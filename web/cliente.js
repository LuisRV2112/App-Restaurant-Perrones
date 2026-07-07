/* ================= CLIENTE — Los Perrones ================= */

let productos = [];
let carrito = JSON.parse(localStorage.getItem('carrito') || '[]');
let editandoPedido = null; // id de pedido que se está editando
let datosPrevios = null;   // datos del pedido que se está modificando (para precargar)
let chatAbierto = null;    // pedidoId del chat abierto

const CATS = [
  ['hotdog', '🌭 Hot Dogs'],
  ['combo',  '🎁 Combos'],
  ['extra',  '🧀 Extras'],
  ['snack',  '🍟 Snacks'],
  ['bebida', '🥤 Bebidas'],
];

/* token anónimo para que el cliente sea dueño de sus pedidos */
if (!localStorage.getItem('clienteToken'))
  localStorage.setItem('clienteToken', crypto.randomUUID());
const clienteToken = localStorage.getItem('clienteToken');

init();
async function init() {
  pintarLogo();
  productos = await API.get('/api/productos');
  pintarMenu();
  actualizarBadge();
  setInterval(refrescarPedidos, 4000);
}

/* ==================== MENÚ (scroll continuo) ==================== */

function pintarMenu() {
  // barra de navegación que sigue al usuario
  document.getElementById('navCats').innerHTML = CATS.map(([c, n]) =>
    `<button class="btn btn-mini" data-cat="${c}" onclick="irACat('${c}')">${n}</button>`).join('');

  // todas las categorías, una debajo de otra
  document.getElementById('menuCompleto').innerHTML = CATS.map(([c, n]) => {
    const lista = productos.filter(p => p.categoria === c);
    if (!lista.length) return '';
    return `
      <section class="seccion-cat" id="cat-${c}">
        <h2 class="titulo-cat">${n}</h2>
        <div class="grid-menu">
          ${lista.map(p => tarjetaProducto(p)).join('')}
        </div>
      </section>`;
  }).join('');

  // resaltar en la barra la sección que se está viendo
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        document.querySelectorAll('#navCats .btn').forEach(b =>
          b.classList.toggle('btn-salsa', b.dataset.cat === e.target.id.replace('cat-', '')));
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('.seccion-cat').forEach(s => obs.observe(s));
}

function tarjetaProducto(p) {
  return `
    <article class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
      ${imgProducto(p)}
      <div style="padding:14px;display:flex;flex-direction:column;gap:8px;flex:1">
        <div class="fila">
          <h3 style="font-size:20px;margin:0" class="grow">${esc(p.nombre)}</h3>
          <span class="precio-tag">${Q(p.precio)}</span>
        </div>
        <p style="margin:0;font-size:14px;flex:1">${esc(p.descripcion)}</p>
        <div class="fila">
          <button class="btn btn-salsa grow" onclick="agregar('${p.id}')">Agregar al carrito</button>
          ${p.video ? `<button class="btn btn-mini" onclick="verVideo('${p.id}')">🎬 Video</button>` : ''}
        </div>
      </div>
    </article>`;
}

function irACat(c) {
  document.getElementById('cat-' + c)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function verVideo(id) {
  const p = productos.find(x => x.id === id);
  let cuerpo;
  const v = p.video || '';
  const yt = v.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) cuerpo = `<iframe width="100%" height="300" style="border:2px solid var(--tinta);border-radius:10px"
                      src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen></iframe>`;
  else cuerpo = `<video src="${v}" controls style="width:100%;border:2px solid var(--tinta);border-radius:10px"></video>`;
  modal(`<h2>${esc(p.nombre)}</h2>${cuerpo}
         <div class="mt centro"><button class="btn" onclick="cerrarModal()">Cerrar</button></div>`);
}

/* ==================== AGREGAR (combos y extras con destino) ==================== */

function agregar(id) {
  const p = productos.find(x => x.id === id);
  if (p.categoria === 'combo') { personalizarCombo(p); return; }
  if (p.categoria === 'extra') { elegirDestinoExtra(p); return; }
  meterAlCarrito(p, '');
}

/* --- extras: el cliente indica a qué hot dog se le agrega --- */
function elegirDestinoExtra(p) {
  // hot dogs sueltos y combos que ya están en el carrito, uno por unidad
  const destinos = [];
  carrito.forEach(i => {
    const prod = productos.find(x => x.id === i.productoId);
    const cat = prod ? prod.categoria : '';
    if (cat === 'hotdog' || cat === 'combo')
      for (let u = 1; u <= i.cantidad; u++)
        destinos.push(i.cantidad > 1 ? `${i.nombre} #${u}` : i.nombre);
  });

  if (!destinos.length) {
    modal(`
      <h2 style="color:var(--salsa)">${esc(p.nombre)}</h2>
      <p>Los extras se agregan a un hot dog. Todavía no tienes ningún hot dog
         o combo en tu carrito. 🌭</p>
      <p>¿Quieres llevarlo <b>aparte</b> (por ejemplo, en un vasito)?</p>
      <div class="fila mt">
        <button class="btn grow" onclick="cerrarModal()">Cancelar</button>
        <button class="btn btn-salsa grow" onclick="confirmarExtra('${p.id}', null)">Llevarlo aparte</button>
      </div>`);
    return;
  }

  modal(`
    <h2 style="color:var(--salsa)">${esc(p.nombre)} — ${Q(p.precio)}</h2>
    <label>¿A qué hot dog se lo agregamos?</label>
    <select id="opDestino">
      ${destinos.map(d => `<option>${esc(d)}</option>`).join('')}
      <option value="__aparte__">Aparte (en vasito, sin agregar a un hot dog)</option>
    </select>
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModal()">Cancelar</button>
      <button class="btn btn-salsa grow" onclick="confirmarExtra('${p.id}')">Agregar extra</button>
    </div>`);
}

function confirmarExtra(id, forzarAparte) {
  const p = productos.find(x => x.id === id);
  let nota;
  if (forzarAparte === null) nota = 'Aparte (en vasito)';
  else {
    const v = document.getElementById('opDestino').value;
    nota = v === '__aparte__' ? 'Aparte (en vasito)' : 'Para el ' + v;
  }
  meterAlCarrito(p, nota);
  cerrarModal();
}

/* --- combos --- */
function personalizarCombo(p) {
  const bebidas = productos.filter(x => x.categoria === 'bebida');
  const snacks  = productos.filter(x => x.categoria === 'snack');
  const dogs    = productos.filter(x => x.categoria === 'hotdog');
  const extras  = productos.filter(x => x.categoria === 'extra');
  const sel = (id, lista) =>
    `<select id="${id}">${lista.map(x => `<option>${esc(x.nombre)}</option>`).join('')}</select>`;
  const esJauria = /jaur/i.test(p.nombre);

  modal(`
    <h2 style="color:var(--salsa)">${esc(p.nombre)}</h2>
    <p>${esc(p.descripcion)}</p>
    ${esJauria ? `
      <label>Hot dog #1</label>${sel('opDog1', dogs)}
      <label>Hot dog #2</label>${sel('opDog2', dogs)}
      <label>Topping extra #1</label>${sel('opEx1', extras)}
      <label>Topping extra #2</label>${sel('opEx2', extras)}` : ''}
    <label>Snack de tus favoritos</label>${sel('opSnack', snacks)}
    <label>Bebida a elección</label>${sel('opBebida', bebidas)}
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModal()">Cancelar</button>
      <button class="btn btn-salsa grow" onclick="confirmarCombo('${p.id}', ${esJauria})">Agregar ${Q(p.precio)}</button>
    </div>`);
}

function confirmarCombo(id, esJauria) {
  const p = productos.find(x => x.id === id);
  const v = i => document.getElementById(i).value;
  let nota = '';
  if (esJauria) nota += `Dogs: ${v('opDog1')} + ${v('opDog2')} · Extras: ${v('opEx1')} + ${v('opEx2')} · `;
  nota += `Snack: ${v('opSnack')} · Bebida: ${v('opBebida')}`;
  meterAlCarrito(p, nota);
  cerrarModal();
}

function meterAlCarrito(p, nota) {
  const ya = carrito.find(i => i.productoId === p.id && i.nota === nota);
  if (ya) ya.cantidad++;
  else carrito.push({ productoId: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, nota });
  guardarCarrito();
  toast(`${p.nombre} agregado 🌭`);
}

function guardarCarrito() {
  localStorage.setItem('carrito', JSON.stringify(carrito));
  actualizarBadge();
}

function actualizarBadge() {
  document.getElementById('cantCarrito').textContent =
    carrito.reduce((a, i) => a + i.cantidad, 0);
}

const totalCarrito = () => carrito.reduce((a, i) => a + i.precio * i.cantidad, 0);

/* ==================== CARRITO ==================== */

function abrirCarrito() {
  if (!carrito.length) {
    modal(`<h2>Tu carrito está vacío</h2>
           <p>Agrega unos perrones del menú para empezar tu pedido. 🌭</p>
           <div class="centro"><button class="btn btn-salsa" onclick="cerrarModal()">Ir al menú</button></div>`);
    return;
  }
  modal(`
    <h2 style="color:var(--salsa)">${editandoPedido ? 'Editando pedido' : 'Tu carrito'}</h2>
    <div class="col">${carrito.map((i, k) => `
      <div class="fila" style="border:2px solid var(--tinta);border-radius:10px;padding:8px;background:var(--blanco)">
        <div class="grow">
          <b>${esc(i.nombre)}</b> — ${Q(i.precio)}
          ${i.nota ? `<br><small>${esc(i.nota)}</small>` : ''}
        </div>
        <button class="btn btn-mini" onclick="cambiarCant(${k},-1)">−</button>
        <b>${i.cantidad}</b>
        <button class="btn btn-mini" onclick="cambiarCant(${k},1)">+</button>
        <button class="btn btn-mini btn-salsa" onclick="quitarItem(${k})" title="Eliminar producto">🗑</button>
      </div>`).join('')}
    </div>
    <h3 class="mt centro">Total: <span class="precio-tag">${Q(totalCarrito())}</span></h3>
    <div class="fila mt">
      <button class="btn grow" onclick="cerrarModal()">Seguir viendo</button>
      <button class="btn btn-jalapeno grow" onclick="abrirCheckout()">Continuar ➜</button>
    </div>`);
}

function cambiarCant(k, d) {
  carrito[k].cantidad += d;
  if (carrito[k].cantidad <= 0) carrito.splice(k, 1);
  guardarCarrito();
  carrito.length ? abrirCarrito() : cerrarModal();
}

function quitarItem(k) {
  carrito.splice(k, 1);
  guardarCarrito();
  carrito.length ? abrirCarrito() : cerrarModal();
}

/* ==================== CHECKOUT ==================== */

function abrirCheckout() {
  const d = datosPrevios || {}; // datos precargados al modificar un pedido
  modal(`
    <h2 style="color:var(--salsa)">Datos del pedido</h2>

    <label>¿Cómo quieres tu pedido?</label>
    <div class="fila">
      <button class="btn grow" id="btnRecoger" onclick="setTipo('recoger')">🏪 Recoger en tienda</button>
      <button class="btn grow" id="btnDomicilio" onclick="setTipo('domicilio')">🛵 Servicio a domicilio</button>
    </div>

    <div id="datosEntrega">
      <label>Nombre completo</label>
      <input id="fNombre" placeholder="Tu nombre completo" value="${esc(d.cliente?.nombre || '')}">
      <span id="soloDomicilio">
        <label>Dirección</label>
        <input id="fDireccion" placeholder="Zona, calle, casa..." value="${esc(d.cliente?.direccion || '')}">
      </span>
      <label>Número de teléfono</label>
      <input id="fTelefono" placeholder="5555-5555" value="${esc(d.cliente?.telefono || '')}">
    </div>

    <label>📝 Detalles del pedido (opcional)</label>
    <textarea id="fDetalles" rows="3"
      placeholder="Ej. hot dog tradicional sin cebolla y sin mostaza, el otro solo con ketchup">${esc(d.notas || '')}</textarea>

    <label>Método de pago</label>
    <select id="fPago" onchange="cambioPago()">
      <option value="efectivo">Efectivo</option>
      <option value="transferencia" ${d.pago?.metodo === 'transferencia' ? 'selected' : ''}>Transferencia</option>
    </select>
    <span id="zonaEfectivo">
      <label>¿Con cuánto vas a pagar? (para llevar tu cambio)</label>
      <input id="fPagaCon" type="number" min="0" step="0.01" placeholder="Ej. 100.00" oninput="calcCambio()"
             value="${d.pago?.pagaCon ?? ''}">
      <p id="txtCambio" style="font-weight:800"></p>
    </span>

    <h3 class="centro">Total: <span class="precio-tag">${Q(totalCarrito())}</span></h3>
    <div class="fila mt">
      <button class="btn grow" onclick="abrirCarrito()">← Volver</button>
      <button class="btn btn-salsa grow" onclick="enviarPedido()">
        ${editandoPedido ? 'Guardar cambios' : 'Enviar pedido 🚀'}
      </button>
    </div>`);
  setTipo(d.tipo || 'recoger');
  cambioPago();
  calcCambio();
}

let tipoPedido = 'recoger';
function setTipo(t) {
  tipoPedido = t;
  document.getElementById('btnRecoger').className = 'btn grow' + (t === 'recoger' ? ' btn-mostaza' : '');
  document.getElementById('btnDomicilio').className = 'btn grow' + (t === 'domicilio' ? ' btn-mostaza' : '');
  document.getElementById('soloDomicilio').style.display = t === 'domicilio' ? '' : 'none';
}

function cambioPago() {
  document.getElementById('zonaEfectivo').style.display =
    document.getElementById('fPago').value === 'efectivo' ? '' : 'none';
}

function calcCambio() {
  const con = parseFloat(document.getElementById('fPagaCon').value || 0);
  const t = totalCarrito();
  document.getElementById('txtCambio').textContent =
    con >= t ? `Tu cambio será: ${Q(con - t)}` : (con > 0 ? 'La cantidad no alcanza para el total 😅' : '');
}

async function enviarPedido() {
  const val = id => document.getElementById(id).value.trim();
  const nombre = val('fNombre'), telefono = val('fTelefono');
  const direccion = tipoPedido === 'domicilio' ? val('fDireccion') : '';
  const metodo = val('fPago');
  const pagaCon = metodo === 'efectivo' ? parseFloat(val('fPagaCon') || 0) : null;

  if (!nombre) return toast('Escribe tu nombre completo');
  if (!telefono) return toast('Escribe tu número de teléfono');
  if (tipoPedido === 'domicilio' && !direccion) return toast('Escribe tu dirección');
  if (metodo === 'efectivo' && (!pagaCon || pagaCon < totalCarrito()))
    return toast('Indica con cuánto pagarás (debe cubrir el total)');

  const pedido = {
    clienteToken,
    items: carrito,
    total: totalCarrito(),
    tipo: tipoPedido,
    cliente: { nombre, direccion, telefono },
    notas: document.getElementById('fDetalles').value.trim(),
    pago: {
      metodo,
      pagaCon,
      cambio: metodo === 'efectivo' ? +(pagaCon - totalCarrito()).toFixed(2) : null,
    },
  };

  try {
    if (editandoPedido) {
      await API.put('/api/pedidos', { id: editandoPedido, ...pedido });
      toast('Pedido actualizado ✔');
    } else {
      await API.post('/api/pedidos', pedido);
      toast('¡Pedido enviado! 🌭🚀');
    }
    carrito = []; editandoPedido = null; datosPrevios = null;
    guardarCarrito();
    cerrarModal();
    verSeccion('pedidos');
  } catch (e) { toast(e.message); }
}

/* ==================== MIS PEDIDOS ==================== */

function verSeccion(s) {
  document.getElementById('sec-menu').classList.toggle('oculto', s !== 'menu');
  document.getElementById('sec-pedidos').classList.toggle('oculto', s !== 'pedidos');
  if (s === 'pedidos') refrescarPedidos();
}

async function refrescarPedidos() {
  if (document.getElementById('sec-pedidos').classList.contains('oculto')) return;
  const ps = await API.get('/api/pedidos?clienteToken=' + clienteToken);
  ps.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const cont = document.getElementById('listaPedidos');
  cont.innerHTML = ps.length ? ps.map(p => `
    <div class="card">
      <div class="fila">
        <h3 style="margin:0">Pedido #${p.numero}</h3>
        <span class="chip ${p.estado}">${p.estado}</span>
        <span class="chip">${p.tipo === 'domicilio' ? '🛵 Domicilio' : '🏪 Recoger'}</span>
        <div class="grow"></div>
        <b>${Q(p.total)}</b>
      </div>
      <p style="margin:6px 0">${p.items.map(i => `${i.cantidad}× ${esc(i.nombre)}`).join(' · ')}</p>
      ${p.notas ? `<p style="margin:6px 0;background:var(--crema);border:2px dashed var(--tinta);border-radius:8px;padding:6px 10px">📝 ${esc(p.notas)}</p>` : ''}
      ${p.tiempoEstimado
        ? `<p style="font-weight:800;color:var(--jalapeno)">⏱ Tiempo aproximado: ${esc(p.tiempoEstimado)} minutos</p>`
        : (p.estado === 'enviado'
            ? '<p><i>Esperando a que el restaurante reciba tu pedido...</i></p>'
            : '')}
      ${p.pago && p.pago.metodo === 'efectivo' && p.pago.cambio != null
        ? `<p>💵 Pagas con ${Q(p.pago.pagaCon)} — cambio: ${Q(p.pago.cambio)}</p>` : ''}
      <div class="fila">
        ${p.estado === 'enviado' ? `
          <button class="btn btn-mini btn-mostaza" onclick="editarPedido('${p.id}')">✏️ Modificar</button>
          <button class="btn btn-mini btn-salsa" onclick="eliminarPedido('${p.id}')">🗑 Eliminar pedido</button>` : ''}
        <button class="btn btn-mini" onclick="abrirChat('${p.id}', ${p.numero})">💬 Chat con el cajero</button>
      </div>
    </div>`).join('')
    : '<div class="card centro">Todavía no has hecho ningún pedido. ¡Anímate! 🌭</div>';

  if (chatAbierto) cargarChat();
}

function editarPedido(id) {
  API.get('/api/pedidos?clienteToken=' + clienteToken).then(ps => {
    const p = ps.find(x => x.id === id);
    if (!p) return;
    if (p.estado !== 'enviado') return toast('El restaurante ya recibió este pedido');
    carrito = p.items;
    editandoPedido = id;
    datosPrevios = p;
    guardarCarrito();
    abrirCarrito();
  });
}

async function eliminarPedido(id) {
  if (!confirm('¿Eliminar este pedido?')) return;
  try {
    await API.del(`/api/pedidos?id=${id}&clienteToken=${clienteToken}`);
    toast('Pedido eliminado');
    refrescarPedidos();
  } catch (e) { toast(e.message); }
}

/* ==================== CHAT ==================== */

function abrirChat(pedidoId, numero) {
  chatAbierto = pedidoId;
  modal(`
    <h2>💬 Chat — Pedido #${numero}</h2>
    <div class="chat-caja" id="cajaChat"></div>
    <div class="fila mt">
      <input id="txtChat" class="grow" placeholder="Escribe un mensaje..."
             onkeydown="if(event.key==='Enter')enviarChat()">
      <button class="btn btn-salsa" onclick="enviarChat()">Enviar</button>
    </div>
    <div class="centro mt"><button class="btn btn-mini" onclick="chatAbierto=null;cerrarModal()">Cerrar</button></div>`);
  cargarChat();
}

async function cargarChat() {
  if (!chatAbierto) return;
  const caja = document.getElementById('cajaChat');
  if (!caja) return;
  const ms = await API.get('/api/mensajes?pedidoId=' + chatAbierto);
  caja.innerHTML = ms.map(m => `
    <div class="burbuja ${m.de === 'cliente' ? 'mia' : 'otra'}">
      ${esc(m.texto)}<small>${m.de === 'cliente' ? 'Tú' : 'Cajero'} · ${m.fecha.slice(11, 16)}</small>
    </div>`).join('') || '<i>Sin mensajes todavía. Saluda al cajero 👋</i>';
  caja.scrollTop = caja.scrollHeight;
}

async function enviarChat() {
  const t = document.getElementById('txtChat');
  if (!t.value.trim()) return;
  await API.post('/api/mensajes', { pedidoId: chatAbierto, texto: t.value.trim() });
  t.value = '';
  cargarChat();
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
