import { useEffect, useState } from "react";
import { getProfile, updateProfile } from "../api";

export default function Settings() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setError("");
    setMsg("");
    try {
      const data = await getProfile();
      setProfile(data);
    } catch (e) {
      setError(e.message || "Failed");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    setError("");
    setMsg("");
    try {
      const payload = {
        full_name: profile.full_name,
        preferred_calendar: profile.preferred_calendar,
        timezone: profile.timezone,
        language: profile.language,
      };
      const updated = await updateProfile(payload);
      setProfile(updated);
      setMsg("Saved.");
    } catch (e) {
      setError(e.message || "Failed");
    }
  }

  if (error) return <div style={{ padding: 24 }}><p>Error: {error}</p></div>;
  if (!profile) return <div style={{ padding: 24 }}><p>Loading...</p></div>;

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h2>Profile / Settings</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <label>
          Email
          <input value={profile.email} disabled />
        </label>

        <label>
          Full name
          <input
            value={profile.full_name || ""}
            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
          />
        </label>

        <label>
          Preferred calendar
          <select
            value={profile.preferred_calendar || "gregorian"}
            onChange={(e) => setProfile({ ...profile, preferred_calendar: e.target.value })}
          >
            <option value="gregorian">Gregorian</option>
            <option value="ethiopian">Ethiopian</option>
          </select>
        </label>

        <label>
          Timezone
          <input
            value={profile.timezone || "UTC"}
            onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
          />
        </label>

        <label>
          Language
          <input
            value={profile.language || "en"}
            onChange={(e) => setProfile({ ...profile, language: e.target.value })}
          />
        </label>

        <button onClick={handleSave}>Save</button>
        {msg && <p>{msg}</p>}
      </div>
    </div>
  );
}
