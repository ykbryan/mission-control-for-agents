import type { Metadata } from 'next'
import { siteConfig } from '@/lib/site'
import '@/app/globals.css'

export const metadata: Metadata = {
  title: {
    default: siteConfig.title,
    template: `%s — ${siteConfig.title}`,
  },
  description: siteConfig.description,
  // Zero telemetry: no verification tags, no analytics metadata
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  return (
    <html lang="en" className="dark">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={csp} />
      </head>
      <body className="bg-zinc-950 text-text-primary antialiased">
        {children}
      </body>
    </html>
  )
}
