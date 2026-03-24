// Marketing entry — Server Component (default)
import { Hero } from '@/components/server/Hero'
import { FeatureGrid } from '@/components/server/FeatureGrid'

export default function MarketingHomePage() {
  return (
    <main className="min-h-screen bg-zinc-950">
      <Hero />
      <FeatureGrid />
    </main>
  )
}
