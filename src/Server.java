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
            migrarAdmins();
        } else {
            db = semilla();
            guardar();
        }
    }

    /** Bases de datos viejas tenían un solo "admin"; se migran a la lista "admins". */
    @SuppressWarnings("unchecked")
    static void migrarAdmins() {
        if (db.containsKey("admins")) return;
        List<Object> as = new ArrayList<>();
        Map<String, Object> viejo = db.get("admin") instanceof Map
                ? (Map<String, Object>) db.get("admin") : null;
        as.add(mapa("id", nuevoId(), "nombre", "Administrador",
                "usuario", viejo != null ? viejo.get("usuario") : "admin",
                "password", viejo != null ? viejo.get("password") : "admin123"));
        db.put("admins", as);
        db.remove("admin");
        guardar();
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
                case "/api/admins"    -> soloAdmin(rol) ? admins(metodo, body, q, ses) : err403();
                case "/api/cajeros"   -> soloAdmin(rol) ? cajeros(metodo, body, q) : err403();
                case "/api/ausencias" -> soloAdmin(rol) ? ausencias(metodo, body, q) : err403();
                case "/api/finanzas"  -> soloAdmin(rol) ? finanzas(metodo, body, q) : err403();
                case "/api/caja"      -> soloAdmin(rol) ? caja(metodo, body, q) : err403();
                case "/api/asignaciones" -> asignaciones(metodo, body, q, rol, ses);
                case "/api/inventario"-> soloAdmin(rol) ? inventario(metodo, body, q) : err403();
                case "/api/estadisticas" -> soloAdmin(rol) ? estadisticas(q) : err403();
                case "/api/reportes"  -> soloAdmin(rol) ? reportes(q) : err403();
                case "/api/pedidos"   -> pedidos(metodo, body, q, rol, ses);
                case "/api/mensajes"  -> mensajes(metodo, body, q, rol, ses);
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
        for (Object o : lista("admins")) {
            Map<String, Object> a = (Map<String, Object>) o;
            if (u.equals(a.get("usuario")) && p.equals(a.get("password"))) {
                String t = UUID.randomUUID().toString();
                sesiones.put(t, mapa("rol", "admin", "usuario", u, "id", a.get("id")));
                return mapa("token", t, "rol", "admin", "nombre", a.get("nombre"));
            }
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
        if (b.containsKey("redes")) cfg.put("redes", b.get("redes")); // {facebook, instagram, whatsapp}
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
                p.put("opciones", b.get("opciones")); // sabores/variantes: "Rojo, Verde, Anaranjado"
                p.put("activo", !Boolean.FALSE.equals(b.get("activo")));
                prods.add(p);
                guardar();
                return p;
            }
            case "PUT": {
                if (!soloAdmin(rol)) return err403();
                Map<String, Object> p = porId(prods, str(b.get("id")));
                if (p == null) return mapa("_status", 404, "error", "Producto no existe");
                for (String k : new String[]{"nombre", "categoria", "descripcion", "precio", "imagen", "video", "activo", "opciones"})
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

    /* ==================== ADMINISTRADORES (máximo 3) ==================== */

    @SuppressWarnings("unchecked")
    static Object admins(String metodo, Map<String, Object> b, Map<String, String> q, Map<String, Object> ses) {
        List<Object> as = lista("admins");
        switch (metodo) {
            case "GET": return as;
            case "POST": {
                if (as.size() >= 3)
                    return mapa("_status", 409, "error", "Máximo 3 administradores. Elimina uno para agregar otro.");
                String usuario = str(b.get("usuario")).trim();
                if (usuario.isBlank() || str(b.get("password")).isBlank())
                    return mapa("_status", 400, "error", "Usuario y contraseña son obligatorios");
                if (usuarioOcupado(usuario, null))
                    return mapa("_status", 409, "error", "Ese usuario ya existe (admin o cajero). Elige otro.");
                Map<String, Object> a = mapa(
                        "id", nuevoId(),
                        "nombre", str(b.get("nombre")).isBlank() ? "Administrador" : str(b.get("nombre")),
                        "usuario", usuario,
                        "password", str(b.get("password")));
                as.add(a);
                guardar();
                return a;
            }
            case "PUT": { // cambiar usuario/contraseña de cualquier admin (incluido uno mismo)
                Map<String, Object> a = porId(as, str(b.get("id")));
                if (a == null) return mapa("_status", 404, "error", "Administrador no existe");
                if (b.containsKey("usuario")) {
                    String usuario = str(b.get("usuario")).trim();
                    if (usuario.isBlank())
                        return mapa("_status", 400, "error", "El usuario no puede quedar vacío");
                    if (usuarioOcupado(usuario, str(a.get("id"))))
                        return mapa("_status", 409, "error", "Ese usuario ya existe (admin o cajero). Elige otro.");
                    a.put("usuario", usuario);
                }
                if (b.containsKey("password")) {
                    if (str(b.get("password")).isBlank())
                        return mapa("_status", 400, "error", "La contraseña no puede quedar vacía");
                    a.put("password", b.get("password"));
                }
                if (b.containsKey("nombre")) a.put("nombre", b.get("nombre"));
                guardar();
                return a;
            }
            case "DELETE": {
                String id = q.get("id");
                if (str(ses.get("id")).equals(id))
                    return mapa("_status", 409, "error",
                            "No puedes eliminarte a ti mismo. Pide a otro administrador que lo haga.");
                as.removeIf(o -> str(((Map<String, Object>) o).get("id")).equals(id));
                guardar();
                return mapa("ok", true);
            }
        }
        return err405();
    }

    /** ¿El usuario ya lo usa otro admin o algún cajero? */
    @SuppressWarnings("unchecked")
    static boolean usuarioOcupado(String usuario, String exceptoAdminId) {
        for (Object o : lista("admins")) {
            Map<String, Object> a = (Map<String, Object>) o;
            if (usuario.equals(a.get("usuario")) && !str(a.get("id")).equals(exceptoAdminId)) return true;
        }
        for (Object o : lista("cajeros"))
            if (usuario.equals(((Map<String, Object>) o).get("usuario"))) return true;
        return false;
    }

    /* ==================== CAJEROS ==================== */

    @SuppressWarnings("unchecked")
    static Object cajeros(String metodo, Map<String, Object> b, Map<String, String> q) {
        List<Object> cs = lista("cajeros");
        switch (metodo) {
            case "GET": return cs;
            case "POST": {
                if (usuarioOcupado(str(b.get("usuario")).trim(), null))
                    return mapa("_status", 409, "error", "Ese usuario ya existe (admin o cajero). Elige otro.");
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
            if (estado.equals("cancelado") || estado.equals("devuelto")) continue;
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

    /* ==================== CAJA (efectivo físico) ==================== */

    @SuppressWarnings("unchecked")
    static Object caja(String metodo, Map<String, Object> b, Map<String, String> q) {
        List<Object> cs = lista("caja");
        switch (metodo) {
            case "GET": return cs;
            case "POST": {
                Map<String, Object> m = mapa(
                        "id", nuevoId(),
                        "fecha", b.containsKey("fecha") && !str(b.get("fecha")).isBlank()
                                ? str(b.get("fecha")) : LocalDate.now().toString(),
                        "tipo", str(b.get("tipo")),       // entrada | salida
                        "concepto", str(b.get("concepto")),
                        "monto", num(b.get("monto")));
                cs.add(m);
                guardar();
                return m;
            }
            case "DELETE": {
                cs.removeIf(o -> str(((Map<String, Object>) o).get("id")).equals(q.get("id")));
                guardar();
                return mapa("ok", true);
            }
        }
        return err405();
    }

    /* ==================== CAJA POR CAJERO (fondo + corte) ==================== */

    @SuppressWarnings("unchecked")
    static Object asignaciones(String metodo, Map<String, Object> b, Map<String, String> q,
                               String rol, Map<String, Object> ses) {
        List<Object> as = lista("asignacionesCaja");
        switch (metodo) {
            case "GET": {
                if (rol.equals("admin")) return as;
                if (rol.equals("cajero")) {
                    // el cajero solo ve su asignación de hoy
                    String hoy = LocalDate.now().toString();
                    List<Object> propias = new ArrayList<>();
                    for (Object o : as) {
                        Map<String, Object> a = (Map<String, Object>) o;
                        if (str(ses.get("id")).equals(str(a.get("cajeroId")))
                                && hoy.equals(a.get("fecha"))) propias.add(o);
                    }
                    return propias;
                }
                return err403();
            }
            case "POST": {
                if (!soloAdmin(rol)) return err403();
                String cajeroId = str(b.get("cajeroId"));
                String fecha = b.containsKey("fecha") && !str(b.get("fecha")).isBlank()
                        ? str(b.get("fecha")) : LocalDate.now().toString();
                // no permitir dos cajas abiertas para el mismo cajero el mismo día
                for (Object o : as) {
                    Map<String, Object> a = (Map<String, Object>) o;
                    if (cajeroId.equals(a.get("cajeroId")) && fecha.equals(a.get("fecha"))
                            && "abierta".equals(a.get("estado")))
                        return mapa("_status", 409, "error",
                                "Ese cajero ya tiene una caja abierta para esa fecha. Ciérrala primero.");
                }
                Map<String, Object> desglose = b.get("desglose") instanceof Map
                        ? (Map<String, Object>) b.get("desglose") : new LinkedHashMap<>();
                Map<String, Object> a = mapa(
                        "id", nuevoId(),
                        "fecha", fecha,
                        "cajeroId", cajeroId,
                        "cajeroNombre", nombreCajero(cajeroId),
                        "desglose", desglose,
                        "total", totalDesglose(desglose),  // el total lo calcula el servidor
                        "estado", "abierta",
                        "cierre", null);
                as.add(a);
                guardar();
                return a;
            }
            case "PUT": { // editar fondo (si sigue abierta) o cierre / corte de caja
                if (!soloAdmin(rol)) return err403();
                Map<String, Object> a = porId(as, str(b.get("id")));
                if (a == null) return mapa("_status", 404, "error", "Asignación no existe");
                if ("cerrada".equals(a.get("estado")))
                    return mapa("_status", 409, "error", "Esta caja ya fue cerrada");
                // ajustar el fondo antes del cierre
                if (Boolean.TRUE.equals(b.get("soloEditar"))) {
                    Map<String, Object> d = b.get("desglose") instanceof Map
                            ? (Map<String, Object>) b.get("desglose") : new LinkedHashMap<>();
                    a.put("desglose", d);
                    a.put("total", totalDesglose(d));
                    guardar();
                    return a;
                }
                Map<String, Object> desgloseCierre = b.get("desglose") instanceof Map
                        ? (Map<String, Object>) b.get("desglose") : new LinkedHashMap<>();
                double contado = totalDesglose(desgloseCierre);
                double ventasEfectivo = efectivoDelCajero(str(a.get("cajeroId")), str(a.get("fecha")));
                double esperado = num(a.get("total")) + ventasEfectivo;
                a.put("estado", "cerrada");
                a.put("cierre", mapa(
                        "fecha", ahora(),
                        "desglose", desgloseCierre,
                        "contado", contado,
                        "ventasEfectivo", ventasEfectivo,
                        "esperado", esperado,
                        "diferencia", contado - esperado)); // negativo = faltante, positivo = sobrante
                guardar();
                return a;
            }
            case "DELETE": {
                if (!soloAdmin(rol)) return err403();
                as.removeIf(o -> str(((Map<String, Object>) o).get("id")).equals(q.get("id")));
                guardar();
                return mapa("ok", true);
            }
        }
        return err405();
    }

    /** Suma un desglose de denominaciones: {"100": 2, "50": 2, ...} -> Q. */
    static double totalDesglose(Map<String, Object> d) {
        double t = 0;
        for (Map.Entry<String, Object> e : d.entrySet()) {
            try { t += Double.parseDouble(e.getKey()) * num(e.getValue()); }
            catch (NumberFormatException ignored) { }
        }
        return Math.round(t * 100) / 100.0;
    }

    /** Ventas en efectivo de un cajero en un día (pedidos que él recibió). */
    @SuppressWarnings("unchecked")
    static double efectivoDelCajero(String cajeroId, String fecha) {
        double t = 0;
        for (Object o : lista("pedidos")) {
            Map<String, Object> p = (Map<String, Object>) o;
            if (!ESTADOS_VENTA.contains(str(p.get("estado")))) continue;
            if (!cajeroId.equals(str(p.get("cajeroId")))) continue;
            if (!str(p.get("fecha")).startsWith(fecha)) continue;
            Map<String, Object> pago = p.get("pago") instanceof Map ? (Map<String, Object>) p.get("pago") : Map.of();
            if ("efectivo".equals(pago.get("metodo"))) t += num(p.get("total"));
        }
        return t;
    }

    /* ==================== INVENTARIO ==================== */

    @SuppressWarnings("unchecked")
    static Object inventario(String metodo, Map<String, Object> b, Map<String, String> q) {
        List<Object> inv = lista("inventario");
        switch (metodo) {
            case "GET": return inv;
            case "POST": {
                Map<String, Object> it = mapa(
                        "id", nuevoId(),
                        "nombre", str(b.get("nombre")),
                        "unidad", str(b.get("unidad")),      // unidades, lb, paquetes...
                        "cantidad", num(b.get("cantidad")),
                        "minimo", num(b.get("minimo")),      // alerta cuando cantidad <= minimo
                        "costo", num(b.get("costo")));       // costo unitario en Q
                inv.add(it);
                guardar();
                return it;
            }
            case "PUT": {
                Map<String, Object> it = porId(inv, str(b.get("id")));
                if (it == null) return mapa("_status", 404, "error", "Artículo no existe");
                for (String k : new String[]{"nombre", "unidad", "cantidad", "minimo", "costo"})
                    if (b.containsKey(k)) it.put(k, b.get(k));
                guardar();
                return it;
            }
            case "DELETE": {
                inv.removeIf(o -> str(((Map<String, Object>) o).get("id")).equals(q.get("id")));
                guardar();
                return mapa("ok", true);
            }
        }
        return err405();
    }

    /* ==================== ESTADÍSTICAS ==================== */

    static final Set<String> ESTADOS_VENTA = Set.of("recibido", "preparando", "listo", "entregado");

    @SuppressWarnings("unchecked")
    static Object estadisticas(Map<String, String> q) {
        String desde = q.getOrDefault("desde", "0000-01-01");
        String hasta = q.getOrDefault("hasta", "9999-12-31");
        String hoy = LocalDate.now().toString();

        double ventasTotal = 0, efectivoVentasRango = 0;
        int numPedidos = 0;
        double domicilio = 0, recoger = 0, efectivo = 0, transferencia = 0;
        Map<String, double[]> porDia = new TreeMap<>();        // fecha -> [total, pedidos]
        Map<String, double[]> top = new LinkedHashMap<>();     // nombre -> [cantidad, total]
        double efectivoVentasTodas = 0, efectivoVentasHoy = 0; // para el saldo de caja

        int pedidosCancelados = 0, pedidosDevueltos = 0;
        double montoCancelado = 0, montoDevuelto = 0;

        for (Object o : lista("pedidos")) {
            Map<String, Object> p = (Map<String, Object>) o;
            String est = str(p.get("estado"));
            String diaP = str(p.get("fecha"));
            diaP = diaP.length() >= 10 ? diaP.substring(0, 10) : diaP;
            boolean enRango = diaP.compareTo(desde) >= 0 && diaP.compareTo(hasta) <= 0;
            if (enRango && est.equals("cancelado")) { pedidosCancelados++; montoCancelado += num(p.get("total")); }
            if (enRango && est.equals("devuelto"))  { pedidosDevueltos++;  montoDevuelto += num(p.get("total")); }
            if (!ESTADOS_VENTA.contains(est)) continue;
            String fecha = str(p.get("fecha"));
            String dia = fecha.length() >= 10 ? fecha.substring(0, 10) : fecha;
            double total = num(p.get("total"));
            Map<String, Object> pago = p.get("pago") instanceof Map ? (Map<String, Object>) p.get("pago") : Map.of();
            boolean esEfectivo = "efectivo".equals(pago.get("metodo"));

            // saldo de caja: todas las ventas en efectivo de la historia (y las de hoy)
            if (esEfectivo) {
                efectivoVentasTodas += total;
                if (dia.equals(hoy)) efectivoVentasHoy += total;
            }

            if (dia.compareTo(desde) < 0 || dia.compareTo(hasta) > 0) continue;

            numPedidos++;
            ventasTotal += total;
            porDia.computeIfAbsent(dia, k -> new double[2]);
            porDia.get(dia)[0] += total;
            porDia.get(dia)[1] += 1;
            if ("domicilio".equals(p.get("tipo"))) domicilio += total; else recoger += total;
            if (esEfectivo) { efectivo += total; efectivoVentasRango += total; }
            else transferencia += total;

            for (Object it : (List<Object>) p.get("items")) {
                Map<String, Object> item = (Map<String, Object>) it;
                double[] acc = top.computeIfAbsent(str(item.get("nombre")), k -> new double[2]);
                acc[0] += num(item.get("cantidad"));
                acc[1] += num(item.get("precio")) * num(item.get("cantidad"));
            }
        }

        double ticketPromedio = numPedidos > 0 ? ventasTotal / numPedidos : 0;
        double mediaDiaria = !porDia.isEmpty() ? ventasTotal / porDia.size() : 0;

        // finanzas manuales dentro del rango
        double ingresosMan = 0, gastos = 0, egresos = 0, sueldos = 0;
        for (Object o : lista("finanzas")) {
            Map<String, Object> f = (Map<String, Object>) o;
            String fecha = str(f.get("fecha"));
            if (fecha.compareTo(desde) < 0 || fecha.compareTo(hasta) > 0) continue;
            double m = num(f.get("monto"));
            switch (str(f.get("tipo"))) {
                case "ingreso" -> ingresosMan += m;
                case "gasto"   -> gastos += m;
                case "egreso"  -> egresos += m;
                case "sueldo"  -> sueldos += m;
            }
        }
        double perdidas = gastos + egresos + sueldos;
        double ganancia = ventasTotal + ingresosMan - perdidas;

        // caja: saldo total histórico = ventas en efectivo + entradas - salidas
        double entradasCaja = 0, salidasCaja = 0;
        for (Object o : lista("caja")) {
            Map<String, Object> m = (Map<String, Object>) o;
            if ("entrada".equals(m.get("tipo"))) entradasCaja += num(m.get("monto"));
            else salidasCaja += num(m.get("monto"));
        }
        double saldoCaja = efectivoVentasTodas + entradasCaja - salidasCaja;

        // inventario: valor total y artículos con poca existencia
        double valorInventario = 0;
        List<Object> bajoStock = new ArrayList<>();
        for (Object o : lista("inventario")) {
            Map<String, Object> it = (Map<String, Object>) o;
            valorInventario += num(it.get("cantidad")) * num(it.get("costo"));
            if (num(it.get("cantidad")) <= num(it.get("minimo")))
                bajoStock.add(mapa("nombre", it.get("nombre"), "cantidad", it.get("cantidad"),
                        "minimo", it.get("minimo"), "unidad", it.get("unidad")));
        }

        // top productos ordenado por cantidad (máximo 8)
        List<Object> topLista = new ArrayList<>();
        top.entrySet().stream()
                .sorted((a, b2) -> Double.compare(b2.getValue()[0], a.getValue()[0]))
                .limit(8)
                .forEach(e -> topLista.add(mapa("nombre", e.getKey(),
                        "cantidad", e.getValue()[0], "total", e.getValue()[1])));

        // por día como lista ordenada
        List<Object> dias = new ArrayList<>();
        porDia.forEach((d, v) -> dias.add(mapa("fecha", d, "total", v[0], "pedidos", v[1])));

        return mapa(
                "ventasTotal", ventasTotal,
                "numPedidos", numPedidos,
                "ticketPromedio", ticketPromedio,
                "mediaDiaria", mediaDiaria,
                "porDia", dias,
                "topProductos", topLista,
                "porTipo", mapa("domicilio", domicilio, "recoger", recoger),
                "porPago", mapa("efectivo", efectivo, "transferencia", transferencia),
                "ingresosManuales", ingresosMan,
                "gastos", gastos, "egresos", egresos, "sueldos", sueldos,
                "perdidas", perdidas,
                "ganancia", ganancia,
                "saldoCaja", saldoCaja,
                "entradasCaja", entradasCaja, "salidasCaja", salidasCaja,
                "efectivoVentasHoy", efectivoVentasHoy,
                "efectivoVentasTotal", efectivoVentasTodas,
                "valorInventario", valorInventario,
                "bajoStock", bajoStock,
                "pedidosCancelados", pedidosCancelados, "montoCancelado", montoCancelado,
                "pedidosDevueltos", pedidosDevueltos, "montoDevuelto", montoDevuelto);
    }

    /* ==================== PEDIDOS ==================== */

    @SuppressWarnings("unchecked")
    static Object pedidos(String metodo, Map<String, Object> b, Map<String, String> q, String rol, Map<String, Object> ses) {
        List<Object> ps = lista("pedidos");
        switch (metodo) {
            case "GET": {
                if (rol.equals("admin")) return ps; // el admin ve todo
                if (rol.equals("cajero")) {
                    // cada cajero ve: pedidos nuevos sin recibir + SU propio historial de HOY
                    List<Object> visibles = new ArrayList<>();
                    for (Object o : ps)
                        if (pedidoVisibleParaCajero((Map<String, Object>) o, ses)) visibles.add(o);
                    return visibles;
                }
                String ct = q.get("clienteToken");
                List<Object> propios = new ArrayList<>();
                if (ct != null && !ct.isBlank())
                    for (Object o : ps)
                        if (ct.equals(((Map<String, Object>) o).get("clienteToken"))) propios.add(o);
                return propios;
            }
            case "POST": { // cliente crea pedido; el cajero también puede (tomado en el restaurante)
                boolean esCajero = rol.equals("cajero");
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("id", nuevoId());
                p.put("numero", siguienteNumero());
                p.put("fecha", ahora());
                p.put("clienteToken", str(b.get("clienteToken")));
                p.put("items", b.getOrDefault("items", new ArrayList<>()));
                p.put("total", num(b.get("total")));
                p.put("tipo", str(b.get("tipo"))); // domicilio | recoger | local (en el restaurante)
                p.put("cliente", b.get("cliente")); // {nombre, direccion, telefono}
                p.put("pago", b.get("pago"));       // {metodo, pagaCon, cambio}
                p.put("notas", str(b.get("notas"))); // detalles: "sin cebolla", "solo ketchup"...
                if (esCajero) {
                    // tomado directo en caja: ya está recibido y queda en el historial de ese cajero
                    p.put("estado", "recibido");
                    p.put("cajeroId", ses.get("id"));
                    p.put("cajeroNombre", nombreCajero(str(ses.get("id"))));
                    p.put("tiempoEstimado", b.get("tiempoEstimado"));
                } else {
                    p.put("estado", "enviado");     // enviado -> recibido -> preparando -> listo -> entregado
                    p.put("tiempoEstimado", null);
                }
                ps.add(p);
                guardar();
                return p;
            }
            case "PUT": {
                Map<String, Object> p = porId(ps, str(b.get("id")));
                if (p == null) return mapa("_status", 404, "error", "Pedido no existe");
                if (rol.equals("cajero") || rol.equals("admin")) {
                    String nuevoEstado = str(b.get("estado"));
                    // al recibirlo (o cancelarlo directo), el pedido queda asignado a ese cajero
                    if (rol.equals("cajero") && p.get("cajeroId") == null
                            && Set.of("recibido", "cancelado", "devuelto").contains(nuevoEstado)) {
                        p.put("cajeroId", ses.get("id"));
                        p.put("cajeroNombre", nombreCajero(str(ses.get("id"))));
                    }
                    // cancelación o devolución: guardar motivo y quién lo hizo (para control)
                    if (Set.of("cancelado", "devuelto").contains(nuevoEstado)) {
                        p.put("motivoCancelacion", str(b.get("motivo")));
                        p.put("anuladoPor", rol.equals("cajero")
                                ? nombreCajero(str(ses.get("id"))) : "Administrador");
                        p.put("fechaAnulacion", ahora());
                    }
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

    /** Un cajero ve los pedidos nuevos (sin recibir) y su propio historial del día de hoy. */
    static boolean pedidoVisibleParaCajero(Map<String, Object> p, Map<String, Object> ses) {
        if ("enviado".equals(p.get("estado"))) return true; // pendientes: los ve cualquier cajero
        String hoy = LocalDate.now().toString();
        return str(ses.get("id")).equals(str(p.get("cajeroId")))
                && str(p.get("fecha")).startsWith(hoy);
    }

    @SuppressWarnings("unchecked")
    static String nombreCajero(String id) {
        for (Object o : lista("cajeros")) {
            Map<String, Object> c = (Map<String, Object>) o;
            if (str(c.get("id")).equals(id)) return str(c.get("nombre"));
        }
        return "";
    }

    /* ==================== CHAT ==================== */

    @SuppressWarnings("unchecked")
    static Object mensajes(String metodo, Map<String, Object> b, Map<String, String> q, String rol, Map<String, Object> ses) {
        List<Object> ms = lista("mensajes");
        switch (metodo) {
            case "GET": {
                String pid = q.get("pedidoId");
                if (pid != null) { // chat de un pedido concreto
                    List<Object> res = new ArrayList<>();
                    for (Object o : ms)
                        if (str(((Map<String, Object>) o).get("pedidoId")).equals(pid)) res.add(o);
                    return res;
                }
                // sin pedidoId: todos los mensajes que le corresponden (para notificaciones)
                Set<String> pedidosVisibles = new HashSet<>();
                if (rol.equals("admin")) {
                    for (Object o : lista("pedidos"))
                        pedidosVisibles.add(str(((Map<String, Object>) o).get("id")));
                } else if (rol.equals("cajero")) {
                    for (Object o : lista("pedidos"))
                        if (pedidoVisibleParaCajero((Map<String, Object>) o, ses))
                            pedidosVisibles.add(str(((Map<String, Object>) o).get("id")));
                } else {
                    String ct = q.get("clienteToken");
                    if (ct != null && !ct.isBlank())
                        for (Object o : lista("pedidos"))
                            if (ct.equals(((Map<String, Object>) o).get("clienteToken")))
                                pedidosVisibles.add(str(((Map<String, Object>) o).get("id")));
                }
                List<Object> res = new ArrayList<>();
                for (Object o : ms)
                    if (pedidosVisibles.contains(str(((Map<String, Object>) o).get("pedidoId")))) res.add(o);
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
        prods.add(prod("Papalinas", "snack", "Papalinas doradas polvoreadas con barbacoa.", 12));
        Map<String, Object> doritos = prod("Doritos", "snack", "Doritos crujientes, elige tu sabor favorito.", 12);
        doritos.put("opciones", "Rojo, Verde, Anaranjado");
        prods.add(doritos);
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
        d.put("config", mapa("nombre", "Los Perrones", "logo", null,
                "redes", mapa("facebook", "", "instagram", "", "whatsapp", "")));
        d.put("admins", new ArrayList<>(List.of(
                mapa("id", nuevoId(), "nombre", "Administrador",
                        "usuario", "admin", "password", "admin123"))));
        d.put("productos", prods);
        d.put("cajeros", new ArrayList<>(List.of(
                mapa("id", nuevoId(), "nombre", "Cajero de prueba", "usuario", "cajero", "password", "cajero123", "sueldo", 3200.0))));
        d.put("ausencias", new ArrayList<>());
        d.put("finanzas", new ArrayList<>());
        d.put("caja", new ArrayList<>());
        d.put("asignaciones", new ArrayList<>());
        d.put("inventario", new ArrayList<>(List.of(
                mapa("id", nuevoId(), "nombre", "Salchichas", "unidad", "unidades", "cantidad", 50.0, "minimo", 15.0, "costo", 3.5),
                mapa("id", nuevoId(), "nombre", "Pan para hot dog", "unidad", "unidades", "cantidad", 50.0, "minimo", 15.0, "costo", 1.5),
                mapa("id", nuevoId(), "nombre", "Tocino", "unidad", "lb", "cantidad", 10.0, "minimo", 3.0, "costo", 25.0),
                mapa("id", nuevoId(), "nombre", "Cheetos Flaming Hot", "unidad", "bolsas", "cantidad", 12.0, "minimo", 4.0, "costo", 8.0),
                mapa("id", nuevoId(), "nombre", "Refrescos en lata", "unidad", "latas", "cantidad", 48.0, "minimo", 12.0, "costo", 5.0))));
        d.put("pedidos", new ArrayList<>());
        d.put("mensajes", new ArrayList<>());
        d.put("ultimoPedido", 0.0);
        return d;
    }

    static Map<String, Object> prod(String nombre, String cat, String desc, double precio) {
        return mapa("id", nuevoId(), "nombre", nombre, "categoria", cat,
                "descripcion", desc, "precio", precio, "imagen", null, "video", null, "activo", true);
    }
}
