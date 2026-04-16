import { useEffect, useState } from "react";
import { loginUser, registerUser, setToken, getGoogleLoginUrl } from "../api";
import { useNavigate, useSearchParams } from "react-router-dom";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function Login() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [calendarScope, setCalendarScope] = useState(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const google = searchParams.get("google");
    const reason = searchParams.get("reason");
    const scope = searchParams.get("calendar_scope");

    if (token) {
      setToken(token);
      nav("/app", { replace: true });
      return;
    }

    if (google === "connected") {
      setCalendarScope(scope);
      setMsg(
        scope === "granted"
          ? "Google account connected with calendar access."
          : "Google connected. Reconnect in Settings to enable calendar export."
      );
      setError("");
    }

    if (google === "error") {
      setError(reason || "Google login failed.");
      setMsg("");
    }
  }, [searchParams, nav]);

  function switchMode(m) {
    setMode(m);
    setError("");
    setMsg("");
    setCalendarScope(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setMsg(""); setLoading(true);
    try {
      if (mode === "register") {
        await registerUser({
          email, full_name: fullName, password,
          preferred_calendar: "gregorian", timezone: "UTC", language: "en",
        });
        setMsg("Account created. You can now sign in.");
        setMode("login");
        setPassword("");
        setLoading(false);
        return;
      }
      const data = await loginUser(email, password);
      setToken(data.access_token);
      nav("/app");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(""); setMsg(""); setGoogleLoading(true);
    try {
      const data = await getGoogleLoginUrl();
      window.location.href = data.auth_url;
    } catch (err) {
      setError(err.message || "Failed to start Google sign-in.");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="loginShell">
      {/* Left — branding only */}
      <div className="loginLeft">
        <div className="loginLeftInner">
          <div className="loginBrand">
            <div className="loginBrandMark">Z</div>
            <span>Zemen</span>
          </div>

          <div className="loginHero">
            <h2 className="loginHeroTitle">
              Schedule across two calendars, seamlessly.
            </h2>
            <p className="loginHeroSub">
              Zemen combines Ethiopian and Gregorian calendar support with
              collaborative event management, conflict detection, and smart
              scheduling — all in one workspace.
            </p>
          </div>
        </div>
      </div>

      {/* Right — form only */}
      <div className="loginRight">
        <div className="loginCard">
          <div className="loginCardHead">
            <h1 className="loginCardTitle">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h1>
            <p className="loginCardSub">
              {mode === "login"
                ? "Sign in to your workspace."
                : "Get started with Zemen for free."}
            </p>
          </div>

          <div className="segmented authSegmented">
            <button
              type="button"
              className={`segmentedBtn ${mode === "login" ? "segmentedBtnActive" : ""}`}
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`segmentedBtn ${mode === "register" ? "segmentedBtnActive" : ""}`}
              onClick={() => switchMode("register")}
            >
              Register
            </button>
          </div>

          {mode === "login" && (
            <>
              <button
                type="button"
                className="btn loginGoogleBtn"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
              >
                {googleLoading ? (
                  <><span className="spinner" style={{ width: 16, height: 16 }} /> Redirecting…</>
                ) : (
                  <><GoogleIcon /> Continue with Google</>
                )}
              </button>
              <div className="authDivider">
                <span>or sign in with email</span>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="stack">
            {mode === "register" && (
              <label className="label">
                Full name
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </label>
            )}

            <label className="label">
              Email address
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                required
                autoComplete="email"
              />
            </label>

            <label className="label">
              Password
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Choose a password" : "Your password"}
                type="password"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>

            <button
              className="btn btnPrimary authSubmitBtn"
              type="submit"
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading ? (
                <><span className="spinner" style={{ width: 16, height: 16, borderTopColor: "#fff" }} />
                {mode === "login" ? "Signing in…" : "Creating account…"}</>
              ) : (
                mode === "login" ? "Sign in" : "Create account"
              )}
            </button>
          </form>

          {msg && (
            <div className={`alert ${calendarScope === "missing" ? "alertWarning" : "alertSuccess"}`}>
              {msg}
            </div>
          )}

          {error && (
            <div className="alert alertDanger">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}