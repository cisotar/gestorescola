import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SchoolActionsMenu from '../components/admin/SchoolActionsMenu'
import CreateSchoolModal from '../components/admin/CreateSchoolModal'
import DesignateAdminModal from '../components/admin/DesignateAdminModal'
import Modal from '../components/ui/Modal'
import { createSchoolFromAdmin, designateLocalAdmin, setSchoolStatus, softDeleteSchool } from '../lib/db'
import useAuthStore from '../store/useAuthStore'
import useSchoolStore from '../store/useSchoolStore'
import { toast } from '../hooks/useToast'

function buildJoinLink(slug) {
  if (typeof window === 'undefined') return `/join/${slug}`
  return `${window.location.origin}/join/${slug}`
}

async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fallback */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch { return false }
}

export default function AdminPanelPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [designateState, setDesignateState] = useState(null)
  const navigate = useNavigate()

  const user = useAuthStore(s => s.user)
  const displayName = user?.displayName ?? 'Admin'

  const allSchools      = useSchoolStore(s => s.allSchools)
  const fetchAllSchools = useSchoolStore(s => s.fetchAllSchools)
  const stopAllSchools  = useSchoolStore(s => s.stopAllSchoolsListener)
  const switchSchool    = useSchoolStore(s => s.switchSchool)

  useEffect(() => {
    fetchAllSchools()
    return () => { stopAllSchools() }
  }, [fetchAllSchools, stopAllSchools])

  const handleSchoolClick = async (school) => {
    try {
      await switchSchool(school.schoolId)
      navigate('/home')
    } catch (e) {
      console.warn('[AdminPanelPage] switchSchool falhou:', e)
      toast('Não foi possível carregar a escola', 'err')
    }
  }

  const handleSubmit = async ({ slug, adminEmail }) => {
    if (!user?.uid) {
      const err = new Error('Usuário não autenticado')
      err.code = 'permission-denied'
      throw err
    }
    const { schoolId } = await createSchoolFromAdmin({
      slug,
      adminEmail,
      currentUserUid: user.uid,
    })
    setModalOpen(false)
    const link = buildJoinLink(slug)
    copyToClipboard(link).then(ok => {
      toast(ok ? `Escola criada! Link copiado: ${link}` : `Escola criada! Link: ${link}`, 'ok')
    })
    try { await switchSchool(schoolId) } catch (e) {
      console.warn('[AdminPanelPage] switchSchool após criar falhou:', e)
    }
  }

  const handleAction = (action, school) => {
    if (action === 'suspend' || action === 'reactivate' || action === 'delete') {
      if (!school?.schoolId) return
      setConfirm({ action, school, submitting: false })
      return
    }
    if (action === 'designate') {
      if (!school?.schoolId) return
      setDesignateState({ school })
    }
  }

  const handleDesignateSubmit = async ({ adminEmail }) => {
    if (!designateState?.school?.schoolId) {
      const err = new Error('Escola não selecionada')
      err.code = 'permission-denied'
      throw err
    }
    const result = await designateLocalAdmin(designateState.school.schoolId, adminEmail)
    setDesignateState(null)
    toast(
      result?.promoted
        ? 'Admin local atualizado. O novo admin já tem acesso elevado.'
        : 'Admin local atualizado. O novo admin terá acesso ao fazer login.',
      'ok'
    )
  }

  const handleConfirm = async () => {
    if (!confirm) return
    const { action, school } = confirm
    setConfirm(c => (c ? { ...c, submitting: true } : c))
    try {
      if (action === 'delete') {
        await softDeleteSchool(school.schoolId)
        toast('Escola excluída', 'ok')
      } else {
        const nextStatus = action === 'suspend' ? 'suspended' : 'active'
        await setSchoolStatus(school.schoolId, nextStatus)
        toast(action === 'suspend' ? 'Escola suspensa' : 'Escola reativada', 'ok')
      }
      setConfirm(null)
    } catch (e) {
      console.warn('[AdminPanelPage] handleConfirm falhou:', e)
      toast(
        e?.code === 'permission-denied'
          ? 'Sem permissão para realizar esta ação'
          : 'Falha ao atualizar escola. Tente novamente.',
        'err'
      )
      setConfirm(c => (c ? { ...c, submitting: false } : c))
    }
  }

  return (
    <div className="max-w-4xl">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-t1">
          Olá, {displayName}!
        </h1>
        <p className="text-sm text-t3 mt-1">Selecione uma escola ou adicione uma nova.</p>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Add school card */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-bdr bg-surf hover:border-accent hover:bg-surf2 transition-colors text-t3 hover:text-accent group"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-colors">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="text-sm font-semibold">Adicionar escola</span>
        </button>

        {/* One card per school */}
        {allSchools.map(school => (
          <div
            key={school.schoolId}
            className="relative flex flex-col h-32 rounded-xl border border-bdr bg-surf hover:border-t3 hover:shadow-sm transition-all"
          >
            {/* Clickable area — navigates to school home */}
            <button
              type="button"
              onClick={() => handleSchoolClick(school)}
              className="flex-1 flex flex-col items-start justify-center px-4 text-left"
            >
              <span className="font-bold text-t1 text-base leading-tight line-clamp-2">
                {school.name || school.slug}
              </span>
              {school.status === 'suspended' && (
                <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-warn bg-warn/10 px-1.5 py-0.5 rounded-full">
                  Suspensa
                </span>
              )}
            </button>

            {/* 3-dot menu — bottom-right corner, stops propagation */}
            <div
              className="absolute bottom-2 right-2"
              onClick={e => e.stopPropagation()}
            >
              <SchoolActionsMenu
                school={school}
                onAction={handleAction}
                triggerLabel=""
              />
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      <CreateSchoolModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <DesignateAdminModal
        open={!!designateState}
        school={designateState?.school ?? null}
        onClose={() => setDesignateState(null)}
        onSubmit={handleDesignateSubmit}
      />

      <Modal
        open={!!confirm}
        onClose={() => { if (!confirm?.submitting) setConfirm(null) }}
        title={
          confirm?.action === 'suspend' ? 'Suspender escola?' :
          confirm?.action === 'delete'  ? 'Excluir escola?'   : 'Reativar escola?'
        }
        size="sm"
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-t2">
              {confirm.action === 'suspend' ? (
                <>Membros da escola <strong className="text-t1">{confirm.school.name}</strong> perderão o acesso enquanto ela estiver suspensa. Você continuará podendo reativá-la a qualquer momento.</>
              ) : confirm.action === 'delete' ? (
                <>A escola <strong className="text-t1">{confirm.school.name}</strong> será removida do painel. <strong className="text-t1">Operação reversível apenas via backend</strong>. Membros perderão acesso imediatamente.</>
              ) : (
                <>A escola <strong className="text-t1">{confirm.school.name}</strong> voltará a ficar acessível aos membros.</>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={confirm.submitting}
                className="px-4 h-9 rounded-lg border border-bdr bg-surf text-sm font-medium text-t1 hover:bg-surf2 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirm.submitting}
                className={`px-4 h-9 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                  confirm.action === 'suspend' ? 'bg-warn hover:brightness-110' :
                  confirm.action === 'delete'  ? 'bg-err hover:brightness-110'  :
                  'bg-accent hover:brightness-110'
                }`}
              >
                {confirm.submitting
                  ? (confirm.action === 'delete' ? 'Excluindo...' : 'Salvando...')
                  : confirm.action === 'suspend' ? 'Suspender'
                  : confirm.action === 'delete'  ? 'Excluir'
                  : 'Reativar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
