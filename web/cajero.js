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
refrescar();
setInterval(refrescar, 4000);

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

  document.getElementById('listaPedidos').innerHTML = ps.length ? ps.map(p => `
    <div class="card">
      <div class="fila">
        <h3 style="margin:0">Pedido #${p.numero}</h3>
        <span class="chip ${p.estado}">${p.estado}</span>
        <span class="chip">${p.tipo === 'domicilio' ? '🛵 Servicio a domicilio' : '🏪 Recoger en tienda'}</span>
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
          <input id="min-${p.id}" type="number" min="1" placeholder="min" style="width:90px">
          <button class="btn btn-mini btn-jalapeno" onclick="recibir('${p.id}')">
            ✅ Recibir e indicar tiempo
          </button>` : ''}
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
  const p = pedidosCache.find(x => x.id === id);
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
    <div>${p.tipo === 'domicilio' ? 'SERVICIO A DOMICILIO' : 'RECOGER EN TIENDA'}</div>
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
  await API.put('/api/pedidos', { id, estado: 'recibido', tiempoEstimado: min });
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
