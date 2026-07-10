/* Utilidades compartidas — Los Perrones */

const API = {
  async pedir(metodo, ruta, body) {
    const opts = { method: metodo, headers: {} };
    const token = sessionStorage.getItem('token');
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(ruta, opts);
    const datos = await res.json();
    if (!res.ok) throw new Error(datos.error || 'Error del servidor');
    return datos;
  },
  get:  (r)    => API.pedir('GET', r),
  post: (r, b) => API.pedir('POST', r, b),
  put:  (r, b) => API.pedir('PUT', r, b),
  del:  (r)    => API.pedir('DELETE', r),
};

function Q(n) {
  return 'Q' + Number(n || 0).toFixed(2);
}

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t == null ? '' : String(t);
  return d.innerHTML;
}

function toast(msg) {
  document.getElementById('toast')?.remove();
  const t = document.createElement('div');
  t.id = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* Sonido corto de notificación (no requiere archivos) */
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
  } catch (e) { /* el navegador puede bloquear audio antes de la primera interacción */ }
}

/* Emoji de respaldo cuando el producto no tiene imagen */
function emojiCat(cat) {
  return { hotdog: '🌭', combo: '🎁', bebida: '🥤', extra: '🧀', snack: '🍟' }[cat] || '🍽️';
}

function imgProducto(p, alto = 150) {
  if (p.imagen)
    return `<img src="${p.imagen}" alt="${esc(p.nombre)}" style="width:100%;height:${alto}px;object-fit:cover;border-bottom:3px solid var(--tinta)">`;
  return `<div style="height:${alto}px;display:flex;align-items:center;justify-content:center;font-size:64px;background:var(--crema);border-bottom:3px solid var(--tinta)">${emojiCat(p.categoria)}</div>`;
}

/* Leer un archivo de imagen y devolver dataURL */
function leerArchivo(input) {
  return new Promise((res, rej) => {
    const f = input.files[0];
    if (!f) return res(null);
    if (f.size > 1.5 * 1024 * 1024) return rej(new Error('La imagen debe pesar menos de 1.5 MB'));
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(f);
  });
}

/* Leer un archivo de video (mp4/webm) y devolver dataURL */
function leerVideo(input) {
  return new Promise((res, rej) => {
    const f = input.files[0];
    if (!f) return res(null);
    if (f.size > 12 * 1024 * 1024) return rej(new Error('El video debe pesar menos de 12 MB'));
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('No se pudo leer el video'));
    r.readAsDataURL(f);
  });
}

async function pintarLogo() {
  try {
    const cfg = await API.get('/api/config');
    const cont = document.getElementById('logoMarca');
    if (cont && cfg.logo) cont.innerHTML = `<img src="${cfg.logo}" alt="logo">` + cont.innerHTML;
    return cfg;
  } catch (e) { return {}; }
}

function requiereRol(rol) {
  if (sessionStorage.getItem('rol') !== rol) location.href = 'login.html';
}

/* Sonido de notificación (WebAudio, sin archivos) — dos tonos tipo "¡din-don!" */
let _audioCtx = null;
function beep() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    [[880, 0], [1174.66, 0.14]].forEach(([freq, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(ctx.destination);
      const ini = ctx.currentTime + t;
      g.gain.setValueAtTime(0.001, ini);
      g.gain.exponentialRampToValueAtTime(0.25, ini + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ini + 0.35);
      o.start(ini); o.stop(ini + 0.4);
    });
  } catch (e) { /* el navegador puede bloquear audio hasta la primera interacción */ }
}

function cerrarSesion() {
  sessionStorage.clear();
  location.href = 'login.html';
}

/* ==================== PERSONALIZACIÓN DE HOT DOGS Y COMBOS ====================
   Formulario unificado: quitar/ajustar ingredientes (gratis), extras con precio
   (salen de la categoría "extra" del menú) y un campo "Otro" libre.
   Todo queda en la nota del mismo hot dog para no tener confusión. */

const QUITAR_OPCIONES = [
  'Poca cebolla', 'Sin cebolla', 'Sin pimiento', 'Sin mostaza',
  'Sin mayonesa', 'Sin salsa dulce/ketchup', 'Sin jalapeño',
];

function esActivo(p) { return p.activo !== false; }

function htmlPersonalizacion(productos) {
  const extras = productos.filter(x => x.categoria === 'extra' && esActivo(x));
  return `
    <label>🥗 Ingredientes (marca lo que quieras cambiar)</label>
    <div class="pers-grid">
      ${QUITAR_OPCIONES.map((o, i) => `
        <label class="pers-op"><input type="checkbox" id="pers-q-${i}"> ${o}</label>`).join('')}
    </div>
    <label>➕ Extras</label>
    <div class="pers-grid">
      ${extras.map(e => `
        <label class="pers-op"><input type="checkbox" id="pers-e-${e.id}">
          Extra ${esc(e.nombre)} <b>(+${Q(e.precio)})</b></label>`).join('')
        || '<small>No hay extras disponibles.</small>'}
    </div>
    <label>✏️ Otro (si no está en las opciones)</label>
    <input id="pers-otro" placeholder="Ej. bien dorado el pan, cortado a la mitad...">`;
}

/* Lee el formulario: devuelve la nota unificada y cuánto suman los extras */
function leerPersonalizacion(productos) {
  const partes = [];
  let extraTotal = 0;
  QUITAR_OPCIONES.forEach((o, i) => {
    if (document.getElementById('pers-q-' + i)?.checked) partes.push(o);
  });
  productos.filter(x => x.categoria === 'extra' && esActivo(x)).forEach(e => {
    if (document.getElementById('pers-e-' + e.id)?.checked) {
      partes.push(`Extra ${e.nombre} (+${Q(e.precio)})`);
      extraTotal += e.precio;
    }
  });
  const otro = document.getElementById('pers-otro')?.value.trim();
  if (otro) partes.push(otro);
  return { nota: partes.join(' · '), extraTotal };
}
