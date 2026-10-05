/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // legacy tokens used by the classic snapshot screen
        felt: { DEFAULT: '#0D1B0F', surface: '#1A2E1C' },
        poker: { green: '#00C853', gold: '#FFD700', danger: '#FF4444' },
        // design system
        // paper surfaces (named ink-* for history: 900 = page, 800 = panel, lower = deeper tints)
        ink: { DEFAULT: '#F4F0E8', 900: '#F4F0E8', 800: '#FBF9F4', 700: '#EFEAE0', 600: '#E8E2D6', 500: '#D8D1C2' },
        line: 'rgba(27,26,23,0.16)',
        fg: { DEFAULT: '#1B1A17', muted: '#5C584F', dim: '#8A8579' },
        mint: { DEFAULT: '#1F6B4A', dim: '#17523A', ink: '#FBF9F4' }, // felt green = a good spot
        amber: { DEFAULT: '#A8660B' },
        coral: { DEFAULT: '#C0321F' }, // card red
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,26,23,0.05)',
        glow: '0 0 0 3px rgba(31,107,74,0.18)',
      },
      borderRadius: { lg: '5px', xl: '6px', '2xl': '8px', '3xl': '12px' },
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
