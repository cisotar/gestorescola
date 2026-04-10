import { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { updatePendingData } from '../lib/db'
import { db } from '../lib/firebase'
import { ScheduleGrid } from './SettingsPage'

const PHONE_REGEX = /^[1-9][0-9]9[0-9]{7,8}$/

function validatePhone(raw) {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 'Informe o telefone'
  if (!PHONE_REGEX.test(digits)) return 'Número inválido. Use DDD + número começando com 9 (ex: 11987654321)'
  return null
}

export default function PendingPage() {
  const { user, logout }               = useAuthStore()
  const store                          = useAppStore()
  const [step,          setStep]       = useState('form') // 'form' | 'schedule' | 'waiting'
  const [celular,       setCelular]    = useState('')
  const [selectedSubjs, setSelSubjs]  = useState([])
  const [saving,        setSaving]    = useState(false)
  const [phoneError,    setPhoneError] = useState('')
  const [subjError,     setSubjError]  = useState('')
  const [saveError,     setSaveError]  = useState('')

  // Re-entry: se celular já foi salvo, pular direto para a tela de espera
  useEffect(() => {
    getDoc(doc(db, 'pending_teachers', user.uid)).then(snap => {
      if (snap.exists() && snap.data().celular) {
        setCelular(snap.data().celular)
        setSelSubjs(snap.data().subjectIds ?? [])
        setStep('waiting')
      }
    })
  }, [])

  // Agrupa segmento → área → matérias
  const segGroups = store.segments.map(seg => {
    const areasInSeg = store.areas.filter(a => (a.segmentIds ?? []).includes(seg.id))
    const areaGroups = areasInSeg
      .map(area => ({
        area,
        subjs: store.subjects.filter(s => s.areaId === area.id),
      }))
      .filter(g => g.subjs.length > 0)
    return { seg, areaGroups }
  }).filter(g => g.areaGroups.length > 0)

  const toggleSubj = (id) =>
    setSelSubjs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleSubmit = async () => {
    const pErr = validatePhone(celular)
    const sErr = selectedSubjs.length === 0 ? 'Selecione ao menos uma matéria' : null
    setPhoneError(pErr ?? '')
    setSubjError(sErr ?? '')
    if (pErr || sErr) return

    setSaving(true); setSaveError('')
    try {
      await updatePendingData(user.uid, { celular: celular.replace(/\D/g, ''), subjectIds: selectedSubjs })
      setStep('schedule')
    } catch (e) {
      setSaveError('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // Teacher sintético para ScheduleGrid — usa user.uid como id (mesmo que o admin associará ao aprovar)
  const syntheticTeacher = { id: user.uid, subjectIds: selectedSubjs, name: user?.displayName ?? '' }

  const myScheduleCount = store.schedules.filter(s => s.teacherId === user.uid).length

  const containerMax = step === 'schedule' ? 'max-w-5xl' : 'max-w-2xl'

  return (
    <div className="fixed inset-0 bg-bg overflow-y-auto p-4">
      <div className="min-h-full flex items-start justify-center">
        <div className={`bg-surf border border-bdr rounded-2xl shadow-xl p-8 w-full ${containerMax} my-8`}>

          {/* ── Step: form ─────────────────────────────────────────────────── */}
          {step === 'form' && (
            <>
              <div className="text-center mb-7">
                <div className="text-4xl mb-3">👋</div>
                <h2 className="text-xl font-extrabold mb-1">Complete seu cadastro</h2>
                <p className="text-sm text-t2">Preencha seus dados para solicitar acesso ao sistema.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Coluna esquerda — campos */}
                <div className="space-y-5">
                  {/* Nome + E-mail lado a lado */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="lbl">Nome</label>
                      <div className="inp bg-surf2 text-t3 cursor-not-allowed select-none truncate">{user?.displayName}</div>
                    </div>
                    <div>
                      <label className="lbl">E-mail</label>
                      <div className="inp bg-surf2 text-t3 cursor-not-allowed select-none truncate">{user?.email}</div>
                    </div>
                  </div>

                  {/* Telefone */}
                  <div>
                    <label className="lbl">Telefone <span className="text-err">*</span></label>
                    <input
                      type="tel"
                      className={`inp ${phoneError ? 'border-err' : ''}`}
                      placeholder="11987654321"
                      value={celular}
                      onChange={e => setCelular(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    />
                    {phoneError
                      ? <p className="text-xs text-err mt-1">{phoneError}</p>
                      : <p className="text-xs text-t3 mt-1">Use seu número de WhatsApp. Formato: DDD (sem zero) + número (ex: 11987654321)</p>
                    }
                  </div>

                  {/* Matérias */}
                  <div>
                    <label className="lbl">Matérias que leciona <span className="text-err">*</span></label>
                    {segGroups.length === 0 ? (
                      <p className="text-xs text-t3 mt-1">Nenhuma matéria cadastrada no sistema ainda.</p>
                    ) : (
                      <div className="space-y-3 mt-2">
                        {segGroups.map(({ seg, areaGroups }) => (
                          <div key={seg.id} className="border border-bdr rounded-xl p-4">
                            <div className="text-xs font-extrabold text-navy uppercase tracking-widest mb-3">{seg.name}</div>
                            <div className="space-y-3">
                              {areaGroups.map(({ area, subjs }) => (
                                <div key={area.id}>
                                  <div className="text-[11px] font-bold text-t3 uppercase tracking-wide mb-1.5">{area.name}</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {subjs.map(s => (
                                      <button
                                        key={s.id}
                                        type="button"
                                        className={selectedSubjs.includes(s.id) ? 'btn btn-xs btn-dark' : 'btn btn-xs btn-ghost'}
                                        onClick={() => toggleSubj(s.id)}
                                      >{s.name}</button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {subjError && <p className="text-xs text-err mt-2">{subjError}</p>}
                  </div>

                  {/* Erro de save */}
                  {saveError && <p className="text-xs text-err">{saveError}</p>}

                  {/* Ações */}
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      onClick={handleSubmit}
                      disabled={saving}
                      className="btn btn-dark w-full disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Salvando…' : 'Enviar cadastro'}
                    </button>
                    <button onClick={logout} className="btn btn-ghost w-full">
                      Sair da conta
                    </button>
                  </div>
                </div>

                {/* Coluna direita — preview informativo (desktop) */}
                <div className="hidden lg:flex flex-col items-center justify-center text-center p-6 rounded-xl bg-surf2 border border-bdr border-dashed">
                  <div className="text-4xl mb-4">🗓️</div>
                  <div className="font-bold text-sm text-t1 mb-2">Próximo passo: sua grade horária</div>
                  <p className="text-xs text-t3 leading-relaxed">
                    Após enviar seu cadastro, você poderá preencher sua grade de horários
                    enquanto aguarda a aprovação do administrador.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ── Step: schedule ─────────────────────────────────────────────── */}
          {step === 'schedule' && (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-extrabold mb-1">Preencha sua grade horária</h2>
                <p className="text-sm text-t2">Cadastre seus horários agora enquanto aguarda a aprovação.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
                {/* Coluna esquerda — resumo dos dados enviados */}
                <div className="space-y-4">
                  <div className="bg-surf2 rounded-xl p-4 text-sm space-y-2 border border-bdr">
                    <div className="text-xs font-bold text-t2 uppercase tracking-wider mb-3">Dados enviados ✓</div>
                    <div><span className="text-t3 mr-1">Nome:</span>{user?.displayName}</div>
                    <div><span className="text-t3 mr-1">E-mail:</span>{user?.email}</div>
                    <div><span className="text-t3 mr-1">WhatsApp:</span>{celular}</div>
                    <div>
                      <span className="text-t3 mr-1">Matérias:</span>
                      <span className="text-xs">
                        {selectedSubjs.length > 0
                          ? selectedSubjs.map(id => store.subjects.find(s => s.id === id)?.name).filter(Boolean).join(', ')
                          : <span className="text-t3 italic">Nenhuma</span>}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => setStep('waiting')}
                      className="btn btn-dark w-full"
                    >
                      Concluir
                    </button>
                    <button
                      onClick={() => setStep('waiting')}
                      className="btn btn-ghost w-full"
                    >
                      Pular por agora
                    </button>
                  </div>
                </div>

                {/* Coluna direita — grade horária */}
                <div className="min-w-0">
                  <ScheduleGrid teacher={syntheticTeacher} store={store} />
                </div>
              </div>
            </>
          )}

          {/* ── Step: waiting ───────────────────────────────────────────��──── */}
          {step === 'waiting' && (
            <>
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">⏳</div>
                <h2 className="text-xl font-extrabold mb-2">Aguardando aprovação</h2>
                <p className="text-sm text-t2">Seus dados foram enviados. O administrador irá revisar seu cadastro.</p>
              </div>

              <div className="text-left space-y-2 mb-6 bg-surf2 rounded-xl p-4 text-sm">
                <div><span className="text-t3 mr-1">Nome:</span>{user?.displayName}</div>
                <div><span className="text-t3 mr-1">E-mail:</span>{user?.email}</div>
                <div><span className="text-t3 mr-1">WhatsApp:</span>{celular}</div>
                <div>
                  <span className="text-t3 mr-1">Matérias:</span>
                  {selectedSubjs.length > 0
                    ? selectedSubjs.map(id => store.subjects.find(s => s.id === id)?.name).filter(Boolean).join(', ')
                    : <span className="text-t3 italic">Nenhuma selecionada</span>}
                </div>
              </div>

              {myScheduleCount > 0 && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-ok/10 border border-ok/30 text-ok text-sm font-semibold mb-4">
                  <span>✅</span>
                  <span>{myScheduleCount} horário{myScheduleCount !== 1 ? 's' : ''} cadastrado{myScheduleCount !== 1 ? 's' : ''} na sua grade</span>
                </div>
              )}

              <button onClick={logout} className="btn btn-ghost w-full">
                Sair da conta
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
