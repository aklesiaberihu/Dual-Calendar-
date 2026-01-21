import { useEffect, useState } from "react";
import { createEvent, getEvent, updateEvent, e2g } from "../api";
import { useNavigate, useParams } from "react-router-dom";

/*
Concurrency-safe updates:
- Backend requires payload.version for PUT /events/{id}
- If version mismatches: backend returns 409 Conflict
- We show a clear message and allow reload
*/

function toInputValue(dtIso) {
  if (!dtIso) return "";
  return dtIso.slice(0, 16);
}

function fromInputValue(v) {
  if (!v) return null;
  return `${v}:00`;
}

export default function EventForm() {
  const nav = useNavigate();
  const { id } = useParams();

  // IMPORTANT: store event version for optimistic locking
  const [version, setVersion] = useState(null);

  const [calendarType, setCalendarType] = useState("gregorian");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Gregorian inputs
  const [gDateTime, setGDateTime] = useState("");

  // Ethiopian inputs
  const [eYear, setEYear] = useState("");
  const [eMonth, setEMonth] = useState("");
  const [eDay, setEDay] = useState("");

  const [timezone, setTimezone] = useState("UTC");
  const [reminder, setReminder] = useState(60);

  const [error, setError] = useState("");
  const [conflictMsg, setConflictMsg] = useState("");

  async function loadEvent() {
    if (!id) return;
    setError("");
    setConflictMsg("");
    try {
      const ev = await getEvent(Number(id));

      // load fields
      setTitle(ev.title || "");
      setDescription(ev.description || "");
      setGDateTime(toInputValue(ev.start_time_utc));
      setTimezone(ev.timezone || "UTC");
      setReminder(ev.reminder_minutes ?? 60);

      // store version
      setVersion(ev.version);

      // default to gregorian when editing
      setCalendarType("gregorian");
    } catch (e) {
      setError(e.message || "Failed to load");
    }
  }

  useEffect(() => {
    loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setConflictMsg("");

    try {
      let startUtc = null;

      if (calendarType === "gregorian") {
        if (!gDateTime) {
          setError("Gregorian date/time required");
          return;
        }
        if (!gDateTime) {
          setError("Gregorian date & time required");
          return;
        }
        // Interpret datetime-local as UTC and send ISO string
        startUtc = new Date(gDateTime + "Z").toISOString();
} else {
        if (!eYear || !eMonth || !eDay) {
          setError("Complete Ethiopian date required");
          return;
        }
        const g = await e2g(Number(eYear), Number(eMonth), Number(eDay));
        startUtc = `${g.year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}T09:00:00`;
      }

      const basePayload = {
        title,
        description,
        start_time_utc: startUtc,
        timezone,
        reminder_minutes: Number(reminder),
      };

      if (id) {
        if (version === null || version === undefined) {
          setError("Missing version. Reload the event and try again.");
          return;
        }

        // MUST include version for concurrency-safe update
        const payload = { version, ...basePayload };

        const updated = await updateEvent(Number(id), payload);

        // if update succeeds, backend increments version; store it
        setVersion(updated.version);

      } else {
        await createEvent(basePayload);
      }

      nav("/");
    } catch (e2) {
      // Explicit conflict handling: backend returns 409 with message
      const msg = e2.message || "Failed";

      if (msg.toLowerCase().includes("version conflict")) {
        setConflictMsg(
          "Conflict detected: someone updated this event while you were editing. Click Reload to get the latest version, then apply your changes again."
        );
        return;
      }

      setError(msg);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2>{id ? "Edit Event" : "Create Event"}</h2>

      {id && (
        <p style={{ marginTop: 6, color: "#666" }}>
          Current version: <b>{version ?? "loading..."}</b>
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <label>
          Calendar Type
          <select value={calendarType} onChange={(e) => setCalendarType(e.target.value)}>
            <option value="gregorian">Gregorian</option>
            <option value="ethiopian">Ethiopian</option>
          </select>
        </label>

        {calendarType === "gregorian" && (
          <label>
            Gregorian Date & Time (UTC)
            <input
              type="datetime-local"
              value={gDateTime}
              onChange={(e) => setGDateTime(e.target.value)}
            />
          </label>
        )}

        {calendarType === "ethiopian" && (
          <div style={{ display: "flex", gap: 8 }}>
            <label>
              Year
              <input value={eYear} onChange={(e) => setEYear(e.target.value)} />
            </label>
            <label>
              Month
              <input value={eMonth} onChange={(e) => setEMonth(e.target.value)} />
            </label>
            <label>
              Day
              <input value={eDay} onChange={(e) => setEDay(e.target.value)} />
            </label>
          </div>
        )}

        <label>
          Timezone
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </label>

        <label>
          Reminder (minutes)
          <input type="number" value={reminder} onChange={(e) => setReminder(e.target.value)} />
        </label>

        <div style={{ display: "flex", gap: 12 }}>
          <button type="submit">{id ? "Save" : "Create"}</button>
          <button type="button" onClick={() => nav("/")}>Cancel</button>
          {id && (
            <button type="button" onClick={loadEvent}>Reload</button>
          )}
        </div>
      </form>

      {conflictMsg && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <b>Conflict:</b>
          <div style={{ marginTop: 6 }}>{conflictMsg}</div>
        </div>
      )}

      {error && <p style={{ marginTop: 12 }}>Error: {error}</p>}
    </div>
  );
}
