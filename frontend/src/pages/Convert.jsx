import { useState } from "react";
import { e2g, g2e } from "../api";

export default function Convert() {
  const [gy, setGy] = useState("2026");
  const [gm, setGm] = useState("1");
  const [gd, setGd] = useState("7");

  const [ey, setEy] = useState("2018");
  const [em, setEm] = useState("4");
  const [ed, setEd] = useState("29");

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleG2E(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    try {
      const data = await g2e(Number(gy), Number(gm), Number(gd));
      setResult({ direction: "Gregorian → Ethiopian", data });
    } catch (err) {
      setError(err.message || "Failed");
    }
  }

  async function handleE2G(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    try {
      const data = await e2g(Number(ey), Number(em), Number(ed));
      setResult({ direction: "Ethiopian → Gregorian", data });
    } catch (err) {
      setError(err.message || "Failed");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Convert Dates</h2>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
        <form onSubmit={handleG2E} style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8, minWidth: 320 }}>
          <h3>Gregorian → Ethiopian</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={gy} onChange={(e) => setGy(e.target.value)} placeholder="Year" />
            <input value={gm} onChange={(e) => setGm(e.target.value)} placeholder="Month" />
            <input value={gd} onChange={(e) => setGd(e.target.value)} placeholder="Day" />
          </div>
          <button type="submit" style={{ marginTop: 12 }}>Convert</button>
        </form>

        <form onSubmit={handleE2G} style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8, minWidth: 320 }}>
          <h3>Ethiopian → Gregorian</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={ey} onChange={(e) => setEy(e.target.value)} placeholder="Year" />
            <input value={em} onChange={(e) => setEm(e.target.value)} placeholder="Month" />
            <input value={ed} onChange={(e) => setEd(e.target.value)} placeholder="Day" />
          </div>
          <button type="submit" style={{ marginTop: 12 }}>Convert</button>
        </form>
      </div>

      {error && <p style={{ marginTop: 16 }}>Error: {error}</p>}

      {result && (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
          <strong>{result.direction}</strong>
          <pre style={{ marginTop: 8 }}>{JSON.stringify(result.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
