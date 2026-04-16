import { useEffect, useMemo, useState } from "react";
import {
  getProfile, updateProfile,
  getGoogleStatus, getGoogleConnectUrl, disconnectGoogle,
} from "../api";

const TIMEZONES = [
  "UTC", "Africa/Addis_Ababa", "Africa/Nairobi", "Africa/Cairo",
  "Europe/Rome", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Asia/Dubai", "Asia/Riyadh", "Asia/Tokyo", "Australia/Sydney",
];

function Avatar({ email, size = 56 }) {
  const initial = email ? email.charAt(0).toUpperCase() : "U";
  return (
    <div className="settingsAvatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initial}
    </div>
  );
}

function CalIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function Settings() {
  const [profile, setProfile] = useState(null);
  const [initialProfile, setInitialProfile] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [googleStatus, setGoogleStatus] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleMsg, setGoogleMsg] = useState("");
  const [googleError, setGoogleError] = useState("");

  async function load() {
    setError(""); setMsg("");
    try {
      const data = await getProfile();
      setProfile(data);
      setInitialProfile(data);
    } catch (e) {
      setError(e.message || "Failed to load profile");
    }
  }

  async function loadGoogleStatus() {
    try {
      const status = await getGoogleStatus();
      setGoogleStatus(status);
    } catch {
      setGoogleStatus(null);
    }
  }

  useEffect(() => {
    load();
    loadGoogleStatus();
  }, []);

  async function handleSave() {
    if (!profile) return;
    setError(""); setMsg(""); setSaving(true);
    try {
      const updated = await updateProfile({
        full_name: profile.full_name,
        preferred_calendar: profile.preferred_calendar,
        timezone: profile.timezone,
      });
      setProfile(updated);
      setInitialProfile(updated);
      setMsg("Profile saved successfully.");
    } catch (e) {
      setError(e.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleGoogleConnect() {
    setGoogleError(""); setGoogleMsg(""); setGoogleLoading(true);
    try {
      const data = await getGoogleConnectUrl();
      window.location.href = data.auth_url;
    } catch (e) {
      setGoogleError(e.message || "Failed to start Google connection");
      setGoogleLoading(false);
    }
  }

  async function handleGoogleDisconnect() {
    setGoogleError(""); setGoogleMsg(""); setGoogleLoading(true);
    try {
      await disconnectGoogle();
      setGoogleMsg("Google account disconnected.");
      await loadGoogleStatus();
    } catch (e) {
      setGoogleError(e.message || "Failed to disconnect");
    } finally {
      setGoogleLoading(false);
    }
  }

  const hasChanges = useMemo(() => {
    if (!profile || !initialProfile) return false;
    return (
      (profile.full_name || "") !== (initialProfile.full_name || "") ||
      (profile.preferred_calendar || "") !== (initialProfile.preferred_calendar || "") ||
      (profile.timezone || "") !== (initialProfile.timezone || "")
    );
  }, [profile, initialProfile]);

  if (!profile && !error) {
    return (
      <div className="page pageNarrow">
        <div className="settingsLoading">
          <span className="spinner" />
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Loading profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page pageNarrow">
      <div className="pageHeader">
        <div className="pageHeaderBlock">
          <h1 className="h1">Your account</h1>
          <p className="sub">Manage your personal preferences, calendar defaults, and connected services.</p>
        </div>
      </div>

      {error && <div className="alert alertDanger" style={{ marginBottom: 18 }}>{error}</div>}

      {profile && (
        <div className="stack">

          {/* Profile card */}
          <div className="sectionCard sectionCardPad">
            <div className="settingsProfileRow">
              <Avatar email={profile.email} />
              <div className="settingsProfileInfo">
                <div className="settingsProfileName">{profile.full_name || profile.email}</div>
                <div className="settingsProfileEmail">{profile.email}</div>
                <div className="settingsProfileMeta">
                  <span className="badge badgeAccent">
                    {profile.preferred_calendar === "ethiopian" ? "Ethiopian" : "Gregorian"}
                  </span>
                  <span className="badge">{profile.timezone || "UTC"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Single unified form */}
          <div className="sectionCard sectionCardPad">
            <div className="stack">

              {/* Personal information */}
              <div>
                <div className="sectionHead" style={{ marginBottom: 14 }}>
                  <h3 className="sectionTitle">Personal information</h3>
                  {hasChanges && <span className="badge badgeWarning">Unsaved changes</span>}
                </div>
                <div className="formGrid">
                  <label className="label">
                    Email address
                    <input className="input" value={profile.email || ""} disabled/>
                  </label>
                  <label className="label">
                    Full name
                    <input
                      className="input"
                      value={profile.full_name || ""}
                      onChange={e => setProfile({ ...profile, full_name: e.target.value })}
                      placeholder="Your full name"
                    />
                  </label>
                </div>
              </div>

              <div className="formDivider"/>

              {/* Workspace defaults */}
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
                  <CalIcon/>
                  <h3 className="sectionTitle">Workspace defaults</h3>
                </div>
                <div className="stack">
                  <div>
                    <div style={{ fontSize:"0.78rem", fontWeight:600, color:"var(--muted-2)", marginBottom:8 }}>Preferred calendar</div>
                    <div style={{ display:"flex", gap:8 }}>
                      {[
                        { key:"gregorian", label:"Gregorian", sub:"Standard calendar" },
                        { key:"ethiopian", label:"Ethiopian", sub:"13-month calendar" },
                      ].map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setProfile({ ...profile, preferred_calendar: opt.key })}
                          style={{
                            display:"flex", alignItems:"center", gap:8,
                            padding:"10px 16px", borderRadius:10, flex:1,
                            border: (profile.preferred_calendar || "gregorian") === opt.key ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                            background: (profile.preferred_calendar || "gregorian") === opt.key ? "var(--accent-soft)" : "rgba(255,255,255,0.03)",
                            color: (profile.preferred_calendar || "gregorian") === opt.key ? "var(--text)" : "var(--muted)",
                            fontWeight:600, fontSize:"0.88rem", cursor:"pointer", transition:"all 150ms ease",
                          }}
                        >
                          <CalIcon size={15}/>
                          <div style={{ textAlign:"left" }}>
                            <div>{opt.label}</div>
                            <div style={{ fontSize:"0.72rem", fontWeight:400, opacity:0.7 }}>{opt.sub}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="label">
                    Timezone
                    <select
                      className="input"
                      value={profile.timezone || "UTC"}
                      onChange={e => setProfile({ ...profile, timezone: e.target.value })}
                      style={{ appearance:"none", WebkitAppearance:"none" }}
                    >
                      {TIMEZONES.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                      {!TIMEZONES.includes(profile.timezone) && profile.timezone && (
                        <option value={profile.timezone}>{profile.timezone}</option>
                      )}
                    </select>
                  </label>
                </div>
              </div>

              <div className="formDivider"/>

              {/* Google Calendar */}
              <div>
                <div className="sectionHead" style={{ marginBottom: 14, alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <GoogleIcon/>
                    <h3 className="sectionTitle">Google Calendar</h3>
                  </div>
                  {googleStatus?.connected
                    ? <span className="badge badgeSuccess">Connected</span>
                    : <span className="badge">Not connected</span>
                  }
                </div>

                {googleMsg && <div className="alert alertSuccess" style={{ marginBottom:10 }}>{googleMsg}</div>}
                {googleError && <div className="alert alertDanger" style={{ marginBottom:10 }}>{googleError}</div>}

                {googleStatus?.connected ? (
                  <div className="stack">
                    <div className="settingsGoogleInfo">
                      <div className="settingsGoogleRow">
                        <span className="settingsGoogleLabel">Google account</span>
                        <span className="settingsGoogleVal">{googleStatus.google_email || ""}</span>
                      </div>
                      <div className="settingsGoogleRow">
                        <span className="settingsGoogleLabel">Calendar access</span>
                        <span>
                          {googleStatus.has_calendar_scope
                            ? <span className="badge badgeSuccess">Granted</span>
                            : <span className="badge badgeDanger">Missing, reconnect to grant</span>
                          }
                        </span>
                      </div>
                      {googleStatus.google_connected_at && (
                        <div className="settingsGoogleRow">
                          <span className="settingsGoogleLabel">Connected on</span>
                          <span className="settingsGoogleVal">
                            {new Date(googleStatus.google_connected_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                    {!googleStatus.has_calendar_scope && (
                      <div className="alert alertWarning">
                        Calendar export permission is missing. Disconnect and reconnect to grant calendar access.
                      </div>
                    )}
                    <div className="formActions">
                      <button className="btn btnSm" onClick={handleGoogleConnect} disabled={googleLoading} type="button">
                        <GoogleIcon/> Reconnect
                      </button>
                      <button className="btn btnSm btnDanger" onClick={handleGoogleDisconnect} disabled={googleLoading} type="button">
                        {googleLoading ? "Disconnecting..." : "Disconnect"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn loginGoogleBtn"
                    onClick={handleGoogleConnect}
                    disabled={googleLoading}
                    type="button"
                    style={{ maxWidth: 280 }}
                  >
                    {googleLoading
                      ? <><span className="spinner" style={{ width:15, height:15 }}/> Connecting...</>
                      : <><GoogleIcon/> Connect Google Calendar</>
                    }
                  </button>
                )}
              </div>

              <div className="formDivider"/>

              {/* Actions */}
              <div className="settingsSaveRow">
                {msg && <div className="alert alertSuccess" style={{ flex:1 }}>{msg}</div>}
                <div className="formActions">
                  <button className="btn" onClick={load} disabled={saving} type="button">Discard</button>
                  <button
                    className="btn btnPrimary"
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    type="button"
                  >
                    {saving
                      ? <><span className="spinner" style={{ width:15, height:15, borderTopColor:"#fff" }}/> Saving...</>
                      : "Save changes"
                    }
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
