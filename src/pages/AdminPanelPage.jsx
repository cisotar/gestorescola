// AdminPanelPage — casca do painel SaaS admin (`/admin`).
// Issue 415: layout com mocks. Issue 417: integração do CreateSchoolModal com Firestore.
// Issue 419: integração com useSchoolStore (listagem em tempo real e troca com teardown).

import { useEffect, useState, lazy, Suspense } from 'react'
import SchoolTabBar from '../components/admin/SchoolTabBar'
import SchoolActionsMenu from '../components/admin/SchoolActionsMenu'
import AdminSubNav from '../components/admin/AdminSubNav'
import CreateSchoolModal from '../components/admin/CreateSchoolModal'
import DesignateAdminModal from '../components/admin/DesignateAdminModal'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { createSchoolFromAdmin, designateLocalAdmin, setSchoolStatus, softDeleteSchool } from '../lib/db'
import useAuthStore from '../store/useAuthStore'
import useSchoolStore from '../store/useSchoolStore'
import { toast } from '../hooks/useToast'

// Lazy-load das páginas internas para evitar inflar o bundle de /admin.
const DashboardPage = lazy(() => import('./DashboardPage'))
const CalendarPage  = lazy(() => import('./CalendarPage'))
const SettingsPage  = lazy(() => import('./SettingsPage'))

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
  } catch {
    // fallback abaixo
  }
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
  } catch {
    return false
  }
}

export default function AdminPanelPage() {
  const [section, setSection] = useState('dashboard')
  const [modalOpen, setModalOpen] = useState(false)
  // confirm: { action: 'suspend' | 'reactivate' | 'delete', school, submitting } | null
  const [confirm, setConfirm] = useState(null)
  // designateState: { school } | null
  const [designateState, setDesignateState] = useState(null)
  const user = useAuthStore(s => s.user)

  const allSchools         = useSchoolStore(s => s.allSchools)
  const currentSchoolId    = useSchoolStore(s => s.currentSchoolId)
  const fetchAllSchools    = useSchoolStore(s => s.fetchAllSchools)
  const stopAllSchools     = useSchoolStore(s => s.stopAllSchoolsListener)
  const switchSchool       = useSchoolStore(s => s.switchSchool)

  // Subscribe global em /schools no mount; teardown no unmount.
  useEffect(() => {
    fetchAllSchools()
    return () => { stopAllSchools() }
  }, [fetchAllSchools, stopAllSchools])

  // Auto-select da primeira escola quando a lista chega e ainda não há contexto.
  useEffect(() => {
    if (currentSchoolId == null && allSchools.length > 0) {
      switchSchool(allSchools[0].schoolId).catch(e => {
        console.warn('[AdminPanelPage] auto-select switchSchool falhou:', e)
      })
    }
  }, [currentSchoolId, allSchools, switchSchool])

  // Fallback: se currentSchoolId não bate com nenhum item (suspensão/delete), usa o primeiro.
  const activeSchool =
    allSchools.find(s => s.schoolId === currentSchoolId) ?? allSchools[0] ?? null

  const handleSelect = (id) => {
    switchSchool(id).catch(e => {
      console.warn('[AdminPanelPage] switchSchool falhou:', e)
      toast('Não foi possível carregar a escola', 'err')
    })
  }

  const handleCreate = () => {
    setModalOpen(true)
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

    // Sucesso: fechar modal e ativar tab nova (lista real chega via onSnapshot).
    setModalOpen(false)
    try {
      await switchSchool(schoolId)
    } catch (e) {
      console.warn('[AdminPanelPage] switchSchool após criar falhou:', e)
    }

    // Toast com link copiável para /join/{slug}.
    const link = buildJoinLink(slug)
    copyToClipboard(link).then(ok => {
      if (ok) {
        toast(`Escola criada! Link copiado: ${link}`, 'ok')
      } else {
        toast(`Escola criada! Link: ${link}`, 'ok')
      }
    })
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
      return
    }
    // eslint-disable-next-line no-console
    console.log('[AdminPanelPage] Ação na escola:', action, school?.schoolId)
  }

  const handleDesignateSubmit = async ({ adminEmail }) => {
    if (!designateState?.school?.schoolId) {
      const err = new Error('Escola não selecionada')
      err.code = 'permission-denied'
      throw err
    }
    const result = await designateLocalAdmin(designateState.school.schoolId, adminEmail)
    setDesignateState(null)
    if (result?.promoted) {
      toast('Admin local atualizado. O novo admin já tem acesso elevado.', 'ok')
    } else {
      toast('Admin local atualizado. O novo admin terá acesso ao fazer login.', 'ok')
    }
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
      if (action === 'delete') {
        if (e?.code === 'permission-denied') {
          toast('Sem permissão para excluir a escola', 'err')
        } else {
          toast('Falha ao excluir escola. Tente novamente.', 'err')
        }
      } else if (e?.code === 'permission-denied') {
        toast('Sem permissão para alterar o status da escola', 'err')
      } else {
        toast('Falha ao atualizar escola. Tente novamente.', 'err')
      }
      // Reabilita botão para retry; mantém modal aberto.
      setConfirm(c => (c ? { ...c, submitting: false } : c))
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">Painel Admin SaaS</h1>
        <p className="text-sm text-t3 mt-1">Gerencie todas as escolas em um único painel.</p>
      </div>

      <SchoolTabBar
        schools={allSchools}
        currentSchoolId={activeSchool?.schoolId ?? null}
        onSelect={handleSelect}
        onCreate={handleCreate}
      />

      {activeSchool ? (
        <>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-bold text-t1">{activeSchool.name}</h2>
            <span className="text-xs text-t3">/{activeSchool.slug}</span>
            <SchoolActionsMenu school={activeSchool} onAction={handleAction} />
          </div>

          <AdminSubNav section={section} onChange={setSection} />

          <Suspense
            fallback={
              <div className="flex items-center justify-center py-10">
                <Spinner />
              </div>
            }
          >
            {/* key força unmount/remount limpo ao trocar de escola, evitando estado stale
                em modais/forms internos das páginas reutilizadas. */}
            <div key={activeSchool.schoolId}>
              {section === 'dashboard' && <DashboardPage />}
              {section === 'calendar'  && <CalendarPage />}
              {section === 'settings'  && <SettingsPage />}
            </div>
          </Suspense>
        </>
      ) : (
        <div className="rounded-lg border border-bdr bg-surf p-6 text-sm text-t3">
          Nenhuma escola selecionada.
        </div>
      )}

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
          confirm?.action === 'suspend'
            ? 'Suspender escola?'
            : confirm?.action === 'delete'
              ? 'Excluir escola?'
              : 'Reativar escola?'
        }
        size="sm"
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-t2">
              {confirm.action === 'suspend' ? (
                <>
                  Membros da escola <strong className="text-t1">{confirm.school.name}</strong>{' '}
                  perderão o acesso enquanto ela estiver suspensa. Você (SaaS admin) continuará
                  podendo visualizá-la e reativá-la a qualquer momento.
                </>
              ) : confirm.action === 'delete' ? (
                <>
                  A escola <strong className="text-t1">{confirm.school.name}</strong> será
                  removida do painel.{' '}
                  <strong className="text-t1">Esta operação é reversível apenas via backend</strong>{' '}
                  (script manual). Membros perderão acesso imediatamente.
                </>
              ) : (
                <>
                  A escola <strong className="text-t1">{confirm.school.name}</strong> voltará a
                  ficar acessível aos membros conforme suas permissões.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={confirm.submitting}
                className="px-4 h-9 rounded-lg border border-bdr bg-surf text-sm font-medium text-t1 hover:bg-surf2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirm.submitting}
                className={`px-4 h-9 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  confirm.action === 'suspend'
                    ? 'bg-warn hover:brightness-110'
                    : confirm.action === 'delete'
                      ? 'bg-err hover:brightness-110'
                      : 'bg-accent hover:brightness-110'
                }`}
              >
                {confirm.submitting
                  ? (confirm.action === 'delete' ? 'Excluindo...' : 'Salvando...')
                  : confirm.action === 'suspend'
                    ? 'Suspender'
                    : confirm.action === 'delete'
                      ? 'Excluir'
                      : 'Reativar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
