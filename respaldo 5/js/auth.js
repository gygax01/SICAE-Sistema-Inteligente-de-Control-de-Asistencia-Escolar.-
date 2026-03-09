/* ======================================================
   ===== AUTH JWT (FRONTEND) ===========================
====================================================== */

const AUTH_TOKEN_KEY = "asistencia_auth_token";
const AUTH_USER_KEY = "asistencia_auth_user";
const AUTH_BYPASS_KEY = "AUTH_BYPASS";
const SUPABASE_REST_URL = "https://vqylvfutuiococveggej.supabase.co/rest/v1";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_C3jhIFoDyrdFr5PuTU2_tg_D8-WWItk";
const DEFAULT_API_BASE_URL = SUPABASE_REST_URL;

function esSupabaseRest(url) {
  return /supabase\.co\/rest\/v1$/i.test(String(url || "").trim().replace(/\/+$/, ""));
}

function getApiBaseURLForAuth() {
  const fromWindow = String(window.API_BASE_URL || "").trim();
  if (fromWindow) return fromWindow.replace(/\/+$/, "");

  const fromStorage = String(localStorage.getItem("API_BASE_URL") || "").trim();
  if (fromStorage && fromStorage !== "/api") return fromStorage.replace(/\/+$/, "");

  return DEFAULT_API_BASE_URL;
}

function isAuthBypassEnabled() {
  return String(localStorage.getItem(AUTH_BYPASS_KEY) || "").trim().toLowerCase() === "true";
}

function enableAuthBypass(user = null) {
  localStorage.setItem(AUTH_BYPASS_KEY, "true");
  if (user) {
    setAuthSession(getAuthToken() || "postgrest-direct", user);
  }
}

function getAuthToken() {
  return String(localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
}

function inicializarSupabaseDirecto() {
  const apiBase = getApiBaseURLForAuth();
  if (!esSupabaseRest(apiBase)) return;

  localStorage.setItem("API_BASE_URL", apiBase);

  const token = getAuthToken();
  if (!token) {
    localStorage.setItem(AUTH_TOKEN_KEY, SUPABASE_PUBLISHABLE_KEY);
  }

  if (!isAuthBypassEnabled()) {
    localStorage.setItem(AUTH_BYPASS_KEY, "true");
  }

  const currentUser = getAuthUser();
  if (!currentUser?.id) {
    setAuthSession(localStorage.getItem(AUTH_TOKEN_KEY) || SUPABASE_PUBLISHABLE_KEY, {
      id: "supabase-direct",
      username: "supabase",
      nombre: "Modo Supabase",
      rol: "admin"
    });
  }
}

function getAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setAuthSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, String(token || ""));
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user || null));
}

function clearAuthSession({ redirect = true } = {}) {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_BYPASS_KEY);

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
    credentials: "include"
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
window.SUPABASE_REST_URL = SUPABASE_REST_URL;
window.SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;

window.addEventListener("load", async () => {
  inicializarSupabaseDirecto();

  const needsAuth = document.body?.dataset?.requiresAuth === "true";
  if (!needsAuth) return;

  const ok = await ensureAuthSession();
  if (!ok) return;

  hydrateAuthUI();
});
