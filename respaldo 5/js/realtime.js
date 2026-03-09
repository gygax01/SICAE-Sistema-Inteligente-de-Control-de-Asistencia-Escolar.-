/* ======================================================
   ===== API COMPATIBLE (SUPABASE/POSTGRESQL) ===========
====================================================== */

const SUPABASE_PROJECT_URL = "https://vqylvfutuiococveggej.supabase.co";
const SUPABASE_REST_URL = `${SUPABASE_PROJECT_URL}/rest/v1`;
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_C3jhIFoDyrdFr5PuTU2_tg_D8-WWItk";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxeWx2ZnV0dWlvY29jdmVnZ2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjIxNzMsImV4cCI6MjA4ODM5ODE3M30.JjG3-RLOYSpGnacdC9fwSgDG17Z_5rz5RHt6PUN7Y5M";
const DEFAULT_API_BASE_URL = SUPABASE_REST_URL;
const SUPABASE_API_KEY_STORAGE_KEY = "SUPABASE_API_KEY";

function esSupabaseRest(url) {
  return /supabase\.co\/rest\/v1$/i.test(String(url || "").trim().replace(/\/+$/, ""));
}

function isSupabaseRestOfCurrentProject(url) {
  const clean = String(url || "").trim().replace(/\/+$/, "");
  if (!esSupabaseRest(clean)) return false;
  try {
    return new URL(clean).host === new URL(SUPABASE_REST_URL).host;
  } catch {
    return false;
  }
}

function resolveSupabaseApiKey() {
  const fromWindow = String(window.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (fromWindow) return fromWindow;

  const fromStorage = String(localStorage.getItem(SUPABASE_API_KEY_STORAGE_KEY) || "").trim();
  if (fromStorage) return fromStorage;

  return SUPABASE_PUBLISHABLE_KEY;
}

function resolveBearerToken() {
  const fromAuth = typeof getAuthToken === "function"
    ? getAuthToken()
    : String(localStorage.getItem("asistencia_auth_token") || "");

  const token = String(fromAuth || "").trim();
  if (!token || token.startsWith("sb_publishable_") || token === "postgrest-direct") {
    return SUPABASE_ANON_KEY;
  }
  return token;
}

const API_BASE_URL = (() => {
  const fromWindow = String(window.API_BASE_URL || "").trim();
  if (fromWindow) {
    const clean = fromWindow.replace(/\/+$/, "");
    if (!esSupabaseRest(clean) || isSupabaseRestOfCurrentProject(clean)) {
      return clean;
    }
  }

  const fromStorage = String(localStorage.getItem("API_BASE_URL") || "").trim();
  if (fromStorage && fromStorage !== "/api") {
    const clean = fromStorage.replace(/\/+$/, "");
    if (!esSupabaseRest(clean) || isSupabaseRestOfCurrentProject(clean)) {
      return clean;
    }
  }

  return DEFAULT_API_BASE_URL;
})();

window.API_BASE_URL = API_BASE_URL;
window.SUPABASE_PROJECT_URL = SUPABASE_PROJECT_URL;
window.SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.supabaseClient = null;
localStorage.setItem("API_BASE_URL", API_BASE_URL);
const tokenActual = String(localStorage.getItem("asistencia_auth_token") || "").trim();
if (!tokenActual || tokenActual.startsWith("sb_publishable_") || tokenActual === "postgrest-direct") {
  localStorage.setItem("asistencia_auth_token", SUPABASE_ANON_KEY);
}
localStorage.setItem(SUPABASE_API_KEY_STORAGE_KEY, SUPABASE_PUBLISHABLE_KEY);

const bc = new BroadcastChannel("victory-data");

let pollAlumnosId = null;
let pollAttendanceId = null;
let alumnosSincronizados = false;
let authErrorRedireccionado = false;

const POLL_ALUMNOS_MS = 10000;
const POLL_ATTENDANCE_MS = 6000;

function pgEq(value) {
  return `eq.${String(value)}`;
}

function pgGte(value) {
  return `gte.${String(value)}`;
}

function pgLt(value) {
  return `lt.${String(value)}`;
}

function esURLAbsoluta(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function construirURL(path, query = {}) {
  const base = String(API_BASE_URL || "/api").replace(/\/+$/, "");
  const cleanPath = String(path || "").startsWith("/") ? String(path) : `/${path}`;
  const raw = `${base}${cleanPath}`;

  const url = esURLAbsoluta(raw)
    ? new URL(raw)
    : new URL(raw, window.location.origin);

  Object.entries(query || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, v);
  });

  return url.toString();
}

async function apiRequest(path, { method = "GET", query = null, body = null, headers = {}, timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = construirURL(path, query || {});
    const supabaseApiKey = resolveSupabaseApiKey();
    const token = resolveBearerToken();

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(supabaseApiKey ? { apikey: supabaseApiKey } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: "include"
    });

    const raw = await res.text();
    let data = null;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }

    if (!res.ok) {
      const bypass = typeof isAuthBypassEnabled === "function" ? isAuthBypassEnabled() : false;
      if (res.status === 401 && !bypass && !authErrorRedireccionado && typeof clearAuthSession === "function") {
        authErrorRedireccionado = true;
        setTimeout(() => clearAuthSession({ redirect: true }), 80);
      }

      const err = new Error(`[API ${res.status}] ${method} ${path}`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function apiTry(calls = [], { acceptNull = false } = {}) {
  let lastError = null;

  for (const call of calls) {
    try {
      const data = await call();

      if (data === undefined) continue;
      if (data === null && !acceptNull) continue;

      return data;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  return null;
}

function arrayDesdeRespuesta(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function objetoDesdeRespuesta(payload) {
  if (!payload) return null;

  if (Array.isArray(payload)) return payload[0] || null;
  if (payload.data && !Array.isArray(payload.data)) return payload.data;
  if (payload.item && !Array.isArray(payload.item)) return payload.item;
  if (payload.row && !Array.isArray(payload.row)) return payload.row;
  if (payload.result && !Array.isArray(payload.result)) return payload.result;

  return payload;
}

function alumnoVacioBase() {
  return {
    id: "",
    nombre: "",
    correo: "",
    fechaNacimiento: "",
    telefono: "",
    matricula: "",
    grado: "",
    grupo: "",
    tarjetaUID: "",
    fechaRegistro: hoy()
  };
}

function normalizarAlumno(raw = {}) {
  const base = alumnoVacioBase();

  return {
    ...base,
    id: raw.id ?? base.id,
    nombre: String(raw.nombre ?? "").trim(),
    correo: String(raw.correo ?? raw.email ?? "").trim(),
    fechaNacimiento: String(raw.fechaNacimiento ?? raw.fecha_nacimiento ?? "").trim(),
    telefono: String(raw.telefono ?? raw.phone ?? "").trim(),
    matricula: String(raw.matricula ?? raw.student_id ?? "").trim().toUpperCase(),
    grado: String(raw.grado ?? raw.grade ?? "").trim().toUpperCase(),
    grupo: String(raw.grupo ?? raw.group ?? "").trim().toUpperCase(),
    tarjetaUID: normalizarUID(raw.tarjetaUID ?? raw.tarjeta_uid ?? ""),
    fechaRegistro: String(raw.fechaRegistro ?? raw.fecha_registro ?? hoy()).trim()
  };
}

function guardarAlumnosLocalCompat(lista) {
  const normalizados = (Array.isArray(lista) ? lista : []).map(normalizarAlumno);

  guardarAlumnos(normalizados);
}

function upsertAlumnoLocal(alumno) {
  const lista = obtenerAlumnos();
  const normalizado = normalizarAlumno(alumno);

  const idx = lista.findIndex(a => String(a.id) === String(normalizado.id));

  if (idx >= 0) lista[idx] = { ...lista[idx], ...normalizado };
  else lista.push(normalizado);

  guardarAlumnosLocalCompat(lista);
  bc.postMessage("alumnos");
}

function alumnoAPayloadServidor(alumno) {
  const a = normalizarAlumno(alumno);

  return {
    id: a.id,
    nombre: a.nombre,
    correo: a.correo || null,
    fecha_nacimiento: a.fechaNacimiento || null,
    telefono: a.telefono || null,
    matricula: a.matricula || null,
    grado: a.grado || null,
    grupo: a.grupo || null,
    tarjeta_uid: a.tarjetaUID || null,
    fecha_registro: a.fechaRegistro || hoy()
  };
}

function normalizarEventoAttendance(raw = {}) {
  const alumnoId = raw.alumno_id ?? raw.cliente_id ?? null;

  return {
    id: raw.id,
    alumno_id: alumnoId,
    uid: normalizarUID(raw.uid ?? raw.tarjeta_uid ?? ""),
    created_at: raw.created_at ?? raw.fecha_hora ?? raw.ts ?? null,
    type: String(raw.type ?? raw.accion ?? "").trim().toLowerCase()
  };
}

function normalizarEventoNFC(raw = {}) {
  const id = raw.id ?? raw.event_id ?? null;
  const uid = normalizarUID(raw.uid ?? raw.tarjeta_uid ?? "");

  if (!id || !uid) return null;

  return {
    id,
    uid,
    created_at: raw.created_at ?? raw.ts ?? new Date().toISOString(),
    processed: !!raw.processed
  };
}

function ordenarEventosPorFecha(eventos = [], asc = true) {
  return [...eventos].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return asc ? ta - tb : tb - ta;
  });
}

async function logEstadoServidor() {
  if (!navigator.onLine) {
    console.warn("[API] Offline: trabajando en modo local");
    return;
  }

  try {
    await apiTry([
      () => apiRequest("/health"),
      () => apiRequest("/status"),
      () => apiRequest("/alumnos", { query: { limit: 1 } }),
      () => apiRequest("/", { timeoutMs: 6000 })
    ], { acceptNull: true });

    console.info(`[API] Conexion OK (${API_BASE_URL})`);
  } catch (err) {
    console.error("[API] Error de conexion:", err?.message || err);
  }
}

async function cargarAlumnosIniciales() {
  if (!navigator.onLine) {
    const local = obtenerAlumnos();
    guardarAlumnosLocalCompat(local);
    return local;
  }

  try {
    const payload = await apiTry([
      () => apiRequest("/alumnos"),
      () => apiRequest("/alumnos", { query: { select: "*", order: "nombre.asc", limit: 5000 } }),
      () => apiRequest("/students")
    ]);

    const lista = arrayDesdeRespuesta(payload)
      .map(normalizarAlumno)
      .filter(a => a && (a.id || a.nombre || a.tarjetaUID));

    lista.sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));

    guardarAlumnosLocalCompat(lista);
    bc.postMessage("alumnos");

    console.info("[ALUMNOS] Cargados desde API:", lista.length);
    return lista;
  } catch (err) {
    console.error("[ALUMNOS] Error carga inicial API:", err?.message || err);
    return obtenerAlumnos();
  }
}

async function ensureAlumnosCargados() {
  if (alumnosSincronizados) return obtenerAlumnos();

  const lista = await cargarAlumnosIniciales();
  alumnosSincronizados = true;
  return lista;
}

async function obtenerAlumnoPorUIDRemoto(uid) {
  if (!navigator.onLine) return null;

  const normalizado = normalizarUID(uid);
  if (!normalizado) return null;

  try {
    const payload = await apiTry([
      () => apiRequest(`/alumnos/by-uid/${encodeURIComponent(normalizado)}`),
      () => apiRequest(`/alumnos/by_uid/${encodeURIComponent(normalizado)}`),
      () => apiRequest("/alumnos", { query: { uid: normalizado, limit: 1 } }),
      () => apiRequest("/alumnos", {
        query: {
          select: "*",
          tarjeta_uid: pgEq(normalizado),
          limit: 1
        }
      })
    ], { acceptNull: true });

    const obj = objetoDesdeRespuesta(payload);
    if (!obj || (!obj.id && !obj.nombre && !obj.tarjeta_uid && !obj.tarjetaUID)) return null;

    const alumno = normalizarAlumno(obj);
    upsertAlumnoLocal(alumno);
    return alumno;
  } catch (_) {
    return null;
  }
}

async function verificarDuplicadoAlumnoRemoto({ correo, matricula, uid }) {
  if (!navigator.onLine) return null;

  const correoN = String(correo || "").trim().toLowerCase();
  const matriculaN = String(matricula || "").trim().toUpperCase();
  const uidN = normalizarUID(uid);

  try {
    const payload = await apiTry([
      () => apiRequest("/alumnos/duplicados", {
        query: { correo: correoN, matricula: matriculaN, uid: uidN }
      }),
      () => apiRequest("/alumnos/duplicate", {
        query: { correo: correoN, matricula: matriculaN, uid: uidN }
      })
    ], { acceptNull: true });

    const obj = objetoDesdeRespuesta(payload) || {};
    const tipo = String(obj.duplicado || obj.tipo || obj.field || "").toLowerCase();

    if (tipo === "correo") return "correo";
    if (tipo === "matricula") return "matricula";
    if (["tarjeta", "uid", "tarjeta_uid"].includes(tipo)) return "tarjeta";

    if (obj.correo === true) return "correo";
    if (obj.matricula === true) return "matricula";
    if (obj.tarjeta === true || obj.uid === true || obj.tarjeta_uid === true) return "tarjeta";
  } catch (_) {
    // fallback abajo
  }

  try {
    const payload = await apiRequest("/alumnos");
    const lista = arrayDesdeRespuesta(payload).map(normalizarAlumno);

    if (uidN && lista.some(a => normalizarUID(a.tarjetaUID) === uidN)) return "tarjeta";
    if (matriculaN && lista.some(a => String(a.matricula || "").toUpperCase() === matriculaN)) return "matricula";
    if (correoN && lista.some(a => String(a.correo || "").toLowerCase() === correoN)) return "correo";
  } catch (_) {
    // sin fallback remoto
  }

  return null;
}

async function insertarAlumnoSupabase(alumno) {
  if (!navigator.onLine) return false;

  try {
    const payload = alumnoAPayloadServidor(alumno);

    const res = await apiTry([
      () => apiRequest("/alumnos", { method: "POST", body: payload }),
      () => apiRequest("/alumnos", {
        method: "POST",
        body: payload,
        headers: { Prefer: "return=representation" }
      }),
      () => apiRequest("/students", { method: "POST", body: payload })
    ]);

    const guardado = objetoDesdeRespuesta(res) || alumno;
    upsertAlumnoLocal(guardado);

    return true;
  } catch (err) {
    console.error("[ALUMNOS] Error insert API:", err?.message || err);
    return false;
  }
}

async function actualizarAlumnoSupabase(alumno) {
  if (!navigator.onLine) return false;

  try {
    const payload = alumnoAPayloadServidor(alumno);
    const id = encodeURIComponent(String(alumno.id));

    await apiTry([
      () => apiRequest(`/alumnos/${id}`, { method: "PUT", body: payload }),
      () => apiRequest(`/alumnos/${id}`, { method: "PATCH", body: payload }),
      () => apiRequest("/alumnos", {
        method: "PATCH",
        query: { id: pgEq(id) },
        body: payload,
        headers: { Prefer: "return=representation" }
      })
    ]);

    upsertAlumnoLocal(alumno);
    return true;
  } catch (err) {
    console.error("[ALUMNOS] Error update API:", err?.message || err);
    return false;
  }
}

async function borrarAlumnoSupabase(id) {
  if (!navigator.onLine) return false;

  try {
    const enc = encodeURIComponent(String(id));

    await apiTry([
      () => apiRequest(`/alumnos/${enc}`, { method: "DELETE" }),
      () => apiRequest("/alumnos", { method: "DELETE", query: { id: enc } }),
      () => apiRequest("/alumnos", { method: "DELETE", query: { id: pgEq(enc) } })
    ], { acceptNull: true });

    const lista = obtenerAlumnos().filter(a => String(a.id) !== String(id));
    guardarAlumnosLocalCompat(lista);
    bc.postMessage("alumnos");
    return true;
  } catch (err) {
    console.error("[ALUMNOS] Error delete API:", err?.message || err);
    return false;
  }
}

async function obtenerEventosAttendanceRemotos({ inicioISO = null, finISO = null, asc = true, alumnoId = null } = {}) {
  if (!navigator.onLine) return [];

  try {
    const order = asc ? "asc" : "desc";
    const filtroAlumno = alumnoId ? { alumno_id: alumnoId, cliente_id: alumnoId } : {};

    const payload = await apiTry([
      () => apiRequest("/attendance/rango", {
        query: { inicio: inicioISO, fin: finISO, ...filtroAlumno, order }
      }),
      () => apiRequest("/attendance/events", {
        query: { from: inicioISO, to: finISO, ...filtroAlumno, order }
      }),
      () => apiRequest("/attendance", {
        query: { from: inicioISO, to: finISO, ...filtroAlumno, order }
      }),
      () => apiRequest("/attendance", {
        query: {
          select: "*",
          ...(inicioISO || finISO
            ? {
              and: `(${[
                inicioISO ? `created_at.gte.${inicioISO}` : "",
                finISO ? `created_at.lt.${finISO}` : ""
              ].filter(Boolean).join(",")})`
            }
            : {}),
          ...(alumnoId ? { alumno_id: pgEq(alumnoId), cliente_id: pgEq(alumnoId) } : {}),
          order: `created_at.${order}`,
          limit: 10000
        }
      })
    ]);

    const eventos = arrayDesdeRespuesta(payload)
      .map(normalizarEventoAttendance)
      .filter(ev => ev && ev.created_at && ev.type);

    return ordenarEventosPorFecha(eventos, asc);
  } catch (err) {
    console.error("[ATTENDANCE] Error obteniendo eventos remotos:", err?.message || err);
    return null;
  }
}

async function obtenerUltimoTipoAsistenciaHoyRemoto(alumnoId) {
  if (!navigator.onLine || !alumnoId) return null;

  const { inicioISO, finISO } = rangoHoyISO();

  try {
    const payload = await apiTry([
      () => apiRequest("/attendance/ultimo-tipo", {
        query: { alumno_id: alumnoId, cliente_id: alumnoId, inicio: inicioISO, fin: finISO }
      }),
      () => apiRequest("/attendance/last-type", {
        query: { alumno_id: alumnoId, cliente_id: alumnoId, from: inicioISO, to: finISO }
      })
    ], { acceptNull: true });

    const obj = objetoDesdeRespuesta(payload) || {};
    const tipo = String(obj.type || obj.ultimo_tipo || obj.accion || "").toLowerCase();

    if (tipo === "entrada" || tipo === "salida") return tipo;
  } catch (_) {
    // fallback abajo
  }

  const eventos = await obtenerEventosAttendanceRemotos({
    inicioISO,
    finISO,
    asc: false,
    alumnoId
  });

  if (!Array.isArray(eventos)) return null;

  const ultimo = eventos[0]?.type;
  return (ultimo === "entrada" || ultimo === "salida") ? ultimo : null;
}

async function registrarAsistenciaServidor(payload) {
  const alumnoId = payload?.alumno_id ?? payload?.cliente_id ?? null;
  const payloadNormalizado = {
    ...payload,
    alumno_id: alumnoId,
    cliente_id: alumnoId
  };

  try {
    await apiTry([
      () => apiRequest("/attendance", { method: "POST", body: payloadNormalizado }),
      () => apiRequest("/attendance/event", { method: "POST", body: payloadNormalizado })
    ]);

    return { accion: String(payloadNormalizado?.type || "").toLowerCase() };
  } catch (_) {
    const rpcPayload = {
      p_id: payloadNormalizado?.id,
      p_alumno_id: alumnoId,
      p_cliente_id: alumnoId,
      p_uid: payloadNormalizado?.uid,
      p_created_at: payloadNormalizado?.created_at,
      p_source: payloadNormalizado?.source,
      p_device_id: payloadNormalizado?.device_id
    };

    const rpc = await apiTry([
      () => apiRequest("/attendance/registrar", { method: "POST", body: rpcPayload }),
      () => apiRequest("/rpc/registrar_asistencia", { method: "POST", body: rpcPayload })
    ]);

    const out = objetoDesdeRespuesta(rpc) || {};
    const accion = String(out.accion || out.type || payloadNormalizado?.type || "").toLowerCase();

    return { accion };
  }
}

async function reconstruirAsistenciasHoy() {
  const { fechaLocal, inicioISO, finISO } = rangoHoyISO();

  const eventos = await obtenerEventosAttendanceRemotos({
    inicioISO,
    finISO,
    asc: true
  });

  if (!Array.isArray(eventos)) return;

  const alumnos = obtenerAlumnos();
  const alumnosPorId = new Map(alumnos.map(a => [String(a.id), a]));
  const alumnosPorUID = new Map(alumnos.map(a => [normalizarUID(a.tarjetaUID), a]));

  const sesiones = {};
  const resultado = [];

  for (const ev of eventos) {
    const key = String(ev.alumno_id || ev.uid || "");
    if (!key) continue;

    if (!sesiones[key]) sesiones[key] = [];
    sesiones[key].push(ev);
  }

  Object.keys(sesiones).forEach(key => {
    const items = sesiones[key] || [];
    let entradaActiva = null;

    items.forEach(ev => {
      const alumno = ev.alumno_id
        ? (alumnosPorId.get(String(ev.alumno_id)) || {})
        : (alumnosPorUID.get(normalizarUID(ev.uid)) || {});

      if (ev.type === "entrada") {
        entradaActiva = {
          id: ev.id,
          alumno_id: ev.alumno_id || null,
          nombre: alumno.nombre || "Alumno",
          matricula: alumno.matricula || "-",
          grado: alumno.grado || "",
          grupo: alumno.grupo || "",
          grado_grupo: `${alumno.grado || ""}${alumno.grado && alumno.grupo ? " / " : ""}${alumno.grupo || ""}`,
          fecha: fechaLocal,
          entrada_ts: new Date(ev.created_at).getTime(),
          salida_ts: null
        };

        resultado.push(entradaActiva);
      }

      if (ev.type === "salida" && entradaActiva) {
        entradaActiva.salida_ts = new Date(ev.created_at).getTime();
        entradaActiva = null;
      }
    });
  });

  guardarAsistencias(resultado);

  if (typeof notificarCambioAsistencias === "function") {
    notificarCambioAsistencias();
  }
}

function iniciarRealtimeAlumnos() {
  if (pollAlumnosId) return;

  const tick = async () => {
    if (!navigator.onLine) return;
    await cargarAlumnosIniciales();
  };

  tick();
  pollAlumnosId = setInterval(tick, POLL_ALUMNOS_MS);
  console.info("[ALUMNOS] Polling activo");
}

function iniciarRealtimeAttendance() {
  if (pollAttendanceId) return;

  const tick = async () => {
    if (!navigator.onLine) return;
    await reconstruirAsistenciasHoy();
  };

  tick();
  pollAttendanceId = setInterval(tick, POLL_ATTENDANCE_MS);
  console.info("[ATTENDANCE] Polling activo");
}

async function autocerrarAsistenciasPendientes() {
  if (!navigator.onLine) return;

  try {
    await apiTry([
      () => apiRequest("/attendance/autocierre", { method: "POST" }),
      () => apiRequest("/attendance/auto-close", { method: "POST" })
    ], { acceptNull: true });
  } catch (err) {
    console.warn("[AUTO-CIERRE] Endpoint no disponible:", err?.message || err);
  }
}

async function migrarUIDEnAttendance(uidAnterior, uidNuevo) {
  if (!navigator.onLine) return;
  if (!uidAnterior || !uidNuevo || uidAnterior === uidNuevo) return;

  try {
    await apiTry([
      () => apiRequest("/attendance/migrar-uid", {
        method: "PATCH",
        body: { uidAnterior, uidNuevo }
      }),
      () => apiRequest("/attendance/uid-migration", {
        method: "POST",
        body: { uid_anterior: uidAnterior, uid_nuevo: uidNuevo }
      })
    ], { acceptNull: true });
  } catch (err) {
    console.error("[ATTENDANCE] Error migrando UID:", err?.message || err);
  }
}

async function marcarEventoNFCProcesado(eventId) {
  if (!eventId) return false;

  try {
    const id = encodeURIComponent(String(eventId));

    await apiTry([
      () => apiRequest(`/nfc-events/${id}/process`, { method: "POST" }),
      () => apiRequest(`/nfc-events/${id}`, { method: "PATCH", body: { processed: true } }),
      () => apiRequest("/nfc-events/process", { method: "POST", body: { id: eventId } }),
      () => apiRequest("/nfc_events", {
        method: "PATCH",
        query: { id: pgEq(id) },
        body: { processed: true },
        headers: { Prefer: "return=representation" }
      })
    ], { acceptNull: true });

    return true;
  } catch (err) {
    console.warn("[NFC] No se pudo marcar processed:", err?.message || err);
    return false;
  }
}

async function obtenerEventoNFCPendiente() {
  if (!navigator.onLine) return null;

  try {
    const claim = await apiTry([
      () => apiRequest("/nfc-events/claim", { method: "POST" }),
      () => apiRequest("/nfc-events/next", { method: "POST" })
    ], { acceptNull: true });

    const ev = normalizarEventoNFC(objetoDesdeRespuesta(claim));
    if (ev) return ev;
  } catch (_) {
    // fallback abajo
  }

  try {
    const list = await apiTry([
      () => apiRequest("/nfc-events/pending", { query: { limit: 1 } }),
      () => apiRequest("/nfc-events", { query: { processed: false, limit: 1 } }),
      () => apiRequest("/nfc_events", {
        query: {
          select: "*",
          processed: "eq.false",
          order: "created_at.asc",
          limit: 1
        }
      })
    ], { acceptNull: true });

    const eventos = arrayDesdeRespuesta(list)
      .map(normalizarEventoNFC)
      .filter(Boolean);

    const ev = eventos[0] || null;
    if (!ev) return null;

    await marcarEventoNFCProcesado(ev.id);
    return ev;
  } catch (err) {
    console.error("[NFC] Error obteniendo evento:", err?.message || err);
    return null;
  }
}

async function obtenerResumenDashboardRemoto({ inicioISO = null, finISO = null } = {}) {
  if (!navigator.onLine) {
    return {
      total_alumnos: (obtenerAlumnos() || []).length,
      presentes: (obtenerAsistencias() || []).filter(x => x?.entrada_ts && !x?.salida_ts).length,
      entradas_hoy: 0,
      salidas_hoy: 0,
      asistencias_hoy: (obtenerAsistencias() || []).length,
      recientes: []
    };
  }

  try {
    const payload = await apiTry([
      () => apiRequest("/dashboard/resumen", { query: { inicio: inicioISO, fin: finISO } }),
      () => apiRequest("/dashboard/live", { query: { from: inicioISO, to: finISO } })
    ], { acceptNull: true });

    const obj = objetoDesdeRespuesta(payload);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch (err) {
    console.warn("[DASHBOARD] No disponible, usando resumen local:", err?.message || err);

    const { inicioISO: ini, finISO: fn } = rangoHoyISO();
    const eventos = await obtenerEventosAttendanceRemotos({ inicioISO: ini, finISO: fn, asc: true });
    const alumnos = obtenerAlumnos() || [];

    if (!Array.isArray(eventos)) {
      return {
        total_alumnos: alumnos.length,
        presentes: (obtenerAsistencias() || []).filter(x => x?.entrada_ts && !x?.salida_ts).length,
        entradas_hoy: 0,
        salidas_hoy: 0,
        asistencias_hoy: (obtenerAsistencias() || []).length,
        recientes: []
      };
    }

    const entradas = eventos.filter(e => e.type === "entrada").length;
    const salidas = eventos.filter(e => e.type === "salida").length;
    const lastByPersona = new Map();
    eventos.forEach(e => {
      const key = String(e.alumno_id || e.uid || "");
      if (!key) return;
      lastByPersona.set(key, e.type);
    });

    const presentes = Array.from(lastByPersona.values()).filter(t => t === "entrada").length;

    return {
      total_alumnos: alumnos.length,
      presentes,
      entradas_hoy: entradas,
      salidas_hoy: salidas,
      asistencias_hoy: eventos.length,
      recientes: eventos.slice(-20).reverse()
    };
  }
}

async function descargarCsvEndpoint(path, query = {}, filename = "reporte.csv") {
  if (!navigator.onLine) return false;

  const supabaseApiKey = resolveSupabaseApiKey();
  const token = resolveBearerToken();

  const url = construirURL(path, query);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(supabaseApiKey ? { apikey: supabaseApiKey } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    credentials: "include"
  });

  if (!res.ok) {
    throw new Error(`descarga_error_${res.status}`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return true;
}

function csvEscape(value) {
  const txt = value === null || value === undefined ? "" : String(value);
  if (!/[",\n]/.test(txt)) return txt;
  return `"${txt.replace(/"/g, '""')}"`;
}

function triggerCsvDownload(filename, headers = [], rows = []) {
  const head = headers.map(csvEscape).join(",");
  const body = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const csv = `${head}\n${body}`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function descargarReporteAsistenciasCsv({ inicioISO = null, finISO = null } = {}) {
  const ymd = hoy();
  const filename = `reporte_asistencias_${ymd}.csv`;

  try {
    return await descargarCsvEndpoint(
      "/reportes/asistencias.csv",
      { inicio: inicioISO, fin: finISO },
      filename
    );
  } catch (_) {
    const { inicioISO: ini, finISO: fn } = rangoHoyISO();
    const eventos = await obtenerEventosAttendanceRemotos({
      inicioISO: inicioISO || ini,
      finISO: finISO || fn,
      asc: true
    });

    if (!Array.isArray(eventos)) return false;

    const alumnos = obtenerAlumnos() || [];
    const byId = new Map(alumnos.map(a => [String(a.id), a]));
    const rows = eventos.map(ev => {
      const al = byId.get(String(ev.alumno_id || "")) || {};
      return [
        ev.created_at || "",
        ev.type || "",
        al.nombre || "Alumno",
        al.matricula || "-",
        al.grado || "",
        al.grupo || "",
        ev.uid || ""
      ];
    });

    triggerCsvDownload(
      filename,
      ["FechaHora", "Accion", "Alumno", "Matricula", "Grado", "Grupo", "UID"],
      rows
    );
    return true;
  }
}

async function descargarReporteDiarioCsv({ inicioISO = null, finISO = null } = {}) {
  const ymd = hoy();
  const filename = `reporte_diario_${ymd}.csv`;

  try {
    return await descargarCsvEndpoint(
      "/reportes/diario.csv",
      { inicio: inicioISO, fin: finISO },
      filename
    );
  } catch (_) {
    const { inicioISO: ini, finISO: fn } = rangoHoyISO();
    const eventos = await obtenerEventosAttendanceRemotos({
      inicioISO: inicioISO || ini,
      finISO: finISO || fn,
      asc: true
    });

    if (!Array.isArray(eventos)) return false;

    const alumnos = obtenerAlumnos() || [];
    const byId = new Map(alumnos.map(a => [String(a.id), a]));
    const mapa = new Map();

    eventos.forEach(ev => {
      const key = String(ev.alumno_id || ev.uid || "");
      if (!key) return;
      const al = byId.get(String(ev.alumno_id || "")) || {};
      const base = mapa.get(key) || {
        fecha: (ev.created_at || "").slice(0, 10),
        alumno: al.nombre || "Alumno",
        matricula: al.matricula || "-",
        grado: al.grado || "",
        grupo: al.grupo || "",
        primeraEntrada: "",
        ultimaSalida: "",
        eventos: 0
      };

      if (ev.type === "entrada" && !base.primeraEntrada) {
        base.primeraEntrada = ev.created_at || "";
      }
      if (ev.type === "salida") {
        base.ultimaSalida = ev.created_at || "";
      }

      base.eventos += 1;
      mapa.set(key, base);
    });

    const rows = Array.from(mapa.values()).map(x => [
      x.fecha,
      x.alumno,
      x.matricula,
      x.grado,
      x.grupo,
      x.primeraEntrada,
      x.ultimaSalida,
      x.eventos
    ]);

    triggerCsvDownload(
      filename,
      ["Fecha", "Alumno", "Matricula", "Grado", "Grupo", "PrimeraEntrada", "UltimaSalida", "Eventos"],
      rows
    );
    return true;
  }
}

/* ======================================================
   ===== EXPORTS GLOBALES ===============================
====================================================== */

window.apiRequest = apiRequest;
window.obtenerEventosAttendanceRemotos = obtenerEventosAttendanceRemotos;
window.obtenerUltimoTipoAsistenciaHoyRemoto = obtenerUltimoTipoAsistenciaHoyRemoto;
window.registrarAsistenciaServidor = registrarAsistenciaServidor;
window.obtenerEventoNFCPendiente = obtenerEventoNFCPendiente;
window.marcarEventoNFCProcesado = marcarEventoNFCProcesado;
window.obtenerResumenDashboardRemoto = obtenerResumenDashboardRemoto;
window.descargarReporteAsistenciasCsv = descargarReporteAsistenciasCsv;
window.descargarReporteDiarioCsv = descargarReporteDiarioCsv;

/* ======================================================
   ===== INIT GLOBAL ====================================
====================================================== */

window.addEventListener("load", async () => {
  if (typeof ensureAuthSession === "function") {
    const ok = await ensureAuthSession();
    if (!ok) return;
  }

  await ensureAlumnosCargados();
  await logEstadoServidor();

  if (!navigator.onLine) return;

  iniciarRealtimeAlumnos();
  iniciarRealtimeAttendance();

  await autocerrarAsistenciasPendientes();
  await reconstruirAsistenciasHoy();
});

window.addEventListener("online", async () => {
  console.info("[APP] Conexion restablecida");
  alumnosSincronizados = false;
  authErrorRedireccionado = false;

  if (typeof ensureAuthSession === "function") {
    const ok = await ensureAuthSession();
    if (!ok) return;
  }

  await ensureAlumnosCargados();
  await logEstadoServidor();

  iniciarRealtimeAlumnos();
  iniciarRealtimeAttendance();

  await autocerrarAsistenciasPendientes();
  await reconstruirAsistenciasHoy();
});

window.addEventListener("offline", () => {
  console.warn("[APP] Sin conexion a internet");
});
