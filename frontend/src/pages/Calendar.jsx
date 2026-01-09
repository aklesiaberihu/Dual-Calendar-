import { useEffect, useState } from "react";
import { deleteEvent, listEvents } from "../api";
import { Link } from "react-router-dom";

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2>Calendar</h2>
          <p>Basic event management (list, create, edit, delete).</p>
        </div>
        <Link to="/events/new">
          <button>Create Event</button>
        </Link>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}

      {!loading && !error && (
        <div style={{ marginTop: 16 }}>
          {events.length === 0 ? (
            <p>No events yet. Click “Create Event”.</p>
          ) : (
            <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Start (UTC)</th>
                  <th>End (UTC)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td>{ev.title}</td>
                    <td>{ev.start_time_utc}</td>
                    <td>{ev.end_time_utc || "-"}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <Link to={`/events/${ev.id}/edit`}><button>Edit</button></Link>
                      <button onClick={() => handleDelete(ev.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
