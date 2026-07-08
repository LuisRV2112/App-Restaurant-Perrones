# 🌭 Los Perrones — Aplicación web del restaurante

Aplicación completa para el restaurante de comida rápida **Los Perrones** (hot dogs estilo americano).

**Tecnologías:** Java (JDK 17 o superior, sin librerías externas), HTML, CSS y JavaScript.
El backend es un servidor HTTP hecho con `com.sun.net.httpserver` que expone una API REST
y guarda todos los datos en `data/db.json` (persisten aunque se reinicie el servidor).

---

## ▶️ Cómo ejecutar

Requisito: tener instalado un **JDK 17+** (`javac` y `java`).

```bash
# Linux / Mac
./run.sh

# Windows
run.bat

# O manualmente:
javac -d out src/*.java
java -cp out Server
```

Luego abrir en el navegador:

| Página | URL |
|---|---|
| Tienda (cliente) | http://localhost:8080/ |
| Acceso del personal | http://localhost:8080/login.html |

## 👥 Usuarios de prueba

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Cajero | `cajero` | `cajero123` |

El cliente **no necesita cuenta**: pide directamente desde la tienda.

---

## ✅ Funcionalidades por rol

### Cliente
- Menú completo en **scroll continuo** (optimizado para PC y celular): al ir bajando se ven todas las categorías, con una barra fija para saltar a hot dogs, combos, extras, snacks o bebidas.
- Personalizar combos (snack y bebida a elección; el Combo La Jauría permite elegir 2 hot dogs y 2 toppings extra).
- Al agregar un **extra**, el cliente indica **a qué hot dog del carrito se le agrega** (o pedirlo aparte en vasito).
- Carrito: agregar, cambiar cantidades y eliminar productos mientras arma el pedido.
- Enviar el pedido para **recoger en tienda** o **servicio a domicilio** (nombre completo, dirección, teléfono).
- Métodos de pago: **efectivo** (indica con cuánto paga y el sistema calcula el cambio) o **transferencia**.
- Cuadro de **detalles del pedido** (ej. "hot dog tradicional sin cebolla y sin mostaza, el otro solo con ketchup"): el cajero lo ve resaltado en cada pedido y se puede cambiar al modificar el pedido.
- **Modificar o eliminar** su pedido mientras el cajero aún no lo reciba.
- Ver el **tiempo aproximado** que indica el restaurante cuando recibe el pedido.
- **Chat** con el cajero por cada pedido, con **notificaciones**: cuando el cajero escribe suena una alerta (WebAudio) y el chat **se abre solo** para no perderse de nada; también avisa cuando el pedido cambia de estado.
- Al **modificar un pedido** (antes de que lo reciban) se regresa al menú completo: puede **agregar más hot dogs, combos, bebidas o lo que quiera**, con una barra fija de "Revisar y guardar / Cancelar".

### Cajero
- Recibe los pedidos en tiempo real (la pantalla se actualiza sola y avisa de pedidos nuevos).
- Ve si el pedido es para **recoger en tienda** o **a domicilio**, con todos los datos del cliente y del pago (incluido el cambio a llevar).
- Al recibir el pedido **ingresa el tiempo aproximado** en minutos, que se le muestra al cliente.
- Avanza el estado del pedido: recibido → preparando → listo → entregado.
- **Chat** con el cliente de cada pedido, con **notificación sonora y apertura automática** del chat cuando el cliente escribe; también suena cuando entra un pedido nuevo.
- **🖨 Imprimir ticket**: cada pedido se puede mandar a la **impresora POS** (formato de 72 mm, fuente monoespaciada) con productos, notas, total, pago y cambio.
- **🛒 Tomar pedido (modo tablet, todo táctil)**: apartado para atender clientes en el restaurante — botones grandes por categoría, un toque agrega el producto (los combos piden snack/bebida y los extras a qué hot dog van), cambio calculado en vivo, y al cobrar el pedido **nace recibido, asignado a ese cajero** (cuenta en su historial, su caja y las estadísticas) y el **ticket sale solo a la impresora**. Estos pedidos quedan como "🍽 En restaurante".
- **Historial propio**: cada cajero ve los pedidos pendientes y únicamente los pedidos que **él mismo recibió hoy** — cada día empieza un historial nuevo, y el pedido queda marcado con el nombre del cajero que lo atendió.

### Administrador
- **Productos:** agregar, editar y eliminar productos; cambiar **precios en Quetzales**; subir o quitar **imágenes**; agregar o quitar **videos**, ya sea **pegando un enlace** (YouTube o .mp4) o **subiendo el archivo MP4** (máx. 12 MB).
- **Logo y redes:** agregar, actualizar o eliminar el logo del restaurante (se muestra en todas las páginas), y configurar las **redes sociales** (Facebook, Instagram y WhatsApp) que aparecen al final de la tienda; con WhatsApp se agrega además un **botón flotante** para que los clientes escriban directo.
- **Cajeros:** agregar, actualizar o eliminar cajeros (con usuario, contraseña y sueldo).
- **Asistencia:** registrar los días que un cajero no llegó a trabajar; el sistema calcula el descuento y el sueldo a pagar del mes.
- **Finanzas** con 4 secciones:
  - **📊 Resumen**: cuánto hay **en caja**, **ganancia o pérdida** del mes, ventas, pérdidas/salidas, **ticket promedio** (media por pedido), **media de venta diaria**, valor del inventario y alertas de artículos por agotarse.
  - **💵 Caja**: control del efectivo físico — las ventas en efectivo entran solas y se registran entradas y salidas manuales; muestra el saldo actual.
  - **👤 Caja por cajero (fondo y corte)**: el admin asigna a cada cajero su fondo del día **desglosado por denominaciones** (ej. 2×Q100, 5×Q20, 10×Q10...) y el sistema calcula el total solo. El cajero ve su caja asignada en su panel. Al final del día se hace el **corte**: se cuenta el efectivo billete por billete y el sistema compara contra fondo + ventas en efectivo de ese cajero, marcando si **cuadró, falta o sobra** — sin pérdidas sin explicación. No se pueden abrir dos cajas al mismo cajero el mismo día ni cerrar dos veces.
  - **🧮 Hoja de cálculo libre**: se escribe directo sobre las celdas (como en Excel) y se guarda solo; conectada a las ventas del cajero.
  - **📦 Inventario**: artículos con existencia, mínimo de alerta, costo unitario y valor total; botones +/− para ajustar rápido y filas en rojo cuando hay que comprar.
- **Reportes y estadísticas:** además del detalle por producto, incluye **gráfica de ventas por día**, ganancia/pérdida del período, ticket promedio, media diaria, top de más vendidos, y distribución domicilio vs tienda y efectivo vs transferencia, todo filtrable por fechas.
- **Reportes:** cuántos pedidos entraron, unidades vendidas por producto (hot dogs, combos, bebidas, etc.) y **total de ventas en Q**, con filtro por rango de fechas.

---

## 🗂 Estructura

```
los-perrones/
├── src/
│   ├── Server.java     ← servidor HTTP + API REST + datos semilla
│   └── Json.java       ← mini librería JSON (sin dependencias)
├── web/
│   ├── index.html      ← tienda (cliente)  + cliente.js
│   ├── login.html      ← acceso del personal
│   ├── cajero.html     ← panel del cajero  + cajero.js
│   ├── admin.html      ← panel del admin   + admin.js
│   ├── common.js       ← utilidades compartidas
│   └── styles.css      ← identidad visual "rótulo callejero"
├── data/db.json        ← se crea solo al primer arranque (con el menú cargado)
├── run.sh / run.bat
└── README.md
```

## 📝 Notas

- Las imágenes (máx. 1.5 MB) y los videos MP4 subidos (máx. 12 MB) se guardan en base64 dentro de `db.json`.
- La interfaz es **responsive**: funciona en PC y en celulares (para probar desde tu teléfono en la misma red WiFi, entra a `http://IP-de-tu-PC:8080`).
- Para reiniciar la aplicación con los datos originales, basta con borrar `data/db.json`.
- El chat y los pedidos se actualizan por sondeo cada 4 segundos.
