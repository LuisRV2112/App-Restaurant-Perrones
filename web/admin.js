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
  document.getElementById('gridAdmin').innerHTML = productos.map(p => {
    const activo = esActivo(p);
    return `
    <article class="card ${activo ? '' : 'agotado'}" style="padding:0;overflow:hidden">
      ${imgProducto(p, 120)}
      <div style="padding:12px" class="col">
        <div class="fila">
          <b class="grow">${esc(p.nombre)}</b>
          <span class="precio-tag" style="font-size:14px">${Q(p.precio)}</span>
        </div>
        <div class="fila">
          <span class="chip">${NOMBRES_CAT[p.categoria] || p.categoria}</span>
          <span class="chip ${activo ? 'listo' : ''}">${activo ? 'disponible' : 'agotado'}</span>
        </div>
        <div class="fila">
          <button class="btn btn-mini btn-mostaza grow" onclick="formProducto('${p.id}')">✏️ Editar</button>
          ${activo
            ? `<button class="btn btn-mini" title="Marcar agotado, sin borrarlo" onclick="toggleProducto('${p.id}', false)">🚫 Desactivar</button>`
            : `<button class="btn btn-mini btn-jalapeno" onclick="toggleProducto('${p.id}', true)">✅ Activar</button>`}
          <button class="btn btn-mini btn-salsa" title="Eliminar para siempre" onclick="borrarProducto('${p.id}')">🗑</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

async function toggleProducto(id, activo) {
  await API.put('/api/productos', { id, activo });
  toast(activo ? 'Producto disponible de nuevo ✔' : 'Producto marcado como agotado');
  cargarProductos();
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
  if (!confirm('¿Eliminar este producto PARA SIEMPRE? Si solo se acabó por hoy, mejor usa Desactivar.')) return;
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
  const r = cfg.redes || {};
  document.getElementById('redFb').value = r.facebook || '';
  document.getElementById('redIg').value = r.instagram || '';
  document.getElementById('redWa').value = r.whatsapp || '';
}

async function guardarRedes() {
  const fb = document.getElementById('redFb').value.trim();
  const ig = document.getElementById('redIg').value.trim();
  const wa = document.getElementById('redWa').value.replace(/\D/g, '');
  if (fb && !/^https?:\/\//.test(fb)) return toast('El enlace de Facebook debe empezar con https://');
  if (ig && !/^https?:\/\//.test(ig)) return toast('El enlace de Instagram debe empezar con https://');
  if (wa && (wa.length < 8 || wa.length > 15)) return toast('Revisa el número de WhatsApp (ej. 50255551234)');
  await API.put('/api/config', { redes: { facebook: fb, instagram: ig, whatsapp: wa } });
  toast('Redes sociales guardadas ✔');
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

/* ==================== FINANZAS (resumen, caja, hoja, inventario) ==================== */

let subFin = 'resumen';

function cargarFinanzas() { verSubFin(subFin); }

function verSubFin(s) {
  subFin = s;
  document.querySelectorAll('#subFin .btn').forEach(b =>
    b.classList.toggle('btn-mostaza', b.dataset.s === s));
  ['resumen', 'caja', 'hoja', 'inventario'].forEach(x =>
    document.getElementById('fin-' + x).classList.toggle('oculto', x !== s));
  ({ resumen: cargarResumen, caja: cargarCaja, hoja: cargarHoja, inventario: cargarInventario }[s])();
}

/* ---------- RESUMEN: caja, ganancias, pérdidas, medias ---------- */

async function cargarResumen() {
  const hoy = new Date().toISOString().slice(0, 10);
  const mes = hoy.slice(0, 7);
  const e = await API.get(`/api/estadisticas?desde=${mes}-01&hasta=${hoy}`);

  const tarjeta = (titulo, valor, extra = '', fondo = 'var(--blanco)') => `
    <div class="card grow centro" style="background:${fondo};min-width:160px">
      <b>${titulo}</b>
      <div style="font-family:var(--display);font-size:26px">${valor}</div>
      ${extra ? `<small>${extra}</small>` : ''}
    </div>`;

  const gananciaOK = e.ganancia >= 0;
  document.getElementById('fin-resumen').innerHTML = `
    <div class="fila">
      ${tarjeta('💵 En caja ahora', Q(e.saldoCaja), 'efectivo físico acumulado', 'var(--mostaza)')}
      ${tarjeta(gananciaOK ? '📈 Ganancia del mes' : '📉 Pérdida del mes', Q(Math.abs(e.ganancia)),
        'ventas + ingresos − gastos', gananciaOK ? '#D9F2DC' : '#FFD3C9')}
      ${tarjeta('🛒 Ventas del mes', Q(e.ventasTotal), e.numPedidos + ' pedidos')}
      ${tarjeta('💸 Pérdidas / salidas del mes', Q(e.perdidas), 'gastos + egresos + sueldos')}
    </div>
    <div class="fila mt">
      ${tarjeta('🎯 Ticket promedio (media por pedido)', Q(e.ticketPromedio))}
      ${tarjeta('📅 Media de venta diaria', Q(e.mediaDiaria), e.porDia.length + ' días con ventas')}
      ${tarjeta('📦 Valor del inventario', Q(e.valorInventario))}
      ${tarjeta('🥫 Efectivo por ventas hoy', Q(e.efectivoVentasHoy))}
    </div>
    ${e.bajoStock.length ? `
      <div class="card mt" style="background:#FFD3C9">
        <b>⚠️ Inventario bajo — hay que comprar:</b>
        ${e.bajoStock.map(b => `<span class="chip" style="background:var(--salsa);color:var(--blanco)">
          ${esc(b.nombre)}: quedan ${b.cantidad} ${esc(b.unidad)} (mín. ${b.minimo})</span>`).join(' ')}
      </div>` : ''}
    <p class="mt" style="font-size:13px;opacity:.75">
      El resumen es del mes en curso (del ${mes}-01 a hoy). En 📊 Reportes puedes elegir cualquier rango de fechas.</p>`;
}

/* ---------- CAJA: control del efectivo físico ---------- */

const DENOMS = ['200', '100', '50', '20', '10', '5', '1', '0.50', '0.25'];
let asignaciones = [];

async function cargarCaja() {
  const [e, movs, asigs, cjs] = await Promise.all([
    API.get('/api/estadisticas'), API.get('/api/caja'),
    API.get('/api/asignaciones'), API.get('/api/cajeros'),
  ]);
  cajeros = cjs;
  asignaciones = asigs;
  movs.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  asignaciones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  document.getElementById('cajaCards').innerHTML = `
    <div class="card grow centro" style="background:var(--mostaza)"><b>💵 Saldo en caja</b>
      <div style="font-family:var(--display);font-size:30px">${Q(e.saldoCaja)}</div></div>
    <div class="card grow centro"><b>Ventas en efectivo (histórico)</b>
      <div style="font-family:var(--display);font-size:24px">${Q(e.efectivoVentasTotal)}</div></div>
    <div class="card grow centro"><b>Entradas manuales</b>
      <div style="font-family:var(--display);font-size:24px">${Q(e.entradasCaja)}</div></div>
    <div class="card grow centro"><b>Salidas / retiros</b>
      <div style="font-family:var(--display);font-size:24px">${Q(e.salidasCaja)}</div></div>`;

  // formulario de asignación
  document.getElementById('asigCajero').innerHTML =
    cajeros.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  if (!document.getElementById('asigFecha').value)
    document.getElementById('asigFecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('asigDesglose').innerHTML = DENOMS.map(d => `
    <div style="width:86px">
      <label style="margin:4px 0 2px">Q${d}</label>
      <input type="number" min="0" step="1" value="0" id="den-${d.replace('.', '_')}"
             oninput="calcFondo()" style="text-align:center">
    </div>`).join('');
  calcFondo();

  // tabla de asignaciones
  document.getElementById('tablaAsignaciones').innerHTML = `
    <tr><th>Fecha</th><th>Cajero</th><th>Fondo</th><th>Desglose</th><th>Resultado</th><th>Acciones</th></tr>
    ${asignaciones.map(a => `
      <tr>
        <td>${esc(a.fecha)}</td>
        <td>${esc(a.cajeroNombre)}</td>
        <td><b>${Q(a.total)}</b></td>
        <td style="font-size:12px">${textoDesglose(a.desglose)}</td>
        <td>${resultadoAsig(a)}</td>
        <td class="fila">
          ${a.estado === 'abierta'
            ? `<button class="btn btn-mini btn-jalapeno" onclick="modalCierre('${a.id}')">🔒 Cerrar caja</button>` : ''}
          <button class="btn btn-mini btn-salsa" onclick="borrarAsignacion('${a.id}')">🗑</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="6">Sin cajas asignadas todavía.</td></tr>'}`;

  document.getElementById('tablaCaja').innerHTML = `
    <tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Monto</th><th></th></tr>
    ${movs.map(m => `
      <tr>
        <td>${esc(m.fecha)}</td>
        <td><span class="chip" style="background:${m.tipo === 'entrada' ? 'var(--jalapeno)' : 'var(--salsa)'};color:var(--blanco)">${esc(m.tipo)}</span></td>
        <td>${esc(m.concepto)}</td>
        <td>${Q(m.monto)}</td>
        <td><button class="btn btn-mini btn-salsa" onclick="borrarMovCaja('${m.id}')">🗑</button></td>
      </tr>`).join('') || '<tr><td colspan="5">Sin movimientos manuales. Las ventas en efectivo entran solas.</td></tr>'}`;
}

function leerDesglose() {
  const d = {};
  DENOMS.forEach(x => {
    const n = parseInt(document.getElementById('den-' + x.replace('.', '_')).value || 0);
    if (n > 0) d[x] = n;
  });
  return d;
}

function calcFondo() {
  const d = leerDesglose();
  const total = Object.entries(d).reduce((a, [den, n]) => a + parseFloat(den) * n, 0);
  document.getElementById('asigTotal').textContent = Q(total);
}

function textoDesglose(d) {
  const partes = Object.entries(d || {})
    .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
    .map(([den, n]) => `${n}×Q${den}`);
  return partes.join(' · ') || '—';
}

function resultadoAsig(a) {
  if (a.estado === 'abierta') return '<span class="chip recibido">abierta</span>';
  const c = a.cierre || {};
  const dif = c.diferencia || 0;
  const detalle = `fondo ${Q(a.total)} + ventas efectivo ${Q(c.ventasEfectivo)} = esperado ${Q(c.esperado)} · contado ${Q(c.contado)}`;
  if (Math.abs(dif) < 0.01)
    return `<span class="chip listo">✔ cuadró</span><br><small>${detalle}</small>`;
  if (dif < 0)
    return `<span class="chip" style="background:var(--salsa);color:var(--blanco)">⚠ faltan ${Q(-dif)}</span><br><small>${detalle}</small>`;
  return `<span class="chip" style="background:var(--mostaza)">sobran ${Q(dif)}</span><br><small>${detalle}</small>`;
}

async function asignarCaja() {
  const d = leerDesglose();
  if (!Object.keys(d).length) return toast('Indica el desglose del fondo (cuántos billetes de cada uno)');
  try {
    await API.post('/api/asignaciones', {
      cajeroId: document.getElementById('asigCajero').value,
      fecha: document.getElementById('asigFecha').value,
      desglose: d,
    });
    toast('Caja asignada ✔');
    cargarCaja();
  } catch (e) { toast(e.message); }
}

function modalCierre(id) {
  const a = asignaciones.find(x => x.id === id);
  modal(`
    <h2 style="color:var(--salsa)">🔒 Cierre de caja — ${esc(a.cajeroNombre)}</h2>
    <p style="margin:4px 0">
      📅 ${esc(a.fecha)} · Fondo entregado: <b>${Q(a.total)}</b><br>
      <small>${textoDesglose(a.desglose)}</small>
    </p>
    <p style="margin:4px 0">Cuenta el efectivo de la caja <b>billete por billete</b>. El sistema
      compara contra el fondo + las ventas en efectivo que este cajero recibió ese día.</p>
    <div class="fila">
      ${DENOMS.map(d => `
        <div style="width:86px">
          <label style="margin:4px 0 2px">Q${d}</label>
          <input type="number" min="0" step="1" value="0" id="cden-${d.replace('.', '_')}"
                 oninput="calcCierre()" style="text-align:center">
        </div>`).join('')}
    </div>
    <h3 class="centro mt">Contado: <span class="precio-tag" id="cierreTotal">Q0.00</span></h3>
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModal()">Cancelar</button>
      <button class="btn btn-salsa grow" onclick="cerrarCaja('${id}')">Cerrar caja</button>
    </div>`);
}

function leerDesgloseCierre() {
  const d = {};
  DENOMS.forEach(x => {
    const n = parseInt(document.getElementById('cden-' + x.replace('.', '_'))?.value || 0);
    if (n > 0) d[x] = n;
  });
  return d;
}

function calcCierre() {
  const d = leerDesgloseCierre();
  const total = Object.entries(d).reduce((a, [den, n]) => a + parseFloat(den) * n, 0);
  document.getElementById('cierreTotal').textContent = Q(total);
}

async function cerrarCaja(id) {
  const d = leerDesgloseCierre();
  if (!Object.keys(d).length) return toast('Cuenta el efectivo: indica cuántos billetes de cada denominación');
  try {
    const a = await API.put('/api/asignaciones', { id, desglose: d });
    cerrarModal();
    const dif = a.cierre.diferencia || 0;
    if (Math.abs(dif) < 0.01) toast('✔ La caja cuadró perfecto');
    else if (dif < 0) toast(`⚠ Faltan ${Q(-dif)} en la caja de ${a.cajeroNombre}`);
    else toast(`Sobran ${Q(dif)} en la caja de ${a.cajeroNombre}`);
    cargarCaja();
  } catch (e) { toast(e.message); }
}

async function borrarAsignacion(id) {
  if (!confirm('¿Eliminar este registro de caja?')) return;
  await API.del('/api/asignaciones?id=' + id);
  cargarCaja();
}

async function agregarMovCaja() {
  const monto = parseFloat(document.getElementById('cajaMonto').value || 0);
  const concepto = document.getElementById('cajaConcepto').value.trim();
  if (!monto || monto <= 0) return toast('Escribe el monto');
  if (!concepto) return toast('Escribe el concepto del movimiento');
  await API.post('/api/caja', { tipo: document.getElementById('cajaTipo').value, concepto, monto });
  document.getElementById('cajaConcepto').value = '';
  document.getElementById('cajaMonto').value = '';
  toast('Movimiento registrado ✔');
  cargarCaja();
}

async function borrarMovCaja(id) {
  await API.del('/api/caja?id=' + id);
  cargarCaja();
}

/* ---------- INVENTARIO ---------- */

let inventario = [];

async function cargarInventario() {
  inventario = await API.get('/api/inventario');
  const valor = inventario.reduce((a, i) => a + i.cantidad * i.costo, 0);
  const bajos = inventario.filter(i => i.cantidad <= i.minimo);

  document.getElementById('invCards').innerHTML = `
    <div class="card grow centro"><b>Artículos</b>
      <div style="font-family:var(--display);font-size:26px">${inventario.length}</div></div>
    <div class="card grow centro" style="background:var(--mostaza)"><b>Valor del inventario</b>
      <div style="font-family:var(--display);font-size:26px">${Q(valor)}</div></div>
    <div class="card grow centro" style="background:${bajos.length ? '#FFD3C9' : '#D9F2DC'}"><b>Con poca existencia</b>
      <div style="font-family:var(--display);font-size:26px">${bajos.length}</div></div>`;

  document.getElementById('tablaInventario').innerHTML = `
    <tr><th>Artículo</th><th>Existencia</th><th>Mínimo</th><th>Costo unit.</th><th>Valor</th><th>Acciones</th></tr>
    ${inventario.map(i => `
      <tr style="${i.cantidad <= i.minimo ? 'background:#FFD3C9' : ''}">
        <td>${esc(i.nombre)} ${i.cantidad <= i.minimo ? '⚠️' : ''}</td>
        <td>
          <button class="btn btn-mini" onclick="ajustarStock('${i.id}',-1)">−</button>
          <b> ${i.cantidad} ${esc(i.unidad)} </b>
          <button class="btn btn-mini" onclick="ajustarStock('${i.id}',1)">+</button>
        </td>
        <td>${i.minimo}</td>
        <td>${Q(i.costo)}</td>
        <td>${Q(i.cantidad * i.costo)}</td>
        <td class="fila">
          <button class="btn btn-mini btn-mostaza" onclick="formArticulo('${i.id}')">✏️</button>
          <button class="btn btn-mini btn-salsa" onclick="borrarArticulo('${i.id}')">🗑</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="6">Inventario vacío. Agrega tu primer artículo arriba.</td></tr>'}`;
}

async function agregarArticulo() {
  const val = i => document.getElementById(i).value;
  if (!val('invNombre').trim()) return toast('Escribe el nombre del artículo');
  await API.post('/api/inventario', {
    nombre: val('invNombre').trim(),
    unidad: val('invUnidad').trim() || 'unidades',
    cantidad: parseFloat(val('invCantidad') || 0),
    minimo: parseFloat(val('invMinimo') || 0),
    costo: parseFloat(val('invCosto') || 0),
  });
  ['invNombre', 'invUnidad', 'invCantidad', 'invMinimo', 'invCosto'].forEach(i =>
    document.getElementById(i).value = '');
  toast('Artículo agregado ✔');
  cargarInventario();
}

async function ajustarStock(id, d) {
  const i = inventario.find(x => x.id === id);
  if (!i) return;
  const nueva = Math.max(0, i.cantidad + d);
  await API.put('/api/inventario', { id, cantidad: nueva });
  cargarInventario();
}

function formArticulo(id) {
  const i = inventario.find(x => x.id === id);
  modal(`
    <h2 style="color:var(--salsa)">Editar artículo</h2>
    <label>Nombre</label><input id="eNombre" value="${esc(i.nombre)}">
    <label>Unidad</label><input id="eUnidad" value="${esc(i.unidad)}">
    <label>Cantidad</label><input id="eCantidad" type="number" step="0.01" min="0" value="${i.cantidad}">
    <label>Mínimo (alerta)</label><input id="eMinimo" type="number" step="0.01" min="0" value="${i.minimo}">
    <label>Costo unitario (Q)</label><input id="eCosto" type="number" step="0.01" min="0" value="${i.costo}">
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModal()">Cancelar</button>
      <button class="btn btn-jalapeno grow" onclick="guardarArticulo('${id}')">Guardar</button>
    </div>`);
}

async function guardarArticulo(id) {
  const val = i => document.getElementById(i).value;
  await API.put('/api/inventario', {
    id,
    nombre: val('eNombre').trim(),
    unidad: val('eUnidad').trim(),
    cantidad: parseFloat(val('eCantidad') || 0),
    minimo: parseFloat(val('eMinimo') || 0),
    costo: parseFloat(val('eCosto') || 0),
  });
  toast('Artículo actualizado ✔');
  cerrarModal();
  cargarInventario();
}

async function borrarArticulo(id) {
  if (!confirm('¿Eliminar este artículo del inventario?')) return;
  await API.del('/api/inventario?id=' + id);
  cargarInventario();
}

/* ---------- HOJA DE CÁLCULO (la de siempre) ---------- */

async function cargarHoja() {
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
  await cargarHoja();
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
  cargarHoja();
}

/* ==================== REPORTES ==================== */

async function cargarReporte() {
  const desde = document.getElementById('repDesde').value;
  const hasta = document.getElementById('repHasta').value;
  let rango = '';
  if (desde) rango += 'desde=' + desde + '&';
  if (hasta) rango += 'hasta=' + hasta;
  const [r, e] = await Promise.all([
    API.get('/api/reportes?' + rango),
    API.get('/api/estadisticas?' + rango),
  ]);

  const filas = Object.entries(r.porProducto)
    .sort((a, b) => b[1].cantidad - a[1].cantidad);

  // gráfica de barras de ventas por día (CSS puro)
  const maxDia = Math.max(...e.porDia.map(d => d.total), 1);
  const barras = e.porDia.slice(-21).map(d => `
    <div class="barra-col" title="${d.fecha}: ${Q(d.total)} (${d.pedidos} pedidos)">
      <div class="barra" style="height:${Math.max(5, d.total / maxDia * 100)}%"></div>
      <small>${d.fecha.slice(8)}/${d.fecha.slice(5, 7)}</small>
    </div>`).join('');

  const gananciaOK = e.ganancia >= 0;
  document.getElementById('zonaReporte').innerHTML = `
    <div class="fila">
      <div class="card grow centro"><b>Pedidos que entraron</b>
        <div style="font-family:var(--display);font-size:34px">${r.pedidosEntrados}</div></div>
      <div class="card grow centro"><b>Pedidos vendidos</b>
        <div style="font-family:var(--display);font-size:34px">${e.numPedidos}</div></div>
      <div class="card grow centro" style="background:var(--mostaza)"><b>Total de ventas</b>
        <div style="font-family:var(--display);font-size:34px">${Q(e.ventasTotal)}</div></div>
      <div class="card grow centro" style="background:${gananciaOK ? '#D9F2DC' : '#FFD3C9'}">
        <b>${gananciaOK ? 'Ganancia' : 'Pérdida'} del período</b>
        <div style="font-family:var(--display);font-size:34px">${Q(Math.abs(e.ganancia))}</div></div>
    </div>

    <div class="fila mt">
      <div class="card grow centro"><b>🎯 Ticket promedio</b>
        <div style="font-family:var(--display);font-size:24px">${Q(e.ticketPromedio)}</div>
        <small>media por pedido</small></div>
      <div class="card grow centro"><b>📅 Media diaria</b>
        <div style="font-family:var(--display);font-size:24px">${Q(e.mediaDiaria)}</div>
        <small>${e.porDia.length} días con ventas</small></div>
      <div class="card grow centro"><b>🛵 Domicilio vs 🏪 Tienda</b>
        <div style="font-size:17px;font-weight:800">${Q(e.porTipo.domicilio)} / ${Q(e.porTipo.recoger)}</div></div>
      <div class="card grow centro"><b>💵 Efectivo vs 🏦 Transferencia</b>
        <div style="font-size:17px;font-weight:800">${Q(e.porPago.efectivo)} / ${Q(e.porPago.transferencia)}</div></div>
    </div>

    ${e.porDia.length ? `
    <div class="card mt">
      <h3>📈 Ventas por día ${e.porDia.length > 21 ? '(últimos 21 días del rango)' : ''}</h3>
      <div class="grafica">${barras}</div>
    </div>` : ''}

    ${e.topProductos.length ? `
    <div class="card mt">
      <h3>🏆 Los más vendidos</h3>
      ${e.topProductos.map((t, i) => `
        <div class="fila" style="margin:4px 0">
          <span style="width:26px;font-weight:800">${['🥇','🥈','🥉'][i] || (i + 1) + '.'}</span>
          <b class="grow">${esc(t.nombre)}</b>
          <span class="chip">${t.cantidad} vendidos</span>
          <b>${Q(t.total)}</b>
        </div>`).join('')}
    </div>` : ''}

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
