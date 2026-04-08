import useAuthStore from '../store/useAuthStore'
import useAppStore from '../store/useAppStore'
import ActionCard from '../components/ui/ActionCard'

function TeacherStats({ teacher, schedules, absences }) {
  const myAulas = schedules.filter(s => s.teacherId === teacher.id).length
  const myFaltas = (absences ?? []).reduce((acc, ab) =>
    acc + (ab.teacherId === teacher.id ? ab.slots.length : 0), 0)
  const mySubs = (absences ?? []).reduce((acc, ab) =>
    acc + ab.slots.filter(s => s.substituteId === teacher.id).length, 0)

  return (
    <div className="card">
      <div className="font-bold text-sm mb-4">Suas estatísticas do mês</div>
      <div className="flex gap-6 flex-wrap">
        {[
          { v: myAulas,  l: 'aulas/semana' },
          { v: myFaltas, l: 'faltas registradas' },
          { v: mySubs,   l: 'subs. realizadas' },
        ].map(({ v, l }) => (
          <div key={l} className="text-center">
            <div className="text-3xl font-extrabold text-navy">{v}</div>
            <div className="text-xs text-t2 mt-0.5">{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HomePage() {
  const { user, teacher: myTeacher } = useAuthStore()
  const { schedules, absences } = useAppStore()
  const firstName = user?.displayName?.split(' ')[0] ?? 'Professor'

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Olá, {firstName} 👋</h1>
        <p className="text-sm text-t2 mt-1">Bem-vindo(a) ao seu painel de controle.</p>
      </div>

      {myTeacher && (
        <TeacherStats teacher={myTeacher} schedules={schedules} absences={absences} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionCard
          icon="👤" label="Meu Perfil"
          desc="Acesse a sua Grade de Horários, turma, ou preferências da conta."
          to="/settings" primary
        />
        <ActionCard
          icon="📋" label="Relatório de Faltas"
          desc="Monitore seu histórico de ausências e as substituições realizadas."
          to="/absences"
        />
        <ActionCard
          icon="📊" label="Acessar Dashboard"
          desc="Acesse dados completos, status global e lista de escolas."
          to="/dashboard"
        />
      </div>
    </div>
  )
}
