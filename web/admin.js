/* ================= ADMINISTRADOR — Los Perrones ================= */

requiereRol('admin');
pintarLogo();

let productos = [], cajeros = [], ausencias = [], finanzas = [];

verTab('productos');

function verTab(t) {
  document.querySelectorAll('#tabs .btn').forEach(b =>
    b.classList.toggle('btn-salsa', b.dataset.t === t));
  ['productos', 'logo', 'cajeros', 'asistencia', 'finanzas', 'reportes'].forEach(x =>
    document.getElementById('tab-' + x).classList.toggle('oculto', x !== t));
  ({ productos: cargarProductos, logo: cargarLogo, cajeros: cargarCajeros,
     asistencia: cargarAsistencia, finanzas: cargarFinanzas, reportes: cargarReporte }[t])();
}

/* ==================== PRODUCTOS ==================== */

const NOMBRES_CAT = { hotdog: 'Hot dog', combo: 'Combo', bebida: 'Bebida', extra: 'Extra', snack: 'Snack' };

async function cargarProductos() {
  productos = await API.get('/api/productos');
  document.getElementById('gridAdmin').innerHTML = productos.map(p => `
    <article class="card" style="padding:0;overflow:hidden">
      ${imgProducto(p, 120)}
      <div style="padding:12px" class="col">
        <div class="fila">
          <b class="grow">${esc(p.nombre)}</b>
          <span class="precio-tag" style="font-size:14px">${Q(p.precio)}</span>
        </div>
        <span class="chip">${NOMBRES_CAT[p.categoria] || p.categoria}</span>
        <div class="fila">
          <button class="btn btn-mini btn-mostaza grow" onclick="formProducto('${p.id}')">✏️ Editar</button>
          <button class="btn btn-mini btn-salsa" onclick="borrarProducto('${p.id}')">🗑</button>
        </div>
      </div>
    </article>`).join('');
}

function formProducto(id) {
  const p = productos.find(x => x.id === id) || {};
  modal(`
    <h2 style="color:var(--salsa)">${id ? 'Editar' : 'Agregar'} producto</h2>
    <label>Nombre</label>
    <input id="pNombre" value="${esc(p.nombre || '')}">
    <label>Categoría</label>
    <select id="pCat">
      ${Object.entries(NOMBRES_CAT).map(([v, n]) =>
        `<option value="${v}" ${p.categoria === v ? 'selected' : ''}>${n}</option>`).join('')}
    </select>
    <label>Descripción</label>
    <textarea id="pDesc" rows="3">${esc(p.descripcion || '')}</textarea>
    <label>Precio (Quetzales)</label>
    <input id="pPrecio" type="number" step="0.01" min="0" value="${p.precio ?? ''}">
    <label>Imagen del producto</label>
    ${p.imagen ? `<div class="fila"><img src="${p.imagen}" style="height:60px;border:2px solid var(--tinta);border-radius:8px">
                  <button class="btn btn-mini btn-salsa" onclick="imagenPendiente='BORRAR';this.parentNode.remove()">Quitar imagen</button></div>` : ''}
    <input type="file" id="pImagen" accept="image/*">
    <label>Video del producto</label>
    ${p.video ? `<div class="fila"><span class="chip">🎬 Ya tiene video</span>
                 <button class="btn btn-mini btn-salsa" type="button"
                   onclick="videoPendiente='BORRAR';this.parentNode.innerHTML='<i>El video se quitará al guardar</i>'">Quitar video</button></div>` : ''}
    <small style="font-weight:800">Opción A — pegar un enlace (YouTube o .mp4):</small>
    <input id="pVideo" value="${esc(p.video && !String(p.video).startsWith('data:') ? p.video : '')}"
           placeholder="https://youtube.com/watch?v=...">
    <small style="font-weight:800">Opción B — subir un archivo MP4 (máx. 12 MB):</small>
    <input type="file" id="pVideoArchivo" accept="video/mp4,video/webm">
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModal()">Cancelar</button>
      <button class="btn btn-jalapeno grow" onclick="guardarProducto('${id || ''}')">Guardar</button>
    </div>`);
  imagenPendiente = null;
  videoPendiente = null;
}

let imagenPendiente = null;
let videoPendiente = null;

async function guardarProducto(id) {
  const val = i => document.getElementById(i).value;
  const b = {
    nombre: val('pNombre').trim(),
    categoria: val('pCat'),
    descripcion: val('pDesc').trim(),
    precio: parseFloat(val('pPrecio') || 0),
  };
  if (!b.nombre) return toast('El nombre es obligatorio');
  try {
    const nueva = await leerArchivo(document.getElementById('pImagen'));
    if (nueva) b.imagen = nueva;
    else if (imagenPendiente === 'BORRAR') b.imagen = null;

    // video: primero el archivo subido, si no, el enlace
    const archivoVideo = await leerVideo(document.getElementById('pVideoArchivo'));
    const enlace = val('pVideo').trim();
    if (archivoVideo) b.video = archivoVideo;
    else if (enlace) b.video = enlace;
    else if (videoPendiente === 'BORRAR') b.video = null;

    if (id) await API.put('/api/productos', { id, ...b });
    else await API.post('/api/productos', b);
    toast('Producto guardado ✔');
    cerrarModal();
    cargarProductos();
  } catch (e) { toast(e.message); }
}

async function borrarProducto(id) {
  if (!confirm('¿Eliminar este producto del menú?')) return;
  await API.del('/api/productos?id=' + id);
  toast('Producto eliminado');
  cargarProductos();
}

/* ==================== LOGO ==================== */

async function cargarLogo() {
  const cfg = await API.get('/api/config');
  document.getElementById('logoActual').innerHTML = cfg.logo
    ? `<img src="${cfg.logo}" style="max-height:130px;border:3px solid var(--tinta);border-radius:12px">`
    : '<p><i>El restaurante todavía no tiene logo.</i></p>';
}

async function subirLogo() {
  try {
    const dato = await leerArchivo(document.getElementById('archivoLogo'));
    if (!dato) return toast('Primero elige una imagen');
    await API.put('/api/config', { logo: dato });
    toast('Logo actualizado ✔');
    cargarLogo();
  } catch (e) { toast(e.message); }
}

async function quitarLogo() {
  await API.put('/api/config', { logo: null });
  toast('Logo eliminado');
  cargarLogo();
}

/* ==================== CAJEROS ==================== */

async function cargarCajeros() {
  cajeros = await API.get('/api/cajeros');
  document.getElementById('tablaCajeros').innerHTML = `
    <tr><th>Nombre</th><th>Usuario</th><th>Sueldo mensual</th><th>Acciones</th></tr>
    ${cajeros.map(c => `
      <tr>
        <td>${esc(c.nombre)}</td>
        <td>${esc(c.usuario)}</td>
        <td>${Q(c.sueldo)}</td>
        <td class="fila">
          <button class="btn btn-mini btn-mostaza" onclick="formCajero('${c.id}')">✏️ Actualizar</button>
          <button class="btn btn-mini btn-salsa" onclick="borrarCajero('${c.id}')">🗑 Eliminar</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="4">Sin cajeros registrados.</td></tr>'}`;
}

function formCajero(id) {
  const c = cajeros.find(x => x.id === id) || {};
  modal(`
    <h2 style="color:var(--salsa)">${id ? 'Actualizar' : 'Agregar'} cajero</h2>
    <label>Nombre completo</label><input id="cNombre" value="${esc(c.nombre || '')}">
    <label>Usuario (para iniciar sesión)</label><input id="cUsuario" value="${esc(c.usuario || '')}">
    <label>Contraseña</label><input id="cPass" value="${esc(c.password || '')}">
    <label>Sueldo mensual (Q)</label><input id="cSueldo" type="number" step="0.01" min="0" value="${c.sueldo ?? ''}">
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModal()">Cancelar</button>
      <button class="btn btn-jalapeno grow" onclick="guardarCajero('${id || ''}')">Guardar</button>
    </div>`);
}

async function guardarCajero(id) {
  const val = i => document.getElementById(i).value;
  const b = {
    nombre: val('cNombre').trim(),
    usuario: val('cUsuario').trim(),
    password: val('cPass'),
    sueldo: parseFloat(val('cSueldo') || 0),
  };
  if (!b.nombre || !b.usuario || !b.password) return toast('Completa nombre, usuario y contraseña');
  if (id) await API.put('/api/cajeros', { id, ...b });
  else await API.post('/api/cajeros', b);
  toast('Cajero guardado ✔');
  cerrarModal();
  cargarCajeros();
}

async function borrarCajero(id) {
  if (!confirm('¿Eliminar a este cajero?')) return;
  await API.del('/api/cajeros?id=' + id);
  toast('Cajero eliminado');
  cargarCajeros();
}

/* ==================== ASISTENCIA / SUELDOS ==================== */

async function cargarAsistencia() {
  [cajeros, ausencias] = await Promise.all([API.get('/api/cajeros'), API.get('/api/ausencias')]);
  document.getElementById('ausCajero').innerHTML =
    cajeros.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');

  const nombre = id => cajeros.find(c => c.id === id)?.nombre || '(eliminado)';
  document.getElementById('tablaAusencias').innerHTML = `
    <tr><th>Cajero</th><th>Fecha</th><th>Motivo</th><th></th></tr>
    ${ausencias.map(a => `
      <tr>
        <td>${esc(nombre(a.cajeroId))}</td>
        <td>${esc(a.fecha)}</td>
        <td>${esc(a.motivo || '—')}</td>
        <td><button class="btn btn-mini btn-salsa" onclick="borrarAusencia('${a.id}')">🗑</button></td>
      </tr>`).join('') || '<tr><td colspan="4">Sin ausencias registradas. 🎉</td></tr>'}`;

  // Resumen del mes: sueldo - descuento por días no trabajados (sueldo/30 por día)
  const mes = new Date().toISOString().slice(0, 7);
  document.getElementById('resumenSueldos').innerHTML = `
    <table>
      <tr><th>Cajero</th><th>Sueldo base</th><th>Faltas del mes</th><th>Descuento (sueldo/30 × faltas)</th><th>Sueldo a pagar</th></tr>
      ${cajeros.map(c => {
        const faltas = ausencias.filter(a => a.cajeroId === c.id && (a.fecha || '').startsWith(mes)).length;
        const desc = (c.sueldo / 30) * faltas;
        return `<tr>
          <td>${esc(c.nombre)}</td><td>${Q(c.sueldo)}</td><td>${faltas}</td>
          <td>${Q(desc)}</td><td><b>${Q(c.sueldo - desc)}</b></td></tr>`;
      }).join('')}
    </table>`;
}

async function agregarAusencia() {
  const cajeroId = document.getElementById('ausCajero').value;
  const fecha = document.getElementById('ausFecha').value;
  if (!cajeroId || !fecha) return toast('Elige el cajero y la fecha');
  await API.post('/api/ausencias', {
    cajeroId, fecha, motivo: document.getElementById('ausMotivo').value.trim(),
  });
  document.getElementById('ausMotivo').value = '';
  toast('Ausencia registrada');
  cargarAsistencia();
}

async function borrarAusencia(id) {
  await API.del('/api/ausencias?id=' + id);
  cargarAsistencia();
}

/* ==================== FINANZAS (hoja libre + ventas automáticas) ==================== */

async function cargarFinanzas() {
  let pedidos;
  [finanzas, pedidos] = await Promise.all([API.get('/api/finanzas'), API.get('/api/pedidos')]);

  // Ventas automáticas: pedidos que el cajero ya recibió (o más adelante)
  const ventas = pedidos
    .filter(p => ['recibido', 'preparando', 'listo', 'entregado'].includes(p.estado))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  finanzas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const opciones = t => ['ingreso', 'gasto', 'egreso', 'sueldo']
    .map(x => `<option ${x === t ? 'selected' : ''}>${x}</option>`).join('');

  document.getElementById('tablaFinanzas').innerHTML = `
    <tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Monto (Q)</th><th></th></tr>
    ${ventas.map(p => `
      <tr class="fila-auto">
        <td>${esc((p.fecha || '').slice(0, 10))}</td>
        <td>ingreso (venta)</td>
        <td>Venta automática — Pedido #${p.numero} (${esc(p.estado)}, ${p.tipo === 'domicilio' ? 'domicilio' : 'tienda'})</td>
        <td>${Number(p.total || 0).toFixed(2)}</td>
        <td title="Se genera sola con los pedidos del cajero">🔒</td>
      </tr>`).join('')}
    ${finanzas.map(f => `
      <tr data-id="${f.id}">
        <td contenteditable data-campo="fecha" onblur="guardarCelda(this)">${esc(f.fecha)}</td>
        <td><select onchange="guardarSelect(this,'${f.id}')">${opciones(f.tipo)}</select></td>
        <td contenteditable data-campo="descripcion" onblur="guardarCelda(this)">${esc(f.descripcion)}</td>
        <td contenteditable data-campo="monto" onblur="guardarCelda(this)">${Number(f.monto || 0).toFixed(2)}</td>
        <td><button class="btn btn-mini btn-salsa" onclick="borrarFinanza('${f.id}')">🗑</button></td>
      </tr>`).join('')}
    ${!ventas.length && !finanzas.length
      ? '<tr><td colspan="5">Hoja vacía. Usa "＋ Agregar fila" o espera ventas del cajero.</td></tr>' : ''}`;

  actualizarTotales();
}

/* nueva fila vacía lista para escribir */
async function agregarFila() {
  await API.post('/api/finanzas', {
    fecha: new Date().toISOString().slice(0, 10),
    tipo: 'gasto',
    descripcion: '',
    monto: 0,
  });
  await cargarFinanzas();
  // dejar el cursor en la descripción de la fila nueva
  document.querySelector('#tablaFinanzas tr[data-id] td[data-campo="descripcion"]')?.focus();
}

/* guardar una celda editada (como en Excel: al salir de la celda) */
async function guardarCelda(td) {
  const id = td.closest('tr').dataset.id;
  const campo = td.dataset.campo;
  let valor = td.textContent.trim();
  if (campo === 'monto') {
    valor = parseFloat(valor.replace(/[^0-9.\-]/g, '')) || 0;
    td.textContent = valor.toFixed(2);
  }
  try {
    await API.put('/api/finanzas', { id, [campo]: valor });
    actualizarTotales();
  } catch (e) { toast(e.message); }
}

async function guardarSelect(sel, id) {
  await API.put('/api/finanzas', { id, tipo: sel.value });
  actualizarTotales();
}

/* recalcular las tarjetas de totales sin repintar la tabla (para no perder el foco) */
async function actualizarTotales() {
  const [fs, pedidos] = await Promise.all([API.get('/api/finanzas'), API.get('/api/pedidos')]);
  finanzas = fs;
  const totalVentasAuto = pedidos
    .filter(p => ['recibido', 'preparando', 'listo', 'entregado'].includes(p.estado))
    .reduce((a, p) => a + (p.total || 0), 0);
  const suma = t => finanzas.filter(f => f.tipo === t).reduce((a, f) => a + (f.monto || 0), 0);
  const ingresos = suma('ingreso') + totalVentasAuto;
  const salidas = suma('gasto') + suma('egreso') + suma('sueldo');
  document.getElementById('totalesFinanzas').innerHTML = `
    <div class="card grow centro"><b>Ventas (pedidos)</b><br><span class="precio-tag">${Q(totalVentasAuto)}</span></div>
    <div class="card grow centro"><b>Ingresos totales</b><br><span class="precio-tag">${Q(ingresos)}</span></div>
    <div class="card grow centro"><b>Gastos</b><br><span class="precio-tag">${Q(suma('gasto'))}</span></div>
    <div class="card grow centro"><b>Egresos</b><br><span class="precio-tag">${Q(suma('egreso'))}</span></div>
    <div class="card grow centro"><b>Sueldos</b><br><span class="precio-tag">${Q(suma('sueldo'))}</span></div>
    <div class="card grow centro" style="background:${ingresos - salidas >= 0 ? 'var(--crema)' : '#FFD3C9'}">
      <b>Balance</b><br><span class="precio-tag">${Q(ingresos - salidas)}</span></div>`;
}

async function borrarFinanza(id) {
  await API.del('/api/finanzas?id=' + id);
  cargarFinanzas();
}

/* ==================== REPORTES ==================== */

async function cargarReporte() {
  const desde = document.getElementById('repDesde').value;
  const hasta = document.getElementById('repHasta').value;
  let url = '/api/reportes?';
  if (desde) url += 'desde=' + desde + '&';
  if (hasta) url += 'hasta=' + hasta;
  const r = await API.get(url);

  const filas = Object.entries(r.porProducto)
    .sort((a, b) => b[1].cantidad - a[1].cantidad);

  document.getElementById('zonaReporte').innerHTML = `
    <div class="fila">
      <div class="card grow centro"><b>Pedidos que entraron</b>
        <div style="font-family:var(--display);font-size:34px">${r.pedidosEntrados}</div></div>
      <div class="card grow centro"><b>Pedidos vendidos</b>
        <div style="font-family:var(--display);font-size:34px">${r.pedidosVendidos}</div></div>
      <div class="card grow centro" style="background:var(--mostaza)"><b>Total de ventas</b>
        <div style="font-family:var(--display);font-size:34px">${Q(r.totalVentas)}</div></div>
    </div>
    <div class="card mt" style="overflow-x:auto">
      <h3>Ventas por producto</h3>
      <table>
        <tr><th>Producto</th><th>Vendidos</th><th>Total</th></tr>
        ${filas.map(([n, d]) =>
          `<tr><td>${esc(n)}</td><td>${d.cantidad}</td><td>${Q(d.total)}</td></tr>`).join('')
          || '<tr><td colspan="3">No hay ventas en el rango seleccionado.</td></tr>'}
      </table>
    </div>`;
}

/* ==================== MODAL ==================== */

function modal(html) {
  cerrarModal();
  const v = document.createElement('div');
  v.className = 'velo';
  v.innerHTML = `<div class="modal">${html}</div>`;
  v.addEventListener('click', e => { if (e.target === v) cerrarModal(); });
  document.getElementById('modales').appendChild(v);
}

function cerrarModal() {
  document.querySelector('.velo')?.remove();
}
