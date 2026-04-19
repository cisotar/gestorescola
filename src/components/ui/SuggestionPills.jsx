import SuggestionPill from './SuggestionPill'
import { isFormationSlot } from '../../lib/helpers'

export default function SuggestionPills({ suggestions, onSelect, slot, sharedSeries = [] }) {
  if (!suggestions || suggestions.length === 0) {
    return <p className="text-sm text-t3 py-2">Sem sugestões disponíveis</p>
  }

  // Guard defensivo: se slot é FORMAÇÃO, não renderizar sugestões
  if (slot && isFormationSlot(slot.turma, slot.subjectId, sharedSeries)) {
    return null
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
