import { useEffect, useState } from "react";

function App() {
  const [status, setStatus] = useState("Checking backend...");

  useEffect(() => {
    fetch("http://localhost:8000/health")
      .then((r) => r.json())
      .then((data) => setStatus(`Backend says: ${data.status}`))
      .catch(() => setStatus("Could not reach backend"));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Dual Calendar</h1>
      <p>{status}</p>
    </div>
  );
}

export default App;
