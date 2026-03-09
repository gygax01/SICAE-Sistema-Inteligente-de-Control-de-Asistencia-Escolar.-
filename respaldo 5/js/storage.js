/* ======================================================
   ===== STORAGE OFFLINE FIRST (SOURCE OF TRUTH) =====
====================================================== */

/* ================= UTIL BASE ================= */

function safeGet(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function safeSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizarUID(uid) {
  return String(uid || "").trim().toUpperCase();
}

/* ======================================================
   ===== ZONA HORARIA CORREGIDA (MEXICO / CHIAPAS) =====
====================================================== */

const APP_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/**
 * Devuelve fecha real en zona horaria Mexico
 * Formato: YYYY-MM-DD
 */
function hoy() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: APP_TIMEZONE
  });
}

/**
 * Devuelve hora real Mexico HH:mm:ss
 */
function horaActual() {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: APP_TIMEZONE,
    hour12: false
  });
}

function fechaDesdeTS(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

function horaDesdeTS(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function rangoHoyISO() {
  const now = new Date();
  const inicio = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const fin = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

  return {
    fechaLocal: hoy(),
    inicioISO: inicio.toISOString(),
    finISO: fin.toISOString()
  };
}

/**
 * Timestamp absoluto (NO depende de zona)
 */
function ahoraTimestamp() {
  return Date.now();
}

/* ================= ALUMNOS ================= */

function obtenerAlumnos() {
  return safeGet("alumnos");
}

function guardarAlumnos(data) {
  safeSet("alumnos", data);
}

/* ================= ASISTENCIAS ================= */

function obtenerAsistencias() {
  return safeGet("asistencias");
}

function guardarAsistencias(data) {
  safeSet("asistencias", data);
}

