/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: '#121212',
        cyan: '#10bfc9',
        lime: '#9aed57',
        danger: '#ef4444',
        warning: '#f59e0b',
        success: '#22c55e',
        info: '#3b82f6',
        white: '#ffffff',
        'text-muted': '#7d7d7d',
        'text-secondary': '#b8b8b8',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #10bfc9 0%, #9aed57 100%)',
        'dark-radial': 'radial-gradient(circle at center, rgba(30,30,30,0.5) 0%, rgba(18,18,18,1) 100%)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(16, 191, 201, 0.5)',
        'glow-sm': '0 0 10px rgba(16, 191, 201, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'pulse-glow': 'pulseGlow 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)', boxShadow: '0 0 10px rgba(34,197,94,0.5)' },
          '50%': { opacity: '0.6', transform: 'scale(1.1)', boxShadow: '0 0 20px rgba(34,197,94,0.8)' },
        }
      }
    },
  },
  plugins: [],
}
