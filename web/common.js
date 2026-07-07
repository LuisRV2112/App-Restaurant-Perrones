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
  } catch (e) { /* sin logo */ }
}

function requiereRol(rol) {
  if (sessionStorage.getItem('rol') !== rol) location.href = 'login.html';
}

function cerrarSesion() {
  sessionStorage.clear();
  location.href = 'login.html';
}
