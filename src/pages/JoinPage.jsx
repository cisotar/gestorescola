import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getSchoolSlug, requestTeacherAccess } from '../lib/db'
import { getSchoolDocRef, getSchoolRef } from '../lib/firebase/multi-tenant'
import useAuthStore from '../store/useAuthStore'
import useSchoolStore from '../store/useSchoolStore'
import Spinner from '../components/ui/Spinner'

// ─── Sub-componentes (uso único, sem export) ──────────────────────────────────

function LoadingState() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg">
      <Spinner size={40} />
      <div className="mt-5 text-base font-bold text-t1">
        <span className="text-accent">Gestão</span>
        <span className="text-navy">Escolar</span>
      </div>
      <div className="mt-1.5 text-sm text-t3">Verificando convite…</div>
    </div>
  )
}

function SlugErrorState() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg p-4">
      <div className="bg-surf border border-bdr rounded-2xl shadow-xl p-10 w-full max-w-sm text-center">
        <div className="text-3xl font-extrabold tracking-tight mb-2">
          <span className="text-accent">Gestão</span>
          <span className="text-navy">Escolar</span>
        </div>
        <div className="mt-6 mb-2 text-err font-semibold text-base">Link inválido</div>
        <p className="text-sm text-t2 leading-relaxed">
          Link de convite inválido ou desativado.
        </p>
        <p className="text-xs text-t3 mt-4">
          Solicite um novo link ao administrador da escola.
        </p>
      </div>
    </div>
  )
}

// ─── JoinPage ─────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const { slug }        = useParams()
  const navigate        = useNavigate()
  const { user, loading: authLoading } = useAuthStore()

  const [status, setStatus]   = useState('loading') // 'loading' | 'invalid' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  async function resolveJoin(currentUser) {
    // 1. Resolver slug
    const slugData = await getSchoolSlug(slug)
    if (!slugData?.schoolId) {
      setStatus('invalid')
      return
    }
    const { schoolId } = slugData

    // 1b. Validar existência do doc raiz schools/{schoolId} — apenas se autenticado.
    // Pré-login a regra exige isAuthenticated(); o slug em school_slugs já confirma
    // a existência da escola (leitura pública), então a validação extra do doc raiz
    // só agrega valor para usuários logados.
    if (currentUser) {
      try {
        const schoolSnap = await getDoc(getSchoolRef(schoolId))
        if (!schoolSnap.exists()) {
          setStatus('invalid')
          return
        }
      } catch (e) {
        console.error('[JoinPage] erro validando schools/{schoolId}:', e)
        setErrorMsg('Não foi possível validar a escola. Verifique sua conexão e tente novamente.')
        setStatus('error')
        return
      }
    }

    // 1c. Persistência precoce — grava schoolId no localStorage antes
    // mesmo do redirect para /login. Chave equivalente a LS_KEY de useSchoolStore
    // ('gestao_active_school'). Usamos literal para evitar acoplamento com o store.
    try { localStorage.setItem('gestao_active_school', schoolId) } catch {}

    // 2. Sem usuário autenticado — salvar slug e redirecionar para login
    if (!currentUser) {
      try { sessionStorage.setItem('pendingJoinSlug', slug) } catch {}
      navigate('/login', { state: { redirect: '/join/' + slug }, replace: true })
      return
    }

    // 3. Usuário autenticado — consumir pendingJoinSlug se presente
    try { sessionStorage.removeItem('pendingJoinSlug') } catch {}

    // 4. Verificar se usuário já está aprovado na escola via users/{uid}.schools
    try {
      const userSnap = await getDoc(doc(db, 'users', currentUser.uid))
      if (userSnap.exists()) {
        const schoolEntry = userSnap.data().schools?.[schoolId]
        const entryStatus = typeof schoolEntry === 'object' && schoolEntry !== null
          ? schoolEntry?.status
          : null
        const entryRole = typeof schoolEntry === 'object' && schoolEntry !== null
          ? schoolEntry?.role
          : null

        if (entryStatus === 'approved') {
          // Usuário já aprovado: ativar escola e redirecionar conforme role
          await useSchoolStore.getState().setCurrentSchool(schoolId)
          const destination = (entryRole === 'teacher') ? '/home' : '/dashboard'
          navigate(destination, { replace: true })
          return
        }
      }
    } catch (e) {
      console.warn('[JoinPage] leitura users/{uid}:', e)
    }

    // 5. Verificar se já está em pending_teachers
    try {
      const pendingRef  = getSchoolDocRef(schoolId, 'pending_teachers', currentUser.uid)
      const pendingSnap = await getDoc(pendingRef)

      if (pendingSnap.exists()) {
        await useSchoolStore.getState().setCurrentSchool(schoolId)
        navigate('/', { replace: true })
        return
      }
    } catch (e) {
      console.warn('[JoinPage] leitura pending_teachers:', e)
    }

    // 6. Novo professor — criar solicitação de acesso
    try {
      await requestTeacherAccess(schoolId, currentUser)
      await useSchoolStore.getState().setCurrentSchool(schoolId)
      navigate('/', { replace: true })
    } catch (e) {
      console.error('[JoinPage] requestTeacherAccess falhou:', e)
      setErrorMsg('Erro ao solicitar acesso. Tente novamente.')
      setStatus('error')
    }
  }

  useEffect(() => {
    // Aguardar auth resolver antes de iniciar a lógica de join
    if (authLoading) return

    resolveJoin(user)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  // Após resolver com setCurrentSchool, o App.jsx vai reagir ao currentSchoolId
  // e renderizar a página correta (PendingPage via role === 'pending').
  // Enquanto isso, manter o spinner.

  if (status === 'invalid') return <SlugErrorState />

  if (status === 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg p-4">
        <div className="bg-surf border border-bdr rounded-2xl shadow-xl p-10 w-full max-w-sm text-center">
          <div className="text-3xl font-extrabold tracking-tight mb-2">
            <span className="text-accent">Gestão</span>
            <span className="text-navy">Escolar</span>
          </div>
          <div className="mt-6 mb-2 text-err font-semibold text-base">Erro</div>
          <p className="text-sm text-t2 leading-relaxed">{errorMsg}</p>
          <button
            onClick={() => { setStatus('loading'); resolveJoin(user) }}
            className="mt-6 btn btn-dark w-full"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  // 'loading' ou 'done' (aguardando App.jsx reagir) — exibir spinner
  return <LoadingState />
}
