import SuggestionPill from './SuggestionPill'

export default function SuggestionPills({ suggestions, onSelect }) {
  if (!suggestions || suggestions.length === 0) {
    return <p className="text-sm text-t3 py-2">Sem sugestões disponíveis</p>
  }

  return (
    <div className="flex gap-2">
      {suggestions.map(teacher => (
        <SuggestionPill
          key={teacher.id}
          teacher={teacher}
          monthlyAulas={teacher.monthlyAulas ?? 0}
          atLimit={teacher.atLimit ?? false}
          onClick={() => onSelect(teacher)}
        />
      ))}
    </div>
  )
}
