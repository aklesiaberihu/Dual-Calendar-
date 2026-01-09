const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export function getToken() {
  return localStorage.getItem("token");
}
export function setToken(token) {
  localStorage.setItem("token", token);
}
export function clearToken() {
  localStorage.removeItem("token");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const token = getToken();

  async function doFetch(withAuth) {
    const headers = {};
    if (withAuth && token) headers["Authorization"] = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return { res, data };
  }

  // First try
  let { res, data } = await doFetch(auth);

  // If token is stale and backend rejects it, retry once without auth
  if ((res.status === 401 || res.status === 403) && auth && token) {
    clearToken();
    ({ res, data } = await doFetch(false));
  }

  if (!res.ok) {
    const msg = data && data.detail ? data.detail : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

/* ---------- Auth ---------- */
export async function registerUser(payload) {
  return request("/auth/register", { method: "POST", body: payload });
}

export async function loginUser(email, password) {
  const url = `/auth/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
  return request(url, { method: "POST" });
}

/* ---------- Profile ---------- */
export async function getProfile() {
  return request("/profile");
}
export async function updateProfile(payload) {
  return request("/profile", { method: "PUT", body: payload });
}

/* ---------- Events CRUD ---------- */
export async function listEvents() {
  return request("/events");
}
export async function getEvent(id) {
  return request(`/events/${id}`);
}
export async function createEvent(payload) {
  return request("/events", { method: "POST", body: payload });
}
export async function updateEvent(id, payload) {
  return request(`/events/${id}`, { method: "PUT", body: payload });
}
export async function deleteEvent(id) {
  return request(`/events/${id}`, { method: "DELETE" });
}

/* ---------- Date Conversion ---------- */
export async function g2e(year, month, day) {
  const url = `/convert/gregorian-to-ethiopian?year=${year}&month=${month}&day=${day}`;
  return request(url, { auth: false });
}
export async function e2g(year, month, day) {
  const url = `/convert/ethiopian-to-gregorian?year=${year}&month=${month}&day=${day}`;
  return request(url, { auth: false });
}
