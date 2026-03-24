import { siteConfig } from '@/lib/site'
import { FadeUp } from '@/components/motion/FadeUp'

// Server Component: content from lib/site, animation is a client island
export function Hero() {
  return (
    <section className="relative min-h-[60vh] flex items-center px-6 py-32 border-b border-divide overflow-hidden">
      {/* 1px grid lines — Kat-spec */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #1f2937 1px, transparent 1px), linear-gradient(to bottom, #1f2937 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div className="relative max-w-6xl mx-auto w-full">
        <FadeUp delay={0}>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-secondary mb-6">
            Mission Control — Initializing
          </p>
        </FadeUp>
        <FadeUp delay={0.1}>
          <h1 className="font-sans text-5xl md:text-7xl font-bold text-text-primary tracking-tight leading-none mb-6">
            {siteConfig.title}
          </h1>
        </FadeUp>
        <FadeUp delay={0.2}>
          <p className="font-sans text-lg text-text-secondary max-w-xl leading-relaxed">
            {siteConfig.subtitle}{' '}
            <span className="text-text-primary">{siteConfig.description}</span>
          </p>
        </FadeUp>
      </div>
    </section>
  )
}
