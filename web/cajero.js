/* ================= CAJERO — Los Perrones ================= */

requiereRol('cajero');
document.getElementById('quien').textContent = '👤 ' + (sessionStorage.getItem('nombre') || '');

let filtro = 'activos';
let chatAbierto = null;
let vistos = new Set();          // pedidos ya avisados
let msjVistos = new Set();       // mensajes ya vistos (para notificar solo los nuevos)
let primeraCarga = true;         // en la primera carga no se notifica lo viejo
let pedidosCache = [];           // último listado (para imprimir y abrir chats)

pintarLogo();
cargarMiCaja();
refrescar();
setInterval(refrescar, 4000);
setInterval(cargarMiCaja, 30000); // por si el admin la asigna o cierra durante el día

async function cargarMiCaja() {
  try {
    const as = await API.get('/api/asignaciones'); // el servidor devuelve solo la mía de hoy
    const el = document.getElementById('miCaja');
    if (!as.length) { el.innerHTML = ''; return; }
    const a = as[as.length - 1];
    el.innerHTML = a.estado === 'abierta'
      ? `<span class="chip" style="background:var(--mostaza)">💵 Tu caja de hoy: <b>${Q(a.total)}</b></span>`
      : `<span class="chip entregado">💵 Caja de hoy cerrada</span>`;
  } catch (e) { /* sin caja asignada */ }
}

function filtrar(f) {
  filtro = f;
  document.querySelectorAll('#filtros .btn').forEach(b =>
    b.classList.toggle('btn-mostaza', b.dataset.f === f));
  refrescar();
}

const SIGUIENTE = { recibido: 'preparando', preparando: 'listo', listo: 'entregado' };

async function refrescar() {
  let ps;
  try { ps = await API.get('/api/pedidos'); }
  catch (e) { return; }
  pedidosCache = ps;

  // aviso de pedidos nuevos (con sonido)
  for (const p of ps)
    if (p.estado === 'enviado' && !vistos.has(p.id)) {
      vistos.add(p.id);
      if (!primeraCarga) {
        beep();
        toast(`🔔 Pedido nuevo #${p.numero} (${p.tipo === 'domicilio' ? 'domicilio' : 'recoger'})`);
      }
    }

  await vigilarMensajes(ps);
  primeraCarga = false;

  if (filtro === 'activos') ps = ps.filter(p => !['entregado', 'cancelado'].includes(p.estado));
  ps.sort((a, b) => b.fecha.localeCompare(a.fecha));

  // el refresco automático NO debe borrar lo que el cajero está escribiendo:
  // guardamos los valores de los campos de tiempo (y cuál tiene el foco) y los restauramos
  const valoresMin = {};
  document.querySelectorAll('#listaPedidos input[id^="min-"]').forEach(i => {
    if (i.value) valoresMin[i.id] = i.value;
  });
  const focoId = document.activeElement && document.activeElement.id
    && document.activeElement.id.startsWith('min-') ? document.activeElement.id : null;

  document.getElementById('listaPedidos').innerHTML = ps.length ? ps.map(p => `
    <div class="card">
      <div class="fila">
        <h3 style="margin:0">Pedido #${p.numero}</h3>
        <span class="chip ${p.estado}">${p.estado}</span>
        <span class="chip">${p.tipo === 'domicilio' ? '🛵 Servicio a domicilio' : p.tipo === 'local' ? '🍽 En restaurante' : '🏪 Recoger en tienda'}</span>
        ${p.cajeroNombre ? `<span class="chip" style="background:var(--crema)">👤 ${esc(p.cajeroNombre)}</span>` : ''}
        <div class="grow"></div>
        <b style="font-size:18px">${Q(p.total)}</b>
      </div>

      <table class="mt">
        <tr><th>Cant.</th><th>Producto</th><th>Detalle</th><th>Subtotal</th></tr>
        ${p.items.map(i => `
          <tr>
            <td>${i.cantidad}</td>
            <td>${esc(i.nombre)}</td>
            <td>${esc(i.nota || '—')}</td>
            <td>${Q(i.precio * i.cantidad)}</td>
          </tr>`).join('')}
      </table>

      ${p.notas ? `
        <p style="margin:10px 0;background:var(--mostaza);border:2px dashed var(--tinta);border-radius:8px;padding:8px 12px;font-weight:800">
          📝 Detalles del cliente: ${esc(p.notas)}
        </p>` : ''}

      <p style="margin:8px 0">
        👤 <b>${esc(p.cliente?.nombre || 'Cliente en tienda')}</b>
        ${p.cliente?.telefono ? ' · 📞 ' + esc(p.cliente.telefono) : ''}
        ${p.tipo === 'domicilio' ? '<br>📍 ' + esc(p.cliente?.direccion || '') : ''}
        <br>💳 ${esc(p.pago?.metodo || '')}
        ${p.pago?.metodo === 'efectivo' && p.pago.pagaCon
          ? ` — paga con ${Q(p.pago.pagaCon)} (cambio ${Q(p.pago.cambio)})` : ''}
      </p>

      <div class="fila">
        ${p.estado === 'enviado' ? `
          <span style="font-weight:800">✅ Recibir, listo en:</span>
          ${[5, 10, 15, 20, 25, 30].map(m =>
            `<button class="btn btn-mini btn-jalapeno" style="padding:9px 13px"
                     onclick="recibirCon('${p.id}', ${m})">${m}'</button>`).join('')}
          <input id="min-${p.id}" type="number" min="1" placeholder="otro" style="width:74px">
          <button class="btn btn-mini" onclick="recibir('${p.id}')">✓</button>` : ''}
        ${SIGUIENTE[p.estado] ? `
          <button class="btn btn-mini btn-mostaza" onclick="cambiarEstado('${p.id}','${SIGUIENTE[p.estado]}')">
            ➜ Marcar ${SIGUIENTE[p.estado]}
          </button>` : ''}
        ${p.tiempoEstimado ? `<span class="chip">⏱ ${esc(p.tiempoEstimado)} min</span>` : ''}
        <button class="btn btn-mini" onclick="abrirChat('${p.id}', ${p.numero})">💬 Chat</button>
        <button class="btn btn-mini btn-mostaza" onclick="imprimirTicket('${p.id}')">🖨 Imprimir ticket</button>
      </div>
    </div>`).join('')
    : '<div class="card centro">No hay pedidos por ahora. 🧘</div>';

  // restaurar lo que estaba escrito y el foco
  Object.entries(valoresMin).forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
  });
  if (focoId) {
    const el = document.getElementById(focoId);
    if (el) el.focus();
  }

  if (chatAbierto) cargarChat();
}

/* ---------- notificaciones de chat ---------- */

async function vigilarMensajes(ps) {
  let ms;
  try { ms = await API.get('/api/mensajes'); } // todos los mensajes de mis pedidos
  catch (e) { return; }

  const nuevosDeClientes = [];
  for (const m of ms) {
    if (!msjVistos.has(m.id)) {
      msjVistos.add(m.id);
      if (!primeraCarga && m.de === 'cliente') nuevosDeClientes.push(m);
    }
  }
  if (!nuevosDeClientes.length) return;

  beep();
  const ultimo = nuevosDeClientes[nuevosDeClientes.length - 1];
  const p = ps.find(x => x.id === ultimo.pedidoId);
  toast(`💬 Mensaje nuevo del cliente${p ? ' — Pedido #' + p.numero : ''}`);

  // abrir el chat automáticamente para no perderse de nada
  if (chatAbierto === ultimo.pedidoId) { cargarChat(); return; }
  if (!document.querySelector('.velo') && p) abrirChat(p.id, p.numero);
}

/* ---------- impresión POS ---------- */

function imprimirTicket(id) {
  imprimirTicketDe(pedidosCache.find(x => x.id === id));
}

function imprimirTicketDe(p) {
  if (!p) return;
  const linea = '--------------------------------';
  const fPago = p.pago || {};
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket #${p.numero}</title>
  <style>
    /* formato para impresoras POS térmicas (58/80 mm) */
    @page { margin: 0; }
    body {
      width: 72mm; margin: 0; padding: 4mm 3mm;
      font-family: 'Courier New', monospace; font-size: 12px; color: #000;
    }
    .c { text-align: center; }
    .g { font-size: 16px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { vertical-align: top; padding: 1px 0; }
    .der { text-align: right; }
    .tot { font-size: 15px; font-weight: bold; }
  </style></head><body>
    <div class="c g">LOS PERRONES</div>
    <div class="c">Hot dogs estilo americano</div>
    <div class="c">${linea}</div>
    <div>PEDIDO #${p.numero}</div>
    <div>${esc(p.fecha)}</div>
    <div>${p.tipo === 'domicilio' ? 'SERVICIO A DOMICILIO' : p.tipo === 'local' ? 'EN RESTAURANTE' : 'RECOGER EN TIENDA'}</div>
    <div>Cliente: ${esc(p.cliente?.nombre || '')}</div>
    ${p.cliente?.telefono ? `<div>Tel: ${esc(p.cliente.telefono)}</div>` : ''}
    ${p.tipo === 'domicilio' ? `<div>Dir: ${esc(p.cliente?.direccion || '')}</div>` : ''}
    <div class="c">${linea}</div>
    <table>
      ${p.items.map(i => `
        <tr><td>${i.cantidad} x ${esc(i.nombre)}</td>
            <td class="der">Q${(i.precio * i.cantidad).toFixed(2)}</td></tr>
        ${i.nota ? `<tr><td colspan="2">&nbsp;&nbsp;* ${esc(i.nota)}</td></tr>` : ''}`).join('')}
    </table>
    ${p.notas ? `<div class="c">${linea}</div><div>NOTAS: ${esc(p.notas)}</div>` : ''}
    <div class="c">${linea}</div>
    <table>
      <tr class="tot"><td>TOTAL</td><td class="der">Q${Number(p.total).toFixed(2)}</td></tr>
      <tr><td>Pago</td><td class="der">${esc(fPago.metodo || '')}</td></tr>
      ${fPago.metodo === 'efectivo' && fPago.pagaCon ? `
        <tr><td>Paga con</td><td class="der">Q${Number(fPago.pagaCon).toFixed(2)}</td></tr>
        <tr><td>Cambio</td><td class="der">Q${Number(fPago.cambio).toFixed(2)}</td></tr>` : ''}
    </table>
    ${p.tiempoEstimado ? `<div>Tiempo aprox: ${esc(p.tiempoEstimado)} min</div>` : ''}
    <div class="c">${linea}</div>
    <div class="c">¡Gracias por su compra!</div>
    <div class="c">🌭</div>
    <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`;
  const w = window.open('', 'ticket', 'width=380,height=640');
  if (!w) return toast('Permite las ventanas emergentes para imprimir');
  w.document.write(html);
  w.document.close();
  w.focus();
}

async function recibir(id) {
  const min = document.getElementById('min-' + id).value;
  if (!min || min <= 0) return toast('Indica el tiempo aproximado en minutos');
  recibirCon(id, min);
}

async function recibirCon(id, min) {
  await API.put('/api/pedidos', { id, estado: 'recibido', tiempoEstimado: String(min) });
  toast(`Pedido recibido — ${min} min avisados al cliente`);
  refrescar();
}

async function cambiarEstado(id, estado) {
  await API.put('/api/pedidos', { id, estado });
  refrescar();
}

/* ---------- chat ---------- */

function abrirChat(pedidoId, numero) {
  chatAbierto = pedidoId;
  const v = document.createElement('div');
  v.className = 'velo';
  v.innerHTML = `<div class="modal">
    <h2>💬 Chat — Pedido #${numero}</h2>
    <div class="chat-caja" id="cajaChat"></div>
    <div class="fila mt">
      <input id="txtChat" class="grow" placeholder="Mensaje para el cliente..."
             onkeydown="if(event.key==='Enter')enviarChat()">
      <button class="btn btn-salsa" onclick="enviarChat()">Enviar</button>
    </div>
    <div class="centro mt"><button class="btn btn-mini" onclick="cerrarChat()">Cerrar</button></div>
  </div>`;
  v.addEventListener('click', e => { if (e.target === v) cerrarChat(); });
  document.getElementById('modales').appendChild(v);
  cargarChat();
}

function cerrarChat() {
  chatAbierto = null;
  document.querySelector('.velo')?.remove();
}

async function cargarChat() {
  const caja = document.getElementById('cajaChat');
  if (!caja || !chatAbierto) return;
  const ms = await API.get('/api/mensajes?pedidoId=' + chatAbierto);
  caja.innerHTML = ms.map(m => `
    <div class="burbuja ${m.de === 'cajero' ? 'mia' : 'otra'}">
      ${esc(m.texto)}<small>${m.de === 'cajero' ? 'Tú' : 'Cliente'} · ${m.fecha.slice(11, 16)}</small>
    </div>`).join('') || '<i>Sin mensajes todavía.</i>';
  caja.scrollTop = caja.scrollHeight;
}

async function enviarChat() {
  const t = document.getElementById('txtChat');
  if (!t.value.trim()) return;
  await API.post('/api/mensajes', { pedidoId: chatAbierto, texto: t.value.trim() });
  t.value = '';
  cargarChat();
}

/* ==================== TOMAR PEDIDO (punto de venta táctil) ==================== */

const POS_CATS = [
  ['hotdog', '🌭 Hot Dogs'],
  ['combo',  '🎁 Combos'],
  ['extra',  '🧀 Extras'],
  ['snack',  '🍟 Snacks'],
  ['bebida', '🥤 Bebidas'],
];
let productosPos = [];
let carritoPos = [];
let catPos = 'hotdog';

function verVista(v) {
  document.querySelectorAll('#vistas .btn').forEach(b =>
    b.classList.toggle('btn-mostaza', b.dataset.v === v));
  document.getElementById('vista-pedidos').classList.toggle('oculto', v !== 'pedidos');
  document.getElementById('vista-tomar').classList.toggle('oculto', v !== 'tomar');
  if (v === 'tomar' && !productosPos.length) cargarPos();
}

async function cargarPos() {
  productosPos = await API.get('/api/productos');
  pintarPosTabs();
  pintarPosGrid();
  pintarCarritoPos();
}

function pintarPosTabs() {
  document.getElementById('posTabs').innerHTML = POS_CATS.map(([c, n]) =>
    `<button class="btn pos-tab ${c === catPos ? 'btn-salsa' : ''}"
             onclick="catPos='${c}';pintarPosTabs();pintarPosGrid()">${n}</button>`).join('');
}

function pintarPosGrid() {
  const lista = productosPos.filter(p => p.categoria === catPos);
  document.getElementById('posGrid').innerHTML = lista.map(p => {
    const agotado = !esActivo(p);
    return `
    <button class="pos-prod ${agotado ? 'agotado' : ''}" ${agotado ? 'disabled' : ''}
            onclick="tocarProducto('${p.id}')">
      <span class="pos-emoji">${p.imagen
        ? `<img src="${p.imagen}" alt="">` : emojiCat(p.categoria)}</span>
      <b>${esc(p.nombre)}</b>
      <span class="precio-tag" style="font-size:15px">${agotado ? 'No disponible' : Q(p.precio)}</span>
    </button>`;
  }).join('') || '<p>No hay productos en esta categoría.</p>';
}

/* --- tocar un producto: directo, combo o extra con destino --- */

function tocarProducto(id) {
  const p = productosPos.find(x => x.id === id);
  if (!esActivo(p)) return;
  if (p.categoria === 'combo') { posCombo(p); return; }
  if (p.categoria === 'extra') { posExtra(p); return; }
  if (p.categoria === 'hotdog') { posHotdog(p); return; }
  if (parseOpciones(p).length) { posSabor(p); return; }
  posAgregar(p, '');
}

function posSabor(p) {
  modalCajero(`
    <h2 style="color:var(--salsa)">${esc(p.nombre)} — ${Q(p.precio)}</h2>
    <label>Sabor</label>
    <div class="col">
      ${parseOpciones(p).map(o => `
        <button class="btn btn-mostaza" style="padding:16px;font-size:17px"
                onclick="posConfirmarSabor('${p.id}', '${esc(o).replace(/'/g, "\\'")}')">${esc(o)}</button>`).join('')}
    </div>
    <div class="centro mt"><button class="btn" onclick="cerrarModalCajero()">Cancelar</button></div>`);
}

function posConfirmarSabor(id, sabor) {
  const p = productosPos.find(x => x.id === id);
  posAgregar(p, 'Sabor: ' + sabor);
  cerrarModalCajero();
}

function posHotdog(p) {
  modalCajero(`
    <h2 style="color:var(--salsa)">${esc(p.nombre)} — ${Q(p.precio)}</h2>
    ${htmlPersonalizacion(productosPos)}
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModalCajero()">Cancelar</button>
      <button class="btn btn-salsa grow" style="padding:14px" onclick="posConfirmarHotdog('${p.id}')">Agregar</button>
    </div>`);
}

function posConfirmarHotdog(id) {
  const p = productosPos.find(x => x.id === id);
  const per = leerPersonalizacion(productosPos);
  posAgregar(p, per.nota, p.precio + per.extraTotal);
  cerrarModalCajero();
}

function posAgregar(p, nota, precioUnit) {
  const precio = precioUnit != null ? precioUnit : p.precio;
  const ya = carritoPos.find(i => i.productoId === p.id && i.nota === nota && i.precio === precio);
  if (ya) ya.cantidad++;
  else carritoPos.push({ productoId: p.id, nombre: p.nombre, precio, cantidad: 1, nota });
  pintarCarritoPos();
}

function posCombo(p) {
  const sel = (id, lista) =>
    `<select id="${id}" style="font-size:16px;padding:12px">${nombresConOpciones(lista).map(n => `<option>${esc(n)}</option>`).join('')}</select>`;
  const bebidas = productosPos.filter(x => x.categoria === 'bebida' && esActivo(x));
  const snacks  = productosPos.filter(x => x.categoria === 'snack' && esActivo(x));
  const dogs    = productosPos.filter(x => x.categoria === 'hotdog' && esActivo(x));
  const extras  = productosPos.filter(x => x.categoria === 'extra' && esActivo(x));
  const esJauria = /jaur/i.test(p.nombre);
  modalCajero(`
    <h2 style="color:var(--salsa)">${esc(p.nombre)} — ${Q(p.precio)}</h2>
    ${esJauria ? `
      <label>Hot dog #1</label>${sel('posDog1', dogs)}
      <label>Hot dog #2</label>${sel('posDog2', dogs)}
      <label>Topping extra #1</label>${sel('posEx1', extras)}
      <label>Topping extra #2</label>${sel('posEx2', extras)}` : ''}
    <label>Snack</label>${sel('posSnack', snacks)}
    <label>Bebida</label>${sel('posBebida', bebidas)}
    ${htmlPersonalizacion(productosPos)}
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModalCajero()">Cancelar</button>
      <button class="btn btn-salsa grow" style="padding:14px" onclick="posConfirmarCombo('${p.id}', ${esJauria})">Agregar</button>
    </div>`);
}

function posConfirmarCombo(id, esJauria) {
  const p = productosPos.find(x => x.id === id);
  const v = i => document.getElementById(i).value;
  let nota = '';
  if (esJauria) nota += `Dogs: ${v('posDog1')} + ${v('posDog2')} · Extras: ${v('posEx1')} + ${v('posEx2')} · `;
  nota += `Snack: ${v('posSnack')} · Bebida: ${v('posBebida')}`;
  const per = leerPersonalizacion(productosPos);
  if (per.nota) nota += ' · ' + per.nota;
  posAgregar(p, nota, p.precio + per.extraTotal);
  cerrarModalCajero();
}

function posExtra(p) {
  const destinos = [];
  carritoPos.forEach(i => {
    const prod = productosPos.find(x => x.id === i.productoId);
    const cat = prod ? prod.categoria : '';
    if (cat === 'hotdog' || cat === 'combo')
      for (let u = 1; u <= i.cantidad; u++)
        destinos.push(i.cantidad > 1 ? `${i.nombre} #${u}` : i.nombre);
  });
  if (!destinos.length) { posAgregar(p, 'Aparte (en vasito)'); return; }
  modalCajero(`
    <h2 style="color:var(--salsa)">${esc(p.nombre)} — ${Q(p.precio)}</h2>
    <label>¿Para qué hot dog?</label>
    <select id="posDestino" style="font-size:16px;padding:12px">
      ${destinos.map(d => `<option>${esc(d)}</option>`).join('')}
      <option value="__aparte__">Aparte (en vasito)</option>
    </select>
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModalCajero()">Cancelar</button>
      <button class="btn btn-salsa grow" style="padding:14px" onclick="posConfirmarExtra('${p.id}')">Agregar</button>
    </div>`);
}

function posConfirmarExtra(id) {
  const p = productosPos.find(x => x.id === id);
  const v = document.getElementById('posDestino').value;
  posAgregar(p, v === '__aparte__' ? 'Aparte (en vasito)' : 'Para el ' + v);
  cerrarModalCajero();
}

/* --- carrito del POS --- */

const posTotal = () => carritoPos.reduce((a, i) => a + i.precio * i.cantidad, 0);

function pintarCarritoPos() {
  document.getElementById('posItems').innerHTML = carritoPos.length ? carritoPos.map((i, k) => `
    <div class="fila" style="border:2px solid var(--tinta);border-radius:10px;padding:6px;background:var(--blanco)">
      <div class="grow" style="font-size:14px">
        <b>${esc(i.nombre)}</b> — ${Q(i.precio)}
        ${i.nota ? `<br><small>${esc(i.nota)}</small>` : ''}
      </div>
      <button class="btn btn-mini" style="padding:8px 12px" onclick="posCant(${k},-1)">−</button>
      <b>${i.cantidad}</b>
      <button class="btn btn-mini" style="padding:8px 12px" onclick="posCant(${k},1)">+</button>
    </div>`).join('')
    : '<p style="opacity:.6"><i>Toca los productos del menú para agregarlos 👈</i></p>';
  document.getElementById('posTotal').textContent = Q(posTotal());
  posCalcCambio();
}

function posCant(k, d) {
  carritoPos[k].cantidad += d;
  if (carritoPos[k].cantidad <= 0) carritoPos.splice(k, 1);
  pintarCarritoPos();
}

function limpiarPos() {
  carritoPos = [];
  document.getElementById('posNombre').value = '';
  document.getElementById('posPagaCon').value = '';
  pintarCarritoPos();
}

function posCambioPago() {
  document.getElementById('posZonaEfectivo').style.display =
    document.getElementById('posPago').value === 'efectivo' ? '' : 'none';
  posCalcCambio();
}

function posCalcCambio() {
  const el = document.getElementById('posCambio');
  if (!el) return;
  const con = parseFloat(document.getElementById('posPagaCon').value || 0);
  const t = posTotal();
  el.textContent = con >= t && t > 0 ? `Cambio: ${Q(con - t)}` : (con > 0 ? 'No alcanza para el total' : '');
}

/* --- cobrar --- */

async function cobrarPos() {
  if (!carritoPos.length) return toast('El pedido está vacío');
  const metodo = document.getElementById('posPago').value;
  const pagaCon = metodo === 'efectivo'
    ? parseFloat(document.getElementById('posPagaCon').value || 0) : null;
  if (metodo === 'efectivo' && (!pagaCon || pagaCon < posTotal()))
    return toast('Indica con cuánto paga el cliente (debe cubrir el total)');

  const pedido = {
    items: carritoPos,
    total: posTotal(),
    tipo: 'local',
    cliente: { nombre: document.getElementById('posNombre').value.trim() || 'Cliente en restaurante' },
    notas: '',
    pago: {
      metodo, pagaCon,
      cambio: metodo === 'efectivo' ? +(pagaCon - posTotal()).toFixed(2) : null,
    },
  };
  try {
    const p = await API.post('/api/pedidos', pedido);
    pedidosCache.push(p);
    beep();
    toast(`✅ Pedido #${p.numero} cobrado — ${Q(p.total)}`);
    imprimirTicketDe(p);   // ticket directo a la impresora POS
    limpiarPos();
    refrescar();
  } catch (e) { toast(e.message); }
}

/* --- modal genérico del cajero --- */

function modalCajero(html) {
  cerrarModalCajero();
  const v = document.createElement('div');
  v.className = 'velo';
  v.id = 'veloCajero';
  v.innerHTML = `<div class="modal">${html}</div>`;
  v.addEventListener('click', e => { if (e.target === v) cerrarModalCajero(); });
  document.getElementById('modales').appendChild(v);
}

function cerrarModalCajero() {
  document.getElementById('veloCajero')?.remove();
}
