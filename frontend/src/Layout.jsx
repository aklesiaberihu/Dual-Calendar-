import { Link, Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "./api";

export default function Layout() {
  const nav = useNavigate();

  function logout() {
    clearToken();
    nav("/login");
  }

  return (
    <div>
      <div style={{ height: 80, borderBottom: "1px solid #ddd", display: "flex", alignItems: "center", padding: "0 24px", justifyContent: "space-between" }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Dual Calendar</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={logout}>Logout</button>
          <div style={{ width: 32, height: 32, border: "1px solid #777", borderRadius: "50%" }} />
        </div>
      </div>

      <div style={{ display: "flex" }}>
        <div style={{ width: 240, borderRight: "1px solid #ddd", padding: 16, minHeight: "calc(100vh - 80px)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link to="/" style={{ textDecoration: "none" }}>Today (Calendar)</Link>
            <Link to="/events/new" style={{ textDecoration: "none" }}>Create Event</Link>
            <Link to="/convert" style={{ textDecoration: "none" }}>Convert</Link>
            <Link to="/settings" style={{ textDecoration: "none" }}>Settings</Link>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
