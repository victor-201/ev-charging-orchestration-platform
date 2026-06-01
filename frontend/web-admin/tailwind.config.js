/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        cyan: '#10bfc9',
        lime: '#9aed57',
        danger: '#ef4444',
        warning: '#f59e0b',
        success: '#22c55e',
        info: '#3b82f6',
        // Theme-aware using CSS variables
        'text-main': 'var(--text-main)',
        'text-faded': 'var(--text-faded)',
        'text-muted': 'var(--text-faded)',
        'card-border': 'var(--card-border)',
        'pill-text': 'var(--pill-text)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #10bfc9 0%, #9aed57 100%)',
        'sq-shine': 'var(--sq-shine)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(16, 191, 201, 0.5)',
        'glow-sm': '0 0 10px rgba(16, 191, 201, 0.3)',
        'card': 'var(--card-shadow)',
        'token': 'var(--token-shadow)',
        'pill': 'var(--pill-shadow)',
      },
      borderRadius: {
        'card': '36px',
        'pill': '16px',
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
