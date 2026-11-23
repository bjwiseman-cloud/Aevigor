import animate from 'tailwindcss-animate';
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        serif: ['"Shippori Mincho"', '"Hiragino Mincho ProN"', '"Times New Roman"', 'Georgia', 'serif'],
        sans: ['"Zen Kaku Gothic New"', '"Segoe UI"', 'system-ui', '-apple-system', 'Helvetica', 'Arial', 'sans-serif'],
        // Sporty display face for statuses, card titles and big numbers (Ben 2026-11-23: livelier, cycling-app feel)
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace']
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        // Status colours, set per theme in index.css
        status: Object.fromEntries(['go', 'ok', 'caution', 'easy', 'none', 'deload', 'warn'].map((k) => [k, `hsl(var(--status-${k}) / <alpha-value>)`]))
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        pop: { '0%': { opacity: '0', transform: 'scale(0.85) translateY(8px)' }, '70%': { opacity: '1', transform: 'scale(1.04)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        shine: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
        breathe: { '0%, 100%': { opacity: '0.55', transform: 'scale(1)' }, '50%': { opacity: '0.9', transform: 'scale(1.08)' } },
        'spin-slow': { to: { transform: 'translate(-50%, -50%) rotate(360deg)' } },
        confetti: { '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' }, '100%': { transform: 'translateY(115vh) rotate(720deg)', opacity: '0.7' } },
        burst: { '0%': { opacity: '0', transform: 'scale(0.3) rotate(-8deg)' }, '60%': { opacity: '1', transform: 'scale(1.12) rotate(2deg)' }, '100%': { opacity: '1', transform: 'scale(1) rotate(0)' } }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out', 'accordion-up': 'accordion-up 0.2s ease-out',
        pop: 'pop 0.5s cubic-bezier(.2,.9,.3,1.2) both', float: 'float 3s ease-in-out infinite',
        shine: 'shine 3s linear infinite', breathe: 'breathe 3.5s ease-in-out infinite',
        'spin-slow': 'spin-slow 24s linear infinite', confetti: 'confetti 3s linear infinite', burst: 'burst 0.7s cubic-bezier(.2,.9,.3,1.3) both'
      }
    }
  },
  plugins: [animate]
};
