/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e5dafc',
          100: '#ab93f4',
          200: '#7a6cef',
          300: '#4a4be8',
          400: '#2d3ce5',
          500: '#162ee3',
          600: '#1325c4',
          700: '#101da0',
          800: '#221c6b',
          900: '#1a1554',
        },
        accent: {
          50: '#e5e1ff',
          100: '#ada6ff',
          200: '#5d7dfd',
          300: '#0e55fb',
          400: '#0b46d4',
          500: '#093aae',
          600: '#232c76',
        },
        cta: {
          DEFAULT: '#22bf59',
          dark: '#1ba34c',
          light: '#3dd674',
        },
        ink: {
          50: '#fcfcfd',
          100: '#f5f7f9',
          200: '#eceff3',
          500: '#6f7072',
          900: '#1a1a1a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['Cairo', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Cormorant', 'Georgia', 'serif'],
      },
      boxShadow: {
        'soft': '0 4px 24px -8px rgba(22,46,227,0.15)',
        'card': '0 8px 32px -12px rgba(15,23,42,0.12)',
        'cta': '0 12px 28px -8px rgba(34,191,89,0.4)',
      },
      animation: {
        'shake': 'shake 1.5s ease-in-out infinite',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-3px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(3px)' },
        },
      },
    },
  },
  plugins: [],
};
