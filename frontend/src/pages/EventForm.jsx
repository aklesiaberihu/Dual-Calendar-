import { useEffect, useState } from "react";
import { createEvent, getEvent, updateEvent, e2g, rankEventSlots } from "../api";
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
  const { id } = useParams();

  const [version, setVersion] = useState(null);

  const [calendarType, setCalendarType] = useState("gregorian");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gDateTime, setGDateTime] = useState("");

  const [eYear, setEYear] = useState("");
  const [eMonth, setEMonth] = useState("");
  const [eDay, setEDay] = useState("");

  const [timezone, setTimezone] = useState("UTC");
  const [reminder, setReminder] = useState(60);

  const [error, setError] = useState("");
  const [conflictMsg, setConflictMsg] = useState("");

  // --- Ranking UI state ---
  const [rankDuration, setRankDuration] = useState(60);
  const [rankWindowStart, setRankWindowStart] = useState("");
  const [rankWindowEnd, setRankWindowEnd] = useState("");
  const [rankResults, setRankResults] = useState(null);
  const [rankError, setRankError] = useState("");

  async function loadEvent() {
    if (!id) return;
    setError("");
    setConflictMsg("");
    try {
      const ev = await getEvent(Number(id));

      setTitle(ev.title || "");
      setDescription(ev.description || "");
      setGDateTime(toInputValue(ev.start_time_utc));
      setTimezone(ev.timezone || "UTC");
      setReminder(ev.reminder_minutes ?? 60);
      setVersion(ev.version);

      setCalendarType("gregorian");

      // convenient default ranking window: same day 08:00-18:00
      if (ev.start_time_utc) {
        const day = ev.start_time_utc.slice(0, 10); // YYYY-MM-DD
        setRankWindowStart(`${day}T08:00`);
        setRankWindowEnd(`${day}T18:00`);
      }
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
        startUtc = fromInputValue(gDateTime);
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
        const payload = { version, ...basePayload };
        const updated = await updateEvent(Number(id), payload);
        setVersion(updated.version);
      } else {
        await createEvent(basePayload);
      }

      nav("/");
    } catch (e2) {
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

  async function handleRank() {
    if (!id) {
      setRankError("Create the event first, then you can rank suggestions.");
      return;
    }
    setRankError("");
    setRankResults(null);

    if (!rankWindowStart || !rankWindowEnd) {
      setRankError("Please set a window start and end.");
      return;
    }

    try {
      const params = {
        duration_minutes: String(rankDuration),
        window_start_utc: fromInputValue(rankWindowStart),
        window_end_utc: fromInputValue(rankWindowEnd),
        max_results: "5",
        candidate_limit: "25",
        prefer_earlier: "true",
        work_start_hour: "9",
        work_end_hour: "17",
        // For now: keep constraints simple (no manual required/optional selection in UI)
        required_user_ids: "",
        optional_user_ids: "",
      };

      const data = await rankEventSlots(Number(id), params);
      setRankResults(data);
    } catch (e) {
      setRankError(e.message || "Failed to rank slots");
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
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
            <input type="datetime-local" value={gDateTime} onChange={(e) => setGDateTime(e.target.value)} />
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
          {id && <button type="button" onClick={loadEvent}>Reload</button>}
        </div>
      </form>

      {conflictMsg && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <b>Conflict:</b>
          <div style={{ marginTop: 6 }}>{conflictMsg}</div>
        </div>
      )}

      {error && <p style={{ marginTop: 12 }}>Error: {error}</p>}

      {/* --- Ranked suggestions panel --- */}
      <div style={{ marginTop: 24, padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Suggest Best Time (Ranked)</h3>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label>
            Duration (min)
            <input
              type="number"
              value={rankDuration}
              onChange={(e) => setRankDuration(Number(e.target.value))}
              style={{ marginLeft: 6 }}
            />
          </label>

          <label>
            Window start
            <input
              type="datetime-local"
              value={rankWindowStart}
              onChange={(e) => setRankWindowStart(e.target.value)}
              style={{ marginLeft: 6 }}
            />
          </label>

          <label>
            Window end
            <input
              type="datetime-local"
              value={rankWindowEnd}
              onChange={(e) => setRankWindowEnd(e.target.value)}
              style={{ marginLeft: 6 }}
            />
          </label>

          <button type="button" onClick={handleRank}>Suggest Best Time</button>
        </div>

        {rankError && <p style={{ marginTop: 10 }}>Error: {rankError}</p>}

        {rankResults && (
          <div style={{ marginTop: 14 }}>
            <p>
              Showing top ranked slots (lower score is better).
            </p>
            <ul>
              {rankResults.ranked_slots.map((s, idx) => (
                <li key={idx} style={{ marginBottom: 10 }}>
                  <div>
                    <b>Slot:</b> {s.start} → {s.end}
                  </div>
                  <div>
                    <b>Score:</b> {s.score}
                  </div>
                  <div>
                    <b>Reasons:</b> {s.reasons.join("; ")}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
