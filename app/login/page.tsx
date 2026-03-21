"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";

export default function LoginPage() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (url && token) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, token }),
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Authentication failed");
        }
        
        Cookies.set("gatewayUrl", url, { expires: 7 });
        Cookies.set("gatewayToken", token, { expires: 7 });
        router.push("/");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div style={{ padding: "50px", maxWidth: "400px", margin: "0 auto", fontFamily: "monospace" }}>
      <h1>Gateway Login</h1>
      {error && <div style={{ color: "red", padding: "10px", marginBottom: "15px", border: "1px solid red", background: "#ffcccc", borderRadius: "5px" }}>{error}</div>}
      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        <div>
          <label>Gateway URL:</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8000"
            required
            style={{ width: "100%", padding: "8px", marginTop: "5px", color: "black" }}
          />
        </div>
        <div>
          <label>Gateway Token:</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token"
            required
            style={{ width: "100%", padding: "8px", marginTop: "5px", color: "black" }}
          />
        </div>
        <button type="submit" disabled={loading} style={{ padding: "10px", cursor: loading ? "not-allowed" : "pointer", background: "#333", color: "white", border: "none" }}>
          {loading ? "Verifying..." : "Connect"}
        </button>
      </form>
    </div>
  );
}
