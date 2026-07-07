import com.sun.net.httpserver.*;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.Executors;

/**
 * Los Perrones - Servidor de la aplicación.
 * Java puro (JDK 17+), sin dependencias externas.
 *
 * Compilar:  javac -d out src/*.java
 * Ejecutar:  java -cp out Server
 * Abrir:     http://localhost:8080
 */
public class Server {

    static final int PUERTO = 8080;
    static final Path DB = Path.of("data", "db.json");
    static Map<String, Object> db;                       // base de datos en memoria
    static final Map<String, Map<String, Object>> sesiones = new HashMap<>(); // token -> {rol, usuario, id}

    public static void main(String[] args) throws Exception {
        cargar();
        HttpServer server = HttpServer.create(new InetSocketAddress(PUERTO), 0);
        server.createContext("/api/", Server::api);
        server.createContext("/", Server::estatico);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("==============================================");
        System.out.println("  LOS PERRONES corriendo en:");
        System.out.println("  http://localhost:" + PUERTO);
        System.out.println("  Cliente:  http://localhost:" + PUERTO + "/");
        System.out.println("  Personal: http://localhost:" + PUERTO + "/login.html");
        System.out.println("  (admin / admin123)");
        System.out.println("==============================================");
    }

    /* ==================== PERSISTENCIA ==================== */

    @SuppressWarnings("unchecked")
    static synchronized void cargar() throws IOException {
        if (Files.exists(DB)) {
            db = (Map<String, Object>) Json.parse(Files.readString(DB, StandardCharsets.UTF_8));
        } else {
            db = semilla();
            guardar();
        }
    }

    static synchronized void guardar() {
        try {
            Files.createDirectories(DB.getParent());
            Files.writeString(DB, Json.stringify(db), StandardCharsets.UTF_8);
        } catch (IOException e) {
            System.err.println("Error guardando db: " + e.getMessage());
        }
    }

    /* ==================== RUTEO API ==================== */

    static void api(HttpExchange ex) throws IOException {
        String metodo = ex.getRequestMethod();
        String ruta = ex.getRequestURI().getPath();
        Map<String, String> q = query(ex.getRequestURI().getQuery());
        Map<String, Object> body = leerBody(ex);
        Map<String, Object> ses = sesion(ex);
        String rol = ses == null ? "" : (String) ses.get("rol");

        try {
            Object resp = switch (ruta) {
                case "/api/login"     -> metodo.equals("POST") ? login(body) : err405();
                case "/api/config"    -> config(metodo, body, rol);
                case "/api/productos" -> productos(metodo, body, q, rol);
                case "/api/cajeros"   -> soloAdmin(rol) ? cajeros(metodo, body, q) : err403();
                case "/api/ausencias" -> soloAdmin(rol) ? ausencias(metodo, body, q) : err403();
                case "/api/finanzas"  -> soloAdmin(rol) ? finanzas(metodo, body, q) : err403();
                case "/api/reportes"  -> soloAdmin(rol) ? reportes(q) : err403();
                case "/api/pedidos"   -> pedidos(metodo, body, q, rol);
                case "/api/mensajes"  -> mensajes(metodo, body, q, rol);
                default -> mapa("error", "Ruta no encontrada");
            };
            int code = 200;
            if (resp instanceof Map<?, ?> m && m.containsKey("_status")) {
                code = ((Number) m.get("_status")).intValue();
                ((Map<?, ?>) resp).remove("_status");
            }
            responder(ex, code, resp);
        } catch (Exception e) {
            e.printStackTrace();
            responder(ex, 500, mapa("error", "Error interno: " + e.getMessage()));
        }
    }

    static boolean soloAdmin(String rol) { return "admin".equals(rol); }
    static Map<String, Object> err403() { return mapa("_status", 403, "error", "No autorizado"); }
    static Map<String, Object> err405() { return mapa("_status", 405, "error", "Método no permitido"); }

    /* ==================== LOGIN ==================== */

    @SuppressWarnings("unchecked")
    static Object login(Map<String, Object> b) {
        String u = str(b.get("usuario")), p = str(b.get("password"));
        Map<String, Object> admin = (Map<String, Object>) db.get("admin");
        if (u.equals(admin.get("usuario")) && p.equals(admin.get("password"))) {
            String t = UUID.randomUUID().toString();
            sesiones.put(t, mapa("rol", "admin", "usuario", u));
            return mapa("token", t, "rol", "admin", "nombre", "Administrador");
        }
        for (Object o : lista("cajeros")) {
            Map<String, Object> c = (Map<String, Object>) o;
            if (u.equals(c.get("usuario")) && p.equals(c.get("password"))) {
                String t = UUID.randomUUID().toString();
                sesiones.put(t, mapa("rol", "cajero", "usuario", u, "id", c.get("id")));
                return mapa("token", t, "rol", "cajero", "nombre", c.get("nombre"));
            }
        }
        return mapa("_status", 401, "error", "Usuario o contraseña incorrectos");
    }

    static Map<String, Object> sesion(HttpExchange ex) {
        String h = ex.getRequestHeaders().getFirst("Authorization");
        if (h == null || !h.startsWith("Bearer ")) return null;
        return sesiones.get(h.substring(7));
    }

    /* ==================== CONFIG (logo, nombre) ==================== */

    @SuppressWarnings("unchecked")
    static Object config(String metodo, Map<String, Object> b, String rol) {
        Map<String, Object> cfg = (Map<String, Object>) db.get("config");
        if (metodo.equals("GET")) return cfg;
        if (!soloAdmin(rol)) return err403();
        if (b.containsKey("logo")) cfg.put("logo", b.get("logo")); // string dataURL o null para eliminar
        if (b.containsKey("nombre")) cfg.put("nombre", b.get("nombre"));
        guardar();
        return cfg;
    }

    /* ==================== PRODUCTOS ==================== */

    @SuppressWarnings("unchecked")
    static Object productos(String metodo, Map<String, Object> b, Map<String, String> q, String rol) {
        List<Object> prods = lista("productos");
        switch (metodo) {
            case "GET": return prods;
            case "POST": {
                if (!soloAdmin(rol)) return err403();
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("id", nuevoId());
                p.put("nombre", str(b.get("nombre")));
                p.put("categoria", str(b.get("categoria"))); // hotdog | combo | bebida | extra | snack
                p.put("descripcion", str(b.get("descripcion")));
                p.put("precio", num(b.get("precio")));
                p.put("imagen", b.get("imagen"));
                p.put("video", b.get("video"));
                prods.add(p);
                guardar();
                return p;
            }
            case "PUT": {
                if (!soloAdmin(rol)) return err403();
                Map<String, Object> p = porId(prods, str(b.get("id")));
                if (p == null) return mapa("_status", 404, "error", "Producto no existe");
                for (String k : new String[]{"nombre", "categoria", "descripcion", "precio", "imagen", "video"})
                    if (b.containsKey(k)) p.put(k, b.get(k));
                guardar();
                return p;
            }
            case "DELETE": {
                if (!soloAdmin(rol)) return err403();
                prods.removeIf(o -> str(((Map<String, Object>) o).get("id")).equals(q.get("id")));
                guardar();
                return mapa("ok", true);
            }
        }
        return err405();
    }

    /* ==================== CAJEROS ==================== */

    @SuppressWarnings("unchecked")
    static Object cajeros(String metodo, Map<String, Object> b, Map<String, String> q) {
        List<Object> cs = lista("cajeros");
        switch (metodo) {
            case "GET": return cs;
            case "POST": {
                Map<String, Object> c = mapa(
                        "id", nuevoId(),
                        "nombre", str(b.get("nombre")),
                        "usuario", str(b.get("usuario")),
                        "password", str(b.get("password")),
                        "sueldo", num(b.get("sueldo")));
                cs.add(c);
                guardar();
                return c;
            }
            case "PUT": {
                Map<String, Object> c = porId(cs, str(b.get("id")));
                if (c == null) return mapa("_status", 404, "error", "Cajero no existe");
                for (String k : new String[]{"nombre", "usuario", "password", "sueldo"})
                    if (b.containsKey(k)) c.put(k, b.get(k));
                guardar();
                return c;
            }
            case "DELETE": {
                cs.removeIf(o -> str(((Map<String, Object>) o).get("id")).equals(q.get("id")));
                guardar();
                return mapa("ok", true);
            }
        }
        return err405();
    }

    /* ==================== AUSENCIAS (control de sueldos) ==================== */

    @SuppressWarnings("unchecked")
    static Object ausencias(String metodo, Map<String, Object> b, Map<String, String> q) {
        List<Object> as = lista("ausencias");
        switch (metodo) {
            case "GET": return as;
            case "POST": {
                Map<String, Object> a = mapa(
                        "id", nuevoId(),
                        "cajeroId", str(b.get("cajeroId")),
                        "fecha", str(b.get("fecha")),
                        "motivo", str(b.get("motivo")));
                as.add(a);
                guardar();
                return a;
            }
            case "DELETE": {
                as.removeIf(o -> str(((Map<String, Object>) o).get("id")).equals(q.get("id")));
                guardar();
                return mapa("ok", true);
            }
        }
        return err405();
    }

    /* ==================== FINANZAS (hoja de cálculo) ==================== */

    @SuppressWarnings("unchecked")
    static Object finanzas(String metodo, Map<String, Object> b, Map<String, String> q) {
        List<Object> fs = lista("finanzas");
        switch (metodo) {
            case "GET": return fs;
            case "POST": {
                Map<String, Object> f = mapa(
                        "id", nuevoId(),
                        "fecha", str(b.get("fecha")),
                        "tipo", str(b.get("tipo")), // ingreso | gasto | egreso | sueldo
                        "descripcion", str(b.get("descripcion")),
                        "monto", num(b.get("monto")));
                fs.add(f);
                guardar();
                return f;
            }
            case "PUT": {
                Map<String, Object> f = porId(fs, str(b.get("id")));
                if (f == null) return mapa("_status", 404, "error", "Registro no existe");
                for (String k : new String[]{"fecha", "tipo", "descripcion", "monto"})
                    if (b.containsKey(k)) f.put(k, b.get(k));
                guardar();
                return f;
            }
            case "DELETE": {
                fs.removeIf(o -> str(((Map<String, Object>) o).get("id")).equals(q.get("id")));
                guardar();
                return mapa("ok", true);
            }
        }
        return err405();
    }

    /* ==================== REPORTES ==================== */

    @SuppressWarnings("unchecked")
    static Object reportes(Map<String, String> q) {
        String desde = q.getOrDefault("desde", "0000-01-01");
        String hasta = q.getOrDefault("hasta", "9999-12-31");
        Map<String, Object> porProducto = new LinkedHashMap<>(); // nombre -> {cantidad, total}
        double totalVentas = 0;
        int pedidosEntrados = 0, pedidosCompletados = 0;

        for (Object o : lista("pedidos")) {
            Map<String, Object> p = (Map<String, Object>) o;
            String fecha = str(p.get("fecha")).substring(0, 10);
            if (fecha.compareTo(desde) < 0 || fecha.compareTo(hasta) > 0) continue;
            pedidosEntrados++;
            String estado = str(p.get("estado"));
            if (estado.equals("cancelado")) continue;
            pedidosCompletados++;
            for (Object it : (List<Object>) p.get("items")) {
                Map<String, Object> item = (Map<String, Object>) it;
                String nombre = str(item.get("nombre"));
                double cant = num(item.get("cantidad"));
                double sub = num(item.get("precio")) * cant;
                Map<String, Object> acc = (Map<String, Object>) porProducto
                        .computeIfAbsent(nombre, k -> mapa("cantidad", 0.0, "total", 0.0));
                acc.put("cantidad", num(acc.get("cantidad")) + cant);
                acc.put("total", num(acc.get("total")) + sub);
                totalVentas += sub;
            }
        }
        return mapa(
                "pedidosEntrados", pedidosEntrados,
                "pedidosVendidos", pedidosCompletados,
                "porProducto", porProducto,
                "totalVentas", totalVentas);
    }

    /* ==================== PEDIDOS ==================== */

    @SuppressWarnings("unchecked")
    static Object pedidos(String metodo, Map<String, Object> b, Map<String, String> q, String rol) {
        List<Object> ps = lista("pedidos");
        switch (metodo) {
            case "GET": {
                // Personal ve todo; el cliente solo lo suyo (por token de cliente)
                if (rol.equals("admin") || rol.equals("cajero")) return ps;
                String ct = q.get("clienteToken");
                List<Object> propios = new ArrayList<>();
                if (ct != null)
                    for (Object o : ps)
                        if (ct.equals(((Map<String, Object>) o).get("clienteToken"))) propios.add(o);
                return propios;
            }
            case "POST": { // cliente crea pedido
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("id", nuevoId());
                p.put("numero", siguienteNumero());
                p.put("fecha", ahora());
                p.put("clienteToken", str(b.get("clienteToken")));
                p.put("items", b.getOrDefault("items", new ArrayList<>()));
                p.put("total", num(b.get("total")));
                p.put("tipo", str(b.get("tipo"))); // domicilio | recoger
                p.put("cliente", b.get("cliente")); // {nombre, direccion, telefono}
                p.put("pago", b.get("pago"));       // {metodo, pagaCon, cambio}
                p.put("notas", str(b.get("notas"))); // detalles: "sin cebolla", "solo ketchup"...
                p.put("estado", "enviado");         // enviado -> recibido -> preparando -> listo -> entregado
                p.put("tiempoEstimado", null);
                ps.add(p);
                guardar();
                return p;
            }
            case "PUT": {
                Map<String, Object> p = porId(ps, str(b.get("id")));
                if (p == null) return mapa("_status", 404, "error", "Pedido no existe");
                if (rol.equals("cajero") || rol.equals("admin")) {
                    // cajero: actualizar estado / tiempo estimado
                    if (b.containsKey("estado")) p.put("estado", b.get("estado"));
                    if (b.containsKey("tiempoEstimado")) p.put("tiempoEstimado", b.get("tiempoEstimado"));
                } else {
                    // cliente: solo puede editar mientras el cajero no lo reciba
                    if (!str(b.get("clienteToken")).equals(p.get("clienteToken")))
                        return err403();
                    if (!"enviado".equals(p.get("estado")))
                        return mapa("_status", 409, "error", "El restaurante ya recibió el pedido, ya no se puede modificar");
                    for (String k : new String[]{"items", "total", "tipo", "cliente", "pago", "notas"})
                        if (b.containsKey(k)) p.put(k, b.get(k));
                }
                guardar();
                return p;
            }
            case "DELETE": {
                Map<String, Object> p = porId(ps, q.get("id"));
                if (p == null) return mapa("_status", 404, "error", "Pedido no existe");
                boolean esPersonal = rol.equals("admin") || rol.equals("cajero");
                if (!esPersonal) {
                    if (!str(q.get("clienteToken")).equals(p.get("clienteToken"))) return err403();
                    if (!"enviado".equals(p.get("estado")))
                        return mapa("_status", 409, "error", "El restaurante ya recibió el pedido, ya no se puede eliminar");
                }
                ps.remove(p);
                guardar();
                return mapa("ok", true);
            }
        }
        return err405();
    }

    static synchronized double siguienteNumero() {
        double n = num(db.getOrDefault("ultimoPedido", 0.0)) + 1;
        db.put("ultimoPedido", n);
        return n;
    }

    /* ==================== CHAT ==================== */

    @SuppressWarnings("unchecked")
    static Object mensajes(String metodo, Map<String, Object> b, Map<String, String> q, String rol) {
        List<Object> ms = lista("mensajes");
        switch (metodo) {
            case "GET": {
                String pid = q.get("pedidoId");
                List<Object> res = new ArrayList<>();
                for (Object o : ms)
                    if (str(((Map<String, Object>) o).get("pedidoId")).equals(pid)) res.add(o);
                return res;
            }
            case "POST": {
                String de = (rol.equals("cajero") || rol.equals("admin")) ? "cajero" : "cliente";
                Map<String, Object> m = mapa(
                        "id", nuevoId(),
                        "pedidoId", str(b.get("pedidoId")),
                        "de", de,
                        "texto", str(b.get("texto")),
                        "fecha", ahora());
                ms.add(m);
                guardar();
                return m;
            }
        }
        return err405();
    }

    /* ==================== ARCHIVOS ESTÁTICOS ==================== */

    static void estatico(HttpExchange ex) throws IOException {
        String ruta = ex.getRequestURI().getPath();
        if (ruta.equals("/")) ruta = "/index.html";
        Path f = Path.of("web", ruta.substring(1)).normalize();
        if (!f.startsWith(Path.of("web")) || !Files.exists(f) || Files.isDirectory(f)) {
            responder(ex, 404, mapa("error", "No encontrado"));
            return;
        }
        String mime = switch (nombreExt(f)) {
            case "html" -> "text/html; charset=utf-8";
            case "css"  -> "text/css; charset=utf-8";
            case "js"   -> "application/javascript; charset=utf-8";
            case "png"  -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "svg"  -> "image/svg+xml";
            case "ico"  -> "image/x-icon";
            default -> "application/octet-stream";
        };
        byte[] datos = Files.readAllBytes(f);
        ex.getResponseHeaders().set("Content-Type", mime);
        ex.sendResponseHeaders(200, datos.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(datos); }
    }

    static String nombreExt(Path f) {
        String n = f.getFileName().toString();
        int p = n.lastIndexOf('.');
        return p < 0 ? "" : n.substring(p + 1).toLowerCase();
    }

    /* ==================== UTILIDADES ==================== */

    static void responder(HttpExchange ex, int code, Object body) throws IOException {
        byte[] datos = Json.stringify(body).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(code, datos.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(datos); }
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> leerBody(HttpExchange ex) throws IOException {
        String texto = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        if (texto.isBlank()) return new LinkedHashMap<>();
        Object o = Json.parse(texto);
        return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<>();
    }

    static Map<String, String> query(String q) {
        Map<String, String> m = new HashMap<>();
        if (q == null) return m;
        for (String par : q.split("&")) {
            int i = par.indexOf('=');
            if (i > 0) m.put(
                    java.net.URLDecoder.decode(par.substring(0, i), StandardCharsets.UTF_8),
                    java.net.URLDecoder.decode(par.substring(i + 1), StandardCharsets.UTF_8));
        }
        return m;
    }

    @SuppressWarnings("unchecked")
    static List<Object> lista(String clave) {
        return (List<Object>) db.computeIfAbsent(clave, k -> new ArrayList<>());
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> porId(List<Object> l, String id) {
        for (Object o : l) {
            Map<String, Object> m = (Map<String, Object>) o;
            if (str(m.get("id")).equals(id)) return m;
        }
        return null;
    }

    static String nuevoId() { return UUID.randomUUID().toString().substring(0, 8); }
    static String ahora() { return LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")); }
    static String str(Object o) { return o == null ? "" : String.valueOf(o); }
    static double num(Object o) { return o instanceof Number n ? n.doubleValue() : 0; }

    static Map<String, Object> mapa(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    /* ==================== DATOS SEMILLA ==================== */

    static Map<String, Object> semilla() {
        List<Object> prods = new ArrayList<>();
        // Hot dogs
        prods.add(prod("Tradicional", "hotdog", "Salchicha envuelta en crujiente tocino, con mix de cebollas y pimientos salteados, chile jalapeño y salsas al gusto.", 20));
        prods.add(prod("Cheeto Power", "hotdog", "Salchicha envuelta en crujiente tocino, con mix de cebollas y pimientos salteados, chile jalapeño, salsas al gusto y Cheetos Flaming Hot.", 25));
        prods.add(prod("Hawaiano", "hotdog", "Salchicha envuelta en crujiente tocino, con mix de cebollas y pimientos salteados, chile jalapeño, piña dulce, salsas al gusto o aderezo chipotle.", 25));
        prods.add(prod("El Fundido", "hotdog", "Salchicha envuelta en crujiente tocino, con mix de cebollas y pimientos salteados, chile jalapeño, queso fundido, tocino y salsas al gusto.", 28));
        // Extras
        prods.add(prod("Queso Fundido", "extra", "Porción extra de queso fundido.", 6));
        prods.add(prod("Tocino", "extra", "Porción extra de tocino crujiente.", 6));
        prods.add(prod("Cebolla caramelizada", "extra", "Porción de cebolla caramelizada.", 5));
        prods.add(prod("Piña dulce", "extra", "Porción de piña dulce.", 5));
        prods.add(prod("Cheetos Flaming Hot", "extra", "Porción de Cheetos Flaming Hot.", 6));
        // Snacks
        prods.add(prod("Papas fritas", "snack", "Papas fritas doradas y saladitas.", 12));
        prods.add(prod("Nachos con queso", "snack", "Nachos bañados en queso fundido.", 15));
        prods.add(prod("Aros de cebolla", "snack", "Aros de cebolla crujientes.", 14));
        // Combos
        prods.add(prod("Combo Barillas", "combo", "Un hot dog Tradicional, snack de tus favoritos y bebida a elección.", 40));
        prods.add(prod("Combo Power", "combo", "Un hot dog Cheeto Power, snack de tus favoritos y bebida a elección.", 45));
        prods.add(prod("Combo Tropical", "combo", "Un hot dog Hawaiano, snack de tus favoritos y bebida a elección.", 45));
        prods.add(prod("Combo Quesito", "combo", "Un hot dog El Fundido, snack de tus favoritos y bebida a elección.", 48));
        prods.add(prod("Combo La Jauría", "combo", "2 hot dogs a tu elección, 2 toppings extras, snack de tus favoritos y bebida a elección.", 85));
        // Bebidas - latas
        prods.add(prod("Coca-Cola (lata)", "bebida", "Refresco en lata 355 ml.", 10));
        prods.add(prod("Tiky (lata)", "bebida", "Refresco en lata 355 ml.", 10));
        prods.add(prod("7up (lata)", "bebida", "Refresco en lata 355 ml.", 10));
        prods.add(prod("Crush (lata)", "bebida", "Refresco en lata 355 ml.", 10));
        prods.add(prod("Té frío (lata)", "bebida", "Té frío en lata 355 ml.", 10));
        // Bebidas - sodas saborizadas
        prods.add(prod("Soda Kiwi", "bebida", "Soda saborizada preparada al momento.", 12));
        prods.add(prod("Soda Manzana verde", "bebida", "Soda saborizada preparada al momento.", 12));
        prods.add(prod("Soda Frambuesa", "bebida", "Soda saborizada preparada al momento.", 12));
        prods.add(prod("Soda Durazno", "bebida", "Soda saborizada preparada al momento.", 12));
        prods.add(prod("Soda Fresa", "bebida", "Soda saborizada preparada al momento.", 12));

        Map<String, Object> d = new LinkedHashMap<>();
        d.put("config", mapa("nombre", "Los Perrones", "logo", null));
        d.put("admin", mapa("usuario", "admin", "password", "admin123"));
        d.put("productos", prods);
        d.put("cajeros", new ArrayList<>(List.of(
                mapa("id", nuevoId(), "nombre", "Cajero de prueba", "usuario", "cajero", "password", "cajero123", "sueldo", 3200.0))));
        d.put("ausencias", new ArrayList<>());
        d.put("finanzas", new ArrayList<>());
        d.put("pedidos", new ArrayList<>());
        d.put("mensajes", new ArrayList<>());
        d.put("ultimoPedido", 0.0);
        return d;
    }

    static Map<String, Object> prod(String nombre, String cat, String desc, double precio) {
        return mapa("id", nuevoId(), "nombre", nombre, "categoria", cat,
                "descripcion", desc, "precio", precio, "imagen", null, "video", null);
    }
}
