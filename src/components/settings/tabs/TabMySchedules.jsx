// TabMySchedules — grade horária pessoal (coordenador/professor)

import useAppStore from '../../../store/useAppStore'
import useAuthStore from '../../../store/useAuthStore'
import { ScheduleGrid } from '../../ui/ScheduleGrid'

export default function TabMySchedules() {
  const store = useAppStore()
  const { teacher: myTeacher } = useAuthStore()
  if (!myTeacher) return <p className="text-sm text-t3">Perfil de professor não encontrado.</p>
  return (
    <div>
      <p className="text-sm text-t2 mb-4">
        Clique em <strong>＋</strong> para solicitar inclusão de aula. Clique em <strong>✕</strong> para solicitar remoção.
        As solicitações são enviadas para aprovação do administrador.
      </p>
      <ScheduleGrid teacher={myTeacher} store={store} />
    </div>
  )
}
