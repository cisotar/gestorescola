import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useAuthStore from '../store/useAuthStore'
import useSchoolStore from '../store/useSchoolStore'
import EmptyState from '../components/ui/EmptyState'

// Ícone de escola inline (mesmo estilo do SchoolHeader).
function SchoolIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

export default function NoSchoolPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  // Listener em tempo real de users/{uid}: se o admin de alguma escola aprovar
  // este usuário em outra sessão (ou em outro device), users/{uid}.schools ganha
  // uma entrada — recarregamos availableSchools, ativamos a primeira escola e
  // redirecionamos para a Home.
  useEffect(() => {
    if (!user?.uid) return

    const ref = doc(db, 'users', user.uid)
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) return
        const schoolsMap = snap.data().schools ?? {}
        const schoolIds = Object.keys(schoolsMap).filter(k =>
          schoolsMap[k] === true || (typeof schoolsMap[k] === 'object' && schoolsMap[k] !== null)
        )
        if (schoolIds.length === 0) return

        try {
          await useSchoolStore.getState().loadAvailableSchools(user.uid)
          const available = useSchoolStore.getState().availableSchools
          const firstId = available[0]?.schoolId ?? schoolIds[0]
          await useSchoolStore.getState().setCurrentSchool(firstId)
          navigate('/', { replace: true })
        } catch (e) {
          console.warn('[NoSchoolPage] ao ativar nova escola:', e)
        }
      },
      (err) => {
        console.warn('[NoSchoolPage] users listener:', err)
      }
    )

    return () => unsub()
  }, [user?.uid, navigate])

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg p-4">
      <div className="bg-surf border border-bdr rounded-2xl shadow-xl w-full max-w-md">
        <EmptyState
          icon={<SchoolIcon />}
          title="Você ainda não está em nenhuma escola"
          description={
            <>
              Para entrar em uma escola, peça ao administrador o link de convite
              no formato <code className="px-1 py-0.5 rounded bg-surf2 text-t1 text-xs">/join/&lt;slug&gt;</code> e abra-o neste navegador.
              <br />
              Assim que você for aprovado, esta tela atualiza automaticamente.
            </>
          }
          actions={
            <button
              type="button"
              className="text-sm text-t3 hover:text-t2 transition-colors"
              onClick={() => useAuthStore.getState().logout()}
            >
              Sair
            </button>
          }
        />
      </div>
    </div>
  )
}
