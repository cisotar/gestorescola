import useToastStore from '../../hooks/useToast'

const COLORS = {
  ok:    'bg-ok-l text-ok border-green-200',
  warn:  'bg-amber-50 text-amber-800 border-amber-200',
  err:   'bg-err-l text-err border-red-200',
  local: 'bg-surf2 text-t2 border-bdr',
}

export default function Toast() {
  const { message, type, visible } = useToastStore()

  return (
    <div
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999]
        px-4 py-2.5 rounded-xl border text-sm font-semibold shadow-lg
        transition-all duration-300
        ${COLORS[type] ?? COLORS.ok}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}
      `}
    >
      {message}
    </div>
  )
}
