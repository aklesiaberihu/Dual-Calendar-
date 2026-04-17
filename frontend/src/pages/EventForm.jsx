import { useEffect, useMemo, useState } from "react";
import {
  createEvent, getEvent, updateEvent, e2g, g2e,
  rankEventSlots, listEventParticipants, shareEvent,
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

function pad2(n) { return String(n).padStart(2, "0"); }

function parseApiDate(value) {
  if (!value) return null;
  const localLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) && !value.endsWith("Z");
  if (localLike) {
    const [datePart, timePartRaw] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePartRaw.slice(0, 5).split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toInputValue(dtIso) {
  if (!dtIso) return "";
  const d = parseApiDate(dtIso);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromInputValue(v) { if (!v) return null; return `${v}:00`; }

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

function SlotCard({ slot, idx, onApply }) {
  const startTime = formatSlotTime(slot.start_local || slot.start);
  const endTime = formatSlotTime(slot.end_local || slot.end);
  const isGood = slot.score === 0;

  return (
    <div
      onClick={() => onApply(slot)}
      style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        gap:12, padding:"14px 16px",
        borderRadius:10, cursor:"pointer",
        border: isGood ? "1px solid rgba(34,197,94,0.3)" : "1px solid var(--border)",
        background: isGood ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.03)",
        transition:"all 150ms ease",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-border)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = isGood ? "rgba(34,197,94,0.3)" : "var(--border)"}
    >
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:28, height:28, borderRadius:"50%", background: isGood ? "var(--success-soft)" : "var(--accent-soft)", border: `1px solid ${isGood?"rgba(34,197,94,0.3)":"var(--accent-border)"}`, display:"grid", placeItems:"center", color: isGood ? "var(--success)" : "#c4b5fd", fontSize:"0.72rem", fontWeight:800, flexShrink:0 }}>
          {idx+1}
        </div>
        <div>
          <div style={{ fontSize:"0.92rem", fontWeight:700, color:"var(--text)" }}>{startTime}</div>
          <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginTop:2 }}>until {endTime}</div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {isGood && <span style={{ fontSize:"0.72rem", color:"var(--success)", fontWeight:600, padding:"2px 8px", borderRadius:99, border:"1px solid rgba(34,197,94,0.3)", background:"var(--success-soft)" }}>No conflicts</span>}
        {!isGood && <span style={{ fontSize:"0.72rem", color:"var(--muted)", fontWeight:600, padding:"2px 8px", borderRadius:99, border:"1px solid var(--border)", background:"rgba(255,255,255,0.03)" }}>{slot.score} conflict{slot.score!==1?"s":""}</span>}
        <button type="button" className="btn btnPrimary btnSm" style={{ fontSize:"0.78rem", padding:"0 12px", minHeight:30 }}
          onClick={e => { e.stopPropagation(); onApply(slot); }}>
          Use →
        </button>
      </div>
    </div>
  );
}

function SmartSchedulingPanel({ onGetEventId, timezone, onApplySlot, participants = [] }) {
  const [rankDurFrom, setRankDurFrom] = useState("09:00");
  const [rankDurTo, setRankDurTo] = useState("10:00");
  const [rankWindowStart, setRankWindowStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T08:00`;
  });
  const [rankWindowEnd, setRankWindowEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T18:00`;
  });
  const [rankResults, setRankResults] = useState(null);
  const [rankError, setRankError] = useState("");
  const [ranking, setRanking] = useState(false);

  const rankDuration = (() => {
    const [fh, fm] = rankDurFrom.split(":").map(Number);
    const [th, tm] = rankDurTo.split(":").map(Number);
    const mins = (th * 60 + tm) - (fh * 60 + fm);
    return mins > 0 ? mins : 60;
  })();

  async function handleRank() {
    if (!rankWindowStart || !rankWindowEnd) { setRankError("Set both window start and end."); return; }
    setRankError(""); setRankResults(null); setRanking(true);
    try {
      const { eventId, confirmedParticipants } = await onGetEventId();
      if (!eventId) { setRankError("Could not prepare the event. Please add a title first."); setRanking(false); return; }
      
      const requiredIds = confirmedParticipants.map(p => p.user_id).filter(Boolean).join(",");
      const data = await rankEventSlots(Number(eventId), {
        duration_minutes: String(rankDuration),
        window_start_utc: fromInputValue(rankWindowStart),
        window_end_utc: fromInputValue(rankWindowEnd),
        max_results: "5", candidate_limit: "25",
        prefer_earlier: "true", work_start_hour: "9", work_end_hour: "17",
        required_user_ids: requiredIds,
        optional_user_ids: "",
        display_timezone: timezone || "UTC",
      });
      setRankResults(data);
    } catch(e) {
      setRankError(e.message || "Failed to find slots.");
    } finally { setRanking(false); }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        <div style={{ fontSize:"0.78rem", fontWeight:600, color:"var(--muted-2)" }}>Event duration</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:10 }}>
          <label className="label" style={{ flex:1, marginBottom:0 }}>
            From
            <input className="input" type="time" value={rankDurFrom} onChange={e => setRankDurFrom(e.target.value)}/>
          </label>
          <span style={{ color:"var(--muted)", paddingBottom:10, flexShrink:0 }}>→</span>
          <label className="label" style={{ flex:1, marginBottom:0 }}>
            To
            <input className="input" type="time" value={rankDurTo} onChange={e => setRankDurTo(e.target.value)}/>
          </label>
          <span style={{ fontSize:"0.78rem", color:"var(--muted)", fontWeight:600, paddingBottom:10, flexShrink:0 }}>
            {rankDuration >= 60
              ? `${Math.floor(rankDuration/60)}h${rankDuration%60>0?` ${rankDuration%60}m`:""}`
              : `${rankDuration}m`}
          </span>
        </div>
      </div>
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
      <button type="button" className="btn btnPrimary" onClick={handleRank} disabled={ranking} style={{ alignSelf:"flex-start" }}>
        {ranking ? <><span className="spinner" style={{ width:14, height:14, borderTopColor:"#fff" }}/> Searching…</> : <><SparkleIcon /> Find best time</>}
      </button>
      {rankError && <div className="alert alertDanger">{rankError}</div>}
      {rankResults && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ fontSize:"0.82rem", color:"var(--muted)", fontWeight:500 }}>
            {rankResults.ranked_slots?.length ? "Available slots, click to use" : "No slots found, try a wider window"}
          </div>
          {rankResults.ranked_slots?.length
            ? rankResults.ranked_slots.map((slot, idx) => <SlotCard key={idx} slot={slot} idx={idx} onApply={onApplySlot}/>)
            : <div className="alert">No slots found. Try widening the search window.</div>}
        </div>
      )}
    </div>
  );
}

function EventTypeSelector({ onSelect }) {
  return (
    <div className="pageNarrow" style={{ maxWidth:620, margin:"0 auto" }}>
      <div style={{ marginBottom:32 }}>
        <h1 className="h1">Create an event</h1>
        <p style={{ color:"var(--muted)", fontSize:"0.95rem", marginTop:8 }}>What kind of event are you creating?</p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        
        <button
          type="button"
          onClick={() => onSelect("personal")}
          style={{
            display:"flex", alignItems:"center", gap:20,
            padding:"24px 28px", borderRadius:16,
            border:"1px solid var(--border)",
            background:"rgba(255,255,255,0.03)",
            cursor:"pointer", textAlign:"left", width:"100%",
            transition:"all 150ms ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor="var(--accent-border)"; e.currentTarget.style.background="var(--accent-soft)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.background="rgba(255,255,255,0.03)"; }}
        >
          <div style={{ width:52, height:52, borderRadius:14, background:"var(--accent-soft)", border:"1px solid var(--accent-border)", display:"grid", placeItems:"center", color:"#c4b5fd", flexShrink:0 }}>
            <CalendarIcon size={24}/>
          </div>
          <div>
            <div style={{ fontSize:"1.05rem", fontWeight:700, color:"var(--text)", marginBottom:4 }}>Personal event</div>
            <div style={{ fontSize:"0.88rem", color:"var(--muted)", lineHeight:1.55 }}>Just for you. Pick a date and time, add reminders and notes.</div>

          </div>
          <div style={{ marginLeft:"auto", color:"var(--muted)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </button>

        
        <button
          type="button"
          onClick={() => onSelect("group")}
          style={{
            display:"flex", alignItems:"center", gap:20,
            padding:"24px 28px", borderRadius:16,
            border:"1px solid var(--border)",
            background:"rgba(255,255,255,0.03)",
            cursor:"pointer", textAlign:"left", width:"100%",
            transition:"all 150ms ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor="var(--accent-border)"; e.currentTarget.style.background="var(--accent-soft)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.background="rgba(255,255,255,0.03)"; }}
        >
          <div style={{ width:52, height:52, borderRadius:14, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.25)", display:"grid", placeItems:"center", color:"var(--success)", flexShrink:0 }}>
            <UsersIcon size={24}/>
          </div>
          <div>
            <div style={{ fontSize:"1.05rem", fontWeight:700, color:"var(--text)", marginBottom:4 }}>Group event</div>
            <div style={{ fontSize:"0.88rem", color:"var(--muted)", lineHeight:1.55 }}>Invite participants and find the best time that works for everyone.</div>
          </div>
          <div style={{ marginLeft:"auto", color:"var(--muted)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </button>
      </div>

    </div>
  );
}

export default function EventForm() {
  const nav = useNavigate();
  const { id } = useParams();

  
  const [eventType, setEventType] = useState(id ? "personal" : "selector");

  const [profile, setProfile] = useState(null);
  const [accessRole, setAccessRole] = useState(id ? "viewer" : "owner");
  const [version, setVersion] = useState(null);

  const [calendarType, setCalendarType] = useState("gregorian");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gDateTime, setGDateTime] = useState("");
  const [gEndDateTime, setGEndDateTime] = useState("");
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
    if (reminderPreset === "none") return null;
    if (reminderPreset === "custom") {
      if (!customReminderAt || !gDateTime) return 60;
      const diffMins = Math.round((new Date(gDateTime).getTime() - new Date(customReminderAt).getTime()) / 60000);
      return Math.max(1, diffMins);
    }
    return Number(reminderPreset);
  }, [reminderPreset, customReminderAt, gDateTime]);

  const [repeatType, setRepeatType] = useState("none");
  const [repeatCount, setRepeatCount] = useState(1);
  const [repDays, setRepDays] = useState(0);
  const [repHours, setRepHours] = useState(0);
  const [repMins, setRepMins] = useState(0);
  const [repeatFrom, setRepeatFrom] = useState("");
  const [repeatUntil, setRepeatUntil] = useState("");

  const [error, setError] = useState("");
  const [conflictMsg, setConflictMsg] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

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
      return { eventId: null, confirmedParticipants: [] };
    }
  }

  function getRecurrencePayload() {
    if (repeatType === "none") return { recurrence_rule:"none", recurrence_count:1 };
    if (repeatType === "daily") return { recurrence_rule:"daily", recurrence_count:Number(repeatCount) };
    if (repeatType === "weekly") return { recurrence_rule:"weekly", recurrence_count:Number(repeatCount) };
    if (repeatType === "custom") {
      const totalMins = dhmToMinutes(repDays, repHours, repMins) || 1;
      return { recurrence_rule:"daily", recurrence_count:Math.max(1, Math.round(totalMins/1440)) };
    }
    return { recurrence_rule:"none", recurrence_count:1 };
  }

  function repeatSummary() {
    if (repeatType === "none") return null;
    if (repeatType === "daily") return "Repeats every day";
    if (repeatType === "weekly") return "Repeats every week";
    if (repeatType === "custom") {
      const parts = [];
      if (Number(repDays)>0) parts.push(`${repDays} day(s)`);
      if (Number(repHours)>0) parts.push(`${repHours} hr(s)`);
      if (Number(repMins)>0) parts.push(`${repMins} min(s)`);
      return parts.length > 0 ? `Every ${parts.join(" ")}` : "Every …";
    }
    return null;
  }

  function handleApplySlot(slot) {
    const startLocal = slot.start_local || slot.start;
    const endLocal = slot.end_local || slot.end;
    if (startLocal) { const iv = toInputValue(startLocal); setGDateTime(iv); syncEthiopianFromGregorian(iv); }
    if (endLocal) setGEndDateTime(toInputValue(endLocal));
    setTimeMode("manual");
  }

  async function syncEthiopianFromGregorian(localDateTime) {
    if (!localDateTime) { setEYear(""); setEMonth(""); setEDay(""); return; }
    const [y,m,d] = localDateTime.slice(0,10).split("-").map(Number);
    try { const eth = await g2e({year:y,month:m,day:d}); setEYear(String(eth.year??"")); setEMonth(String(eth.month??"")); setEDay(String(eth.day??"")); }
    catch { setEYear(""); setEMonth(""); setEDay(""); }
  }

  async function syncGregorianFromEthiopian(year, month, day, currentTimePart="09:00") {
    if (!year||!month||!day) { setGDateTime(""); setGEndDateTime(""); return; }
    try {
      const g = await e2g({year:Number(year),month:Number(month),day:Number(day)});
      const localDate = `${g.year}-${pad2(g.month)}-${pad2(g.day)}`;
      const oldStart = gDateTime ? gDateTime.slice(11,16) : currentTimePart;
      const oldEnd = gEndDateTime ? gEndDateTime.slice(11,16) : "";
      setGDateTime(`${localDate}T${oldStart}`);
      if (oldEnd) setGEndDateTime(`${localDate}T${oldEnd}`);
    } catch { setGDateTime(""); setGEndDateTime(""); }
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
    setError(""); setConflictMsg(""); setMsg("");
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
      setGDateTime(iv); setGEndDateTime(eiv);
      if (iv) await syncEthiopianFromGregorian(iv);
      setCalendarType("gregorian"); setRepeatType("none"); setRepeatCount(1);
      setInitialSnapshot({ title:ev.title||"", description:ev.description||"", start_time_local:ev.start_time_local||"", end_time_local:ev.end_time_local||"", timezone:ev.timezone||"Europe/Rome", reminder_minutes:ev.reminder_minutes??null, version:ev.version });
      setConflictData(null); setShowConflictPanel(false);
      if (ev.user_id===me.id) setAccessRole("owner"); else setAccessRole("viewer");
      
      await loadParticipants(id, me);
    } catch(e) { setError(e.message||"Failed to load event"); }
  }

  async function loadCreateContext() {
    try { const me = await getProfile(); setProfile(me); setAccessRole("owner"); }
    catch(e) { setError(e.message||"Failed"); }
  }

  async function loadGoogleStatus() {
    try { setGoogleStatus(await getGoogleStatus()); } catch { setGoogleStatus(null); }
  }

  useEffect(() => {
    if (id) { loadEvent(); setEventType("personal"); }
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
    } catch(e) { setGoogleError(e.message||"Export failed"); }
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
    setError(""); setConflictMsg(""); setShowConflictPanel(false); setConflictData(null);
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
    setError(""); setConflictMsg(""); setMsg(""); setSaving(true);
    try {
      let startLocal=null, endLocal=null;
      if (calendarType==="gregorian") {
        if (!gDateTime) { setError("Start time is required."); setSaving(false); return; }
        startLocal=fromInputValue(gDateTime); endLocal=fromInputValue(gEndDateTime);
      } else {
        if (!eYear||!eMonth||!eDay) { setError("Please complete the Ethiopian date."); setSaving(false); return; }
        const stp=gDateTime?gDateTime.slice(11,16):"09:00";
        const etp=gEndDateTime?gEndDateTime.slice(11,16):"";
        const g=await e2g({year:Number(eYear),month:Number(eMonth),day:Number(eDay)});
        const bd=`${g.year}-${pad2(g.month)}-${pad2(g.day)}`;
        startLocal=`${bd}T${stp}:00`; endLocal=etp?`${bd}T${etp}:00`:null;
      }
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
        const {recurrence_rule,recurrence_count} = getRecurrencePayload();
        const created = await createEvent({...basePayload,recurrence_rule,recurrence_count});
        if (pendingParticipants.length>0) {
          for (const p of pendingParticipants) await shareEvent(Number(created.id),p);
          setPendingParticipants([]);
        }
        setMsg(recurrence_rule==="none"?"Event created.":"Recurring events created.");
        setTimeout(()=>nav(CALENDAR_PAGE),500);
      }
    } catch(e2) {
      if (e2.status===409 && e2.payload?.code==="VERSION_CONFLICT") {
        const latest = e2.payload.current_event;
        setConflictData({ server:latest, local:buildLocalDraft(), initial:initialSnapshot, yourVersion:e2.payload.your_version, currentVersion:e2.payload.current_version });
        setConflictMsg("This event was updated by someone else while you were editing.");
        setShowConflictPanel(true); setSaving(false); return;
      }
      const message = e2.message||"Failed";
      setError(String(message).toLowerCase().includes("target user not found")?"That email is not a registered Zemen user yet.":String(message));
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
  const summary = repeatSummary();

  
  if (eventType === "selector") {
    return <EventTypeSelector onSelect={setEventType}/>;
  }

  
  const isGroup = eventType === "group";

  function DateTimeSection() {
    return (
      <div className="sectionCard sectionCardPad">
        <h3 className="sectionTitle" style={{ marginBottom:6 }}>
          {isGroup ? "When is this event?" : "Date & time"}
        </h3>
        {isGroup && (
          <p style={{ margin:"0 0 18px", fontSize:"0.88rem", color:"var(--muted)" }}>
            Pick a time yourself or let us find the best slot for all participants.
          </p>
        )}

        
        {(isGroup || !!id) && (
          <div style={{ display:"flex", gap:8, marginBottom:20 }}>
            {[
              { key:"manual", label:"Pick manually", sub:"Choose date & time" },
              { key:"smart", label:"Find best time", sub:"Best slot for everyone" },
            ].map(opt => (
              <button key={opt.key} type="button" onClick={() => setTimeMode(opt.key)} style={{
                display:"flex", alignItems:"center", gap:8,
                padding:"10px 16px", borderRadius:10, flex:1,
                border: timeMode===opt.key ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                background: timeMode===opt.key ? "var(--accent-soft)" : "rgba(255,255,255,0.03)",
                color: timeMode===opt.key ? "var(--text)" : "var(--muted)",
                fontWeight:600, fontSize:"0.88rem", cursor:"pointer", transition:"all 150ms ease",
              }}>
                {opt.key === "smart" ? <SparkleIcon/> : <CalendarIcon size={15}/>}
                <div style={{ textAlign:"left" }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize:"0.72rem", fontWeight:400, opacity:0.7 }}>{opt.sub}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        
        {(isGroup || !!id) && timeMode === "smart" && (
          <SmartSchedulingPanel onGetEventId={getOrCreateEventId} timezone={timezone} onApplySlot={handleApplySlot} participants={[...participants, ...pendingParticipants]}/>
        )}

        
        {(timeMode === "manual" || (!isGroup && !id)) && (
          <div className="stack">
            <div className="segmented" style={{ maxWidth:280 }}>
              <button type="button" className={`segmentedBtn ${calendarType==="gregorian"?"segmentedBtnActive":""}`} onClick={()=>setCalendarType("gregorian")} disabled={!canEdit}>Gregorian</button>
              <button type="button" className={`segmentedBtn ${calendarType==="ethiopian"?"segmentedBtnActive":""}`} onClick={()=>setCalendarType("ethiopian")} disabled={!canEdit}>Ethiopian</button>
            </div>

            {calendarType==="gregorian" && (
              <div className="formGrid">
                <label className="label">Start time *<input className="input" type="datetime-local" value={gDateTime} onChange={async e=>{setGDateTime(e.target.value);await syncEthiopianFromGregorian(e.target.value);}} disabled={!canEdit}/></label>
                <label className="label">End time<input className="input" type="datetime-local" value={gEndDateTime} onChange={e=>setGEndDateTime(e.target.value)} disabled={!canEdit}/></label>
              </div>
            )}

            {calendarType==="ethiopian" && (
              <>
                <div className="formGrid3">
                  <label className="label">Year<input className="input" value={eYear} onChange={async e=>{setEYear(e.target.value);await syncGregorianFromEthiopian(e.target.value,eMonth,eDay,gDateTime?.slice(11,16)||"09:00");}} placeholder="2018" disabled={!canEdit}/></label>
                  <label className="label">Month<input className="input" value={eMonth} onChange={async e=>{setEMonth(e.target.value);await syncGregorianFromEthiopian(eYear,e.target.value,eDay,gDateTime?.slice(11,16)||"09:00");}} placeholder="4" disabled={!canEdit}/></label>
                  <label className="label">Day<input className="input" value={eDay} onChange={async e=>{setEDay(e.target.value);await syncGregorianFromEthiopian(eYear,eMonth,e.target.value,gDateTime?.slice(11,16)||"09:00");}} placeholder="29" disabled={!canEdit}/></label>
                </div>
                <div className="formGrid">
                  <label className="label">Start time<input className="input" type="time" value={gDateTime?gDateTime.slice(11,16):"09:00"} onChange={async e=>{await syncGregorianFromEthiopian(eYear,eMonth,eDay,e.target.value||"09:00");}} disabled={!canEdit}/></label>
                  <label className="label">End time<input className="input" type="time" value={gEndDateTime?gEndDateTime.slice(11,16):""} onChange={e=>{if(!gDateTime)return;const dp=gDateTime.slice(0,10);setGEndDateTime(e.target.value?`${dp}T${e.target.value}`:"");}} disabled={!canEdit}/></label>
                </div>
                {gDateTime && <div className="alert alertInfo" style={{fontSize:"0.85rem"}}>Gregorian: <strong>{gDateTime.replace("T"," ")}</strong>{gEndDateTime&&<> → <strong>{gEndDateTime.replace("T"," ")}</strong></>}</div>}
              </>
            )}
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
        
        {!id && (
          <button type="button" className="btn btnGhost btnSm" style={{ marginBottom:14, display:"flex", alignItems:"center", gap:6 }} onClick={() => setEventType("selector")}>
            <ArrowLeft/> Back
          </button>
        )}
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <h1 className="h1">{id ? "Manage event" : isGroup ? "New group event" : "New personal event"}</h1>
          {id && version!==null && <span className="badge badgeAccent">v{version}</span>}
        </div>
        {id && <div style={{ marginTop:6 }}><span className={`badge ${accessRole==="owner"?"badgeAccent":accessRole==="editor"?"badgeSuccess":""}`}>{accessRole}</span></div>}
      </div>

      {showConflictPanel && conflictData && <ConflictPanel conflictData={conflictData} serverChanges={serverChanges} localChanges={localChanges} saving={saving} canEdit={canEdit} id={id} onReload={handleReloadLatest} onOverwrite={handleOverwrite} onViewDiff={()=>nav(`/events/${id}/diff?from=${conflictData.yourVersion}&to=${conflictData.currentVersion}`)}/>}
      {conflictMsg && !showConflictPanel && <div className="alert alertDanger" style={{marginBottom:16}}><strong>Conflict:</strong> {conflictMsg}</div>}
      {error && <div className="alert alertDanger" style={{marginBottom:16}}>{error}</div>}
      {msg && <div className="alert alertSuccess" style={{marginBottom:16}}>{msg}</div>}

      <form onSubmit={handleSubmit}>
        <div className="stack">

          
          <div className="sectionCard sectionCardPad">
            <h3 className="sectionTitle" style={{marginBottom:18}}>Event details</h3>
            <div className="stack">
              <label className="label">Title *<input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Team meeting" disabled={!canEdit} required/></label>
              <label className="label">Description<textarea className="input" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional notes…" disabled={!canEdit}/></label>
            </div>
          </div>

          
          {(isGroup || id) && (canManageParticipants || !id) && (
            <div className="sectionCard sectionCardPad">
              <div className="sectionHead" style={{ alignItems:"center" }}>
                <div>
                  <h3 className="sectionTitle">Who's invited?</h3>
                  {!id && (
                    <p className="sectionSub">
                      Add participants first. Smart scheduling will check everyone's calendar to find the best time.
                    </p>
                  )}
                </div>
                <span className="badge" style={{ alignSelf:"center" }}>{participants.length + pendingParticipants.length} total</span>
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
                  <div className="label"><span style={{opacity:0}}>.</span><button type="button" className="btn btnSm" onClick={addPendingParticipant}>+ Add</button></div>
                </div>
                {participantsError && <div className="alert alertDanger">{participantsError}</div>}
                {shareMsg && <div className="alert alertSuccess">{shareMsg}</div>}
                {pendingParticipants.length>0 && (
                  <div className="efPendingList">
                    <div className="efPendingTitle">Will be added when you create the event</div>
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
            <div className="sectionCard sectionCardPad">
              <h3 className="sectionTitle" style={{marginBottom:18}}>Repeat <span style={{fontSize:"0.75rem",fontWeight:500,color:"var(--muted)",letterSpacing:"0.02em"}}>optional</span></h3>
              <div className="stack">

                
                <div style={{ position:"relative", maxWidth:280 }}>
                  <select
                    className="input"
                    value={repeatType}
                    onChange={e => setRepeatType(e.target.value)}
                    style={{ appearance:"none", WebkitAppearance:"none", paddingRight:36, cursor:"pointer", fontWeight:600 }}
                  >
                    <option value="none">Never</option>
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                    <option value="custom">Custom interval…</option>
                  </select>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"var(--muted)" }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>

                

                
                {repeatType==="custom" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    <div style={{ fontSize:"0.78rem", fontWeight:600, color:"var(--muted-2)" }}>Repeat between</div>
                    <div className="formGrid">
                      <label className="label">
                        From
                        <input className="input" type="datetime-local" value={repeatFrom} onChange={e => setRepeatFrom(e.target.value)}/>
                      </label>
                      <label className="label">
                        Until
                        <input className="input" type="datetime-local" value={repeatUntil} min={repeatFrom||undefined} onChange={e => setRepeatUntil(e.target.value)}/>
                      </label>
                    </div>
                    {repeatFrom && repeatUntil && (() => {
                      const diffMins = Math.round((new Date(repeatUntil) - new Date(repeatFrom)) / 60000);
                      if (diffMins <= 0) return <div style={{ fontSize:"0.82rem", color:"var(--danger)" }}>⚠ Until must be after From</div>;
                      const days = Math.floor(diffMins / 1440);
                      const hrs = Math.floor((diffMins % 1440) / 60);
                      const parts = [];
                      if (days > 0) parts.push(`${days} day${days>1?"s":""}`);
                      if (hrs > 0) parts.push(`${hrs} hr${hrs>1?"s":""}`);
                      return <div style={{ fontSize:"0.82rem", color:"var(--accent)", fontWeight:600 }}>✓ Repeating over {parts.join(" and ")}</div>;
                    })()}
                  </div>
                )}

                {summary && repeatType !== "custom" && (
                  <div style={{ fontSize:"0.82rem", color:"var(--accent)", fontWeight:600 }}>✓ {summary}</div>
                )}
              </div>
            </div>
          )}

          
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

          
          <div style={{display:"flex",alignItems:"center",gap:12,paddingTop:4,paddingBottom:24}}>
            {canEdit ? (
              <button className="btn btnPrimary" type="submit" disabled={saving}>
                {saving ? <><span className="spinner" style={{width:14,height:14,borderTopColor:"#fff"}}/>{id?"Saving…":"Creating…"}</> : id?"Save changes":"Create event"}
              </button>
            ) : (
              <button className="btn" type="button" disabled>View only</button>
            )}
            <button className="btn" type="button" onClick={()=>nav(CALENDAR_PAGE)}>Cancel</button>
          </div>

        </div>
      </form>
    </div>
  );
}