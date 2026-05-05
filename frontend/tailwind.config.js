/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0A0A0A',
          secondary: '#475569',
          muted: '#94A3B8',
        },
        navy: {
          50: '#F8FAFC',
          900: '#0F172A',
          950: '#070D1B',
          800: '#1E293B',
          700: '#334155',
        },
        brand: '#0F172A',
        buy: { DEFAULT: '#059669', bg: '#D1FAE5' },
        wait: { DEFAULT: '#EA580C', bg: '#FFEDD5' },
        risk: { low: '#2563EB', lowBg: '#DBEAFE' },
        rank: {
          cheap: '#0F172A',
          value: '#2563EB',
          risk: '#059669',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        display: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      letterSpacing: {
        tightest: '-0.05em',
      },
      animation: {
        'fade-in': 'fadeIn 400ms ease-out',
        'slide-up': 'slideUp 500ms cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 2.4s linear infinite',
        'gradient-pan': 'gradientPan 12s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(16px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        gradientPan: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      backgroundImage: {
        'navy-radial':
          'radial-gradient(circle at 20% 0%, rgba(37,99,235,0.18) 0%, transparent 45%), radial-gradient(circle at 100% 100%, rgba(5,150,105,0.16) 0%, transparent 50%)',
        'grid-faint':
          'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 30px 80px -20px rgba(15,23,42,0.4)',
        card: '0 1px 0 0 rgba(15,23,42,0.04), 0 8px 24px -8px rgba(15,23,42,0.08)',
        cardHover: '0 1px 0 0 rgba(15,23,42,0.04), 0 24px 48px -12px rgba(15,23,42,0.18)',
      },
    },
  },
  plugins: [],
};
