// REST client for the St. Agnes Academy Alumni Management System.
// Talks to the Node.js + Express API (/api). In Vite dev the proxy forwards to :3000.

async function api(path, options = {}) {
  const token = localStorage.getItem('saa_token') || sessionStorage.getItem('saa_token') || '';
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token missing / revoked -> clear the session and return to the login screen.
    const hadToken = Boolean(token);
    clearSession();
    if (hadToken) {
      window.location.reload();
      throw new Error('Session expired. Returning to sign-in…');
    }
    throw new Error('Authentication required. Please sign in.');
  }

  if (!res.ok) {
    let message = `API error (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch (e) { /* non-JSON */ }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ------------------------------ auth helpers ------------------------------ */

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('saa_user'));
  } catch (e) {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem('saa_token', token || '');
  localStorage.setItem('saa_user', JSON.stringify(user || null));
}

export function clearSession() {
  localStorage.removeItem('saa_token');
  localStorage.removeItem('saa_user');
  sessionStorage.removeItem('saa_token');
}

export async function login(username, password) {
  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  setSession(data.token, data.user);
  return data.user;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* best effort */ }
  clearSession();
}

/* ------------------------------- domain API ------------------------------ */

export const alumniApi = {
  list: () => api('/alumni'),
  create: (payload) => api('/alumni', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id, payload) => api(`/alumni/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id) => api(`/alumni/${id}`, { method: 'DELETE' })
};

export const transcriptApi = {
  list: () => api('/transcripts'),
  create: (payload) => api('/transcripts', { method: 'POST', body: JSON.stringify(payload) }),
  setStatus: (id, status) => api(`/transcripts/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) })
};

export const trackingApi = {
  summary: () => api('/tracking'),
  updateEmployment: (id, payload) => api(`/tracking/${id}/employment`, { method: 'PUT', body: JSON.stringify(payload) })
};

export const eventsApi = {
  list: () => api('/events'),
  rsvp: (id) => api(`/events/${id}/rsvp`, { method: 'POST' })
};

export const reportsApi = {
  summary: () => api('/reports/summary'),

  /** Downloads the CHED Tracer Study CSV using the bearer token. */
  async downloadTracerStudy() {
    const token = localStorage.getItem('saa_token') || sessionStorage.getItem('saa_token') || '';
    const res = await fetch('/api/reports/tracer-study/download', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error(`Report download failed (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saa-tracer-study-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};