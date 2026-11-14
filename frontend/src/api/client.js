// Small fetch helpers shared by all views

const TOKEN_KEY = 'netpulse_auth_token';
const USER_KEY = 'netpulse_auth_user';

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const getAuthToken = () =>
  safe(() => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '', '');

// remember=true keeps the session in localStorage (survives closing the browser), otherwise sessionStorage
export const setAuthSession = (token, user, remember = true) => {
  safe(() => {
    [localStorage, sessionStorage].forEach((s) => {
      s.removeItem(TOKEN_KEY);
      s.removeItem(USER_KEY);
    });
    if (token) {
      const store = remember ? localStorage : sessionStorage;
      store.setItem(TOKEN_KEY, token);
      store.setItem(USER_KEY, JSON.stringify(user || null));
    }
  });
};

// Logged-in user: { username, full_name, role_id, role_name, is_super, permissions: [menuId] }
export const getStoredAuthUser = () =>
  safe(() => {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    const user = raw ? JSON.parse(raw) : null;
    return user && typeof user === 'object' ? user : null;
  }, null);

export const updateStoredAuthUser = (user) =>
  safe(() => {
    const store = localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
    store.setItem(USER_KEY, JSON.stringify(user || null));
  });

export const authHeaders = (extra = {}) => {
  const token = getAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
};

// Builds a query string; array values become repeated keys, null/undefined/'' are skipped
export const buildQuery = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach(v => q.append(key, v));
    else if (value !== undefined && value !== null && value !== '') q.append(key, value);
  });
  return q.toString();
};

const notifyUnauthorized = (path) => {
  // A failed login attempt is not an expired session
  if (path !== '/api/auth/login') window.dispatchEvent(new CustomEvent('netpulse:unauthorized'));
};

export const getJson = async (path, params) => {
  const qs = params ? buildQuery(params) : '';
  const url = qs ? `${path}?${qs}` : path;
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401) {
    notifyUnauthorized(path);
    throw new Error('HTTP 401: Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  }
  return res.json();
};

// JSON request with any method; the server's error text is kept in the thrown Error
export const sendJson = async (method, path, body) => {
  const res = await fetch(path, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) notifyUnauthorized(path);
  if (!res.ok) {
    const err = new Error(data?.error === 'Forbidden' ? data.message : data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

export const postJson = (path, body = {}) => sendJson('POST', path, body);
