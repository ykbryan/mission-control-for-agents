import { siteConfig } from '@/lib/site'
import { StaggerContainer, StaggerItem } from '@/components/motion/StaggerContainer'

// Server Component: data fetched server-side, animation wrapper is client island
export function FeatureGrid() {
  return (
    <section className="py-24 px-6 border-t border-divide">
      <div className="max-w-6xl mx-auto">
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-px bg-divide">
          {siteConfig.features.map((feature) => (
            <StaggerItem
              key={feature.id}
              className="bg-zinc-950 p-8 flex flex-col gap-4 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-sm"
            >
              <h3 className="font-sans text-sm font-semibold uppercase tracking-widest text-accent">
                {feature.title}
              </h3>
              <p className="font-sans text-text-secondary text-sm leading-relaxed">
                {feature.description}
              </p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}
