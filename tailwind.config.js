/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        navy:   '#1A1814',
        accent: '#C05621',
        'accent-l': '#FFF7ED',
        surf:   '#FFFFFF',
        surf2:  '#F4F2EE',
        bg:     '#F7F6F2',
        bdr:    '#E5E2D9',
        t1:     '#1A1814',
        t2:     '#6B6760',
        t3:     '#A09D97',
        ok:     '#16A34A',
        'ok-l': '#F0FDF4',
        err:    '#C8290A',
        'err-l':'#FFF1EE',
        warn:   '#D97706',
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
}
