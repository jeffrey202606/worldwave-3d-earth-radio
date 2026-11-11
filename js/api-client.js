/* WORLDWAVE Prototype 03 API client. Set window.WW_API_BASE before this file to override. */
(() => {
  const defaultBase = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:4000' : '';
  const BASE = (window.WW_API_BASE ?? defaultBase).replace(/\/$/, '');
  async function request(path) {
    const response = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' }, credentials: 'include', signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`WORLDWAVE API HTTP ${response.status}`);
    return response.json();
  }
  async function loadStations() {
    const payload = await request('/api/v1/stations?limit=300&offset=0&hasGeo=true');
    return { stations: Array.isArray(payload.data) ? payload.data : [], cached: false, source: 'WORLDWAVE DATABASE' };
  }
  async function searchStations(query) {
    const payload = await request(`/api/v1/stations?q=${encodeURIComponent(query)}&limit=100&offset=0&hasGeo=true`);
    return Array.isArray(payload.data) ? payload.data : [];
  }
  async function getStats() { return request('/api/v1/stats'); }
  async function userRequest(path, options = {}) {
    const response = await fetch(`${BASE}/api/v1${path}`, { credentials: 'include', headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, ...options, signal: AbortSignal.timeout(4000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.message || payload.error || `HTTP ${response.status}`), { status: response.status, payload });
    return payload;
  }
  const userApi = {
    me: () => userRequest('/me'),
    register: data => userRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: data => userRequest('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => userRequest('/auth/logout', { method: 'POST' }),
    updateProfile: data => userRequest('/me', { method: 'PATCH', body: JSON.stringify(data) }),
    favorites: () => userRequest('/me/favorites'),
    addFavorite: stationUuid => userRequest('/me/favorites', { method: 'POST', body: JSON.stringify({ stationUuid }) }),
    removeFavorite: uuid => userRequest(`/me/favorites/${encodeURIComponent(uuid)}`, { method: 'DELETE' }),
    lists: () => userRequest('/me/lists'),
    createList: data => userRequest('/me/lists', { method: 'POST', body: JSON.stringify(data) }),
    deleteList: id => userRequest(`/me/lists/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    list: id => userRequest(`/me/lists/${encodeURIComponent(id)}`),
    addToList: (id, stationUuid) => userRequest(`/me/lists/${encodeURIComponent(id)}/stations`, { method: 'POST', body: JSON.stringify({ stationUuid }) }),
    history: () => userRequest('/me/history'),
    recordHistory: data => userRequest('/me/history', { method: 'POST', body: JSON.stringify(data) }),
    exportData: () => userRequest('/me/export'),
    clearHistory: () => userRequest('/me/history', { method: 'DELETE' }),
    deleteAccount: password => userRequest('/me/account', { method: 'DELETE', body: JSON.stringify({ password }) })
  };
  window.WW_API = { base: BASE, loadStations, searchStations, getStats, user: userApi };
})();
