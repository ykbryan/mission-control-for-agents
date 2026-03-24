// Mission Control dashboard root — Server Component
export default function MissionControlPage() {
  return (
    <main className="px-6 py-16">
      <div className="max-w-6xl mx-auto">
        <p className="font-mono text-xs text-text-secondary uppercase tracking-widest mb-8">
          SYSTEM STATUS // NOMINAL
        </p>
        <h1 className="font-sans text-4xl font-bold text-text-primary mb-2">
          Mission Control
        </h1>
        <p className="font-sans text-text-secondary">
          Operational dashboard — agent monitoring, trace logs, and swarm config.
        </p>
      </div>
    </main>
  )
}
