"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";

export default function LoginPage() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (url && token) {
      Cookies.set("gatewayUrl", url, { expires: 7 });
      Cookies.set("gatewayToken", token, { expires: 7 });
      router.push("/");
    }
  };

  return (
    <div style={{ padding: "50px", maxWidth: "400px", margin: "0 auto", fontFamily: "monospace" }}>
      <h1>Gateway Login</h1>
      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        <div>
          <label>Gateway URL:</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8000"
            required
            style={{ width: "100%", padding: "8px", marginTop: "5px" }}
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
            style={{ width: "100%", padding: "8px", marginTop: "5px" }}
          />
        </div>
        <button type="submit" style={{ padding: "10px", cursor: "pointer", background: "#333", color: "white", border: "none" }}>
          Connect
        </button>
      </form>
    </div>
  );
}
