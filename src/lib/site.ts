import type { SiteConfig } from '@/types/site'

export const siteConfig: SiteConfig = {
  title: 'Claw Base HQ',
  subtitle: 'The Mission Control for the Claw network.',
  description: 'Zero telemetry. Zero compromise.',
  features: [
    {
      id: 'feature-dashboard',
      title: 'One Dashboard to Rule Them All',
      description:
        'Looker consolidates all your metrics into a single, unified mission control center.',
    },
    {
      id: 'feature-scale',
      title: 'Enterprise & Hobbyist Ready',
      description:
        'Scalable architecture designed for both massive enterprises and solo operators alike.',
    },
    {
      id: 'feature-privacy',
      title: 'Zero-Telemetry Privacy',
      description:
        'Built with strictly zero tracking. Your data stays inside your mission control.',
    },
  ],
}
