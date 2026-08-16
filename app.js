// URL del CSV publicado (Google Sheets: Archivo > Compartir > Publicar en la web)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6Ph0qEPXFSsMjJUvCks-mhIehT4eJEYPTJmg2xcX8QhOm00iBrPdzmRMFDc5fKwgIQO6OKes3it3k/pub?output=csv";

let personas = [];
let rubros = ["Todos"];

// ---- normalizacion: minusculas + sin acentos, para que el buscador
// encuentre resultados aunque la persona escriba mal o sin tildes ----
function normalize(str){
  return (str || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ---- parser de CSV: soporta campos entre comillas con comas y saltos de linea adentro ----
function parseCSV(text){
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (inQuotes){
      if (c === '"'){
        if (text[i+1] === '"'){ field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"'){ inQuotes = true; }
      else if (c === ','){ row.push(field); field = ""; }
      else if (c === '\r'){ /* ignorar, se maneja con \n */ }
      else if (c === '\n'){ row.push(field); rows.push(row); row = []; field = ""; }
      else { field += c; }
    }
  }
  if (field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] && r[0].trim() !== ""));
}

// busca el indice de columna cuyo encabezado normalizado contiene alguno de los textos dados
function findCol(headers, ...needles){
  return headers.findIndex(h => needles.some(n => normalize(h).includes(normalize(n))));
}

function csvToPersonas(text){
  const table = parseCSV(text);
  if (!table.length) return [];
  const headers = table[0];
  const rows = table.slice(1).filter(r => r.some(v => v && v.trim() !== ""));

  const idxNombre = findCol(headers, "nombre");
  // columna principal de rubro: cualquier encabezado que contenga la palabra "rubro"
  // (cubre "Rubros", "Elegir un Rubro", etc., sin depender del texto exacto)
  const idxRubroPrincipal = headers.findIndex(h => normalize(h).includes("rubro"));
  const idxMarca = findCol(headers, "marca temporal");

  // busca solo a partir de la columna de Rubro en adelante, para no confundir estos campos
  // con "Dirección de correo electrónico" (la cuenta de Google, columna B) u otras columnas iniciales
  const desde = idxRubroPrincipal >= 0 ? idxRubroPrincipal + 1 : 0;
  function findColDesde(...needles){
    for (let i = desde; i < headers.length; i++){
      if (needles.some(n => normalize(headers[i]).includes(normalize(n)))) return i;
    }
    return -1;
  }
  const idxDescripcion = findColDesde("descripcion");
  const idxObservaciones = findColDesde("observaciones");
  const idxTelefono = findColDesde("telefono");
  const idxHorario = findColDesde("horario");
  const idxEmail = findColDesde("email");
  const idxDireccion = findColDesde("direccion");
  const idxIndicaciones = findColDesde("indicaciones");
  const idxInstagram = findColDesde("instagram");
  const idxFacebook = findColDesde("facebook");
  const idxWeb = findColDesde("pagina web", "sitio web");

  // las columnas "Elegir tu actividad / oficio / etc" van entre la columna de Rubro y la de Descripción.
  // se toman por posicion (no por el texto del encabezado) para no depender de como esten redactadas,
  // asi si el formulario cambia la redaccion o el orden de las preguntas, se sigue detectando solo.
  const inicioSub = idxRubroPrincipal >= 0 ? idxRubroPrincipal + 1 : -1;
  const finSub = idxDescripcion >= 0 ? idxDescripcion : headers.length;
  const categoryCols = [];
  if (inicioSub >= 0){
    for (let i = inicioSub; i < finSub; i++){
      if (i === idxObservaciones || i === idxTelefono || i === idxHorario || i === idxEmail ||
          i === idxDireccion || i === idxIndicaciones || i === idxInstagram || i === idxFacebook || i === idxWeb) continue;
      categoryCols.push(i);
    }
  }

  const val = (row, idx) => (idx >= 0 && row[idx] !== undefined) ? row[idx].trim() : "";
  const noVal = (v) => !v || normalize(v) === "no";

  // Google Forms en Argentina guarda "Marca temporal" como DD/MM/AAAA HH:MM:SS
  function parseFecha(str){
    if (!str) return null;
    const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh, mi, ss] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +(ss || 0));
    return isNaN(d.getTime()) ? null : d;
  }

  const AHORA = new Date();
  const DIAS_NUEVO = 7;

  return rows.map(row => {
    const rubro = val(row, idxRubroPrincipal) || "Sin rubro";
    // junta todos los valores cargados entre las columnas de categoria, en orden:
    // el primero es el subrubro; si hay un segundo (ej. Artesanía -> Cerámica), es el detalle mas fino
    const nivelesElegidos = [];
    for (const i of categoryCols){
      const v = val(row, i);
      if (v) nivelesElegidos.push(v);
    }
    const subrubro = nivelesElegidos[0] || "";
    const subsubrubro = nivelesElegidos[1] || "";

    const fecha = parseFecha(val(row, idxMarca));
    const esNuevo = fecha ? ((AHORA - fecha) / 86400000) <= DIAS_NUEVO : false;

    const p = {
      nombre: val(row, idxNombre) || "Sin nombre",
      rubro, subrubro, subsubrubro, esNuevo, _fecha: fecha,
      descripcion: val(row, idxDescripcion),
      observaciones: val(row, idxObservaciones),
      telefono: val(row, idxTelefono),
      horario: val(row, idxHorario),
      email: val(row, idxEmail),
      direccion: val(row, idxDireccion),
      indicaciones: val(row, idxIndicaciones),
      instagram: noVal(val(row, idxInstagram)) ? "" : val(row, idxInstagram),
      facebook: noVal(val(row, idxFacebook)) ? "" : val(row, idxFacebook),
      web: noVal(val(row, idxWeb)) ? "" : val(row, idxWeb),
    };
    p._haystack = normalize([p.nombre, p.rubro, p.subrubro, p.subsubrubro, p.descripcion, p.horario, p.direccion, p.observaciones, p.telefono].join(" "));
    return p;
  }).filter(p => p.nombre && p.nombre !== "Sin nombre");
}

const loadState = document.getElementById("loadState");
const errorState = document.getElementById("errorState");
const updatedAtEl = document.getElementById("updatedAt");
const statsBar = document.getElementById("statsBar");

async function cargarDatos(){
  loadState.style.display = "block";
  errorState.style.display = "none";
  gridEl.innerHTML = "";
  resultCount.innerHTML = "";
  try {
    const res = await fetch(SHEET_CSV_URL + "&_=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    personas = csvToPersonas(text);
    rubros = ["Todos", ...new Set(personas.map(p => p.rubro))];
    loadState.style.display = "none";
    updatedAtEl.textContent = (navigator.onLine ? "Actualizado " : "Sin conexión — mostrando la última copia guardada de ") + new Date().toLocaleString("es-AR", {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
    const cantRubros = rubros.length - 1;
    statsBar.innerHTML = `<span><b>${personas.length}</b> vecino${personas.length===1?"":"s"}</span><span><b>${cantRubros}</b> rubro${cantRubros===1?"":"s"}</span>`;
    if (primeraCarga){ aplicarFiltrosDesdeURL(); primeraCarga = false; }
    renderChips();
    renderGrid();
  } catch (err){
    loadState.style.display = "none";
    errorState.style.display = "block";
  }
}
let primeraCarga = true;

// lee ?rubro=&sub=&sub2=&q= de la URL (si vienen de un link compartido) y precarga esos filtros,
// solo si esos valores realmente existen en los datos de hoy
function aplicarFiltrosDesdeURL(){
  const params = new URLSearchParams(location.search);
  const r = params.get("rubro");
  const s = params.get("sub");
  const s2 = params.get("sub2");
  const q = params.get("q");
  if (r && rubros.includes(r)) activeRubro = r;
  if (activeRubro !== "Todos" && s){
    const subsDisp = new Set(personas.filter(p => p.rubro === activeRubro && p.subrubro).map(p => p.subrubro));
    if (subsDisp.has(s)) activeSubrubro = s;
  }
  if (activeSubrubro !== "Todas" && s2){
    const sub2Disp = new Set(personas.filter(p => p.rubro === activeRubro && p.subrubro === activeSubrubro && p.subsubrubro).map(p => p.subsubrubro));
    if (sub2Disp.has(s2)) activeSubSubrubro = s2;
  }
  if (q) searchInput.value = q;
}

// refleja los filtros actuales en la URL (sin recargar la pagina), para poder compartir el link
function actualizarURL(){
  const params = new URLSearchParams();
  if (activeRubro !== "Todos") params.set("rubro", activeRubro);
  if (activeSubrubro !== "Todas") params.set("sub", activeSubrubro);
  if (activeSubSubrubro !== "Todas") params.set("sub2", activeSubSubrubro);
  const q = searchInput.value.trim();
  if (q) params.set("q", q);
  const nueva = location.pathname + (params.toString() ? "?" + params.toString() : "");
  history.replaceState(null, "", nueva);
}

function compartirBusqueda(){
  let etiqueta = activeRubro === "Todos" ? "todos los rubros" : activeRubro;
  if (activeSubrubro !== "Todas") etiqueta += ` · ${activeSubrubro}`;
  if (activeSubSubrubro !== "Todas") etiqueta += ` · ${activeSubSubrubro}`;
  const texto = `Mirá "${etiqueta}" en el directorio de Trabajos y Servicios — Paraje Las Golondrinas:\n${location.href}`;
  if (navigator.share){
    navigator.share({ title: "Trabajos y Servicios — Las Golondrinas", text: texto, url: location.href }).catch(() => {});
  } else {
    window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank");
  }
}

const chipsEl = document.getElementById("chips");
const subChipsEl = document.getElementById("subChips");
const subChipsLabel = document.getElementById("subChipsLabel");
const subSubChipsEl = document.getElementById("subSubChips");
const subSubChipsLabel = document.getElementById("subSubChipsLabel");
const gridEl = document.getElementById("grid");
const searchInput = document.getElementById("searchInput");
const clearBtn = document.getElementById("clearBtn");
const resultCount = document.getElementById("resultCount");
const emptyState = document.getElementById("emptyState");

let activeRubro = "Todos";
let activeSubrubro = "Todas";
let activeSubSubrubro = "Todas";
let ordenActual = "nombre";

function iconPhone(){return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;}
function iconClock(){return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;}
function iconMail(){return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z" opacity="0"></path><path d="M22 6c0-1.1-.9-2-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V6z"></path><polyline points="22 6 12 13 2 6"></polyline></svg>`;}
function iconPin(){return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;}
function iconWhatsapp(){return `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-10-10.01-10zm0 18.2h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.34c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.55-3.7 8.19-8.25 8.19zm4.52-6.14c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42-.14 0-.31-.02-.47-.02-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08 0 1.22.89 2.41 1.02 2.57.12.17 1.75 2.67 4.24 3.74.59.26 1.06.41 1.42.52.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.1-.23-.16-.48-.28z"/></svg>`;}
function iconArrowUp(){return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;}
function iconShare(){return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;}
function iconInstagram(){return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`;}
function iconFacebook(){return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"></path></svg>`;}
function iconGlobe(){return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;}
function iconMic(){return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;}

// arma el texto para compartir la ficha de una persona por WhatsApp / lo que elija el celular
function compartirFicha(p){
  const lineas = [`*${p.nombre}*`];
  let rubroLinea = p.rubro;
  if (p.subrubro) rubroLinea += ` · ${p.subrubro}`;
  if (p.subsubrubro) rubroLinea += ` · ${p.subsubrubro}`;
  lineas.push(rubroLinea);
  if (p.descripcion) lineas.push(p.descripcion);
  if (p.horario) lineas.push(`🕒 ${p.horario}`);
  if (p.telefono) lineas.push(`📞 ${p.telefono}`);
  if (p.direccion) lineas.push(`📍 ${p.direccion}`);
  lineas.push("", "Visto en el directorio de Trabajos y Servicios — Paraje Las Golondrinas");
  const texto = lineas.join("\n");

  if (navigator.share){
    navigator.share({ title: p.nombre, text: texto }).catch(() => {});
  } else {
    window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank");
  }
}

// arma un link de wa.me a partir del telefono cargado, con mejor esfuerzo:
// deja solo digitos, saca el 0 inicial (codigo de larga distancia) y antepone 54 (Argentina) si falta
function whatsappLink(telefono){
  if (!telefono) return "";
  let digits = telefono.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("54")) digits = "54" + digits;
  return `https://wa.me/${digits}`;
}

// arma el link de instagram/facebook/pagina web a partir de lo que haya cargado la persona:
// si ya pegó el link completo lo usa tal cual, si puso el usuario (con o sin @) arma el link solo,
// y si parece un nombre y apellido (tiene espacios) arma un link de busqueda en esa red en vez de
// un link directo roto
function socialLink(tipo, valor){
  if (!valor) return "";
  let v = valor.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/\s/.test(v)){
    const q = encodeURIComponent(v);
    if (tipo === "instagram") return `https://www.instagram.com/explore/search/keyword/?q=${q}`;
    if (tipo === "facebook") return `https://www.facebook.com/search/top/?q=${q}`;
    return `https://www.google.com/search?q=${q}`;
  }
  v = v.replace(/^@/, "").replace(/^www\./i, "");
  if (tipo === "instagram") return `https://instagram.com/${v}`;
  if (tipo === "facebook") return `https://facebook.com/${v}`;
  return `https://${v}`;
}

function createRipple(e, el){
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const span = document.createElement("span");
  span.className = "ripple";
  span.style.width = span.style.height = size + "px";
  span.style.left = (e.clientX - rect.left - size/2) + "px";
  span.style.top = (e.clientY - rect.top - size/2) + "px";
  el.appendChild(span);
  span.addEventListener("animationend", () => span.remove());
}

function renderChips(){
  chipsEl.innerHTML = "";
  rubros.forEach(r => {
    const btn = document.createElement("button");
    btn.className = "chip" + (r === activeRubro ? " active" : "");
    btn.textContent = r;
    btn.addEventListener("click", (e) => {
      createRipple(e, btn);
      activeRubro = r;
      activeSubrubro = "Todas";
      activeSubSubrubro = "Todas";
      renderChips();
      renderGrid();
    });
    chipsEl.appendChild(btn);
  });
  renderSubChips();
}

function renderSubChips(){
  subChipsEl.innerHTML = "";
  if (activeRubro === "Todos"){ subChipsLabel.style.display = "none"; renderSubSubChips(); return; }

  // subrubros presentes hoy en la planilla para el rubro elegido — se recalculan
  // solos en cada carga de datos, asi que si se agrega uno nuevo aparece sin tocar el codigo
  const subs = [...new Set(
    personas.filter(p => p.rubro === activeRubro && p.subrubro).map(p => p.subrubro)
  )].sort((a,b) => a.localeCompare(b, "es"));

  if (!subs.length){ subChipsLabel.style.display = "none"; renderSubSubChips(); return; }
  subChipsLabel.style.display = "block";

  const opciones = ["Todas", ...subs];
  opciones.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "chip sub" + (s === activeSubrubro ? " active" : "");
    btn.textContent = s;
    btn.addEventListener("click", (e) => {
      createRipple(e, btn);
      activeSubrubro = s;
      activeSubSubrubro = "Todas";
      renderSubChips();
      renderGrid();
    });
    subChipsEl.appendChild(btn);
  });
  renderSubSubChips();
}

function renderSubSubChips(){
  subSubChipsEl.innerHTML = "";
  if (activeRubro === "Todos" || activeSubrubro === "Todas"){ subSubChipsLabel.style.display = "none"; return; }

  // tercer nivel: solo existe para algunos subrubros puntuales (ej. Artesanía -> Cerámica, Madera...).
  // si nadie cargo ese detalle para este subrubro, no se muestra nada.
  const detalles = [...new Set(
    personas.filter(p => p.rubro === activeRubro && p.subrubro === activeSubrubro && p.subsubrubro).map(p => p.subsubrubro)
  )].sort((a,b) => a.localeCompare(b, "es"));

  if (!detalles.length){ subSubChipsLabel.style.display = "none"; return; }
  subSubChipsLabel.style.display = "block";

  const opciones = ["Todas", ...detalles];
  opciones.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "chip sub2" + (s === activeSubSubrubro ? " active" : "");
    btn.textContent = s;
    btn.addEventListener("click", (e) => {
      createRipple(e, btn);
      activeSubSubrubro = s;
      renderSubSubChips();
      renderGrid();
    });
    subSubChipsEl.appendChild(btn);
  });
}

function armarFichaHTML(p){
  let metaHtml = "";
  if (p.horario) metaHtml += `<div class="meta-row">${iconClock()}<span>${p.horario}</span></div>`;
  if (p.telefono) metaHtml += `<a class="meta-row meta-link" href="tel:${p.telefono.replace(/[^0-9+]/g,'')}">${iconPhone()}<span>${p.telefono}</span></a>`;
  if (p.email) metaHtml += `<a class="meta-row meta-link" href="mailto:${p.email}">${iconMail()}<span>${p.email}</span></a>`;
  if (p.direccion) metaHtml += `<div class="meta-row">${iconPin()}<span>${p.direccion}${p.indicaciones ? ` <span class="indic">— ${p.indicaciones}</span>` : ""}</span></div>`;

  const wa = whatsappLink(p.telefono);
  const ig = socialLink("instagram", p.instagram);
  const fb = socialLink("facebook", p.facebook);
  const web = socialLink("web", p.web);

  return `
      <div class="card-top">
        <h3>${p.nombre}</h3>
        <div class="badge-group">
          ${p.esNuevo ? `<span class="badge new">✦ Nuevo</span>` : ""}
          <span class="badge">${p.rubro}</span>
        </div>
      </div>
      ${p.subrubro ? `<p class="subrubro">${p.subrubro}${p.subsubrubro ? ` · ${p.subsubrubro}` : ""}</p>` : ""}
      ${p.descripcion ? `<p class="desc">${p.descripcion}</p>` : ""}
      ${p.observaciones ? `<p class="obs">${p.observaciones}</p>` : ""}
      <div class="meta">${metaHtml}</div>
      <div class="card-actions">
        ${wa ? `<a class="wa-btn" href="${wa}" target="_blank" rel="noopener">${iconWhatsapp()} Escribir por WhatsApp</a>` : ""}
        <div class="icon-group">
          <button class="share-btn" type="button" title="Compartir esta ficha" aria-label="Compartir esta ficha">${iconShare()}</button>
          ${ig ? `<a class="icon-btn instagram-btn" href="${ig}" target="_blank" rel="noopener" title="Instagram" aria-label="Ver Instagram">${iconInstagram()}</a>` : ""}
          ${fb ? `<a class="icon-btn facebook-btn" href="${fb}" target="_blank" rel="noopener" title="Facebook" aria-label="Ver Facebook">${iconFacebook()}</a>` : ""}
          ${web ? `<a class="icon-btn web-btn" href="${web}" target="_blank" rel="noopener" title="Página web" aria-label="Ver página web">${iconGlobe()}</a>` : ""}
        </div>
      </div>
    `;
}

function renderGrid(){
  const q = normalize(searchInput.value.trim());
  clearBtn.style.display = q ? "inline-block" : "none";
  actualizarURL();

  const filtered = personas.filter(p => {
    const matchesRubro = activeRubro === "Todos" || p.rubro === activeRubro;
    const matchesSubrubro = activeSubrubro === "Todas" || p.subrubro === activeSubrubro;
    const matchesSubSubrubro = activeSubSubrubro === "Todas" || p.subsubrubro === activeSubSubrubro;
    const matchesQuery = q === "" || p._haystack.includes(q);
    return matchesRubro && matchesSubrubro && matchesSubSubrubro && matchesQuery;
  });

  if (ordenActual === "recientes"){
    filtered.sort((a, b) => (b._fecha ? b._fecha.getTime() : 0) - (a._fecha ? a._fecha.getTime() : 0));
  } else if (ordenActual === "rubro"){
    filtered.sort((a, b) => a.rubro.localeCompare(b.rubro, "es") || a.nombre.localeCompare(b.nombre, "es"));
  } else {
    filtered.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  let etiqueta = activeRubro === "Todos" ? "Todos los rubros" : activeRubro;
  if (activeSubrubro !== "Todas") etiqueta += ` · ${activeSubrubro}`;
  if (activeSubSubrubro !== "Todas") etiqueta += ` · ${activeSubSubrubro}`;
  resultCount.innerHTML = `<span>${etiqueta}</span><span><span class="n">${filtered.length}</span> vecino${filtered.length===1?"":"s"} encontrado${filtered.length===1?"":"s"}</span>`;

  gridEl.innerHTML = "";
  emptyState.style.display = filtered.length ? "none" : "block";

  filtered.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.animationDelay = (i * 0.03) + "s";
    card.innerHTML = armarFichaHTML(p) + `<span class="expand-hint">click para ampliar ↗</span>`;
    card.querySelector(".share-btn").addEventListener("click", (e) => { e.stopPropagation(); compartirFicha(p); });
    card.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("button")) return;
      abrirModal(p);
    });
    gridEl.appendChild(card);
  });
}

searchInput.addEventListener("input", renderGrid);
clearBtn.addEventListener("click", (e) => { createRipple(e, clearBtn); searchInput.value = ""; renderGrid(); searchInput.focus(); });
document.getElementById("retryBtn").addEventListener("click", (e) => { createRipple(e, e.currentTarget); cargarDatos(); });
document.getElementById("refreshBtn").addEventListener("click", (e) => { createRipple(e, e.currentTarget); cargarDatos(); });

document.getElementById("sortSelect").addEventListener("change", (e) => {
  ordenActual = e.target.value;
  renderGrid();
});

const shareSearchBtn = document.getElementById("shareSearchBtn");
shareSearchBtn.innerHTML = iconShare();
shareSearchBtn.addEventListener("click", compartirBusqueda);

// ---- busqueda por voz (Web Speech API: la reconoce el propio navegador, no queda grabada en ningun lado) ----
const micBtn = document.getElementById("micBtn");
micBtn.innerHTML = iconMic();
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognitionAPI){
  const recognition = new SpeechRecognitionAPI();
  recognition.lang = "es-AR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => micBtn.classList.add("listening"));
  recognition.addEventListener("end", () => micBtn.classList.remove("listening"));
  recognition.addEventListener("error", () => micBtn.classList.remove("listening"));
  recognition.addEventListener("result", (e) => {
    const texto = e.results[0][0].transcript;
    searchInput.value = texto;
    renderGrid();
  });

  micBtn.addEventListener("click", () => {
    if (micBtn.classList.contains("listening")) { recognition.stop(); return; }
    try { recognition.start(); } catch (err) { /* ya estaba escuchando */ }
  });
} else {
  micBtn.style.display = "none"; // el navegador no soporta busqueda por voz (ej. Firefox)
}

cargarDatos();

// ---- modal de ficha ampliada ----
const modalBackdrop = document.getElementById("modalBackdrop");
const modalContent = document.getElementById("modalContent");
const modalClose = document.getElementById("modalClose");

function abrirModal(p){
  modalContent.innerHTML = armarFichaHTML(p);
  modalContent.querySelector(".share-btn").addEventListener("click", () => compartirFicha(p));
  modalBackdrop.classList.add("open");
  document.body.style.overflow = "hidden";
}
function cerrarModal(){
  modalBackdrop.classList.remove("open");
  document.body.style.overflow = "";
}
modalClose.addEventListener("click", cerrarModal);
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) cerrarModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });

// ---- volver arriba ----
const toTopBtn = document.getElementById("toTopBtn");
toTopBtn.innerHTML = iconArrowUp();
window.addEventListener("scroll", () => {
  toTopBtn.classList.toggle("show", window.scrollY > 420);
});
toTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

// ---- modo oscuro (vale para esta visita; no se guarda entre sesiones) ----
const themeToggle = document.getElementById("themeToggle");
function aplicarTema(modo){
  document.documentElement.setAttribute("data-theme", modo);
  themeToggle.textContent = modo === "dark" ? "☀️" : "🌙";
}
const prefiereOscuro = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
aplicarTema(prefiereOscuro ? "dark" : "light");
themeToggle.addEventListener("click", () => {
  const actual = document.documentElement.getAttribute("data-theme");
  aplicarTema(actual === "dark" ? "light" : "dark");
});

// ---- registrar el service worker para que la app funcione instalada / sin conexion ----
if ("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ---- boton de instalar la app ----
const installBtn = document.getElementById("installBtn");
const iosInstallTip = document.getElementById("iosInstallTip");
const iosTipClose = document.getElementById("iosTipClose");

const yaInstalada = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

let promptDeInstalacion = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  promptDeInstalacion = e;
  if (!yaInstalada) installBtn.style.display = "flex"; // Chrome/Edge/Android: se puede instalar con un click
});

installBtn.addEventListener("click", async () => {
  if (!promptDeInstalacion) return;
  promptDeInstalacion.prompt();
  await promptDeInstalacion.userChoice;
  promptDeInstalacion = null;
  installBtn.style.display = "none";
});

window.addEventListener("appinstalled", () => {
  installBtn.style.display = "none";
  iosInstallTip.style.display = "none";
});

// iPhone/iPad no tiene el evento anterior: no se puede instalar con un click,
// asi que mostramos el paso a paso en su lugar
if (esIOS && !yaInstalada){
  installBtn.textContent = "📲 Instalar app";
  installBtn.style.display = "flex";
  installBtn.addEventListener("click", () => {
    iosInstallTip.style.display = "block";
  });
}
iosTipClose.addEventListener("click", () => { iosInstallTip.style.display = "none"; });

// ---- tamaño de letra (accesibilidad): normal -> grande -> mas grande -> normal ----
const fontToggle = document.getElementById("fontToggle");
const nivelesLetra = ["", "font-lg", "font-xl"];
const etiquetasLetra = ["Aa", "A+", "A++"];
let nivelLetra = 0;
fontToggle.addEventListener("click", () => {
  document.body.classList.remove(...nivelesLetra.filter(Boolean));
  nivelLetra = (nivelLetra + 1) % nivelesLetra.length;
  if (nivelesLetra[nivelLetra]) document.body.classList.add(nivelesLetra[nivelLetra]);
  fontToggle.textContent = etiquetasLetra[nivelLetra];
});
