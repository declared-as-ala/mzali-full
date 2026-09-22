/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        'xs': '390px',
      },
      colors: {
        brand: {
          50: '#e5dafc',
          100: '#ab93f4',
          200: '#7c4dff',
          300: '#5b2ccf',
          400: '#5b2ccf',
          500: '#5b2ccf',
          600: '#4a239e',
        },
        cta: {
          DEFAULT: '#22bf59',
          dark: '#1ea84d',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Cairo', 'system-ui', 'sans-serif'],
        display: ['Cormorant', 'Georgia', 'serif'],
        arabic: ['Cairo', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0,0,0,0.06)',
        'card': '0 4px 16px rgba(0,0,0,0.08)',
        'cta': '0 4px 14px rgba(34,191,89,0.25)',
        '2xs': '0 1px 4px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
};
