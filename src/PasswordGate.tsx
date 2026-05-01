import { useState } from "react";

const CORRECT_PASSWORD = "tyson123";
const STORAGE_KEY = "app_auth";

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "1"
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  if (authenticated) {
    return <>{children}</>;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input === CORRECT_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, "1");
      setAuthenticated(true);
    } else {
      setError(true);
      setInput("");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", backgroundColor: "#0a0a0a" }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "32px", background: "#1a1a1a", borderRadius: "8px" }}>
        <h2 style={{ color: "#fff", textAlign: "center" }}>Trader Pulse AI</h2>
        <input type="password" value={input} onChange={(e) => { setInput(e.target.value); setError(false); }} placeholder="Password" />
        {error && <p style={{ color: "red" }}>Incorrect password</p>}
        <button type="submit">Enter</button>
      </form>
    </div>
  );
}
