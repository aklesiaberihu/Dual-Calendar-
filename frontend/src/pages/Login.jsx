import { useState } from "react";
import { loginUser, registerUser, setToken } from "../api";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();

  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("pass1234");
  const [fullName, setFullName] = useState("Test User");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMsg("");

    try {
      if (mode === "register") {
        await registerUser({
          email,
          full_name: fullName,
          password,
          preferred_calendar: "gregorian",
          timezone: "UTC",
          language: "en",
        });
        setMsg("Registered. Now switch to Login.");
        return;
      }

      const data = await loginUser(email, password);
      setToken(data.access_token);
      nav("/");
    } catch (err) {
      setError(err.message || "Failed");
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <h2>{mode === "login" ? "Login" : "Register"}</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMode("login")} type="button">Login</button>
        <button onClick={() => setMode("register")} type="button">Register</button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "register" && (
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
        )}

        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />

        <button type="submit">{mode === "login" ? "Login" : "Register"}</button>
      </form>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      {error && <p style={{ marginTop: 12 }}>Error: {error}</p>}

      <p style={{ marginTop: 16 }}>Tip: If you already registered earlier, use Login mode.</p>
    </div>
  );
}
