"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";

export default function LoginPage() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routerUrl: url, routerToken: token }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Authentication failed");
        return;
      }
      Cookies.set("routerUrl", url, { expires: 7 });
      Cookies.set("routerToken", token, { expires: 7 });
      router.push("/");
    } catch {
      setError("Could not reach router");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "50px", maxWidth: "440px", margin: "0 auto", fontFamily: "monospace" }}>
      <h1>Connect to Router</h1>
      <p style={{ color: "#666", fontSize: "13px", marginBottom: "20px" }}>
        Run the Mission Control Router on the same machine as your OpenClaw gateway,
        then enter its URL and token below.
      </p>
      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        <div>
          <label>Router URL:</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3010"
            required
            style={{ width: "100%", padding: "8px", marginTop: "5px", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label>Router Token:</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token shown when the router starts"
            required
            style={{ width: "100%", padding: "8px", marginTop: "5px", boxSizing: "border-box" }}
          />
        </div>
        {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px",
            cursor: loading ? "not-allowed" : "pointer",
            background: "#333",
            color: "white",
            border: "none",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Connecting..." : "Connect"}
        </button>
      </form>
    </div>
  );
}
