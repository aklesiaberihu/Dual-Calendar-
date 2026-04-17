const API_URL = "http://localhost:8000";

export function getToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("jwt") ||
    ""
  );
}

export function setToken(token) {
  if (!token) return;
  localStorage.setItem("access_token", token);
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  localStorage.removeItem("jwt");
}

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders() {
  return { "Content-Type": "application/json", ...authHeaders() };
}

async function parseError(r) {
  const text = await r.text();

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  const err = new Error(
    parsed?.detail || text || `Request failed with status ${r.status}`
  );
  err.status = r.status;
  err.payload = parsed;
  throw err;
}

export async function loginUser(email, password) {
  const r = await fetch(
    `${API_URL}/auth/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(
      password
    )}`,
    { method: "POST" }
  );
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function registerUser(payload) {
  const r = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function getGoogleLoginUrl() {
  const r = await fetch(`${API_URL}/auth/google/login-url`);
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function listEvents(filters = {}) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.timezone) params.set("timezone", filters.timezone);
  if (filters.start_from) params.set("start_from", filters.start_from);
  if (filters.start_to) params.set("start_to", filters.start_to);
  if (filters.ownership) params.set("ownership", filters.ownership);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const r = await fetch(`${API_URL}/events${suffix}`, { headers: authHeaders() });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function listHolidays(params = {}) {
  const query = new URLSearchParams();

  if (params.from_date) query.set("from_date", params.from_date);
  if (params.to_date) query.set("to_date", params.to_date);
  if (params.calendar_type) query.set("calendar_type", params.calendar_type);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const r = await fetch(`${API_URL}/holidays${suffix}`, {
    headers: authHeaders(),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function getEvent(id) {
  const r = await fetch(`${API_URL}/events/${id}`, { headers: authHeaders() });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function createEvent(payload) {
  const r = await fetch(`${API_URL}/events`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function updateEvent(id, payload, options = {}) {
  const suffix = options.force ? "?force=true" : "";
  const r = await fetch(`${API_URL}/events/${id}${suffix}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function deleteEvent(id) {
  const r = await fetch(`${API_URL}/events/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function listEventParticipants(eventId) {
  const r = await fetch(`${API_URL}/events/${eventId}/participants`, {
    headers: authHeaders(),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function shareEvent(eventId, payload) {
  const r = await fetch(`${API_URL}/events/${eventId}/share`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function removeEventParticipant(eventId, userId) {
  const r = await fetch(`${API_URL}/events/${eventId}/participants/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function e2g(payload) {
  const q = new URLSearchParams({
    year: String(payload.year),
    month: String(payload.month),
    day: String(payload.day),
  }).toString();

  const r = await fetch(`${API_URL}/convert/e2g?${q}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!r.ok) await parseError(r);
  return r.json();
}

export async function g2e(payload) {
  const q = new URLSearchParams({
    year: String(payload.year),
    month: String(payload.month),
    day: String(payload.day),
  }).toString();

  const r = await fetch(`${API_URL}/convert/g2e?${q}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!r.ok) await parseError(r);
  return r.json();
}

export async function convertDate(payload) {
  if (payload?.from === "ethiopian" && payload?.to === "gregorian") {
    return e2g(payload);
  }
  if (payload?.from === "gregorian" && payload?.to === "ethiopian") {
    return g2e(payload);
  }
  throw new Error("Unsupported conversion request");
}

export async function getProfile() {
  const r = await fetch(`${API_URL}/profile`, { headers: authHeaders() });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function updateProfile(payload) {
  const r = await fetch(`${API_URL}/profile`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function getEventDiff(eventId, fromVersion, toVersion) {
  const r = await fetch(
    `${API_URL}/events/${eventId}/diff?from_version=${fromVersion}&to_version=${toVersion}`,
    { headers: authHeaders() }
  );
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function rankEventSlots(eventId, params) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${API_URL}/events/${eventId}/rank?${q}`, {
    headers: authHeaders(),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function getGoogleStatus() {
  const r = await fetch(`${API_URL}/google/status`, {
    headers: authHeaders(),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function getGoogleConnectUrl() {
  const r = await fetch(`${API_URL}/google/connect-url`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function disconnectGoogle() {
  const r = await fetch(`${API_URL}/google/disconnect`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export async function exportEventToGoogle(eventId) {
  const r = await fetch(`${API_URL}/google/export-event/${eventId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!r.ok) await parseError(r);
  return r.json();
}

export { API_URL };

