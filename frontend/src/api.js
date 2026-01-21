const API_URL = "http://localhost:8000";

// -------------------- token helpers --------------------
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
  // keep compatibility with older code paths
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

// -------------------- auth --------------------
export async function loginUser(email, password) {
  const r = await fetch(
    `${API_URL}/auth/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(
      password
    )}`,
    { method: "POST" }
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // expected {access_token, token_type}
}

export async function registerUser(payload) {
  const r = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// -------------------- events --------------------
export async function listEvents() {
  const r = await fetch(`${API_URL}/events`, { headers: authHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getEvent(id) {
  const r = await fetch(`${API_URL}/events/${id}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createEvent(payload) {
  const r = await fetch(`${API_URL}/events`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateEvent(id, payload) {
  const r = await fetch(`${API_URL}/events/${id}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteEvent(id) {
  const r = await fetch(`${API_URL}/events/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// -------------------- conversion --------------------
// these names match your imports: e2g, g2e
export async function e2g(payload) {
  const r = await fetch(`${API_URL}/convert/e2g`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function g2e(payload) {
  const r = await fetch(`${API_URL}/convert/g2e`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// keep backward-compat if some page calls convert endpoint differently
export async function convertDate(payload) {
  const r = await fetch(`${API_URL}/convert`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// -------------------- profile --------------------
export async function getProfile() {
  const r = await fetch(`${API_URL}/profile`, { headers: authHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateProfile(payload) {
  const r = await fetch(`${API_URL}/profile`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// -------------------- diff --------------------
export async function getEventDiff(eventId, fromVersion, toVersion) {
  const r = await fetch(
    `${API_URL}/events/${eventId}/diff?from_version=${fromVersion}&to_version=${toVersion}`,
    { headers: authHeaders() }
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export { API_URL };
