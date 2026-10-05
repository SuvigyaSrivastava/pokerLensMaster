/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // legacy tokens used by the classic snapshot screen
        felt: { DEFAULT: '#0D1B0F', surface: '#1A2E1C' },
        poker: { green: '#00C853', gold: '#FFD700', danger: '#FF4444' },
        // design system
        ink: { DEFAULT: '#0A0B0D', 900: '#0A0B0D', 800: '#111316', 700: '#16191D', 600: '#1D2126', 500: '#272C33' },
        line: 'rgba(255,255,255,0.08)',
        fg: { DEFAULT: '#EDEEF0', muted: '#9BA1AB', dim: '#666C76' },
        mint: { DEFAULT: '#2EE59D', dim: '#1FA772', ink: '#04130D' },
        amber: { DEFAULT: '#F5B84A' },
        coral: { DEFAULT: '#FF6B6B' },
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -16px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(46,229,157,0.35), 0 12px 40px -12px rgba(46,229,157,0.45)',
      },
      keyframes: {
        rise: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        deal: { '0%': { opacity: 0, transform: 'translateY(-10px) rotate(-4deg) scale(.94)' }, '100%': { opacity: 1, transform: 'none' } },
        sheet: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'none' } },
        bar: { '0%,100%': { transform: 'scaleY(.35)' }, '50%': { transform: 'scaleY(1)' } },
        ring: { '0%': { transform: 'scale(.9)', opacity: .7 }, '100%': { transform: 'scale(1.9)', opacity: 0 } },
      },
      animation: {
        rise: 'rise .35s cubic-bezier(.2,.7,.2,1) both',
        deal: 'deal .32s cubic-bezier(.2,.7,.2,1) both',
        sheet: 'sheet .28s cubic-bezier(.2,.8,.2,1) both',
        bar: 'bar .9s ease-in-out infinite',
        ring: 'ring 1.6s ease-out infinite',
      },
    }
  },
  plugins: []
}
