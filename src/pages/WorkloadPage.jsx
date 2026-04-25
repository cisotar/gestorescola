import { useState, useEffect } from 'react'
import useAppStore from '../store/useAppStore'
import Spinner from '../components/ui/Spinner'
import { PeriodToggle, WorkloadConsolidatedTable } from '../components/ui/WorkloadShared'

// ─── Página principal ─────────────────────────────────────────────────────────

export default function WorkloadPage() {
  const { teachers, schedules, absences, sharedSeries, loaded, loadAbsencesIfNeeded } = useAppStore()
  const [period, setPeriod] = useState('month')

  useEffect(() => {
    loadAbsencesIfNeeded()
  }, [])

  if (!loaded) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  const lecturers = teachers.filter(t => t.profile !== 'coordinator')

  if (lecturers.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-extrabold tracking-tight">Carga Horária</h1>
        <div className="card text-center py-16 text-t3">Nenhum professor cadastrado.</div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">Carga Horária</h1>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      <WorkloadConsolidatedTable
        teachers={lecturers}
        schedules={schedules}
        absences={absences}
        sharedSeries={sharedSeries}
        period={period}
      />
    </div>
  )
}
