import { useEffect, useState } from "react";
import { createEvent, getEvent, updateEvent } from "../api";
import { useNavigate, useParams } from "react-router-dom";

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
  const { id } = useParams(); // if present => edit mode

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [reminder, setReminder] = useState(60);

  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        const ev = await getEvent(Number(id));
        setTitle(ev.title || "");
        setDescription(ev.description || "");
        setStart(toInputValue(ev.start_time_utc));
        setEnd(toInputValue(ev.end_time_utc));
        setTimezone(ev.timezone || "UTC");
        setReminder(ev.reminder_minutes ?? 60);
      } catch (e) {
        setError(e.message || "Failed to load");
      }
    }
    load();
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const payload = {
        title,
        description,
        start_time_utc: fromInputValue(start),
        end_time_utc: end ? fromInputValue(end) : null,
        timezone,
        reminder_minutes: Number(reminder),
      };

      if (!payload.start_time_utc) {
        setError("Start time is required");
        return;
      }

      if (id) {
        await updateEvent(Number(id), payload);
      } else {
        await createEvent(payload);
      }

      nav("/");
    } catch (e2) {
      setError(e2.message || "Failed");
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h2>{id ? "Edit Event" : "Create Event"}</h2>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </label>

        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        </label>

        <label>
          Start (UTC)
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>

        <label>
          End (UTC)
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>

        <label>
          Timezone
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC" />
        </label>

        <label>
          Reminder (minutes)
          <input type="number" value={reminder} onChange={(e) => setReminder(e.target.value)} />
        </label>

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button type="submit">{id ? "Save" : "Create"}</button>
          <button type="button" onClick={() => nav("/")}>Cancel</button>
        </div>
      </form>

      {error && <p style={{ marginTop: 12 }}>Error: {error}</p>}
    </div>
  );
}
