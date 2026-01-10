import { useEffect, useMemo, useState } from "react";
import { deleteEvent, listEvents } from "../api";
import { Link } from "react-router-dom";

// ---------- Date helpers (UTC) ----------
function pad2(n) {
  return String(n).padStart(2, "0");
}

function toUTCDateKey(isoString) {
  // isoString like "2026-01-07T10:00:00"
  const d = new Date(isoString + "Z"); // treat as UTC
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`; // "YYYY-MM-DD"
}

function formatUTCDateTime(isoString) {
  const d = new Date(isoString + "Z");
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  return `${y}-${m}-${day} ${hh}:${mm} UTC`;
}

function startOfMonthUTC(year, monthIndex) {
  // monthIndex: 0..11
  return new Date(Date.UTC(year, monthIndex, 1));
}

function daysInMonthUTC(year, monthIndex) {
  // day 0 of next month is last day of current month
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function weekdayUTC(dateObj) {
  // 0=Sun..6=Sat
  return dateObj.getUTCDay();
}

// Build a 6x7 grid of day objects for a month view
function buildMonthGrid(year, monthIndex) {
  const firstDay = startOfMonthUTC(year, monthIndex);
  const firstWeekday = weekdayUTC(firstDay); // 0..6

  const totalDays = daysInMonthUTC(year, monthIndex);

  // We will build 42 cells (6 weeks)
  const cells = [];
  let dayCounter = 1 - firstWeekday; // start from Sunday of first week

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(Date.UTC(year, monthIndex, dayCounter));
    const cellMonth = cellDate.getUTCMonth();
    const inCurrentMonth = cellMonth === monthIndex;

    const y = cellDate.getUTCFullYear();
    const m = pad2(cellDate.getUTCMonth() + 1);
    const d = pad2(cellDate.getUTCDate());
    const key = `${y}-${m}-${d}`;

    cells.push({
      key,
      inCurrentMonth,
      dayNumber: cellDate.getUTCDate(),
      isoDate: key,
    });

    dayCounter++;
  }

  return cells;
}

// ---------- Component ----------
export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // current month state (UTC)
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getUTCMonth()); // 0..11

  async function load() {
    setError("");
    setLoading(true);
    try {
      const data = await listEvents();
      setEvents(data);
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map(); // dateKey -> events[]
    for (const ev of events) {
      const key = toUTCDateKey(ev.start_time_utc);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    // sort each day by time
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.start_time_utc > b.start_time_utc ? 1 : -1));
      map.set(k, arr);
    }
    return map;
  }, [events]);

  const grid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);

  function monthLabel() {
    const d = new Date(Date.UTC(year, monthIndex, 1));
    return d.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  }

  function prevMonth() {
    let y = year;
    let m = monthIndex - 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    setYear(y);
    setMonthIndex(m);
  }

  function nextMonth() {
    let y = year;
    let m = monthIndex + 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setYear(y);
    setMonthIndex(m);
  }

  async function handleDelete(id) {
    if (!confirm("Delete this event?")) return;
    try {
      await deleteEvent(id);
      await load();
    } catch (e) {
      alert(e.message || "Failed");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Calendar</h2>
          <p style={{ marginTop: 8, marginBottom: 0 }}>
            Month view (UTC). Events appear inside each day.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={prevMonth}>Prev</button>
          <div style={{ fontWeight: 600, minWidth: 180, textAlign: "center" }}>{monthLabel()}</div>
          <button onClick={nextMonth}>Next</button>
          <Link to="/events/new">
            <button>Create Event</button>
          </Link>
        </div>
      </div>

      {/* States */}
      {loading && <p style={{ marginTop: 16 }}>Loading...</p>}
      {error && <p style={{ marginTop: 16 }}>Error: {error}</p>}

      {/* Calendar grid */}
      {!loading && !error && (
        <div style={{ marginTop: 16 }}>
          {/* Weekday header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 8,
              marginBottom: 8,
              fontWeight: 600,
            }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
              <div key={w} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8 }}>
                {w}
              </div>
            ))}
          </div>

          {/* 6x7 cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {grid.map((cell) => {
              const dayEvents = eventsByDay.get(cell.isoDate) || [];
              return (
                <div
                  key={cell.key}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: 10,
                    minHeight: 120,
                    background: cell.inCurrentMonth ? "white" : "#fafafa",
                    opacity: cell.inCurrentMonth ? 1 : 0.65,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 700 }}>{cell.dayNumber}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{cell.isoDate}</div>
                  </div>

                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {dayEvents.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#777" }}>No events</div>
                    ) : (
                      dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          style={{
                            border: "1px solid #eee",
                            borderRadius: 8,
                            padding: 8,
                            background: "white",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{ev.title}</div>
                          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                            {formatUTCDateTime(ev.start_time_utc)}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <Link to={`/events/${ev.id}/edit`}><button>Edit</button></Link>
                            <button onClick={() => handleDelete(ev.id)}>Delete</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
            Note: This is a simple month grid for integration/testing. We can improve styling later.
          </div>
        </div>
      )}
    </div>
  );
}
