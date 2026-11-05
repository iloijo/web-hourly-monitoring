// Small fetch helpers shared by all views

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
  const res = await fetch(qs ? `${path}?${qs}` : path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
