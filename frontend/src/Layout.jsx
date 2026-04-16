import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearToken, getToken } from "./api";
import { jwtDecode } from "jwt-decode";

function getInitial() {
  try {
    const token = getToken();
    if (!token) return "U";
    const payload = jwtDecode(token);
    return (payload.sub || "").charAt(0).toUpperCase();
  } catch { return "U"; }
}

const NAV_ITEMS = [
  {
    to: "/app",
    label: "Calendar",
    exact: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    to: "/events/new",
    label: "Create Event",
    exact: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
  },
  {
    to: "/convert",
    label: "Date Conversion",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9"/>
        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/>
        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Profile & Settings",
    exact: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const initial = getInitial();
  const [expanded, setExpanded] = useState(false);

  const COLLAPSED_WIDTH = 58;
  const EXPANDED_WIDTH = 268;

  function logout() {
    clearToken();
    navigate("/");
  }

  return (
    <div className="appShell">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbarLeft">
          <div className="brandMark">Z</div>
          <div className="brandBlock">
            <div className="brandTitle">Zemen</div>
            <div className="brandSub">Dual calendar scheduling, Ethiopian &amp; Gregorian</div>
          </div>
        </div>
      </header>

      {/* Shell body — grid column tracks sidebar width */}
      <div
        className="shellBody"
        style={{ gridTemplateColumns: `${expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH}px minmax(0, 1fr)` }}
      >
        {/* Sidebar */}
        <aside
          className="sidebar"
          style={{
            width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
            padding: expanded ? "20px 14px" : "20px 8px",
            alignItems: expanded ? "stretch" : "center",
            cursor: expanded ? "default" : "pointer",
            transition: "width 200ms ease, padding 200ms ease",
            overflow: "hidden",
          }}
          onClick={() => !expanded && setExpanded(true)}
        >
          {/* Collapse button when expanded */}
          {expanded && (
            <button
              className="sidebarCollapseBtn"
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              title="Collapse"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}

          <div className="sidebarInner">
            {expanded && <p className="sidebarSectionLabel">Navigation</p>}
            <div className="sidebarGroup">
              {NAV_ITEMS.map((item) => {
                const active = item.exact ? path === item.to : path.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`navLink ${active ? "navLinkActive" : ""}`}
                    style={{
                      justifyContent: expanded ? "flex-start" : "center",
                      padding: expanded ? "10px 12px" : "10px",
                    }}
                    title={!expanded ? item.label : undefined}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="navIcon">{item.icon}</span>
                    {expanded && <span className="navLabel">{item.label}</span>}
                    {expanded && active && <span className="navActiveBar" />}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Footer — sign out only */}
          <div className="sidebarFooter" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <button
              className="sidebarSignOut"
              style={{ justifyContent: expanded ? "flex-start" : "center", padding: expanded ? "9px 12px" : "9px" }}
              onClick={(e) => { e.stopPropagation(); logout(); }}
              title="Sign out"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              {expanded && <span>Sign out</span>}
            </button>
          </div>
        </aside>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}