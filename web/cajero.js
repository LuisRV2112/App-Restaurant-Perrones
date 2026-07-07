/* ================= CAJERO — Los Perrones ================= */

requiereRol('cajero');
document.getElementById('quien').textContent = '👤 ' + (sessionStorage.getItem('nombre') || '');

let filtro = 'activos';
let chatAbierto = null;
let vistos = new Set(); // para avisar de pedidos nuevos

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

  // aviso de pedidos nuevos
  for (const p of ps)
    if (p.estado === 'enviado' && !vistos.has(p.id)) {
      vistos.add(p.id);
      toast(`🔔 Pedido nuevo #${p.numero} (${p.tipo === 'domicilio' ? 'domicilio' : 'recoger'})`);
    }

  if (filtro === 'activos') ps = ps.filter(p => !['entregado', 'cancelado'].includes(p.estado));
  ps.sort((a, b) => b.fecha.localeCompare(a.fecha));

  document.getElementById('listaPedidos').innerHTML = ps.length ? ps.map(p => `
    <div class="card">
      <div class="fila">
        <h3 style="margin:0">Pedido #${p.numero}</h3>
        <span class="chip ${p.estado}">${p.estado}</span>
        <span class="chip">${p.tipo === 'domicilio' ? '🛵 Servicio a domicilio' : '🏪 Recoger en tienda'}</span>
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
      </div>
    </div>`).join('')
    : '<div class="card centro">No hay pedidos por ahora. 🧘</div>';

  if (chatAbierto) cargarChat();
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
