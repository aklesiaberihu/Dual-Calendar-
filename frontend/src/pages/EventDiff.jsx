import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useParams } from "react-router-dom";
import { getEventDiff } from "../api";

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
    </svg>
  );
}

function FieldIcon({ field }) {
  const icons = {
    title: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    ),
    description: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>
      </svg>
    ),
    start_time_utc: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    timezone: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
  };
  return icons[field] || (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>
  );
}

function formatFieldName(field) {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && value.includes("T") && value.includes(":")) {
    try {
      return new Date(value).toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return value;
    }
  }
  return String(value);
}

function ChangeCard({ change, index }) {
  const fromEmpty = change.from === null || change.from === undefined || change.from === "";
  const toEmpty = change.to === null || change.to === undefined || change.to === "";
  const changeType = fromEmpty ? "added" : toEmpty ? "removed" : "modified";

  return (
    <div className="diffCard">
      <div className="diffCardHeader">
        <div className="diffCardField">
          <span className="diffFieldIcon"><FieldIcon field={change.field} /></span>
          <span className="diffFieldName">{formatFieldName(change.field)}</span>
        </div>
        <span className={`badge ${
          changeType === "added" ? "badgeSuccess" :
          changeType === "removed" ? "badgeDanger" :
          "badgeAccent"
        }`}>
          {changeType}
        </span>
      </div>

      <div className="diffCardBody">
        <div className="diffValueBlock diffValueFrom">
          <div className="diffValueLabel">
            <span className="diffValueDot diffValueDotFrom" />
            Before
          </div>
          <div className="diffValueContent diffValueContentFrom">
            {formatValue(change.from)}
          </div>
        </div>

        <div className="diffArrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </div>

        <div className="diffValueBlock diffValueTo">
          <div className="diffValueLabel">
            <span className="diffValueDot diffValueDotTo" />
            After
          </div>
          <div className="diffValueContent diffValueContentTo">
            {formatValue(change.to)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EventDiff() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const [fromV, setFromV] = useState(searchParams.get("from") || "");
  const [toV, setToV] = useState(searchParams.get("to") || "");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadDiff(e) {
    if (e) e.preventDefault();
    setError("");
    setResult(null);

    if (!fromV || !toV) {
      setError("Please enter both version numbers.");
      return;
    }
    if (Number(fromV) === Number(toV)) {
      setError("Choose two different versions to compare.");
      return;
    }

    setLoading(true);
    try {
      const data = await getEventDiff(Number(id), Number(fromV), Number(toV));
      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to load diff");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fromV && toV) loadDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeCount = useMemo(() => Array.isArray(result?.changes) ? result.changes.length : 0, [result]);

  const sortedVersions = useMemo(() => {
    const a = Number(fromV), b = Number(toV);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return { older: Math.min(a, b), newer: Math.max(a, b) };
  }, [fromV, toV]);

  return (
    <div className="page pageNarrow">
      <div className="pageHeader">
        <div className="pageHeaderBlock">
          <div className="pageEyebrow"><HistoryIcon /> Version history</div>
          <h1 className="h1">Event change history</h1>
          <p className="sub">
            Compare any two saved versions of this event and inspect exactly
            what changed field by field.
          </p>
        </div>
        <div className="pageActions">
          <Link to={`/events/${id}/edit`}>
            <button className="btn btnSm">← Back to event</button>
          </Link>
        </div>
      </div>

      <div className="stack">
        {/* Stats */}
        <div className="diffStatsRow">
          <div className="statCard">
            <div className="statLabel">Event ID</div>
            <div className="statValue" style={{ fontSize: "1.3rem" }}>{id}</div>
          </div>
          <div className="statCard">
            <div className="statLabel">Comparing</div>
            <div className="statValue" style={{ fontSize: "1.3rem" }}>
              {fromV && toV ? `v${fromV} → v${toV}` : "—"}
            </div>
          </div>
          <div className="statCard">
            <div className="statLabel">Changes found</div>
            <div className="statValue" style={{ fontSize: "1.3rem", color: changeCount > 0 ? "var(--warning)" : "inherit" }}>
              {result ? changeCount : "—"}
            </div>
          </div>
        </div>

        {/* Version selector */}
        <div className="sectionCard sectionCardPad">
          <div className="sectionHead">
            <div>
              <h3 className="sectionTitle">Select versions to compare</h3>
              <p className="sectionSub">Enter the version numbers you want to inspect.</p>
            </div>
            <span className="badge">Diff</span>
          </div>

          <form onSubmit={loadDiff} className="diffForm">
            <div className="diffInputGroup">
              <label className="label">
                From version
                <input
                  className="input"
                  placeholder="e.g. 1"
                  value={fromV}
                  onChange={(e) => setFromV(e.target.value)}
                  type="number"
                  min="1"
                />
              </label>
              <div className="diffFormArrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </div>
              <label className="label">
                To version
                <input
                  className="input"
                  placeholder="e.g. 2"
                  value={toV}
                  onChange={(e) => setToV(e.target.value)}
                  type="number"
                  min="1"
                />
              </label>
            </div>

            {sortedVersions && !error && (
              <div className="alert alertInfo" style={{ fontSize: "0.88rem" }}>
                Comparing version <strong>v{sortedVersions.older}</strong> →{" "}
                <strong>v{sortedVersions.newer}</strong>
              </div>
            )}

            {error && <div className="alert alertDanger">{error}</div>}

            <button className="btn btnPrimary" type="submit" disabled={loading} style={{ alignSelf: "flex-start" }}>
              {loading ? (
                <><span className="spinner" style={{ width: 15, height: 15, borderTopColor: "#fff" }} /> Comparing…</>
              ) : (
                <><HistoryIcon /> Compare versions</>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        {result && (
          <div className="stack">
            {/* Digest */}
            <div className="sectionCard sectionCardPad">
              <div className="sectionHead">
                <div>
                  <h3 className="sectionTitle">Summary</h3>
                  <p className="sectionSub">High-level overview of what changed.</p>
                </div>
                <span className={`badge ${changeCount > 0 ? "badgeWarning" : "badgeSuccess"}`}>
                  {changeCount} {changeCount === 1 ? "change" : "changes"}
                </span>
              </div>

              <div className="diffDigest">
                {result.digest || "No changes detected between these versions."}
              </div>
            </div>

            {/* Field changes */}
            {changeCount > 0 ? (
              <div className="stack">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 className="sectionTitle" style={{ margin: 0 }}>Field-level changes</h3>
                  <span className="hint">{changeCount} field{changeCount !== 1 ? "s" : ""} modified</span>
                </div>
                {result.changes.map((change, i) => (
                  <ChangeCard key={i} change={change} index={i} />
                ))}
              </div>
            ) : (
              <div className="emptyState">
                <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>✓</div>
                <strong>No differences found</strong>
                <p>These two versions are identical.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}