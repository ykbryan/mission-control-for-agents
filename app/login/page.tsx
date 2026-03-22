"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addRouter, removeRouter } from "@/app/actions/auth";

interface RouterInfo {
  id: string;
  url: string;
  label: string;
}

export default function LoginPage() {
  const [routers, setRouters] = useState<RouterInfo[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/routers")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.routers)) setRouters(data.routers);
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Verify connection first
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

      // Add the router via server action
      const id = crypto.randomUUID();
      await addRouter({ id, url, token, label: label || url });

      // Update local state (without token for display)
      setRouters(prev => [...prev.filter(r => r.id !== id), { id, url, label: label || url }]);
      setLabel("");
      setUrl("");
      setToken("");
    } catch {
      setError("Could not reach router");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    await removeRouter(id);
    setRouters(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="text-3xl mb-3">🌐</div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-1">Connections Manager</h1>
          <p className="text-sm text-zinc-400">Connect to one or more OpenClaw AI agent gateways via your router process.</p>
        </div>

        {/* Connected Routers */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3">Connected Routers</h2>
          {initialLoading ? (
            <div className="text-sm text-zinc-500 animate-pulse">Loading…</div>
          ) : routers.length === 0 ? (
            <div className="border border-zinc-800 rounded-xl p-4 text-sm text-zinc-500 text-center">
              No routers connected yet. Add one below.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {routers.map(r => (
                <div key={r.id} className="flex items-center justify-between border border-zinc-800 rounded-xl px-4 py-3 bg-zinc-900">
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-zinc-100 text-sm">{r.label}</span>
                    <span className="text-xs text-zinc-500 truncate">{r.url}</span>
                  </div>
                  <button
                    onClick={() => handleRemove(r.id)}
                    className="ml-4 text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-950 flex-shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Router Form */}
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900 mb-6">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-4">Add Router</h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Label <span className="text-zinc-600">(optional)</span></label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Home Server"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Router URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="http://localhost:3010"
                required
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Router Token</label>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Token shown when the router starts"
                required
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
            >
              {loading ? "Verifying & connecting…" : "Connect Router"}
            </button>
          </form>
        </div>

        {/* Dashboard button */}
        {routers.length > 0 && (
          <button
            onClick={() => router.push("/")}
            className="w-full border border-zinc-700 hover:border-zinc-500 text-zinc-200 hover:text-white font-medium text-sm py-2.5 rounded-xl transition-colors"
          >
            Open Dashboard →
          </button>
        )}
      </div>
    </div>
  );
}
