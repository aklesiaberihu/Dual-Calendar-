import { useEffect, useMemo, useState, useRef } from "react";
import {
  deleteEvent, listEvents, listHolidays, g2e,
  getProfile, getEvent, listEventParticipants,
  getGoogleStatus, exportEventToGoogle, getGoogleConnectUrl,
} from "../api";
import { Link } from "react-router-dom";

function pad2(n) { return String(n).padStart(2, "0"); }

function toUTCDateKey(isoString) {
  const d = new Date(isoString + "Z");
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function toDateKeyFromDateOnly(isoDate) { if (!isoDate) return ""; return isoDate.slice(0, 10); }

function formatLocalRange(ev) {
  if (!ev?.start_time_local) return "";
  const start = ev.start_time_local.slice(11, 16);
  const end = ev.end_time_local ? ev.end_time_local.slice(11, 16) : "";
  return end ? `${start} – ${end}` : start;
}

function formatUTCDateLabel(isoString) {
  const d = new Date(isoString + "Z");
  return d.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatDateOnlyLabel(isoDate) {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatReminder(minutes) {
  if (minutes === undefined || minutes === null) return null;
  if (minutes === 5) return "5 minutes before";
  if (minutes === 15) return "15 minutes before";
  if (minutes === 30) return "30 minutes before";
  if (minutes === 60) return "1 hour before";
  if (minutes === 120) return "2 hours before";
  if (minutes === 1440) return "1 day before";
  if (minutes === 2880) return "2 days before";
  if (minutes === 10080) return "1 week before";
  if (minutes < 60) return `${minutes} minutes before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} minutes before`;
}

function buildMonthGrid(year, monthIndex) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = firstDay.getUTCDay();
  const cells = [];
  let dayCounter = 1 - firstWeekday;
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(Date.UTC(year, monthIndex, dayCounter));
    const y = cellDate.getUTCFullYear();
    const m = pad2(cellDate.getUTCMonth() + 1);
    const d = pad2(cellDate.getUTCDate());
    cells.push({ key: `${y}-${m}-${d}`, inCurrentMonth: cellDate.getUTCMonth() === monthIndex, dayNumber: cellDate.getUTCDate(), isoDate: `${y}-${m}-${d}`, gYear: y, gMonth: cellDate.getUTCMonth() + 1, gDay: cellDate.getUTCDate() });
    dayCounter++;
  }
  return cells;
}

function buildMiniGrid(year, monthIndex) {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const cells = [];
  let dayCounter = 1 - firstWeekday;
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(Date.UTC(year, monthIndex, dayCounter));
    cells.push({ dayNumber: cellDate.getUTCDate(), inMonth: cellDate.getUTCMonth() === monthIndex, isoDate: `${cellDate.getUTCFullYear()}-${pad2(cellDate.getUTCMonth()+1)}-${pad2(cellDate.getUTCDate())}` });
    dayCounter++;
  }
  return cells;
}

function isTodayUTC(isoDate) {
  const now = new Date();
  return isoDate === `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}

function buildHolidayOriginalDate(holiday) {
  if (!holiday) return "—";
  if (holiday.calendar_type === "gregorian" && holiday.g_year) return `${holiday.g_year}-${pad2(holiday.g_month)}-${pad2(holiday.g_day)}`;
  if (holiday.calendar_type === "ethiopian" && holiday.e_year) return `${holiday.e_year}-${pad2(holiday.e_month)}-${pad2(holiday.e_day)}`;
  return "—";
}

const ETH_MONTHS = { 1:"Meskerem",2:"Tikimt",3:"Hidar",4:"Tahsas",5:"Tir",6:"Yekatit",7:"Megabit",8:"Miazia",9:"Ginbot",10:"Sene",11:"Hamle",12:"Nehase",13:"Pagume" };
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WEEKDAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEKDAYS_SHORT = ["S","M","T","W","T","F","S"];

function ChevronLeft() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>; }
function ChevronRight() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>; }
function SearchIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function CloseIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function GoogleIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
}

/* ── Event Popover ── */
function EventPopover({ ev, anchor, participants, accessRole, loading, googleStatus, onClose, onDelete, onGoogleExport, onGoogleConnect }) {
  const popoverRef = useRef(null);
  const [style, setStyle] = useState({ opacity: 0 });
  const [googleMsg, setGoogleMsg] = useState("");
  const [googleExporting, setGoogleExporting] = useState(false);

  useEffect(() => {
    if (!anchor || !popoverRef.current) return;
    const pop = popoverRef.current;
    const pw = pop.offsetWidth || 320;
    const ph = pop.offsetHeight || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 10;
    let left = anchor.right + gap;
    let top = anchor.top;
    if (left + pw > vw - 10) left = anchor.left - pw - gap;
    if (left < 10) left = Math.max(10, anchor.left + anchor.width / 2 - pw / 2);
    if (top + ph > vh - 10) top = vh - ph - 10;
    if (top < 10) top = 10;
    setStyle({ opacity: 1, left, top });
  }, [anchor, loading]); // re-calc after content loads

  if (!ev) return null;
  const canEdit = accessRole === "owner" || accessRole === "editor";
  const canDelete = accessRole === "owner";

  const reminderText = formatReminder(ev.reminder_minutes);

  const rows = [
    { label: "Date", value: formatUTCDateLabel(ev.start_time_utc) },
    { label: "Time", value: formatLocalRange(ev) || "All day" },
    { label: "Timezone", value: ev.timezone || "—" },
    reminderText ? { label: "Reminder", value: reminderText } : null,
    ev.description ? { label: "Notes", value: ev.description } : null,
    (ev.recurrence_rule && ev.recurrence_rule !== "none") ? { label: "Repeats", value: ev.recurrence_rule } : null,
  ].filter(Boolean);

  async function handleExport() {
    setGoogleExporting(true); setGoogleMsg("");
    try {
      await onGoogleExport(ev.id);
      setGoogleMsg("Exported to Google Calendar ✓");
      setTimeout(() => setGoogleMsg(""), 3000);
    } catch { setGoogleMsg("Export failed"); }
    finally { setGoogleExporting(false); }
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={onClose} />
      <div ref={popoverRef} style={{
        position: "fixed", zIndex: 99, width: 320,
        borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(16, 20, 40, 0.97)",
        backdropFilter: "blur(28px)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(139,92,246,0.14)",
        overflow: "hidden", transition: "opacity 0.15s ease", ...style,
      }}>
        {/* accent bar */}
        <div style={{ height: 3, background: "var(--accent)" }} />

        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", marginBottom: 3 }}>Event</div>
            <div style={{ fontSize: "0.96rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.3, wordBreak: "break-word" }}>{ev.title}</div>
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, width: 24, height: 24, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--muted)" }}>
            <CloseIcon />
          </button>
        </div>

        {/* loading shimmer */}
        {loading && (
          <div style={{ padding: "14px", display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: "0.82rem" }}>
            <span className="spinner" style={{ width: 14, height: 14 }} /> Loading details…
          </div>
        )}

        {/* detail rows */}
        {!loading && (
          <div style={{ padding: "6px 0 4px" }}>
            {rows.map(row => (
              <div key={row.label} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "6px 14px", fontSize: "0.84rem" }}>
                <span style={{ color: "var(--muted)", fontWeight: 600, minWidth: 68, flexShrink: 0, fontSize: "0.78rem", paddingTop: 1 }}>{row.label}</span>
                <span style={{ color: "var(--muted-2)", lineHeight: 1.45 }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* participants */}
        {!loading && participants.length > 0 && (
          <div style={{ padding: "8px 14px 10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 6 }}>Participants</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {participants.slice(0, 4).map((p, i) => {
                const email = p.email ?? p.user_email ?? p.user?.email ?? "Unknown";
                const role = p.role ?? "viewer";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent-soft)", border: "1px solid var(--accent-border)", display: "grid", placeItems: "center", color: "#c4b5fd", fontSize: "0.72rem", fontWeight: 800, flexShrink: 0 }}>
                      {email.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ color: "var(--muted-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.72rem", flexShrink: 0 }}>{role}</span>
                  </div>
                );
              })}
              {participants.length > 4 && <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>+{participants.length - 4} more</div>}
            </div>
          </div>
        )}

        {/* Google export row */}
        {!loading && (
          <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {googleStatus?.connected ? (
              <>
                <button
                  className="btn btnSm"
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem" }}
                  onClick={handleExport}
                  disabled={googleExporting}
                >
                  <GoogleIcon /> {googleExporting ? "Exporting…" : "Export to Google"}
                </button>
                {googleMsg && <span style={{ fontSize: "0.75rem", color: googleMsg.includes("✓") ? "var(--success)" : "var(--danger)" }}>{googleMsg}</span>}
              </>
            ) : (
              <button
                className="btn btnSm btnGhost"
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem" }}
                onClick={onGoogleConnect}
              >
                <GoogleIcon /> Connect Google Calendar
              </button>
            )}
          </div>
        )}

        {/* action buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          {canDelete ? (
            <button className="btn btnSm btnDanger" onClick={() => { onDelete(ev.id); onClose(); }}>Delete</button>
          ) : <div />}
          <div style={{ display: "flex", gap: 6 }}>
            {canEdit ? (
              <>
                <Link to={`/events/${ev.id}/diff?from=${Math.max(1,(ev.version??1)-1)}&to=${ev.version??1}`}>
                  <button className="btn btnSm" onClick={onClose}>History</button>
                </Link>
                <Link to={`/events/${ev.id}/edit`}>
                  <button className="btn btnPrimary btnSm" onClick={onClose}>Edit</button>
                </Link>
              </>
            ) : (
              <button className="btn btnSm" onClick={onClose}>Close</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Holiday Popover ── */
function HolidayPopover({ holiday, anchor, onClose }) {
  const popoverRef = useRef(null);
  const [style, setStyle] = useState({ opacity: 0 });

  useEffect(() => {
    if (!anchor || !popoverRef.current) return;
    const pop = popoverRef.current;
    const pw = pop.offsetWidth || 300, ph = pop.offsetHeight || 200;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 10;
    let left = anchor.right + gap, top = anchor.top;
    if (left + pw > vw - 10) left = anchor.left - pw - gap;
    if (left < 10) left = Math.max(10, anchor.left + anchor.width / 2 - pw / 2);
    if (top + ph > vh - 10) top = vh - ph - 10;
    if (top < 10) top = 10;
    setStyle({ opacity: 1, left, top });
  }, [anchor]);

  if (!holiday) return null;
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={onClose} />
      <div ref={popoverRef} style={{
        position: "fixed", zIndex: 99, width: 300, borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.1)", background: "rgba(16, 20, 40, 0.97)",
        backdropFilter: "blur(28px)", boxShadow: "0 20px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(34,197,94,0.12)",
        overflow: "hidden", transition: "opacity 0.15s ease", ...style,
      }}>
        <div style={{ height: 3, background: "var(--success)" }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <div style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--success)", marginBottom: 3 }}>Holiday</div>
            <div style={{ fontSize: "0.96rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>{holiday.name}</div>
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, width: 24, height: 24, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--muted)" }}><CloseIcon /></button>
        </div>
        <div style={{ padding: "6px 0 8px" }}>
          {[
            { label: "Category", value: holiday.category },
            { label: "Type", value: holiday.calendar_type },
            { label: "Date", value: formatDateOnlyLabel(holiday.resolved_date) },
            { label: "Original", value: buildHolidayOriginalDate(holiday) },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "6px 14px", fontSize: "0.84rem" }}>
              <span style={{ color: "var(--muted)", fontWeight: 600, minWidth: 64, flexShrink: 0, fontSize: "0.78rem", paddingTop: 1 }}>{row.label}</span>
              <span style={{ color: "var(--muted-2)", lineHeight: 1.45 }}>{row.value || "—"}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btnSm" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}

function YearView({ year, eventsByDay, holidaysByDay, onMonthClick }) {
  return (
    <div className="calYearGrid">
      {MONTH_NAMES.map((monthName, mi) => {
        const cells = buildMiniGrid(year, mi);
        return (
          <div key={mi} className="calYearMonth" onClick={() => onMonthClick(mi)}>
            <div className="calYearMonthName">{monthName}</div>
            <div className="calMiniGrid">
              {WEEKDAYS_SHORT.map((w, i) => <div key={i} className="calMiniHeader">{w}</div>)}
              {cells.map((cell, i) => {
                const hasEvent = (eventsByDay.get(cell.isoDate)?.length || 0) > 0;
                const hasHoliday = (holidaysByDay.get(cell.isoDate)?.length || 0) > 0;
                const today = isTodayUTC(cell.isoDate);
                return (
                  <div key={i} className={["calMiniDay",!cell.inMonth&&"calMiniDayOther",today&&"calMiniDayToday"].filter(Boolean).join(" ")}>
                    {cell.dayNumber}
                    {(hasEvent||hasHoliday)&&cell.inMonth&&<span className="calMiniDot" style={{background:hasEvent?"var(--accent)":"var(--success)"}}/>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ year, monthIndex, dayOffset, eventsByDay, holidaysByDay, onEventClick, onHolidayClick }) {
  const today = new Date();
  const todayKey = `${today.getUTCFullYear()}-${pad2(today.getUTCMonth()+1)}-${pad2(today.getUTCDate())}`;
  const refDate = new Date(Date.UTC(year, monthIndex, 1 + dayOffset));
  const startOfWeek = new Date(refDate);
  startOfWeek.setUTCDate(refDate.getUTCDate() - refDate.getUTCDay());
  const days = Array.from({length:7},(_,i)=>{
    const d=new Date(startOfWeek); d.setUTCDate(startOfWeek.getUTCDate()+i);
    const key=`${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
    return {key,label:WEEKDAYS[i],day:d.getUTCDate()};
  });
  return (
    <div className="calWeekView">
      <div className="calWeekHeader">
        {days.map(d=>(
          <div key={d.key} className={`calWeekHeaderCell ${d.key===todayKey?"calWeekHeaderToday":""}`}>
            <span className="calWeekDay">{d.label}</span>
            <span className={`calWeekDate ${d.key===todayKey?"dayNumToday":""}`}>{d.day}</span>
          </div>
        ))}
      </div>
      <div className="calWeekBody">
        {days.map(d=>{
          const evs=eventsByDay.get(d.key)||[];
          const hols=holidaysByDay.get(d.key)||[];
          return (
            <div key={d.key} className={`calWeekCol ${d.key===todayKey?"calWeekColToday":""}`}>
              {hols.map(h=><button key={`h-${h.id}`} type="button" className="calHolidayChip" style={{marginBottom:4}} onClick={e=>onHolidayClick(h,e.currentTarget.getBoundingClientRect())}><span className="calHolidayDot"/><span className="calHolidayName">{h.name}</span></button>)}
              {evs.map(ev=>(
                <button key={ev.id} type="button" className="calEventCard" style={{width:"100%",textAlign:"left",cursor:"pointer",marginBottom:4}} onClick={e=>onEventClick(ev,e.currentTarget.getBoundingClientRect())}>
                  <div className="calEventCardTitle">{ev.title}</div>
                  {formatLocalRange(ev)&&<div className="calEventCardTime" style={{marginTop:2}}>{formatLocalRange(ev)}</div>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ year, monthIndex, dayOfMonth, eventsByDay, holidaysByDay, onEventClick, onHolidayClick }) {
  const d = new Date(Date.UTC(year, monthIndex, dayOfMonth));
  const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
  const evs = eventsByDay.get(key) || [];
  const hols = holidaysByDay.get(key) || [];
  const isToday = isTodayUTC(key);
  const HOUR_H = 64;

  function formatHour(h) {
    if (h === 0) return "";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  }

  function getEventPos(ev) {
    if (!ev.start_time_local || !ev.start_time_local.includes("T")) return null;
    const timePart = ev.start_time_local.split("T")[1];
    if (!timePart) return null;
    const [h, m] = timePart.slice(0, 5).split(":").map(Number);
    const top = (h + m / 60) * HOUR_H;
    let duration = 60;
    if (ev.end_time_local && ev.end_time_local.includes("T")) {
      const ePart = ev.end_time_local.split("T")[1];
      if (ePart) {
        const [eh, em] = ePart.slice(0, 5).split(":").map(Number);
        const diff = (eh * 60 + em) - (h * 60 + m);
        if (diff > 0) duration = diff;
      }
    }
    return { top, height: Math.max((duration / 60) * HOUR_H - 2, 28) };
  }

  const now = new Date();
  const nowTop = isToday ? (now.getHours() + now.getMinutes() / 60) * HOUR_H : null;
  const timedEvs = evs.filter(ev => ev.start_time_local && ev.start_time_local.includes("T"));
  const allDayEvs = evs.filter(ev => !ev.start_time_local || !ev.start_time_local.includes("T"));
  const weekdayName = WEEKDAYS_FULL[d.getUTCDay()];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "0 0 14px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.04em", color: "var(--text)" }}>{weekdayName}</span>
          <span style={{ width: 40, height: 40, borderRadius: "50%", display: "inline-grid", placeItems: "center", background: isToday ? "linear-gradient(135deg, #7c3aed, #6366f1)" : "transparent", color: isToday ? "#fff" : "var(--muted)", boxShadow: isToday ? "0 4px 14px rgba(99,102,241,0.4)" : "none", fontSize: "1.1rem", fontWeight: 800 }}>{dayOfMonth}</span>
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", minHeight: 36, alignItems: "flex-start", padding: "6px 0" }}>
        <div style={{ width: 72, flexShrink: 0, fontSize: "0.68rem", color: "var(--muted)", fontWeight: 600, paddingTop: 4, textAlign: "right", paddingRight: 14 }}>all‑day</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, paddingLeft: 8 }}>
          {hols.map(h=><button key={`h-${h.id}`} type="button" className="calHolidayChip" onClick={e=>onHolidayClick(h,e.currentTarget.getBoundingClientRect())}><span className="calHolidayDot"/><span className="calHolidayName">{h.name}</span></button>)}
          {allDayEvs.map(ev=><button key={ev.id} type="button" className="calEventCard" style={{textAlign:"left",cursor:"pointer"}} onClick={e=>onEventClick(ev,e.currentTarget.getBoundingClientRect())}><div className="calEventCardTitle">{ev.title}</div></button>)}
          {hols.length===0&&allDayEvs.length===0&&<div style={{height:20}}/>}
        </div>
      </div>
      <div style={{ position: "relative", overflowY: "auto", maxHeight: "calc(100vh - 320px)" }}>
        {nowTop !== null && (
          <div style={{ position: "absolute", left: 72, right: 0, top: nowTop, zIndex: 10, pointerEvents: "none", display: "flex", alignItems: "center" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--danger)", flexShrink: 0, marginLeft: -5 }} />
            <div style={{ flex: 1, height: 2, background: "var(--danger)", opacity: 0.85 }} />
          </div>
        )}
        {Array.from({length:24},(_,h)=>(
          <div key={h} style={{display:"flex",height:HOUR_H,position:"relative"}}>
            <div style={{width:72,flexShrink:0,fontSize:"0.68rem",color:"var(--muted)",fontWeight:600,textAlign:"right",paddingRight:14,marginTop:-9}}>{formatHour(h)}</div>
            <div style={{flex:1,borderTop:h===0?"none":"1px solid var(--border)"}}/>
          </div>
        ))}
        <div style={{position:"absolute",top:0,left:72,right:0,bottom:0,pointerEvents:"none"}}>
          {timedEvs.map(ev=>{
            const pos=getEventPos(ev);
            if(!pos) return null;
            return (
              <div key={ev.id} id={`event-${ev.id}`}
                style={{position:"absolute",top:pos.top+1,height:pos.height,left:8,right:8,borderRadius:8,background:"linear-gradient(135deg, rgba(124,58,237,0.65), rgba(99,102,241,0.55))",border:"1px solid rgba(139,92,246,0.5)",padding:"5px 10px",cursor:"pointer",pointerEvents:"all",overflow:"hidden",boxShadow:"0 2px 10px rgba(139,92,246,0.25)",backdropFilter:"blur(4px)"}}
                onClick={e=>onEventClick(ev,e.currentTarget.getBoundingClientRect())}
              >
                <div style={{fontSize:"0.82rem",fontWeight:700,color:"#fff",lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ev.title}</div>
                {pos.height>38&&<div style={{fontSize:"0.71rem",color:"rgba(255,255,255,0.75)",marginTop:2}}>{formatLocalRange(ev)}{ev.timezone&&` · ${ev.timezone.split("/").pop()}`}</div>}
              </div>
            );
          })}
        </div>
      </div>
      {hols.length===0&&evs.length===0&&<div className="emptyState" style={{marginTop:20}}><p>No events or holidays on this day.</p></div>}
    </div>
  );
}

// ── Main Calendar Component ──────────────────────────────────────────────────

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [allHolidays, setAllHolidays] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [googleStatus, setGoogleStatus] = useState(null);

  // Popover state
  const [selectedEvent, setSelectedEvent] = useState(null);   // full event object (updated after fetch)
  const [eventAnchor, setEventAnchor] = useState(null);
  const [popoverParticipants, setPopoverParticipants] = useState([]);
  const [popoverAccessRole, setPopoverAccessRole] = useState("viewer");
  const [popoverLoading, setPopoverLoading] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState(null);
  const [holidayAnchor, setHolidayAnchor] = useState(null);

  const [ethiopianMap, setEthiopianMap] = useState({});
  const [calendarView, setCalendarView] = useState("gregorian");
  const [viewMode, setViewMode] = useState("month");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getUTCMonth());
  const [selectedDay, setSelectedDay] = useState(now.getUTCDate());
  const [weekDayOffset, setWeekDayOffset] = useState(now.getUTCDate() - 1);

  const [highlightedHolidayId, setHighlightedHolidayId] = useState(null);
  const [highlightedEventId, setHighlightedEventId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef(null);

  const grid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);

  // Load user profile + google status once
  useEffect(() => {
    getProfile().then(setCurrentUser).catch(() => {});
    getGoogleStatus().then(setGoogleStatus).catch(() => {});
  }, []);

  async function load() {
    setError(""); setLoading(true);
    try {
      const start = new Date(Date.UTC(year, monthIndex, 1));
      const end = new Date(Date.UTC(year, monthIndex + 1, 0));
      const fromDate = `${start.getUTCFullYear()}-${pad2(start.getUTCMonth()+1)}-${pad2(start.getUTCDate())}`;
      const toDate = `${end.getUTCFullYear()}-${pad2(end.getUTCMonth()+1)}-${pad2(end.getUTCDate())}`;
      const [eventData, holidayData, ethConversions] = await Promise.all([
        listEvents(),
        listHolidays({ from_date: fromDate, to_date: toDate }),
        Promise.all(grid.map(cell => g2e({ year: cell.gYear, month: cell.gMonth, day: cell.gDay }).then(res => ({ isoDate: cell.isoDate, ...res })))),
      ]);
      const ethMap = {};
      for (const item of ethConversions) ethMap[item.isoDate] = item;
      setEvents(eventData); setAllEvents(eventData);
      const hols = Array.isArray(holidayData) ? holidayData : [];
      setHolidays(hols); setAllHolidays(hols);
      setEthiopianMap(ethMap);
    } catch (e) { setError(e.message || "Failed to load calendar data"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [year, monthIndex]); // eslint-disable-line
  useEffect(() => { if (searchOpen && searchInputRef.current) searchInputRef.current.focus(); }, [searchOpen]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const key = toUTCDateKey(ev.start_time_utc);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return map;
  }, [events]);

  const holidaysByDay = useMemo(() => {
    const map = new Map();
    for (const h of holidays) {
      const key = toDateKeyFromDateOnly(h.resolved_date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(h);
    }
    return map;
  }, [holidays]);

  const searchResults = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return [];
    const evR = allEvents.filter(ev=>(ev.title||"").toLowerCase().includes(q)||(ev.description||"").toLowerCase().includes(q)).map(ev=>({...ev,_type:"event"}));
    const holR = allHolidays.filter(h=>(h.name||"").toLowerCase().includes(q)).map(h=>({...h,_type:"holiday"}));
    return [...evR,...holR].slice(0,30);
  }, [searchText, allEvents, allHolidays]);

  function monthLabel() {
    if (viewMode === "year") return String(year);
    if (calendarView === "gregorian" || viewMode === "day" || viewMode === "week") {
      return new Date(Date.UTC(year, monthIndex, 1)).toLocaleString(undefined, { month:"long", year:"numeric", timeZone:"UTC" });
    }
    const counts = {};
    for (const cell of grid.filter(c=>c.inCurrentMonth)) {
      const eth = ethiopianMap[cell.isoDate];
      if (!eth) continue;
      const key = `${eth.year}-${eth.month}`;
      counts[key] = (counts[key]||0)+1;
    }
    const dominant = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    if (!dominant) return "Ethiopian View";
    const [ethYear,ethMonth] = dominant[0].split("-");
    return `${ETH_MONTHS[Number(ethMonth)]||`Month ${ethMonth}`} ${ethYear}`;
  }

  function prevPeriod() {
    if (viewMode==="year"){setYear(y=>y-1);return;}
    if (viewMode==="day"){const d=new Date(Date.UTC(year,monthIndex,selectedDay-1));setYear(d.getUTCFullYear());setMonthIndex(d.getUTCMonth());setSelectedDay(d.getUTCDate());return;}
    if (viewMode==="week"){setWeekDayOffset(o=>o-7);return;}
    let m=monthIndex-1,y=year;if(m<0){m=11;y--;}setYear(y);setMonthIndex(m);
  }

  function nextPeriod() {
    if (viewMode==="year"){setYear(y=>y+1);return;}
    if (viewMode==="day"){const d=new Date(Date.UTC(year,monthIndex,selectedDay+1));setYear(d.getUTCFullYear());setMonthIndex(d.getUTCMonth());setSelectedDay(d.getUTCDate());return;}
    if (viewMode==="week"){setWeekDayOffset(o=>o+7);return;}
    let m=monthIndex+1,y=year;if(m>11){m=0;y++;}setYear(y);setMonthIndex(m);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this event?")) return;
    try { await deleteEvent(id); await load(); }
    catch (e) { window.alert(e.message||"Failed to delete event"); }
  }

  // Open event: show basic info immediately, fetch full details + participants in bg
  async function openEvent(ev, rect) {
    setSelectedEvent(ev);        // show basic info right away
    setEventAnchor(rect);
    setSelectedHoliday(null);
    setPopoverParticipants([]);
    setPopoverAccessRole("viewer");
    setPopoverLoading(true);

    try {
      // Fetch full event details + participants in parallel
      const [fullEv, participants] = await Promise.all([
        getEvent(ev.id),
        listEventParticipants(ev.id),
      ]);

      setSelectedEvent(fullEv);   // replace with full details (has reminder_minutes, description)

      const list = Array.isArray(participants) ? participants : [];
      setPopoverParticipants(list);

      // Determine access role
      if (currentUser) {
        const mine = list.find(p => (p.email ?? p.user_email ?? "").toLowerCase() === (currentUser.email || "").toLowerCase());
        if (mine) setPopoverAccessRole(mine.role);
        else if (fullEv.user_id === currentUser.id) setPopoverAccessRole("owner");
        else setPopoverAccessRole("viewer");
      }
    } catch {
      // fallback — just show what we have
      if (currentUser && ev.user_id === currentUser.id) setPopoverAccessRole("owner");
    } finally {
      setPopoverLoading(false);
    }
  }

  function openHoliday(h, rect) { setSelectedHoliday(h); setHolidayAnchor(rect); setSelectedEvent(null); }

  async function handleGoogleExport(eventId) {
    await exportEventToGoogle(Number(eventId));
  }

  async function handleGoogleConnect() {
    try { const data = await getGoogleConnectUrl(); window.location.href = data.auth_url; } catch { }
  }

  function handleSearchResultClick(item) {
    setSearchOpen(false); setSearchText("");
    if (item._type === "event") {
      const d = new Date(item.start_time_utc+"Z");
      setYear(d.getUTCFullYear()); setMonthIndex(d.getUTCMonth());
      setViewMode("month");
      setHighlightedEventId(item.id);
      setTimeout(()=>{ document.getElementById(`event-${item.id}`)?.scrollIntoView({behavior:"smooth",block:"center"}); },120);
      setTimeout(()=>setHighlightedEventId(null),2500);
    } else {
      if (item.resolved_date) {
        const d = new Date(`${item.resolved_date}T00:00:00`);
        setYear(d.getFullYear()); setMonthIndex(d.getMonth());
        setViewMode("month");
        setHighlightedHolidayId(item.id);
        setTimeout(()=>{ document.getElementById(`holiday-${item.id}`)?.scrollIntoView({behavior:"smooth",block:"center"}); },200);
        setTimeout(()=>setHighlightedHolidayId(null),2500);
      }
    }
  }

  const showSearchPanel = searchOpen && searchText.trim().length > 0;

  return (
    <div className="page" style={{ position: "relative" }}>

      {/* Toolbar */}
      <div className="calBar">
        <div className="calBarLeft">
          <h2 className="calBigLabel">{monthLabel()}</h2>
          <div className="calNavGroup">
            <button className="calNavBtn" onClick={prevPeriod}><ChevronLeft /></button>
            <button className="calNavBtn" onClick={nextPeriod}><ChevronRight /></button>
          </div>
          <div className="calTabs">
            {["Day","Week","Month","Year"].map(v=>(
              <button key={v} className={`calTab ${viewMode===v.toLowerCase()?"calTabActive":""}`} onClick={()=>setViewMode(v.toLowerCase())}>{v}</button>
            ))}
          </div>
        </div>

        <div className="calBarRight">
          <div className="calToggle">
            <button className={`calToggleBtn ${calendarView==="gregorian"?"calToggleBtnActive":""}`} onClick={()=>setCalendarView("gregorian")}>Gregorian</button>
            <button className={`calToggleBtn ${calendarView==="ethiopian"?"calToggleBtnActive":""}`} onClick={()=>setCalendarView("ethiopian")}>Ethiopian</button>
          </div>
          {!searchOpen ? (
            <button className="calSearchIconBtn" onClick={()=>setSearchOpen(true)} title="Search"><SearchIcon /></button>
          ) : (
            <div className="calSearchInput">
              <SearchIcon />
              <input ref={searchInputRef} value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="Search events & holidays…" onKeyDown={e=>e.key==="Escape"&&(setSearchOpen(false),setSearchText(""))}/>
              <button onClick={()=>{setSearchOpen(false);setSearchText("");}}><CloseIcon /></button>
            </div>
          )}
        </div>
      </div>

      {/* Search panel */}
      {showSearchPanel&&(
        <div className="calSearchPanel">
          <div className="calSearchPanelHead">{searchResults.length} result{searchResults.length!==1?"s":""} for "{searchText}"</div>
          {searchResults.length===0?(<div className="calSearchEmpty">No matching events or holidays.</div>):(
            <div className="calSearchList">
              {searchResults.map((item,i)=>(
                <button key={`${item._type}-${item.id}-${i}`} type="button" className="calSearchItem" onClick={()=>handleSearchResultClick(item)}>
                  <div className="calSearchItemDot" style={{background:item._type==="holiday"?"var(--success)":"var(--accent)"}}/>
                  <div className="calSearchItemBody">
                    <div className="calSearchItemTitle">{item._type==="event"?item.title:item.name}</div>
                    <div className="calSearchItemMeta">{item._type==="event"?formatUTCDateLabel(item.start_time_utc):formatDateOnlyLabel(item.resolved_date)}</div>
                  </div>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,color:"var(--muted)",marginLeft:"auto"}}><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error&&<div className="alert alertDanger" style={{marginBottom:14}}>{error}</div>}
      {loading&&<div className="calLoading"><span className="spinner"/><span>Loading calendar…</span></div>}

      {!loading&&!error&&(
        <>
          {viewMode==="month"&&(
            <div className="calGridWrap">
              <div className="gridHeader">{WEEKDAYS.map(w=><div key={w} className="gridHeaderCell">{w}</div>)}</div>
              <div className="monthGrid">
                {grid.map(cell=>{
                  const dayEvents=eventsByDay.get(cell.isoDate)||[];
                  const dayHolidays=holidaysByDay.get(cell.isoDate)||[];
                  const today=isTodayUTC(cell.isoDate);
                  const eth=ethiopianMap[cell.isoDate];
                  const isEmpty=dayEvents.length===0&&dayHolidays.length===0;
                  return (
                    <div key={cell.key} className={["dayCell",!cell.inCurrentMonth&&"dayCellOther",today&&"dayCellToday"].filter(Boolean).join(" ")}>
                      <div className="dayTop">
                        <div className={`dayNum ${today?"dayNumToday":""}`} style={{cursor:"pointer"}} onClick={()=>{setSelectedDay(cell.dayNumber);setViewMode("day");}}>
                          {calendarView==="gregorian"?cell.dayNumber:(ethiopianMap[cell.isoDate]?.day??cell.dayNumber)}
                        </div>
                        <div className="dayMeta">
                          {calendarView==="ethiopian"&&eth?<><span>{ETH_MONTHS[eth.month]||eth.month}</span><br/><span>{eth.year}</span></>:null}
                        </div>
                      </div>
                      <div className="eventsCol">
                        {dayHolidays.map(h=>(
                          <button key={`h-${h.id}`} id={`holiday-${h.id}`} type="button"
                            className={`calHolidayChip ${highlightedHolidayId===h.id?"calHolidayChipHighlighted":""}`}
                            onClick={e=>openHoliday(h,e.currentTarget.getBoundingClientRect())}
                          >
                            <span className="calHolidayDot"/><span className="calHolidayName">{h.name}</span>
                          </button>
                        ))}
                        {dayEvents.map(ev=>(
                          <div key={ev.id} id={`event-${ev.id}`}
                            className={`calEventCard ${highlightedEventId===ev.id?"calEventCardHighlighted":""}`}
                            style={{cursor:"pointer"}}
                            onClick={e=>openEvent(ev,e.currentTarget.getBoundingClientRect())}
                          >
                            <div className="calEventCardTitle">{ev.title}</div>
                            {formatLocalRange(ev)&&(
                              <div className="calEventCardTime">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                {formatLocalRange(ev)}
                                {ev.timezone&&<span className="calEventTz">{ev.timezone.split("/").pop()}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                        {isEmpty&&cell.inCurrentMonth&&<div className="calEmptyDay"/>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {viewMode==="day"&&<DayView year={year} monthIndex={monthIndex} dayOfMonth={selectedDay} eventsByDay={eventsByDay} holidaysByDay={holidaysByDay} onEventClick={openEvent} onHolidayClick={openHoliday}/>}
          {viewMode==="week"&&<WeekView year={year} monthIndex={monthIndex} dayOffset={weekDayOffset} eventsByDay={eventsByDay} holidaysByDay={holidaysByDay} onEventClick={openEvent} onHolidayClick={openHoliday}/>}
          {viewMode==="year"&&<YearView year={year} eventsByDay={eventsByDay} holidaysByDay={holidaysByDay} onMonthClick={mi=>{setMonthIndex(mi);setViewMode("month");}}/>}
        </>
      )}

      {selectedHoliday&&<HolidayPopover holiday={selectedHoliday} anchor={holidayAnchor} onClose={()=>setSelectedHoliday(null)}/>}
      {selectedEvent&&(
        <EventPopover
          ev={selectedEvent}
          anchor={eventAnchor}
          participants={popoverParticipants}
          accessRole={popoverAccessRole}
          loading={popoverLoading}
          googleStatus={googleStatus}
          onClose={()=>setSelectedEvent(null)}
          onDelete={handleDelete}
          onGoogleExport={handleGoogleExport}
          onGoogleConnect={handleGoogleConnect}
        />
      )}
    </div>
  );
}