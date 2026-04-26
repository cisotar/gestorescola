  import { useState, useEffect } from 'react'
  import { getDoc } from 'firebase/firestore'
  import useAppStore from '../store/useAppStore'
  import useAuthStore from '../store/useAuthStore'
  import useSchoolStore from '../store/useSchoolStore'
  import { updatePendingData } from '../lib/db'
  import { getSchoolDocRef } from '../lib/firebase/multi-tenant'
  import { ScheduleGrid } from '../components/ui/ScheduleGrid'
  import Modal from '../components/ui/Modal'
  import { DAYS } from '../lib/constants'

  const PHONE_REGEX = /^[1-9][0-9]9[0-9]{7,8}$/

  function HorarioDiaSemana({ day, value, onChange }) {
    const entrada = value?.entrada ?? ''
    const saida   = value?.saida   ?? ''

    let error = null
    if (entrada && !saida) error = 'Preencha a saída também'
    else if (!entrada && saida) error = 'Preencha a entrada também'
    else if (entrada && saida && saida <= entrada) error = 'Saída deve ser após a entrada'

    return (
      <div>
        <div className="flex items-center gap-3">
          <span className="w-20 text-sm font-medium text-t1 shrink-0">{day}</span>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="time"
              className="inp flex-1"
              value={entrada}
              onChange={e => onChange(day, 'entrada', e.target.value)}
            />
            <span className="text-t3 text-sm shrink-0">até</span>
            <input
              type="time"
              className="inp flex-1"
              value={saida}
              onChange={e => onChange(day, 'saida', e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-xs text-err mt-1 ml-23">{error}</p>}
      </div>
    )
  }

  function validatePhone(raw) {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return 'Informe o telefone'
    if (!PHONE_REGEX.test(digits)) return 'Número inválido. Use DDD + número começando com 9 (ex: 11987654321)'
    return null
  }

  function ModalErroValidacao({ open, erros, onClose }) {
    return (
      <Modal open={open} onClose={onClose} title="Dados Incompletos" size="sm">
        <div className="space-y-2 mb-4">
          {erros.map((erro, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <span className="text-lg leading-none mt-0.5">❌</span>
              <span className="text-sm text-t1">{erro}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="btn btn-dark w-full"
        >
          Entendi, vou corrigir
        </button>
      </Modal>
    )
  }

  function ModalCopiaHorario({ open, onClose, onConfirm }) {
    return (
      <Modal open={open} onClose={onClose} title="Copiar horário para toda semana?">
        <div className="space-y-4">
          <p className="text-sm text-t2">
            Deseja aplicar esse horário de entrada e saída para todos os dias da semana?
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="btn btn-ghost flex-1"
            >
              Não, obrigado
            </button>
            <button
              onClick={onConfirm}
              className="btn btn-dark flex-1"
            >
              Copiar para toda semana
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  export default function PendingPage() {
    const { user, logout }               = useAuthStore()
    const store                          = useAppStore()
    const { currentSchoolId }            = useSchoolStore()
    const [step,          setStep]       = useState('form') // 'form' | 'schedule' | 'waiting'
    const [celular,       setCelular]    = useState('')
    const [apelido,       setApelido]    = useState('')
    const [selectedSubjs, setSelSubjs]  = useState([])
    const [horariosSemana, setHorariosSemana] = useState({})
    const [saving,        setSaving]    = useState(false)
    const [saveError,     setSaveError]  = useState('')
    const [modalErroAberto, setModalErroAberto] = useState(false)
    const [errosValidacao, setErrosValidacao] = useState([])
    const [horarioCopiaOfertado, setHorarioCopiaOfertado] = useState(false)
    const [modalCopiaAberto, setModalCopiaAberto] = useState(false)
    const [horarioCopiaEntrada, setHorarioCopiaEntrada] = useState('')
    const [horarioCopiacSaida, setHorarioCopiacSaida] = useState('')

    // Erros de validação de horários — derivados sem estado extra
    const horarioErrors = Object.fromEntries(
      DAYS.map(day => {
        const v = horariosSemana[day]
        const entrada = v?.entrada ?? ''
        const saida   = v?.saida   ?? ''
        let error = null
        if (entrada && !saida) error = 'Preencha a saída também'
        else if (!entrada && saida) error = 'Preencha a entrada também'
        else if (entrada && saida && saida <= entrada) error = 'Saída deve ser após a entrada'
        return [day, error]
      })
    )
    const hasHorarioError = Object.values(horarioErrors).some(Boolean)
    const temAoMenosUmDiaCompleto = DAYS.some(day => {
      const v = horariosSemana[day]
      return v?.entrada && v?.saida && v.saida > v.entrada
    })

    const handleHorarioChange = (day, field, val) => {
      setHorariosSemana(prev => {
        const current = prev[day] ?? { entrada: '', saida: '' }
        const updated = { ...current, [field]: val }
        // Remove a chave se ambos os campos ficarem vazios
        if (!updated.entrada && !updated.saida) {
          const { [day]: _, ...rest } = prev
          return rest
        }

        // Detectar primeiro par completo e oferecer cópia
        if (!horarioCopiaOfertado && updated.entrada && updated.saida) {
          setHorarioCopiaOfertado(true)
          setHorarioCopiaEntrada(updated.entrada)
          setHorarioCopiacSaida(updated.saida)
          setModalCopiaAberto(true)
        }

        return { ...prev, [day]: updated }
      })
    }

    // Re-entry: se celular já foi salvo, retomar no step de grade horária
    useEffect(() => {
      if (!currentSchoolId) return
      getDoc(getSchoolDocRef(currentSchoolId, 'pending_teachers', user.uid)).then(snap => {
        if (snap.exists() && snap.data().celular) {
          setCelular(snap.data().celular)
          setApelido(snap.data().apelido ?? '')
          setSelSubjs(snap.data().subjectIds ?? [])
          setStep('schedule')
        }
      })
    }, [currentSchoolId])

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
      const erros = []

      // Validar matérias
      if (selectedSubjs.length === 0) {
        erros.push('Selecione ao menos uma matéria')
      }

      // Validar celular
      const pErr = validatePhone(celular)
      if (pErr) {
        erros.push(pErr)
      }

      // Validar horários de entrada/saída
      if (!temAoMenosUmDiaCompleto) {
        erros.push('Preencha horários de entrada e saída')
      }

      // Se há erros, abrir modal
      if (erros.length > 0) {
        setErrosValidacao(erros)
        setModalErroAberto(true)
        return
      }

      // Salva dados iniciais e avança para o cadastro de grade de aulas
      setSaving(true); setSaveError('')
      console.log('[PendingPage] handleSubmit', { currentSchoolId, uid: user.uid, hasHorarios: Object.keys(horariosSemana).length })
      if (!currentSchoolId) {
        setSaveError('Erro: escola não selecionada. Recarregue a página.')
        setSaving(false)
        return
      }
      try {
        await updatePendingData(currentSchoolId, user.uid, { celular: celular.replace(/\D/g, ''), apelido: apelido.trim(), subjectIds: selectedSubjs, horariosSemana })
        console.log('[PendingPage] updatePendingData OK')
        setStep('schedule')
      } catch (e) {
        console.error('[PendingPage] updatePendingData FAIL', e)
        setSaveError('Erro ao salvar: ' + e.message)
      } finally {
        setSaving(false)
      }
    }

    const handleCopiaHorarios = () => {
      const novoHorario = { entrada: horarioCopiaEntrada, saida: horarioCopiacSaida }
      const horariosCopia = { ...horariosSemana }
      DAYS.forEach(day => {
        horariosCopia[day] = { ...novoHorario }
      })
      setHorariosSemana(horariosCopia)
      setModalCopiaAberto(false)
    }

    // Teacher sintético para ScheduleGrid — usa user.uid como id (mesmo que o admin associará ao aprovar)
    const syntheticTeacher = { id: user.uid, subjectIds: selectedSubjs, name: user?.displayName ?? '' }

    const myScheduleCount = store.schedules.filter(s => s.teacherId === user.uid).length

    const containerMax = step === 'schedule' ? 'max-w-7xl lg:max-w-[95vw]' : 'max-w-4xl'

    if (!currentSchoolId) {
      return (
        <div className="fixed inset-0 bg-bg overflow-y-auto p-4">
          <div className="min-h-full flex items-start justify-center">
            <div className="bg-surf border border-bdr rounded-2xl shadow-xl p-8 w-full max-w-md my-8 text-center">
              <div className="text-4xl mb-4">🔗</div>
              <h2 className="text-xl font-extrabold mb-2">Link de convite necessário</h2>
              <p className="text-sm text-t2 mb-6">
                Para se cadastrar, acesse o link de convite da sua escola.
              </p>
              <button onClick={logout} className="btn btn-ghost w-full">
                Sair da conta
              </button>
            </div>
          </div>
        </div>
      )
    }

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
                        className="inp"
                        placeholder="11987654321"
                        value={celular}
                        onChange={e => setCelular(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      />
                      <p className="text-xs text-t3 mt-1">Use seu número de WhatsApp. Formato: DDD (sem zero) + número (ex: 11987654321)</p>
                    </div>

                    {/* Apelido */}
                    <div>
                      <label className="lbl">Como prefere ser chamado? <span className="text-t3 normal-case font-normal">(opcional)</span></label>
                      <input
                        className="inp"
                        type="text"
                        placeholder="Ex: Prof. João, Joãozinho..."
                        maxLength={30}
                        value={apelido}
                        onChange={e => setApelido(e.target.value)}
                      />
                      <p className="text-xs text-t3 mt-1">Apelido exibido nas grades horárias quando o toggle "Apelido" estiver ativo.</p>
                    </div>

                    {/* Matérias */}
                    <div>
                      <label className="lbl">Matérias que leciona <span className="text-err">*</span></label>
                      {store.subjects.length === 0 ? (
                        <p className="text-xs text-t3 mt-1">Carregando matérias...</p>
                      ) : segGroups.length === 0 ? (
                        <p className="text-xs text-t3 mt-1">Nenhuma matéria cadastrada no sistema ainda.</p>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
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
                    </div>

                    {/* Horários de entrada/saída */}
                    <div>
                      <label className="lbl">Seus horários na escola <span className="text-err">*</span></label>
                      <p className="text-xs text-t3 mt-0.5 mb-3">Informe seus horários de entrada e saída por dia. Deixe em branco os dias em que não trabalha.</p>
                      <div className="space-y-3">
                        {DAYS.map(day => (
                          <HorarioDiaSemana
                            key={day}
                            day={day}
                            value={horariosSemana[day]}
                            onChange={handleHorarioChange}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Erro de save */}
                    {saveError && <p className="text-xs text-err">{saveError}</p>}

                    {/* Ações */}
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        onClick={handleSubmit}
                        disabled={saving || hasHorarioError || !temAoMenosUmDiaCompleto}
                        className="btn btn-dark w-full disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Salvando…' : 'Próximo →'}
                      </button>
                      <button onClick={logout} className="btn btn-ghost w-full">
                        Sair da conta
                      </button>
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

                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-start">
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

                    <div className="text-sm pt-1">
                      <div className="font-semibold text-t1">
                        {myScheduleCount} aula(s) cadastrada(s)
                      </div>
                      {myScheduleCount === 0 && (
                        <p className="text-xs text-err mt-1">
                          Cadastre ao menos uma aula na grade ao lado para concluir
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 pt-2">
                      <button
                        onClick={() => setStep('waiting')}
                        disabled={myScheduleCount === 0}
                        className="btn btn-dark w-full disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Concluir
                      </button>
                      <button onClick={() => setStep('form')} className="btn btn-ghost w-full">
                        ← Voltar
                      </button>
                    </div>
                  </div>

                  {/* Coluna direita — grade horária */}
                  <div className="min-w-0">
                    <ScheduleGrid teacher={syntheticTeacher} store={store} horariosSemana={horariosSemana} />
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

                <div className="space-y-2">
                  <button onClick={() => setStep('schedule')} className="btn btn-ghost w-full">
                    ← Editar grade de aulas
                  </button>
                  <button onClick={logout} className="btn btn-ghost w-full">
                    Sair da conta
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <ModalErroValidacao
          open={modalErroAberto}
          erros={errosValidacao}
          onClose={() => setModalErroAberto(false)}
        />

        <ModalCopiaHorario
          open={modalCopiaAberto}
          onClose={() => setModalCopiaAberto(false)}
          onConfirm={handleCopiaHorarios}
        />
      </div>
    )
  }
