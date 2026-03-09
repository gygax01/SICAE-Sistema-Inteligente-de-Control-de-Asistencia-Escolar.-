/* ======================================================
   ===== AUTH JWT (FRONTEND) ===========================
====================================================== */

(() => {

const AUTH_TOKEN_KEY = "asistencia_auth_token";
const AUTH_USER_KEY = "asistencia_auth_user";
const AUTH_BYPASS_KEY = "AUTH_BYPASS";
const SUPABASE_PROJECT_URL = "https://vqylvfutuiococveggej.supabase.co";
const SUPABASE_REST_URL = `${SUPABASE_PROJECT_URL}/rest/v1`;
const SUPABASE_PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_PROJECT_URL).host.split(".")[0] || "";
  } catch {
    return "";
  }
})();
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_C3jhIFoDyrdFr5PuTU2_tg_D8-WWItk";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxeWx2ZnV0dWlvY29jdmVnZ2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjIxNzMsImV4cCI6MjA4ODM5ODE3M30.JjG3-RLOYSpGnacdC9fwSgDG17Z_5rz5RHt6PUN7Y5M";
const DEFAULT_API_BASE_URL = SUPABASE_REST_URL;
const getStore = typeof storageGetItem === "function"
  ? storageGetItem
  : key => localStorage.getItem(key);
const setStore = typeof storageSetItem === "function"
  ? storageSetItem
  : (key, value) => localStorage.setItem(key, value);
const removeStore = typeof storageRemoveItem === "function"
  ? storageRemoveItem
  : key => localStorage.removeItem(key);

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

function isSupabaseRequestUrl(url) {
  try {
    const parsed = new URL(String(url || ""), window.location.origin);
    return /\.supabase\.co$/i.test(parsed.hostname) && /^\/rest\/v1(\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function shouldIncludeCredentials(url) {
  return !isSupabaseRequestUrl(url);
}

function getApiBaseURLForAuth() {
  const fromWindow = String(window.API_BASE_URL || "").trim();
  if (fromWindow) {
    const clean = fromWindow.replace(/\/+$/, "");
    if (!esSupabaseRest(clean) || isSupabaseRestOfCurrentProject(clean)) {
      return clean;
    }
  }

  const fromStorage = String(getStore("API_BASE_URL") || "").trim();
  if (fromStorage && fromStorage !== "/api") {
    const clean = fromStorage.replace(/\/+$/, "");
    if (!esSupabaseRest(clean) || isSupabaseRestOfCurrentProject(clean)) {
      return clean;
    }
  }

  return DEFAULT_API_BASE_URL;
}

function isAuthBypassEnabled() {
  return String(getStore(AUTH_BYPASS_KEY) || "").trim().toLowerCase() === "true";
}

function enableAuthBypass(user = null) {
  setStore(AUTH_BYPASS_KEY, "true");
  if (user) {
    setAuthSession(getAuthToken() || "postgrest-direct", user);
  }
}

function getAuthToken() {
  return String(getStore(AUTH_TOKEN_KEY) || "").trim();
}

function parseJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function tokenPerteneceAProyectoActual(token) {
  const payload = parseJwtPayload(token);
  const ref = String(payload?.ref || "").trim();
  return !!ref && ref === SUPABASE_PROJECT_REF;
}

function resolveDefaultAuthToken() {
  const token = getAuthToken();
  if (!token || token.startsWith("sb_publishable_") || token === "postgrest-direct") {
    return SUPABASE_ANON_KEY;
  }
  if (token.includes(".") && !tokenPerteneceAProyectoActual(token)) {
    return SUPABASE_ANON_KEY;
  }
  return token;
}

function inicializarSupabaseDirecto() {
  const apiBase = getApiBaseURLForAuth();
  if (!esSupabaseRest(apiBase)) return;

  setStore("API_BASE_URL", apiBase);

  setStore(AUTH_TOKEN_KEY, resolveDefaultAuthToken());

  if (!isAuthBypassEnabled()) {
    setStore(AUTH_BYPASS_KEY, "true");
  }

  const currentUser = getAuthUser();
  if (!currentUser?.id) {
    setAuthSession(getStore(AUTH_TOKEN_KEY) || SUPABASE_ANON_KEY, {
      id: "supabase-direct",
      username: "supabase",
      nombre: "Modo Supabase",
      rol: "admin"
    });
  }
}

function getAuthUser() {
  try {
    const raw = getStore(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setAuthSession(token, user) {
  setStore(AUTH_TOKEN_KEY, String(token || ""));
  setStore(AUTH_USER_KEY, JSON.stringify(user || null));
}

function clearAuthSession({ redirect = true } = {}) {
  removeStore(AUTH_TOKEN_KEY);
  removeStore(AUTH_USER_KEY);
  removeStore(AUTH_BYPASS_KEY);

  if (redirect) {
    const next = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
    location.href = `login.html?next=${next}`;
  }
}

function isAuthRoleAllowed(allowed = []) {
  if (!allowed.length) return true;
  const role = String(getAuthUser()?.rol || "").trim().toLowerCase();
  return allowed.map(r => String(r || "").trim().toLowerCase()).includes(role);
}

function requireAuth() {
  if (isAuthBypassEnabled()) return true;

  const token = getAuthToken();
  if (!token) {
    clearAuthSession({ redirect: true });
    return false;
  }
  return true;
}

async function authFetchMe() {
  if (isAuthBypassEnabled()) {
    return getAuthUser();
  }

  const token = getAuthToken();
  if (!token) return null;

  const base = getApiBaseURLForAuth();

  const res = await fetch(`${base}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    credentials: shouldIncludeCredentials(base) ? "include" : "omit"
  });

  if (!res.ok) {
    throw new Error("auth_me_error");
  }

  return res.json();
}

async function ensureAuthSession() {
  inicializarSupabaseDirecto();

  if (isAuthBypassEnabled()) {
    return true;
  }

  if (!requireAuth()) return false;

  if (!navigator.onLine) {
    const localUser = getAuthUser();
    if (localUser?.id || localUser?.username) {
      return true;
    }
    return true;
  }

  try {
    const me = await authFetchMe();
    if (!me?.id) {
      clearAuthSession({ redirect: true });
      return false;
    }

    const currentUser = getAuthUser() || {};
    setAuthSession(getAuthToken(), {
      ...currentUser,
      ...me
    });

    return true;
  } catch {
    clearAuthSession({ redirect: true });
    return false;
  }
}

function hydrateAuthUI() {
  const user = getAuthUser();
  const token = getAuthToken();

  const userSlots = document.querySelectorAll("[data-auth-user]");
  userSlots.forEach(el => {
    if (!el) return;
    if (!user || !token) {
      el.textContent = "Sin sesion";
      return;
    }

    const rol = String(user.rol || "").trim();
    const nombre = String(user.nombre || user.username || "Usuario").trim();
    el.textContent = `${nombre}${rol ? ` (${rol})` : ""}`;
  });

  const restricted = document.querySelectorAll("[data-role-allow]");
  restricted.forEach(el => {
    const raw = String(el.getAttribute("data-role-allow") || "").trim();
    if (!raw) return;
    const roles = raw.split(",").map(x => x.trim()).filter(Boolean);

    const allowed = isAuthRoleAllowed(roles);
    if (!allowed) {
      if (el.matches("button") || el.matches("input") || el.matches("select") || el.matches("textarea") || el.matches("a")) {
        el.setAttribute("disabled", "disabled");
      }
      el.classList.add("is-disabled-by-role");
    }
  });

  const logoutButtons = document.querySelectorAll("[data-auth-logout]");
  logoutButtons.forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      clearAuthSession({ redirect: true });
    });
  });
}

window.AUTH_TOKEN_KEY = AUTH_TOKEN_KEY;
window.AUTH_USER_KEY = AUTH_USER_KEY;
window.getAuthToken = getAuthToken;
window.getAuthUser = getAuthUser;
window.setAuthSession = setAuthSession;
window.clearAuthSession = clearAuthSession;
window.requireAuth = requireAuth;
window.ensureAuthSession = ensureAuthSession;
window.isAuthRoleAllowed = isAuthRoleAllowed;
window.hydrateAuthUI = hydrateAuthUI;
window.authFetchMe = authFetchMe;
window.isAuthBypassEnabled = isAuthBypassEnabled;
window.enableAuthBypass = enableAuthBypass;
window.DEFAULT_API_BASE_URL = DEFAULT_API_BASE_URL;
window.SUPABASE_PROJECT_URL = SUPABASE_PROJECT_URL;
window.SUPABASE_REST_URL = SUPABASE_REST_URL;
window.SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

window.addEventListener("load", async () => {
  inicializarSupabaseDirecto();

  const needsAuth = document.body?.dataset?.requiresAuth === "true";
  if (!needsAuth) return;

  const ok = await ensureAuthSession();
  if (!ok) return;

  hydrateAuthUI();
});

})();
