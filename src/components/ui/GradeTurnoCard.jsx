import { ScheduleGrid } from './ScheduleGrid'

const TURNO_LABELS = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }

/**
 * GradeTurnoCard — Componente reutilizável para renderizar grade horária de um professor em um turno específico
 *
 * @param {Object} props
 * @param {string} props.segmentId — ID do segmento (ex: "seg-fund")
 * @param {string} props.turno — Turno: 'manha' | 'tarde' | 'noite'
 * @param {Object} props.teacher — Documento teacher com `{id, name, horariosSemana?, ...}`
 * @param {Object} props.store — `useAppStore()` — acesso a segments, periodConfigs, subjects, schedules, sharedSeries
 * @param {Object|null} props.horariosSemana — Horários do professor por dia da semana (ex: `{Segunda: {entrada, saida}, ...}`) ou `null`
 *
 * @returns {JSX.Element}
 */
function GradeTurnoCard({ segmentId, turno, teacher, store, horariosSemana }) {
  const seg = store.segments.find(s => s.id === segmentId)
  const segName = seg?.name ?? segmentId
  const turnoLabel = TURNO_LABELS[turno] ?? turno

  const semHorarios = horariosSemana !== undefined && (
    horariosSemana === null ||
    Object.keys(horariosSemana ?? {}).length === 0 ||
    !Object.values(horariosSemana ?? {}).some(d => d?.entrada && d?.saida)
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-t1">{segName}</span>
        <span className="text-xs text-t2 px-2 py-0.5 rounded-full bg-surf2 border border-bdr">
          {turno === 'tarde' ? 'Tarde' : turno === 'noite' ? 'Noite' : 'Manhã'}
        </span>
      </div>
      {semHorarios && (
        <p className="text-xs text-t3 italic">
          Horários de entrada e saída não cadastrados — grade exibida sem marcação de disponibilidade
        </p>
      )}
      <ScheduleGrid
        teacher={teacher}
        store={store}
        segmentFilter={{ segmentId, turno }}
        horariosSemana={horariosSemana ?? null}
      />
    </div>
  )
}

export default GradeTurnoCard
