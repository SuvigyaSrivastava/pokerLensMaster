/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        felt: { DEFAULT: '#0D1B0F', surface: '#1A2E1C' },
        poker: { green: '#00C853', gold: '#FFD700', danger: '#FF4444' }
      }
    }
  },
  plugins: []
}
