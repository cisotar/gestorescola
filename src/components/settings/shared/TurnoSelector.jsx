// TurnoSelector — seletor de turno reutilizável em TabSegments, TabPeriods, TabSchedules

export default function TurnoSelector({ seg, store }) {
  return (
    <div className="flex items-center gap-2">
      <label className="lbl !mb-0 shrink-0">Turno:</label>
      <select
        className="inp !w-auto py-1 text-sm"
        value={seg.turno ?? 'manha'}
        onChange={e => store.setSegmentTurno(seg.id, e.target.value)}
      >
        <option value="manha">🌅 Manhã</option>
        <option value="tarde">🌇 Tarde</option>
      </select>
    </div>
  )
}
