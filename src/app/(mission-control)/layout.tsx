// Mission Control route group — protected by RBAC middleware
export default function MissionControlLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <nav className="border-b border-divide px-6 py-4 flex items-center justify-between">
        <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">
          CLAWBASE // MISSION CONTROL
        </span>
        <span className="font-mono text-xs text-accent uppercase tracking-widest">
          SECURE CHANNEL
        </span>
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  )
}
