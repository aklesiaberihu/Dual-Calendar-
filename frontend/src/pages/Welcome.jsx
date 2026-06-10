import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    title: "Dual calendar",
    desc: "View and manage events in both Ethiopian and Gregorian calendars simultaneously.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Shared events",
    desc: "Collaborate with teammates using roles and permissions. Owner, editor, or viewer.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
    ),
    title: "Date conversion",
    desc: "Instantly convert any date between Ethiopian and Gregorian calendar systems.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    title: "Smart scheduling",
    desc: "Conflict detection across participants with automatic time slot suggestion and ranking.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
    title: "Email reminders",
    desc: "Get notified before events with customizable reminder times sent to your inbox.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: "Version history",
    desc: "Track every change to shared events with field-level diff and full version history.",
  },
];

const STATS = [
  { value: "2", label: "Calendar systems" },
  { value: "13", label: "Ethiopian months" },
  { value: "∞", label: "Timezones" },
  { value: "100%", label: "Open source" },
];

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

export default function Welcome() {
  const [heroVisible, setHeroVisible] = useState(false);
  const [featRef, featVisible] = useInView();
  const [statsRef, statsVisible] = useInView();

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="welcomeShell">

      <header className="welcomeTopbar">
        <div className="welcomeTopbarLeft">
          <div className="welcomeTopbarMark">Z</div>
          <div className="welcomeBrand">Zemen</div>
        </div>
        <div className="welcomeTopbarRight">
          <Link to="/login" className="btn btnGhost btnSm">Sign in</Link>
          <Link to="/login" className="btn btnPrimary btnSm">Get started</Link>
        </div>
      </header>

      <main>

        <section className={`wHero ${heroVisible ? "wHeroVisible" : ""}`}>
          <div className="wHeroBg" aria-hidden="true">
            <div className="wHeroOrb wHeroOrb1" />
            <div className="wHeroOrb wHeroOrb2" />
            <div className="wHeroOrb wHeroOrb3" />
            <div className="wHeroGrid" />
          </div>

          <div className="wHeroInner">
            <div className="wHeroEyebrow">
              <span className="welcomeEyebrowDot" />
              Dual-calendar scheduling platform
            </div>

            <h1 className="wHeroTitle">
              Schedule across<br />
              <span className="wHeroTitleAccent">Ethiopian & Gregorian</span><br />
              calendars
            </h1>

            <p className="wHeroSub">
              Zemen is a collaborative scheduling platform built for teams
              and individuals who work across Ethiopian and Gregorian calendar
              systems, with smart scheduling, conflict detection, and version history.
            </p>
          </div>
        </section>

        <section className="wStats" ref={statsRef}>
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`wStat ${statsVisible ? "wStatVisible" : ""}`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="wStatValue">{s.value}</div>
              <div className="wStatLabel">{s.label}</div>
            </div>
          ))}
        </section>

        <section className="wFeatures" ref={featRef}>
          <div className="wFeaturesHead">
            <div className="pageEyebrow">Features</div>
            <h2 className="wFeaturesTitle">Everything in one workspace</h2>
            <p className="wFeaturesSub">
              Built with real algorithmic complexity, not just date formatting.
            </p>
          </div>

          <div className="wFeaturesGrid">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`wFeatureCard ${featVisible ? "wFeatureCardVisible" : ""}`}
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="wFeatureIcon">{f.icon}</div>
                <div className="wFeatureTitle">{f.title}</div>
                <div className="wFeatureDesc">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="welcomeFooter">
        <div className="welcomeFooterBrand">Zemen</div>
        <div className="welcomeFooterSub">Dual-calendar scheduling · Ethiopian & Gregorian</div>
      </footer>
    </div>
  );
}