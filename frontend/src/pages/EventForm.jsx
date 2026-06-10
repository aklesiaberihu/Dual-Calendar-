import { useEffect, useMemo, useState, useRef } from "react";
import {
  createEvent, getEvent, updateEvent, e2g, g2e,
  rankEventSlots, rankSlotsByParticipants, listEventParticipants, shareEvent,
  removeEventParticipant, getProfile, getGoogleStatus,
  getGoogleConnectUrl, disconnectGoogle, exportEventToGoogle,
} from "../api";
import { useNavigate, useParams } from "react-router-dom";

const CALENDAR_PAGE = "/app";

const REMINDER_PRESETS = [
  { label: "None", value: "none" },
  { label: "5 minutes before", value: 5 },
  { label: "15 minutes before", value: 15 },
  { label: "30 minutes before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "2 hours before", value: 120 },
  { label: "1 day before", value: 1440 },
  { label: "2 days before", value: 2880 },
  { label: "1 week before", value: 10080 },
  { label: "Custom…", value: "custom" },
];

const REPEAT_PRESETS = [
  { value: "never",         label: "Never" },
  { value: "every_day",     label: "Every Day" },
  { value: "every_week",    label: "Every Week" },
  { value: "every_2_weeks", label: "Every 2 Weeks" },
  { value: "every_month",   label: "Every Month" },
  { value: "every_year",    label: "Every Year" },
  { value: "custom",        label: "Custom" },
];

const CUSTOM_FREQ_OPTIONS = [
  { value: "daily",   label: "Daily" },
  { value: "weekly",  label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const WEEK_DAYS_LIST = [
  { code: "SUN", label: "Sunday" },
  { code: "MON", label: "Monday" },
  { code: "TUE", label: "Tuesday" },
  { code: "WED", label: "Wednesday" },
  { code: "THU", label: "Thursday" },
  { code: "FRI", label: "Friday" },
  { code: "SAT", label: "Saturday" },
];

function pad2(n) { return String(n).padStart(2, "0"); }

function to12h(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${pad2(m)} ${h >= 12 ? "PM" : "AM"}`;
}

function parseApiDate(value) {
  if (!value) return null;

  const normalized = String(value)
    .replace(/Z$/i, "")
    .replace(/[+-]\d{2}:\d{2}$/, "");
  const m = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!m) return null;
  const [, y, mo, d, h = "0", min = "0"] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(min), 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toInputValue(dtIso) {
  if (!dtIso) return "";
  const d = parseApiDate(dtIso);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromInputValue(v) { if (!v) return null; return `${v}:00`; }
function toSchedulingUTC(v) { if (!v) return null; return new Date(v).toISOString(); }

function convertTimezone(naiveDT, fromTz, toTz) {
  if (!naiveDT) return "";
  try {
    const clean = naiveDT.replace("T", " ").slice(0, 16);
    const [datePart, timePart = "00:00"] = clean.split(" ");
    const [y, mo, d] = datePart.split("-").map(Number);
    const [h, min] = timePart.split(":").map(Number);

    const approxMs = Date.UTC(y, mo - 1, d, h, min);

    const localInFrom = new Date(approxMs).toLocaleString("sv", { timeZone: fromTz });

    const fromOffset = new Date(localInFrom.replace(" ", "T") + "Z").getTime() - approxMs;

    const trueUtcMs = approxMs - fromOffset;

    const result = new Date(trueUtcMs).toLocaleString("sv", { timeZone: toTz });
    return result.slice(0, 16).replace(" ", "T");
  } catch {
    return naiveDT.slice(0, 16);
  }
}

function formatSlotTime(value) {
  if (!value) return "—";
  const d = parseApiDate(value);
  if (!d) return String(value);
  return d.toLocaleString(undefined, { weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}

function getChangedFields(base, compare) {
  if (!base || !compare) return [];
  const fields = ["title","description","start_time_local","end_time_local","timezone","reminder_minutes"];
  return fields.filter(f => (base[f]??"") !== (compare[f]??"")).map(f => ({ field:f, from:base[f]??"", to:compare[f]??"" }));
}

function dhmToMinutes(days, hours, mins) {
  return (Number(days)||0)*1440 + (Number(hours)||0)*60 + (Number(mins)||0);
}
function minutesToDhm(total) {
  const t = Number(total)||0;
  return { days: Math.floor(t/1440), hours: Math.floor((t%1440)/60), mins: t%60 };
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function ChevronDown({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms ease" }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function CalendarIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function UsersIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function SparkleIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function IntervalPicker({ days, hours, mins, onDays, onHours, onMins, label }) {
  return (
    <div>
      {label && <div style={{ fontSize:"0.78rem", fontWeight:600, color:"var(--muted-2)", marginBottom:8 }}>{label}</div>}
      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        {[
          { val:days, set:onDays, unit:"day(s)", max:365 },
          { val:hours, set:onHours, unit:"hr(s)", max:23 },
          { val:mins, set:onMins, unit:"min(s)", max:59 },
        ].map(({ val, set, unit, max }) => (
          <div key={unit} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <input className="input" type="number" min="0" max={max} value={val}
              onChange={e => set(Math.max(0, Math.min(max, Number(e.target.value))))}
              style={{ width:70, minHeight:38, textAlign:"center" }}/>
            <span style={{ fontSize:"0.82rem", color:"var(--muted)", fontWeight:600, whiteSpace:"nowrap" }}>{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sectionCard" style={{ overflow:"hidden" }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"16px 22px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:"0.95rem", fontWeight:700, color:"var(--text)", letterSpacing:"-0.02em" }}>{title}</span>
          {badge && <span className="badge badgeAccent" style={{ fontSize:"0.72rem" }}>{badge}</span>}
        </div>
        <span style={{ color:"var(--muted)" }}><ChevronDown open={open}/></span>
      </button>
      {open && <div style={{ padding:"0 22px 22px" }}>{children}</div>}
    </div>
  );
}

function ConflictPanel({ conflictData, serverChanges, localChanges, saving, canEdit, id, onReload, onOverwrite, onViewDiff }) {
  return (
    <div className="efConflictPanel">
      <div className="efConflictHeader">
        <div className="efConflictIcon">⚠</div>
        <div>
          <div className="efConflictTitle">Edit conflict detected</div>
          <div className="efConflictSub">You started from <strong>v{conflictData.yourVersion}</strong>, but the server is now at <strong>v{conflictData.currentVersion}</strong>.</div>
        </div>
      </div>
      <div className="efConflictGrid">
        {[{ title:"Server changes", cls:"efConflictColTitleServer", changes:serverChanges }, { title:"Your draft changes", cls:"efConflictColTitleLocal", changes:localChanges }].map(col => (
          <div key={col.title} className="efConflictCol">
            <div className={`efConflictColTitle ${col.cls}`}>{col.title}</div>
            {col.changes.length === 0 ? <div className="hint">No changes.</div> : col.changes.map(c => (
              <div key={c.field} className="efConflictChange">
                <div className="efConflictField">{c.field}</div>
                <div className="diffValueContentFrom">{String(c.from)||"—"}</div>
                <div style={{ color:"var(--muted)", fontSize:"0.75rem" }}>→</div>
                <div className="diffValueContentTo">{String(c.to)||"—"}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="formActions" style={{ marginTop:16 }}>
        <button type="button" className="btn btnSm" onClick={onReload} disabled={saving}>Reload latest</button>
        <button type="button" className="btn btnPrimary btnSm" onClick={onOverwrite} disabled={saving||!canEdit}>{saving?"Saving…":"Overwrite"}</button>
        {id && <button type="button" className="btn btnSm" onClick={onViewDiff}>View diff</button>}
      </div>
    </div>
  );
}

function ParticipantRow({ email, role, userId, canManage, onRemove }) {
  return (
    <div className="participantRow">
      <div className="participantInfo">
        <div className="participantAvatar">{(email||"?").charAt(0).toUpperCase()}</div>
        <div><div className="participantEmail">{email}</div><div className="participantRole">{role}</div></div>
      </div>
      {role !== "owner" && canManage && (
        <button type="button" className="btn btnSm btnDanger" onClick={() => onRemove(userId)}>Remove</button>
      )}
    </div>
  );
}

const DURATION_PRESETS = [
  { label: "15 minutes",  value: 15 },
  { label: "30 minutes",  value: 30 },
  { label: "45 minutes",  value: 45 },
  { label: "1 hour",      value: 60 },
  { label: "1.5 hours",   value: 90 },
  { label: "2 hours",     value: 120 },
  { label: "3 hours",     value: 180 },
  { label: "4 hours",     value: 240 },
  { label: "Custom…",     value: "custom" },
];

function ratingLabel(raw) {
  if (!raw) return "";
  const parts = raw.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function ratingColor(raw) {
  switch (ratingLabel(raw).toUpperCase()) {
    case "IDEAL":     return "#22c55e";
    case "EXCELLENT": return "#60a5fa";
    case "GOOD":      return "#facc15";
    case "FAIR":      return "#fb923c";
    case "POOR":      return "#f87171";
    default:          return "var(--muted)";
  }
}

function SlotCard({ slot, idx, onApply }) {
  const startTime = formatSlotTime(slot.start_local || slot.start);
  const endTime   = formatSlotTime(slot.end_local   || slot.end);
  const label     = ratingLabel(slot.rating);
  const color     = ratingColor(slot.rating);
  const reasons   = Array.isArray(slot.reasons) ? slot.reasons : [];
  const hasIssue  = reasons.some(r => /conflict|busy/i.test(r));

  return (
    <div
      onClick={() => onApply(slot)}
      style={{
        display: "flex", flexDirection: "column", gap: 6,
        padding: "12px 16px", borderRadius: 10, cursor: "pointer",
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
        transition: "border-color 150ms ease",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-border)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "var(--accent-soft)", border: "1px solid var(--accent-border)",
            display: "grid", placeItems: "center",
            color: "#c4b5fd", fontSize: "0.7rem", fontWeight: 800, flexShrink: 0,
          }}>
            {idx + 1}
          </div>
          <div>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)" }}>{startTime}</div>
            <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 1 }}>until {endTime}</div>
          </div>
        </div>
        <button
          type="button" className="btn btnPrimary btnSm"
          style={{ fontSize: "0.78rem", padding: "0 12px", minHeight: 30 }}
          onClick={e => { e.stopPropagation(); onApply(slot); }}
        >
          Use →
        </button>
      </div>
      {hasIssue && reasons.length > 0 && (
        <div style={{ fontSize: "0.73rem", paddingLeft: 36, color: "#fb923c" }}>
          {reasons.join(" · ")}
        </div>
      )}
      {!hasIssue && reasons.some(r => /outside/i.test(r)) && (
        <div style={{ fontSize: "0.73rem", paddingLeft: 36, color: "var(--muted)" }}>
          Outside standard work hours
        </div>
      )}
    </div>
  );
}

function SmartSchedulingPanel({ eventId, onGetEventId, timezone, onApplySlot, participants = [], myEmail = "" }) {
  const [durationPreset,  setDurationPreset]  = useState(60);
  const [durationCustom,  setDurationCustom]  = useState("60");
  const [rankWindowStart, setRankWindowStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T08:00`;
  });
  const [rankWindowEnd, setRankWindowEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T18:00`;
  });
  const [rankResults, setRankResults] = useState(null);
  const [rankError,   setRankError]   = useState("");
  const [ranking,     setRanking]     = useState(false);

  const rankDuration = durationPreset === "custom"
    ? Math.max(1, Number(durationCustom) || 60)
    : Number(durationPreset);

  async function handleRank() {
    if (!rankWindowStart || !rankWindowEnd) { setRankError("Set both window start and end."); return; }
    setRankError(""); setRankResults(null); setRanking(true);
    try {
      const baseParams = {
        duration_minutes:  String(rankDuration),
        window_start_utc:  toSchedulingUTC(rankWindowStart),
        window_end_utc:    toSchedulingUTC(rankWindowEnd),
        max_results: "5",  candidate_limit: "25",
        work_start_hour: "9", work_end_hour: "17",
        display_timezone: timezone || "UTC",
      };
      const data = eventId
        ? await rankEventSlots(Number(eventId), baseParams)
        : await rankSlotsByParticipants({
            ...baseParams,
            participant_emails: participants.map(p => p.email).filter(Boolean).join(","),
          });
      setRankResults(data);
    } catch (e) {
      setRankError(e.message || "Failed to find slots.");
    } finally { setRanking(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <label className="label" style={{ marginBottom: 0 }}>
        Event duration
        <select
          className="input"
          value={durationPreset}
          onChange={e => setDurationPreset(e.target.value === "custom" ? "custom" : Number(e.target.value))}
        >
          {DURATION_PRESETS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>

      {durationPreset === "custom" && (
        <label className="label" style={{ marginBottom: 0 }}>
          Custom duration (minutes)
          <input
            className="input"
            type="number"
            min="1"
            max="1440"
            value={durationCustom}
            onChange={e => setDurationCustom(e.target.value)}
            placeholder="e.g. 75"
          />
        </label>
      )}

      <div className="formGrid">
        <label className="label">
          Search from
          <input className="input" type="datetime-local" value={rankWindowStart} onChange={e => setRankWindowStart(e.target.value)}/>
        </label>
        <label className="label">
          Search until
          <input className="input" type="datetime-local" value={rankWindowEnd} onChange={e => setRankWindowEnd(e.target.value)}/>
        </label>
      </div>

      <button type="button" className="btn btnPrimary" onClick={handleRank} disabled={ranking} style={{ alignSelf: "flex-start" }}>
        {ranking
          ? <><span className="spinner" style={{ width: 14, height: 14, borderTopColor: "#fff" }}/> Searching…</>
          : <><SparkleIcon /> Find best time</>}
      </button>

      {rankError && <div className="alert alertDanger">{rankError}</div>}

      {rankResults && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {rankResults.conflicts_detected?.length > 0 ? (
            <div style={{
              background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.2)",
              borderRadius: 8, padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: 5,
            }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fb923c", marginBottom: 2 }}>
                Conflicts detected
              </div>
              {rankResults.conflicts_detected.map(c => {
                const isMe = myEmail && c.email === myEmail;
                return (
                  <div key={c.email} style={{ fontSize: "0.78rem", color: "var(--text)", lineHeight: 1.5 }}>
                    {isMe ? (
                      <>
                        <span style={{ fontWeight: 600 }}>You</span>
                        {" have a conflicting schedule: "}
                        <span style={{ color: "var(--muted)" }}>
                          {c.busy_intervals.map(b =>
                            `${formatSlotTime(b.start_local)} – ${formatSlotTime(b.end_local)}`
                          ).join(", ")}
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontWeight: 600 }}>{c.email}</span>
                        {" is busy within the selected timeframe."}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : rankResults.ranked_slots?.length > 0 ? (
            <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              No conflicts — all participants are free in this window.
            </div>
          ) : null}

          {rankResults.ranked_slots?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--muted-2)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Best available times
              </div>
              {rankResults.ranked_slots.map((slot, idx) => (
                <SlotCard key={idx} slot={slot} idx={idx} onApply={onApplySlot}/>
              ))}
            </div>
          ) : (
            <div className="alert">
              No available slots found. Try a wider search window or a shorter duration.
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function AppleSelect({ value, onChange, options, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => !disabled && setOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", gap: 2, color: "var(--muted)", fontSize: "0.93rem", fontWeight: 500, padding: "2px 0" }}>
        {selected?.label}
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 0.85, color: "var(--muted)", marginLeft: 3, fontSize: "0.6rem" }}>
          <span>▲</span><span>▼</span>
        </span>
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 300, background: "rgba(14,21,42,0.98)", backdropFilter: "blur(12px)", borderRadius: 14, boxShadow: "0 4px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(148,163,184,0.12)", minWidth: 195, overflow: "hidden" }}>
          {options.map((opt, i) => (
            <button key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", width: "100%", padding: "13px 18px", background: "none", border: "none", cursor: "pointer", borderTop: i > 0 ? "1px solid rgba(148,163,184,0.1)" : "none", fontSize: "1rem", color: "var(--text)", textAlign: "left", gap: 10, fontWeight: 400 }}>
              <span style={{ width: 20, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                {opt.value === value && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AppleRow({ label, right, last = false }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", minHeight: 50 }}>
        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", letterSpacing: "-0.01em" }}>{label}</span>
        <div>{right}</div>
      </div>
      {!last && <div style={{ height: 1, background: "var(--border)", marginLeft: 18 }}/>}
    </div>
  );
}

function TwoColumnWheelPicker({ value, onChange, max, unitLabel }) {
  const ITEM_H = 44;
  const min = 1;
  const items = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const ref = useRef(null);
  const scrollTimer = useRef(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = (value - min) * ITEM_H;
  }, []);

  useEffect(() => {
    if (ref.current && !isScrolling.current) {
      ref.current.scrollTo({ top: (value - min) * ITEM_H, behavior: "smooth" });
    }
  }, [value]);

  function handleScroll() {
    isScrolling.current = true;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      isScrolling.current = false;
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      onChange(items[clamped]);
    }, 80);
  }

  return (
    <div style={{ position: "relative", height: ITEM_H * 3, overflow: "hidden", borderRadius: 12 }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: ITEM_H, background: "linear-gradient(to bottom, #0a1020 55%, transparent)", pointerEvents: "none", zIndex: 2 }}/>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_H, background: "linear-gradient(to top, #0a1020 55%, transparent)", pointerEvents: "none", zIndex: 2 }}/>
      <div style={{ position: "absolute", top: ITEM_H, left: 0, right: 0, height: ITEM_H, background: "rgba(255,255,255,0.07)", borderRadius: 10, pointerEvents: "none", zIndex: 1 }}/>
      <div ref={ref} onScroll={handleScroll}
        style={{ height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory", scrollbarWidth: "none", position: "relative", zIndex: 0 }}>
        <div style={{ height: ITEM_H }}/>
        {items.map(n => (
          <div key={n}
            style={{ height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, scrollSnapAlign: "center", cursor: "pointer" }}
            onClick={() => {
              onChange(n);
              if (ref.current) ref.current.scrollTo({ top: (n - min) * ITEM_H, behavior: "smooth" });
            }}>
            <span style={{ fontSize: "1.35rem", fontWeight: n === value ? 700 : 400, color: n === value ? "var(--text)" : "var(--muted)", minWidth: 32, textAlign: "right" }}>
              {n}
            </span>
            <span style={{ fontSize: "1.35rem", fontWeight: 400, color: n === value ? "var(--text)" : "var(--muted)", minWidth: 56 }}>
              {unitLabel}
            </span>
          </div>
        ))}
        <div style={{ height: ITEM_H }}/>
      </div>
    </div>
  );
}

function InlineCalendar({ value, onChange, minDate }) {
  const today = new Date();
  const initDate = value ? new Date(value + "T12:00:00") : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`;

  const total   = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startAt = new Date(viewYear, viewMonth, 1).getDay();
  const cells   = [...Array(startAt).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("en", { month: "long" });

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function selectDay(d) {
    const str = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`;
    if (minDate && str < minDate) return;
    onChange(str);
  }

  return (
    <div style={{ padding: "4px 14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: "0.93rem", flex: 1, color: "var(--text)", display: "flex", alignItems: "center", gap: 4 }}>
          {monthName} {viewYear}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
        <button type="button" onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", color: "var(--muted)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button type="button" onClick={nextMonth} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", color: "var(--muted)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: "0.7rem", fontWeight: 600, color: "var(--muted)", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`}/>;
          const ds = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`;
          const isSel = ds === value;
          const isToday = ds === todayStr;
          const isDisabled = minDate ? ds < minDate : false;
          return (
            <button key={i} type="button" onClick={() => selectDay(d)} disabled={isDisabled}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "1", borderRadius: "50%", border: "none", cursor: isDisabled ? "default" : "pointer", background: isSel ? "var(--accent)" : "transparent", color: isSel ? "#fff" : isToday ? "var(--accent)" : "var(--text)", fontWeight: (isSel || isToday) ? 700 : 400, fontSize: "0.88rem", opacity: isDisabled ? 0.3 : 1 }}>
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CustomRepeatPanel({ frequency, setFrequency, interval, setInterval, byday, setByday, onBack }) {
  const maxByFreq = { daily: 365, weekly: 52, monthly: 12 };
  const max = maxByFreq[frequency] || 52;
  const unitLabel = { daily: "day", weekly: "week", monthly: "month" }[frequency] || "day";

  useEffect(() => {
    if (interval > max) setInterval(1);
  }, [frequency]);

  const safeInterval = Math.min(interval, max);

  function customSummary() {
    const plural = safeInterval > 1 ? `${safeInterval} ${unitLabel}s` : unitLabel;
    return `Event will occur every ${plural}.`;
  }

  function toggleDay(code) {
    setByday(prev => prev.includes(code) ? prev.filter(d => d !== code) : [...prev, code]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(128,128,128,0.13)", border: "none", cursor: "pointer", borderRadius: 20, padding: "6px 14px 6px 10px", color: "var(--text)", fontSize: "0.88rem", fontWeight: 600 }}>
          <ArrowLeft/> Back
        </button>
        <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Custom</span>
      </div>

      <div className="sectionCard sectionCardPad">
        <div className="stack" style={{ gap: 16 }}>
          <label className="label">
            Frequency
            <div style={{ position: "relative" }}>
              <select className="input" value={frequency}
                onChange={e => { setFrequency(e.target.value); if (e.target.value !== "weekly") setByday([]); }}
                style={{ appearance: "none", WebkitAppearance: "none", paddingRight: 36, cursor: "pointer", fontWeight: 600 }}>
                {CUSTOM_FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--muted)" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </label>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted-2)", marginBottom: 4 }}>Every</div>
            <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: "0.9rem" }}>
              {unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}
            </span>
          </div>
        </div>
      </div>

      <div className="sectionCard" style={{ borderRadius: 14, padding: "10px 20px" }}>
        <TwoColumnWheelPicker value={safeInterval} onChange={setInterval} max={max} unitLabel={unitLabel}/>
      </div>

      <div style={{ fontSize: "0.85rem", color: "var(--muted)", paddingLeft: 4 }}>
        {customSummary()}
      </div>

      {frequency === "weekly" && (
        <div className="sectionCard" style={{ padding: 0, borderRadius: 14, overflow: "hidden" }}>
          {WEEK_DAYS_LIST.map((day, i) => (
            <div key={day.code}>
              <button type="button" onClick={() => toggleDay(day.code)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "15px 18px", background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}>
                <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>{day.label}</span>
                {byday.includes(day.code) && (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
              {i < WEEK_DAYS_LIST.length - 1 && <div style={{ height: 1, background: "var(--border)", marginLeft: 18 }}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EventForm() {
  const nav = useNavigate();
  const { id } = useParams();

  const [profile, setProfile] = useState(null);
  const [accessRole, setAccessRole] = useState(id ? "viewer" : "owner");
  const [version, setVersion] = useState(null);

  const [calendarType, setCalendarType] = useState("gregorian");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gDateTime, setGDateTime] = useState("");
  const [gEndDateTime, setGEndDateTime] = useState("");

  const [gDateTimeExtKey,    setGDateTimeExtKey]    = useState(0);
  const [gEndDateTimeExtKey, setGEndDateTimeExtKey] = useState(0);
  const [eDateTimeExtKey,    setEDateTimeExtKey]    = useState(0);
  const [eEndDateTimeExtKey, setEEndDateTimeExtKey] = useState(0);
  const [eYear, setEYear] = useState("");
  const [eMonth, setEMonth] = useState("");
  const [eDay, setEDay] = useState("");
  const [timezone, setTimezone] = useState("Europe/Rome");

  const [timeMode, setTimeMode] = useState("manual");

  const [reminderPreset, setReminderPreset] = useState("none");
  const [remDays, setRemDays] = useState(0);
  const [remHours, setRemHours] = useState(1);
  const [remMins, setRemMins] = useState(0);
  const [customReminderAt, setCustomReminderAt] = useState("");
  const reminderValue = useMemo(() => {
    if (reminderPreset === "none") return 0;
    if (reminderPreset === "custom") {
      if (!customReminderAt || !gDateTime) return 60;
      const diffMins = Math.round((new Date(gDateTime).getTime() - new Date(customReminderAt).getTime()) / 60000);
      return Math.max(1, diffMins);
    }
    return Number(reminderPreset);
  }, [reminderPreset, customReminderAt, gDateTime]);

  const [repeatPreset, setRepeatPreset] = useState("never");
  const [repeatFrequency, setRepeatFrequency] = useState("daily");
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatByday, setRepeatByday] = useState([]);
  const [repeatEndRepeat, setRepeatEndRepeat] = useState("never");
  const [repeatUntilDate, setRepeatUntilDate] = useState("");
  const [showCustomPanel, setShowCustomPanel] = useState(false);

  const [error, setError] = useState("");
  const [conflictMsg, setConflictMsg] = useState("");
  const [msg, setMsg] = useState("");
  const [seriesConflictMsg, setSeriesConflictMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const ethioSyncTimer   = useRef(0);
  const gSyncDebounce    = useRef(null);
  const eSyncDebounce    = useRef(null);
  const eEndSyncDebounce = useRef(null);

  const [googleStatus, setGoogleStatus] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [googleMsg, setGoogleMsg] = useState("");

  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [pendingParticipants, setPendingParticipants] = useState([]);

  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [conflictData, setConflictData] = useState(null);
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [draftEventId, setDraftEventId] = useState(null);

  const canEdit = accessRole === "owner" || accessRole === "editor";
  const canManageParticipants = accessRole === "owner";

  const [draftParticipants, setDraftParticipants] = useState([]);

  async function getOrCreateEventId() {
    if (id) return { eventId: Number(id), confirmedParticipants: participants };
    if (draftEventId) return { eventId: draftEventId, confirmedParticipants: draftParticipants };

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yy = tomorrow.getFullYear();
    const mm = pad2(tomorrow.getMonth()+1);
    const dd = pad2(tomorrow.getDate());
    try {
      const draft = await createEvent({
        title: title.trim() || "Draft event",
        description: description || "",
        start_time_local: `${yy}-${mm}-${dd}T09:00:00`,
        end_time_local: `${yy}-${mm}-${dd}T10:00:00`,
        timezone: timezone || "UTC",
        reminder_minutes: 60,
        recurrence_rule: "none",
        recurrence_count: 1,
      });
      setDraftEventId(draft.id);

      for (const p of pendingParticipants) {
        try { await shareEvent(Number(draft.id), p); } catch { }
      }

      let confirmedParticipants = [];
      try {
        const fetched = await listEventParticipants(Number(draft.id));
        if (Array.isArray(fetched)) {
          confirmedParticipants = fetched;
          setDraftParticipants(fetched);
        }
      } catch { }

      return { eventId: draft.id, confirmedParticipants };
    } catch(e) {
      console.error("Draft creation failed:", e);
      return { eventId: null, confirmedParticipants: [], error: e.message || String(e) };
    }
  }

  function getRecurrencePayload() {
    if (repeatPreset === "never") return { recurrence_rule: "none", recurrence_count: 1 };
    const presetMap = {
      every_day:     { rule: "daily",   interval: 1 },
      every_week:    { rule: "weekly",  interval: 1 },
      every_2_weeks: { rule: "weekly",  interval: 2 },
      every_month:   { rule: "monthly", interval: 1 },
      every_year:    { rule: "monthly", interval: 12 },
    };
    const { rule, interval } = repeatPreset === "custom"
      ? { rule: repeatFrequency, interval: repeatInterval }
      : (presetMap[repeatPreset] || { rule: "daily", interval: 1 });

    const p = {
      recurrence_rule: rule,
      recurrence_count: 1,
      recurrence_interval: interval,
      recurrence_end_type: repeatEndRepeat === "on_date" ? "until" : "count",
    };
    if (repeatEndRepeat === "on_date" && repeatUntilDate) {
      p.recurrence_end_until = repeatUntilDate;
    } else {
      p.recurrence_end_count = 365;
    }
    if (rule === "weekly" && repeatByday.length > 0) {
      p.recurrence_byday = repeatByday.join(",");
    }
    return p;
  }

  function handleApplySlot(slot) {
    const startLocal = slot.start_local || slot.start;
    const endLocal = slot.end_local || slot.end;
    if (startLocal) {
      const iv = toInputValue(startLocal);
      setGDateTime(iv); setGDateTimeExtKey(k => k + 1);
      syncEthiopianFromGregorian(iv);
    }
    if (endLocal) {
      setGEndDateTime(toInputValue(endLocal)); setGEndDateTimeExtKey(k => k + 1);
    }
    setTimeMode("manual");
  }

  async function syncEthiopianFromGregorian(localDateTime) {
    if (!localDateTime) { setEYear(""); setEMonth(""); setEDay(""); return; }

    const [ry, rm, rd] = localDateTime.slice(0, 10).split("-").map(Number);
    const noon = new Date(ry, rm - 1, rd, 12, 0, 0, 0);
    const y = noon.getFullYear();
    const m = noon.getMonth() + 1;
    const d = noon.getDate();
    const reqId = ++ethioSyncTimer.current;
    try {
      const eth = await g2e({year:y, month:m, day:d});
      if (reqId !== ethioSyncTimer.current) return;
      setEYear(String(eth.year??"")); setEMonth(String(eth.month??"")); setEDay(String(eth.day??""));
      setEDateTimeExtKey(k => k + 1);
      setEEndDateTimeExtKey(k => k + 1);
    } catch {
      if (reqId !== ethioSyncTimer.current) return;
      setEYear(""); setEMonth(""); setEDay("");
    }
  }

  function handleCalendarTabSwitch(newType) {
    if (newType === calendarType) return;
    setGDateTime(""); setGEndDateTime("");
    setEYear(""); setEMonth(""); setEDay("");
    setGDateTimeExtKey(k => k + 1);
    setGEndDateTimeExtKey(k => k + 1);
    setEDateTimeExtKey(k => k + 1);
    setEEndDateTimeExtKey(k => k + 1);
    setCalendarType(newType);
  }

  const eConvertTimer    = useRef(0);
  const eEndConvertTimer = useRef(0);

  async function handleEDateTimeChange(rawVal) {
    if (!rawVal || rawVal.length < 16) return;
    const [eDateStr, eTimeStr = "00:00"] = rawVal.split("T");
    const [ey, em, ed] = eDateStr.split("-").map(Number);
    if (!ey || !em || !ed) return;
    setEYear(String(ey)); setEMonth(String(em)); setEDay(String(ed));
    const reqId = ++eConvertTimer.current;
    try {
      const g = await e2g({ year: ey, month: em, day: ed });
      if (reqId !== eConvertTimer.current) return;
      const gDateStr = `${g.year}-${pad2(g.month)}-${pad2(g.day)}`;
      const tz = timezone || "Europe/Rome";
      const romeDT = convertTimezone(`${gDateStr}T${eTimeStr}`, "Africa/Addis_Ababa", tz);
      setGDateTime(romeDT);
    } catch { }
  }

  async function handleEEndDateTimeChange(rawVal) {
    if (!rawVal || rawVal.length < 16) return;
    const [eDateStr, eTimeStr = "00:00"] = rawVal.split("T");
    const [ey, em, ed] = eDateStr.split("-").map(Number);
    if (!ey || !em || !ed) return;
    const reqId = ++eEndConvertTimer.current;
    try {
      const g = await e2g({ year: ey, month: em, day: ed });
      if (reqId !== eEndConvertTimer.current) return;
      const gDateStr = `${g.year}-${pad2(g.month)}-${pad2(g.day)}`;
      const tz = timezone || "Europe/Rome";
      const romeDT = convertTimezone(`${gDateStr}T${eTimeStr}`, "Africa/Addis_Ababa", tz);
      setGEndDateTime(romeDT);
    } catch { }
  }

  function buildLocalDraft() {
    return { title, description, start_time_local:fromInputValue(gDateTime), end_time_local:fromInputValue(gEndDateTime), timezone, reminder_minutes:reminderValue, version };
  }

  async function loadParticipants(eventId, currentProfile=null) {
    if (!eventId) return;
    setParticipantsError(""); setParticipantsLoading(true);
    try {
      const data = await listEventParticipants(Number(eventId));
      const normalized = Array.isArray(data) ? data : [];
      setParticipants(normalized);
      const ap = currentProfile || profile;
      if (ap?.email) {
        const mine = normalized.find(p=>(p.email||"").toLowerCase()===ap.email.toLowerCase());
        if (mine) setAccessRole(mine.role||"viewer");
      }
    } catch(e) { setParticipantsError(e.message||"Failed"); }
    finally { setParticipantsLoading(false); }
  }

  async function loadEvent() {
    if (!id) return;
    setError(""); setConflictMsg(""); setMsg(""); setSeriesConflictMsg("");
    try {
      const [me, ev] = await Promise.all([getProfile(), getEvent(Number(id))]);
      setProfile(me); setTitle(ev.title||""); setDescription(ev.description||"");
      setTimezone(ev.timezone||"Europe/Rome");
      const remMinsVal = ev.reminder_minutes;
      if (remMinsVal===null||remMinsVal===undefined) setReminderPreset("none");
      else {
        const match = REMINDER_PRESETS.find(p=>p.value===remMinsVal&&p.value!=="custom"&&p.value!=="none");
        if (match) setReminderPreset(String(remMinsVal));
        else { setReminderPreset("custom"); const {days,hours,mins}=minutesToDhm(remMinsVal); setRemDays(days); setRemHours(hours); setRemMins(mins); }
      }
      setVersion(ev.version);
      const iv = toInputValue(ev.start_time_local||ev.start_time_utc||"");
      const eiv = toInputValue(ev.end_time_local||ev.end_time_utc||"");
      setGDateTime(iv);    setGDateTimeExtKey(k => k + 1);
      setGEndDateTime(eiv); setGEndDateTimeExtKey(k => k + 1);
      if (iv) await syncEthiopianFromGregorian(iv);
      setCalendarType("gregorian"); setRepeatFrequency("none");
      setInitialSnapshot({ title:ev.title||"", description:ev.description||"", start_time_local:ev.start_time_local||"", end_time_local:ev.end_time_local||"", timezone:ev.timezone||"Europe/Rome", reminder_minutes:ev.reminder_minutes??null, version:ev.version });
      setConflictData(null); setShowConflictPanel(false);
      if (ev.user_id===me.id) setAccessRole("owner"); else setAccessRole("viewer");

      await loadParticipants(id, me);
    } catch(e) { setError(e.message||"Failed to load event"); }
  }

  async function loadCreateContext() {

    setGDateTime(""); setGEndDateTime("");
    setEYear(""); setEMonth(""); setEDay("");
    setGDateTimeExtKey(k => k + 1); setGEndDateTimeExtKey(k => k + 1);
    setEDateTimeExtKey(k => k + 1); setEEndDateTimeExtKey(k => k + 1);
    try { const me = await getProfile(); setProfile(me); setAccessRole("owner"); }
    catch(e) { setError(e.message||"Failed"); }
  }

  async function loadGoogleStatus() {
    try { setGoogleStatus(await getGoogleStatus()); } catch { setGoogleStatus(null); }
  }

  useEffect(() => {
    if (id) loadEvent();
    else loadCreateContext();
    loadGoogleStatus();
  }, [id]);

  async function handleGoogleConnect() {
    setGoogleError(""); setGoogleMsg(""); setGoogleLoading(true);
    try { const data = await getGoogleConnectUrl(); window.location.href = data.auth_url; }
    catch(e) { setGoogleError(e.message||"Failed"); setGoogleLoading(false); }
  }

  async function handleGoogleDisconnect() {
    setGoogleError(""); setGoogleMsg(""); setGoogleLoading(true);
    try { await disconnectGoogle(); setGoogleMsg("Disconnected."); await loadGoogleStatus(); }
    catch(e) { setGoogleError(e.message||"Failed"); }
    finally { setGoogleLoading(false); }
  }

  async function handleExportToGoogle() {
    const eid = id || draftEventId;
    if (!eid) { setGoogleError("Save the event first."); return; }
    setGoogleError(""); setGoogleMsg(""); setGoogleLoading(true);
    try {
      const data = await exportEventToGoogle(Number(eid));
      setGoogleMsg("Exported to Google Calendar.");
      if (data?.google_html_link) window.open(data.google_html_link,"_blank","noopener,noreferrer");
    } catch(e) {
      if (e.status === 401 && e.payload?.detail?.error === "missing_calendar_scope") {
        const authUrl = e.payload.detail.auth_url;
        setGoogleMsg("Redirecting to authorize calendar access...");
        setTimeout(() => window.location.href = authUrl, 500);
      } else {
        setGoogleError(e.message||"Export failed");
      }
    }
    finally { setGoogleLoading(false); }
  }

  function addPendingParticipant() {
    setParticipantsError(""); setShareMsg("");
    const email = shareEmail.trim().toLowerCase();
    if (!email) { setParticipantsError("Please enter an email."); return; }
    if (pendingParticipants.some(p=>p.email.toLowerCase()===email)) { setParticipantsError("Already queued."); return; }
    if (participants.some(p=>(p.email||"").toLowerCase()===email)) { setParticipantsError("Already has access."); return; }
    setPendingParticipants(prev=>[...prev,{email,role:shareRole}]);
    setShareEmail(""); setShareRole("viewer");
  }

  function removePendingParticipant(email) {
    setPendingParticipants(prev=>prev.filter(p=>p.email.toLowerCase()!==email.toLowerCase()));
  }

  async function handleReloadLatest() {
    setError(""); setConflictMsg(""); setSeriesConflictMsg(""); setShowConflictPanel(false); setConflictData(null);
    await loadEvent();
  }

  async function handleOverwrite() {
    if (!id||!conflictData?.server?.version) return;
    setError(""); setMsg(""); setConflictMsg(""); setSaving(true);
    try {
      const updated = await updateEvent(Number(id),{ version:conflictData.server.version, title, description, start_time_local:fromInputValue(gDateTime), end_time_local:fromInputValue(gEndDateTime), timezone, reminder_minutes:reminderValue },{ force:true });
      setVersion(updated.version); setShowConflictPanel(false); setConflictData(null);
      setMsg("Saved."); await loadEvent();
    } catch(e) { setError(e.message||"Failed"); }
    finally { setSaving(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canEdit) { setError("You do not have permission to edit this event."); return; }
    setError(""); setConflictMsg(""); setMsg(""); setSeriesConflictMsg(""); setSaving(true);
    try {
      if (!gDateTime) { setError("Start time is required."); setSaving(false); return; }
      const startLocal = fromInputValue(gDateTime);
      const endLocal   = fromInputValue(gEndDateTime);
      if (endLocal && new Date(endLocal)<=new Date(startLocal)) { setError("End time must be after start time."); setSaving(false); return; }
      const basePayload = { title, description, start_time_local:startLocal, end_time_local:endLocal, timezone, reminder_minutes:reminderValue };

      if (id) {
        if (version===null||version===undefined) { setError("Missing version."); setSaving(false); return; }
        const updated = await updateEvent(Number(id),{version,...basePayload});
        setVersion(updated.version);
        if (canManageParticipants && pendingParticipants.length>0) {
          for (const p of pendingParticipants) await shareEvent(Number(id),p);
          setPendingParticipants([]); await loadParticipants(id,profile);
        }
        setMsg("Event updated successfully.");
        setTimeout(()=>nav(CALENDAR_PAGE),700);
      } else if (draftEventId) {
        await updateEvent(Number(draftEventId),{ version:1, ...basePayload });
        if (pendingParticipants.length>0) {
          for (const p of pendingParticipants) { try { await shareEvent(Number(draftEventId),p); } catch {} }
          setPendingParticipants([]);
        }
        setMsg("Event created."); setTimeout(()=>nav(CALENDAR_PAGE),500);
      } else {
        const recPayload = getRecurrencePayload();
        const created = await createEvent({...basePayload, ...recPayload});
        if (pendingParticipants.length>0) {
          for (const p of pendingParticipants) await shareEvent(Number(created.id),p);
          setPendingParticipants([]);
        }
        const n = created.recurrence_created;
        const conflictCount = created.recurrence_conflicts?.length || 0;
        setMsg(n > 1 ? `Recurring series created: ${n} events.` : "Event created.");
        if (conflictCount > 0) {
          setSeriesConflictMsg(
            `${conflictCount} occurrence${conflictCount !== 1 ? "s" : ""} overlap with existing events — check your calendar.`
          );
        }
        if (n <= 1 && conflictCount === 0) {
          setTimeout(()=>nav(CALENDAR_PAGE), 700);
        }

      }
    } catch(e2) {
      if (e2.status===409 && e2.payload?.code==="VERSION_CONFLICT") {
        const latest = e2.payload.current_event;
        setConflictData({ server:latest, local:buildLocalDraft(), initial:initialSnapshot, yourVersion:e2.payload.your_version, currentVersion:e2.payload.current_version });
        setConflictMsg("This event was updated by someone else while you were editing.");
        setShowConflictPanel(true); setSaving(false); return;
      }
      const message = e2.message||"Failed";
      const errorText = String(message);
      setError(errorText.toLowerCase().includes("target user not found")?"That email is not a registered Zemen user yet.":errorText);
    } finally { setSaving(false); }
  }

  async function handleRemoveParticipant(userId) {
    if (!id||!canManageParticipants) return;
    if (!window.confirm("Remove this participant?")) return;
    setParticipantsError(""); setShareMsg("");
    try { await removeEventParticipant(Number(id),Number(userId)); setShareMsg("Participant removed."); await loadParticipants(id,profile); }
    catch(e) { setParticipantsError(e.message||"Failed"); }
  }

  const serverChanges = useMemo(()=>getChangedFields(conflictData?.initial,conflictData?.server),[conflictData]);
  const localChanges = useMemo(()=>getChangedFields(conflictData?.initial,conflictData?.local),[conflictData]);

  const isGroup = pendingParticipants.length > 0 || participants.filter(p => p.role !== "owner").length > 0;

  function DateTimeSection() {
    return (
      <div className="sectionCard sectionCardPad">
        <h3 className="sectionTitle" style={{ marginBottom:16 }}>Date & time</h3>

        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {[
            { key:"manual", label:"Pick manually", icon:<CalendarIcon size={15}/> },
            { key:"smart",  label:"Find best time", icon:<SparkleIcon/> },
          ].map(opt => (
            <button key={opt.key} type="button" onClick={() => setTimeMode(opt.key)} style={{
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              padding:"10px 16px", borderRadius:10, flex:1,
              border: timeMode===opt.key ? "1px solid var(--accent-border)" : "1px solid var(--border)",
              background: timeMode===opt.key ? "var(--accent-soft)" : "rgba(255,255,255,0.03)",
              color: timeMode===opt.key ? "var(--text)" : "var(--muted)",
              fontWeight:600, fontSize:"0.88rem", cursor:"pointer", transition:"all 150ms ease",
            }}>
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {timeMode === "smart" && (
          <SmartSchedulingPanel eventId={id ? Number(id) : (draftEventId ? Number(draftEventId) : null)} onGetEventId={getOrCreateEventId} timezone={timezone} onApplySlot={handleApplySlot} participants={[...participants, ...pendingParticipants]} myEmail={profile?.email || ""}/>
        )}

        {timeMode === "manual" && (
          <div className="stack">
            <div className="segmented" style={{ maxWidth:280 }}>
              <button type="button" className={`segmentedBtn ${calendarType==="gregorian"?"segmentedBtnActive":""}`} onClick={()=>handleCalendarTabSwitch("gregorian")} disabled={!canEdit}>Gregorian</button>
              <button type="button" className={`segmentedBtn ${calendarType==="ethiopian"?"segmentedBtnActive":""}`} onClick={()=>handleCalendarTabSwitch("ethiopian")} disabled={!canEdit}>Ethiopian</button>
            </div>

            {calendarType==="gregorian" && (
              <>
                <div className="formGrid">
                  <label className="label">Start time *
                    <input className="input" type="datetime-local"
                      key={gDateTimeExtKey}
                      defaultValue={gDateTime}
                      onChange={e => {
                        const val = e.target.value;
                        setGDateTime(val);
                        clearTimeout(gSyncDebounce.current);
                        gSyncDebounce.current = setTimeout(() => syncEthiopianFromGregorian(val), 150);
                      }}
                      disabled={!canEdit}/>
                  </label>
                  <label className="label">End time
                    <input className="input" type="datetime-local"
                      key={gEndDateTimeExtKey}
                      defaultValue={gEndDateTime}
                      onChange={e=>setGEndDateTime(e.target.value)}
                      disabled={!canEdit}/>
                  </label>
                </div>
                {gDateTime && eYear && eMonth && eDay && (() => {
                  const tz = timezone || "Europe/Rome";

                  const eatStart = convertTimezone(gDateTime, tz, "Africa/Addis_Ababa");
                  const eatEnd   = gEndDateTime ? convertTimezone(gEndDateTime, tz, "Africa/Addis_Ababa") : null;
                  return (
                    <div className="alert alertInfo" style={{fontSize:"0.85rem"}}>
                      Ethiopian: <strong>{String(eYear).padStart(4,"0")}-{pad2(Number(eMonth))}-{pad2(Number(eDay))}</strong>
                      {" · "}{to12h(eatStart.slice(11,16))}{eatEnd ? ` – ${to12h(eatEnd.slice(11,16))}` : ""}
                    </div>
                  );
                })()}
              </>
            )}

            {calendarType==="ethiopian" && (() => {
              const tz = timezone || "Europe/Rome";
              const eatStartStr = gDateTime ? convertTimezone(gDateTime, tz, "Africa/Addis_Ababa") : "";
              const eatEndStr   = gEndDateTime ? convertTimezone(gEndDateTime, tz, "Africa/Addis_Ababa") : "";
              const eDateTime = (eYear && eMonth && eDay && eatStartStr)
                ? `${String(eYear).padStart(4,"0")}-${pad2(Number(eMonth))}-${pad2(Number(eDay))}T${eatStartStr.slice(11,16)}`
                : "";
              const eEndDateTime = (eYear && eMonth && eDay && eatEndStr)
                ? `${String(eYear).padStart(4,"0")}-${pad2(Number(eMonth))}-${pad2(Number(eDay))}T${eatEndStr.slice(11,16)}`
                : "";
              return (
                <>
                  <div className="formGrid">
                    <label className="label">Start time *
                      <input className="input" type="datetime-local"
                        key={eDateTimeExtKey}
                        defaultValue={eDateTime}
                        onChange={e => {
                          const val = e.target.value;
                          clearTimeout(eSyncDebounce.current);
                          eSyncDebounce.current = setTimeout(() => handleEDateTimeChange(val), 150);
                        }}
                        disabled={!canEdit}/>
                    </label>
                    <label className="label">End time
                      <input className="input" type="datetime-local"
                        key={eEndDateTimeExtKey}
                        defaultValue={eEndDateTime}
                        onChange={e => {
                          const val = e.target.value;
                          clearTimeout(eEndSyncDebounce.current);
                          eEndSyncDebounce.current = setTimeout(() => handleEEndDateTimeChange(val), 150);
                        }}
                        disabled={!canEdit}/>
                    </label>
                  </div>
                  {gDateTime && (() => {
                    const [y, mo, d] = gDateTime.slice(0,10).split("-");
                    return (
                      <div className="alert alertInfo" style={{fontSize:"0.85rem"}}>
                        Gregorian: <strong>{mo}/{d}/{y}</strong>
                        {" · "}{to12h(gDateTime.slice(11,16))}{gEndDateTime ? ` – ${to12h(gEndDateTime.slice(11,16))}` : ""}
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        )}

        <div className="formDivider" style={{ margin:"20px 0 16px" }}/>
        <label className="label" style={{marginBottom:8}}>Timezone<input className="input" value={timezone} onChange={e=>setTimezone(e.target.value)} placeholder="Europe/Rome" disabled={!canEdit}/></label>

        <div style={{ marginTop:4 }}>
          <div style={{ fontSize:"0.78rem", fontWeight:600, color:"var(--muted-2)", marginBottom:8 }}>Reminder</div>
          <div style={{ position:"relative", maxWidth:280 }}>
            <select
              className="input"
              value={reminderPreset}
              onChange={e => setReminderPreset(e.target.value)}
              disabled={!canEdit}
              style={{ appearance:"none", WebkitAppearance:"none", paddingRight:36, cursor: canEdit?"pointer":"default", fontWeight:600 }}
            >
              {REMINDER_PRESETS.map(p => (
                <option key={p.value} value={String(p.value)}>{p.label}</option>
              ))}
            </select>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"var(--muted)" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {reminderPreset==="custom" && (
            <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:8 }}>
              <label className="label" style={{marginBottom:0}}>
                Remind me at
                <input
                  className="input"
                  type="datetime-local"
                  value={customReminderAt}
                  max={gDateTime || undefined}
                  onChange={e => setCustomReminderAt(e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              {customReminderAt && gDateTime && (
                <div style={{ fontSize:"0.82rem", color:"var(--accent)", fontWeight:600 }}>
                  ✓ {(() => {
                    const diffMins = Math.round((new Date(gDateTime).getTime() - new Date(customReminderAt).getTime()) / 60000);
                    if (diffMins <= 0) return "⚠ Reminder must be before the event start";
                    if (diffMins >= 10080) return `${Math.round(diffMins/10080)} week(s) before the event`;
                    if (diffMins >= 1440) return `${Math.round(diffMins/1440)} day(s) before the event`;
                    if (diffMins >= 60 && diffMins%60===0) return `${diffMins/60} hour(s) before the event`;
                    if (diffMins >= 60) return `${Math.floor(diffMins/60)}h ${diffMins%60}m before the event`;
                    return `${diffMins} minute(s) before the event`;
                  })()}
                </div>
              )}
              {!gDateTime && (
                <div style={{ fontSize:"0.82rem", color:"var(--muted)" }}>Set an event start time first to calculate the reminder offset.</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pageNarrow" style={{ maxWidth:720, margin:"0 auto" }}>

      <div style={{ marginBottom:24 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <h1 className="h1">{id ? "Manage event" : "Create event"}</h1>
          {id && version!==null && <span className="badge badgeAccent">v{version}</span>}
        </div>
        {id && <div style={{ marginTop:6 }}><span className={`badge ${accessRole==="owner"?"badgeAccent":accessRole==="editor"?"badgeSuccess":""}`}>{accessRole}</span></div>}
      </div>

      {showConflictPanel && conflictData && <ConflictPanel conflictData={conflictData} serverChanges={serverChanges} localChanges={localChanges} saving={saving} canEdit={canEdit} id={id} onReload={handleReloadLatest} onOverwrite={handleOverwrite} onViewDiff={()=>nav(`/events/${id}/diff?from=${conflictData.yourVersion}&to=${conflictData.currentVersion}`)}/>}
      {conflictMsg && !showConflictPanel && <div className="alert alertDanger" style={{marginBottom:16}}><strong>Conflict:</strong> {conflictMsg}</div>}
      {error && <div className="alert alertDanger" style={{marginBottom:16}}>{error}</div>}
      {msg && id && <div className="alert alertSuccess" style={{marginBottom:16}}>{msg}</div>}

      <form
        onSubmit={handleSubmit}
        onInput={()=>{ if(msg){setMsg("");setSeriesConflictMsg("");} }}
        onClickCapture={(e)=>{
          if(!msg) return;
          const btn=e.target.closest("button");
          if(btn && (btn.type==="submit" || btn.dataset.keep==="1")) return;
          setMsg(""); setSeriesConflictMsg("");
        }}
      >
        <div className="stack">

          <div className="sectionCard sectionCardPad">
            <h3 className="sectionTitle" style={{marginBottom:18}}>Event details</h3>
            <div className="stack">
              <label className="label">Title *<input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Team meeting" disabled={!canEdit} required/></label>
              <label className="label">Description<textarea className="input" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional notes…" disabled={!canEdit}/></label>
            </div>
          </div>

          {(canManageParticipants || !id) && (
            <div className="sectionCard sectionCardPad">
              <div className="sectionHead" style={{ alignItems:"center" }}>
                <div>
                  <h3 className="sectionTitle">Add participants</h3>
                </div>
              </div>
              <div className="stack" style={{marginTop:14}}>
                <div className="efShareRow">
                  <label className="label" style={{flex:1}}>Email<input className="input" value={shareEmail} onChange={e=>setShareEmail(e.target.value)} placeholder="user@example.com" type="email"/></label>
                  <label className="label" style={{minWidth:130}}>
                    Role
                    <div style={{ position:"relative" }}>
                      <select className="input" value={shareRole} onChange={e=>setShareRole(e.target.value)}
                        style={{ appearance:"none", WebkitAppearance:"none", paddingRight:32, cursor:"pointer", fontWeight:600 }}>
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"var(--muted)" }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  </label>
                  <div className="label"><span style={{opacity:0, fontSize:"0.85rem"}}>.</span><button type="button" className="btn btnSm" onClick={addPendingParticipant} style={{minHeight:44, height:44}}>+ Add</button></div>
                </div>
                {participantsError && <div className="alert alertDanger">{participantsError}</div>}
                {shareMsg && <div className="alert alertSuccess">{shareMsg}</div>}
                {pendingParticipants.length>0 && (
                  <div className="efPendingList">
                    {pendingParticipants.map(p=>(
                      <div key={p.email} className="efPendingRow">
                        <div className="participantAvatar" style={{width:28,height:28,fontSize:"0.72rem"}}>{p.email.charAt(0).toUpperCase()}</div>
                        <div style={{flex:1}}><div style={{fontSize:"0.85rem",fontWeight:600}}>{p.email}</div><div style={{fontSize:"0.75rem",color:"var(--muted)"}}>{p.role}</div></div>
                        <button type="button" className="btn btnSm btnDanger" onClick={()=>removePendingParticipant(p.email)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {id && (participantsLoading ? <div className="calLoading"><span className="spinner"/><span>Loading…</span></div> :
                  participants.length===0 ? <div className="emptyState" style={{padding:16}}>No participants yet.</div> :
                  <div className="efParticipantList">
                    {participants.map((p,idx)=>{
                      const userId=p.user_id??p.id??p.user?.id??idx;
                      const email=p.email??p.user_email??p.user?.email??"Unknown";
                      const role=p.role??"viewer";
                      return <ParticipantRow key={userId} email={email} role={role} userId={userId} canManage={canManageParticipants} onRemove={handleRemoveParticipant}/>;
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <DateTimeSection/>

          {!id && (
            showCustomPanel ? (
              <CustomRepeatPanel
                frequency={repeatFrequency}
                setFrequency={setRepeatFrequency}
                interval={repeatInterval}
                setInterval={setRepeatInterval}
                byday={repeatByday}
                setByday={setRepeatByday}
                onBack={() => setShowCustomPanel(false)}
              />
            ) : (
              <div className="sectionCard sectionCardPad">
                <div className="stack" style={{ gap: 16 }}>

                  <label className="label">
                    Repeat
                    <div style={{ position: "relative" }}>
                      <select className="input" value={repeatPreset}
                        onChange={e => { setRepeatPreset(e.target.value); if (e.target.value === "custom") setShowCustomPanel(true); }}
                        style={{ appearance: "none", WebkitAppearance: "none", paddingRight: 36, cursor: "pointer", fontWeight: 600 }}>
                        {REPEAT_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--muted)" }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  </label>

                  {repeatPreset !== "never" && (
                    <label className="label">
                      End Repeat
                      <div style={{ position: "relative" }}>
                        <select className="input" value={repeatEndRepeat} onChange={e => setRepeatEndRepeat(e.target.value)}
                          style={{ appearance: "none", WebkitAppearance: "none", paddingRight: 36, cursor: "pointer", fontWeight: 600 }}>
                          <option value="never">Never</option>
                          <option value="on_date">On Date</option>
                        </select>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--muted)" }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </div>
                    </label>
                  )}

                  {repeatPreset !== "never" && repeatEndRepeat === "on_date" && (
                    <>
                      <label className="label">
                        End Date
                        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", fontSize: "0.9rem", fontWeight: 600, color: "var(--text)" }}>
                          {repeatUntilDate
                            ? new Date(repeatUntilDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "Select a date below"}
                        </div>
                      </label>
                      <InlineCalendar
                        value={repeatUntilDate}
                        onChange={setRepeatUntilDate}
                        minDate={gDateTime ? gDateTime.slice(0, 10) : undefined}
                      />
                    </>
                  )}

                </div>
              </div>
            )
          )}

          {id && (
            <CollapsibleSection title="Google Calendar" defaultOpen={false}>
              <div className="stack">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:"0.85rem",color:"var(--muted)"}}>Export this event to your Google Calendar.</span>
                  <span className={`badge ${googleStatus?.connected?"badgeSuccess":""}`}>{googleStatus?.connected?"Connected":"Not connected"}</span>
                </div>
                {googleStatus?.connected ? (
                  <>
                    <div className="alert alertSuccess" style={{fontSize:"0.85rem"}}>Connected{googleStatus.google_email?<> as <strong>{googleStatus.google_email}</strong></>:null}</div>
                    {googleMsg&&<div className="alert alertSuccess">{googleMsg}</div>}
                    {googleError&&<div className="alert alertDanger">{googleError}</div>}
                    <div className="formActions">
                      <button type="button" className="btn btnPrimary btnSm" onClick={handleExportToGoogle} disabled={googleLoading}>{googleLoading?"Exporting…":"Export to Google"}</button>
                      <button type="button" className="btn btnSm" onClick={handleGoogleConnect} disabled={googleLoading}>Reconnect</button>
                      <button type="button" className="btn btnSm btnDanger" onClick={handleGoogleDisconnect} disabled={googleLoading}>Disconnect</button>
                    </div>
                  </>
                ) : (
                  <>
                    {googleError&&<div className="alert alertDanger">{googleError}</div>}
                    <button type="button" className="btn btnSm" onClick={handleGoogleConnect} disabled={googleLoading}><GoogleIcon/> {googleLoading?"Connecting…":"Connect Google Calendar"}</button>
                  </>
                )}
              </div>
            </CollapsibleSection>
          )}

          {msg && !id && !draftEventId && (
            <div className="alert alertSuccess" style={{marginBottom:8}}>{msg}</div>
          )}
          {seriesConflictMsg && (
            <div style={{
              background:"rgba(251,146,60,0.08)",
              border:"1px solid rgba(251,146,60,0.25)",
              borderRadius:8,
              padding:"10px 14px",
              marginBottom:8,
              fontSize:"0.88rem",
              color:"var(--text)",
              display:"flex",
              alignItems:"flex-start",
              gap:8,
            }}>
              <span style={{color:"#fb923c",fontWeight:700,flexShrink:0}}>⚠</span>
              <span>{seriesConflictMsg}</span>
            </div>
          )}

          <div style={{display:"flex",alignItems:"center",gap:12,paddingTop:4,paddingBottom:24}}>
            {msg && !id && !draftEventId ? (
              <button className="btn btnPrimary" type="button" data-keep="1" onClick={()=>nav(CALENDAR_PAGE)}>
                Continue to Calendar →
              </button>
            ) : (
              <>
                {canEdit ? (
                  <button className="btn btnPrimary" type="submit" disabled={saving}>
                    {saving ? <><span className="spinner" style={{width:14,height:14,borderTopColor:"#fff"}}/>{id?"Saving…":"Creating…"}</> : id?"Save changes":"Create event"}
                  </button>
                ) : (
                  <button className="btn" type="button" disabled>View only</button>
                )}
                <button className="btn" type="button" onClick={()=>nav(CALENDAR_PAGE)}>Cancel</button>
              </>
            )}
          </div>

        </div>
      </form>
    </div>
  );
}