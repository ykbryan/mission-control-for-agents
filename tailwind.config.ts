import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Omega-locked constrained palette
        zinc: {
          950: '#09090b',
        },
        surface: '#111118',
        accent: '#5b79ff',
        'text-primary': '#f9fafb',
        'text-secondary': '#6b7280',
        divide: '#1f2937',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Satoshi', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
