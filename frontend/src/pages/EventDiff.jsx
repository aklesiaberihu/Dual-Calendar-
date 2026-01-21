import { useState } from "react";
import { useParams } from "react-router-dom";
import { getEventDiff } from "../api";

export default function EventDiff() {
  const { id } = useParams();

  const [fromV, setFromV] = useState("");
  const [toV, setToV] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function loadDiff() {
    setError("");
    setResult(null);
    try {
      const data = await getEventDiff(Number(id), Number(fromV), Number(toV));
      setResult(data);
    } catch (e) {
      setError(e.message || "Failed to load diff");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Event Change History</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <input
          placeholder="From version"
          value={fromV}
          onChange={(e) => setFromV(e.target.value)}
        />
        <input
          placeholder="To version"
          value={toV}
          onChange={(e) => setToV(e.target.value)}
        />
        <button onClick={loadDiff}>Compare</button>
      </div>

      {error && <p>Error: {error}</p>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <h4>Summary</h4>
          <p>{result.digest}</p>

          <h4>Detailed changes</h4>
          <ul>
            {result.changes.map((c, i) => (
              <li key={i}>
                <b>{c.field}</b>: "{String(c.from)}" → "{String(c.to)}"
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
