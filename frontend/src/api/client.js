// Small fetch helpers shared by all views

export const getAuthToken = () => {
  try {
    return localStorage.getItem('netpulse_auth_token') || sessionStorage.getItem('netpulse_auth_token') || '';
  } catch {
    return '';
  }
};

export const setAuthSession = (token, user) => {
  try {
    if (token) {
      localStorage.setItem('netpulse_auth_token', token);
      localStorage.setItem('netpulse_auth_user', user || 'Admin');
    } else {
      localStorage.removeItem('netpulse_auth_token');
      localStorage.removeItem('netpulse_auth_user');
      sessionStorage.removeItem('netpulse_auth_token');
      sessionStorage.removeItem('netpulse_auth_user');
    }
  } catch {
    // Ignore storage availability errors
  }
};

export const getStoredAuthUser = () => {
  try {
    return localStorage.getItem('netpulse_auth_user') || sessionStorage.getItem('netpulse_auth_user') || 'Admin';
  } catch {
    return 'Admin';
  }
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

export const getJson = async (path, params) => {
  const qs = params ? buildQuery(params) : '';
  const url = qs ? `${path}?${qs}` : path;
  const token = getAuthToken();
  const headers = {};
  if (token) {
    headers['Authorization'] = `Basic ${token}`;
  }
  const res = await fetch(url, { headers });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('netpulse:unauthorized'));
    throw new Error(`HTTP 401: Unauthorized`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const postJson = async (path, body = {}) => {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Basic ${token}`;
  }
  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `HTTP ${res.status}`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};
