import { useState } from "react";
import { e2g, g2e } from "../api";

const ETH_MONTHS = [
  "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
  "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume",
];

const GREG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function ConvertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}

function CalendarIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function ResultCard({ result }) {
  const isG2E = result.direction === "g2e";
  const { source, data } = result;

  const sourceLabel = isG2E
    ? `${GREG_MONTHS[source.month - 1] || source.month} ${source.day}, ${source.year}`
    : `${ETH_MONTHS[source.month - 1] || source.month} ${source.day}, ${source.year}`;

  const resultLabel = isG2E
    ? `${ETH_MONTHS[data.month - 1] || data.month} ${data.day}, ${data.year}`
    : `${GREG_MONTHS[data.month - 1] || data.month} ${data.day}, ${data.year}`;

  const sourceCalendar = isG2E ? "Gregorian" : "Ethiopian";
  const resultCalendar = isG2E ? "Ethiopian" : "Gregorian";

  return (
    <div className="convertResult">
      <div className="convertResultHeader">
        <span className="badge badgeSuccess">Conversion complete</span>
        <span className="hint">{isG2E ? "Gregorian to Ethiopian" : "Ethiopian to Gregorian"}</span>
      </div>
      <div className="convertResultBody">
        <div className="convertResultDate">
          <div className="convertResultCalLabel">{sourceCalendar}</div>
          <div className="convertResultDateVal">{sourceLabel}</div>
          <div className="convertResultNums">
            <span>{source.year}</span><span>/</span>
            <span>{pad(source.month)}</span><span>/</span>
            <span>{pad(source.day)}</span>
          </div>
        </div>
        <div className="convertResultArrow"><ArrowIcon /></div>
        <div className="convertResultDate convertResultDateRight">
          <div className="convertResultCalLabel">{resultCalendar}</div>
          <div className="convertResultDateVal resultAccent">{resultLabel}</div>
          <div className="convertResultNums">
            <span>{data.year}</span><span>/</span>
            <span>{pad(data.month)}</span><span>/</span>
            <span>{pad(data.day)}</span>
          </div>
          {data.month_name && <div className="convertMonthName">{data.month_name}</div>}
        </div>
      </div>
    </div>
  );
}

export default function Convert() {
  const [direction, setDirection] = useState("g2e");

  const [gy, setGy] = useState("2026");
  const [gm, setGm] = useState("1");
  const [gd, setGd] = useState("7");

  const [ey, setEy] = useState("2018");
  const [em, setEm] = useState("4");
  const [ed, setEd] = useState("29");

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConvert(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      if (direction === "g2e") {
        const data = await g2e({ year: Number(gy), month: Number(gm), day: Number(gd) });
        setResult({ direction: "g2e", source: { year: gy, month: gm, day: gd }, data });
      } else {
        const data = await e2g({ year: Number(ey), month: Number(em), day: Number(ed) });
        setResult({ direction: "e2g", source: { year: ey, month: em, day: ed }, data });
      }
    } catch (err) {
      setError(err.message || "Conversion failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page pageNarrow">
      <div className="pageHeader">
        <div className="pageHeaderBlock">
          <h1 className="h1">Calendar conversion</h1>
        </div>
      </div>

      <div className="sectionCard sectionCardPad">
        
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          {[
            { key:"g2e", label:"Gregorian to Ethiopian", sub:"Convert from Gregorian" },
            { key:"e2g", label:"Ethiopian to Gregorian", sub:"Convert from Ethiopian" },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { setDirection(opt.key); setResult(null); setError(""); }}
              style={{
                display:"flex", alignItems:"center", gap:8,
                padding:"10px 16px", borderRadius:10, flex:1,
                border: direction===opt.key ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                background: direction===opt.key ? "var(--accent-soft)" : "rgba(255,255,255,0.03)",
                color: direction===opt.key ? "var(--text)" : "var(--muted)",
                fontWeight:600, fontSize:"0.88rem", cursor:"pointer", transition:"all 150ms ease",
              }}
            >
              <CalendarIcon size={15}/>
              <div style={{ textAlign:"left" }}>
                <div>{opt.label}</div>
                <div style={{ fontSize:"0.72rem", fontWeight:400, opacity:0.7 }}>{opt.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <form onSubmit={handleConvert} className="stack">
          {direction === "g2e" ? (
            <div className="formGrid3">
              <label className="label">
                Year
                <input className="input" value={gy} onChange={e => setGy(e.target.value)} placeholder="2026" type="number" min="1"/>
              </label>
              <label className="label">
                Month
                <select className="input" value={gm} onChange={e => setGm(e.target.value)} style={{ appearance:"none", WebkitAppearance:"none" }}>
                  {GREG_MONTHS.map((name, i) => (
                    <option key={i+1} value={i+1}>{i+1} - {name}</option>
                  ))}
                </select>
              </label>
              <label className="label">
                Day
                <input className="input" value={gd} onChange={e => setGd(e.target.value)} placeholder="7" type="number" min="1" max="31"/>
              </label>
            </div>
          ) : (
            <div className="formGrid3">
              <label className="label">
                Year
                <input className="input" value={ey} onChange={e => setEy(e.target.value)} placeholder="2018" type="number" min="1"/>
              </label>
              <label className="label">
                Month
                <select className="input" value={em} onChange={e => setEm(e.target.value)}>
                  {ETH_MONTHS.map((name, i) => (
                    <option key={i+1} value={i+1}>{i+1} - {name}</option>
                  ))}
                </select>
              </label>
              <label className="label">
                Day
                <input className="input" value={ed} onChange={e => setEd(e.target.value)} placeholder="29" type="number" min="1" max="30"/>
              </label>
            </div>
          )}

          <button className="btn btnPrimary" type="submit" disabled={loading} style={{ alignSelf:"flex-start" }}>
            {loading ? (
              <><span className="spinner" style={{ width:15, height:15, borderTopColor:"#fff" }}/> Converting...</>
            ) : (
              <><ConvertIcon /> {direction === "g2e" ? "Convert to Ethiopian" : "Convert to Gregorian"}</>
            )}
          </button>
        </form>
      </div>

      {error && <div className="alert alertDanger" style={{ marginTop:18 }}>{error}</div>}

      {result && <ResultCard result={result}/>}

      <div className="sectionCard sectionCardPad" style={{ marginTop:18 }}>
        <h3 className="sectionTitle" style={{ marginBottom:12 }}>About the Ethiopian calendar</h3>
        <p style={{ fontSize:"0.88rem", color:"var(--muted)", marginBottom:16, lineHeight:1.6 }}>
          The Ethiopian calendar has 13 months and runs approximately 7 to 8 years behind the Gregorian calendar.
        </p>
        <div className="convertFacts">
          {[
            { label:"Structure", value:"12 months x 30 days + Pagume (5 or 6 days)" },
            { label:"New Year", value:"Meskerem 1 = September 11 (or 12 in Gregorian leap year)" },
            { label:"Leap year", value:"Every 4 years, Pagume has 6 days instead of 5" },
            { label:"Era", value:"Follows the Alexandrian era, approximately 7 years behind Gregorian" },
          ].map(f => (
            <div key={f.label} className="convertFactRow">
              <span className="convertFactLabel">{f.label}</span>
              <span className="convertFactValue">{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
