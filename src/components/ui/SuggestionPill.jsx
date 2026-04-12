export default function SuggestionPill({ teacher, monthlyAulas, onClick }) {
  const label = monthlyAulas === 1 ? '1 aula' : `${monthlyAulas} aulas`

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-0.5 px-4 py-3 rounded-lg border
                 bg-accent-l border-accent hover:bg-orange-100
                 transition-colors duration-150 text-left flex-1 min-w-0"
    >
      <span className="text-sm font-bold text-t1 truncate w-full">{teacher.name}</span>
      <span className="text-xs text-t2">{label}</span>
    </button>
  )
}
