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
  safelist: [
    // Profile role pills — definidas em src/lib/settings/helpers.js (PROFILE_OPTIONS)
    // e aplicadas via opt.pill em ProfilePillDropdown.jsx
    'bg-blue-100', 'text-blue-700', 'border-blue-200',       // teacher
    'bg-purple-100', 'text-purple-700', 'border-purple-200', // coordinator
    'bg-indigo-100', 'text-indigo-700', 'border-indigo-200', // teacher-coordinator
    'bg-red-100', 'text-red-700', 'border-red-200',          // admin

    // Pending action status — src/lib/settings/helpers.js (STATUS_BADGE)
    // aplicadas via sb.cls em componentes de solicitações
    'bg-amber-100', 'text-amber-800', 'border-amber-300',    // pending
    'bg-green-100', 'text-green-800', 'border-green-300',    // approved
    'bg-red-100', 'text-red-800', 'border-red-300',          // rejected

    // colorForPct em SubstitutionsPage.jsx linha 1099 — construída via função ternária
    // text-amber-600 já aparece como literal em AbsencesPage.jsx, não precisa de safelist
    'text-green-600', 'text-red-600',
  ],
  plugins: [],
}
