import { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { updatePendingData } from '../lib/db'
import { db } from '../lib/firebase'

export default function PendingPage() {
  const { user, logout }              = useAuthStore()
  const store                         = useAppStore()
  const [step,         setStep]       = useState('form') // 'form' | 'waiting'
  const [celular,      setCelular]    = useState('')
  const [selectedSubjs, setSelSubjs] = useState([])
  const [saving,       setSaving]    = useState(false)
  const [error,        setError]     = useState('')

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

  // Agrupa matérias por segmento (mesma lógica de TabSchedules)
  const segGroups = store.segments.map(seg => {
    const subjsInSeg = store.subjects.filter(s => {
      const area = store.areas.find(a => a.id === s.areaId)
      return (area?.segmentIds ?? []).includes(seg.id)
    })
    return { seg, subjs: subjsInSeg }
  }).filter(g => g.subjs.length > 0)

  const handleSubmit = async () => {
    if (!celular.trim()) return
    setSaving(true); setError('')
    try {
      await updatePendingData(user.uid, { celular: celular.trim(), subjectIds: selectedSubjs })
      setStep('waiting')
    } catch (e) {
      setError('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleSubj = (id) =>
    setSelSubjs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg p-4 overflow-y-auto">
      <div className="bg-surf border border-bdr rounded-2xl shadow-xl p-8 w-full max-w-md my-auto">

        {step === 'form' ? (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">👋</div>
              <h2 className="text-xl font-extrabold mb-1">Complete seu cadastro</h2>
              <p className="text-sm text-t2">Preencha seus dados para solicitar acesso ao sistema.</p>
            </div>

            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="lbl">Nome</label>
                <div className="inp bg-surf2 text-t3 cursor-not-allowed select-none">{user?.displayName}</div>
              </div>

              {/* E-mail */}
              <div>
                <label className="lbl">E-mail</label>
                <div className="inp bg-surf2 text-t3 cursor-not-allowed select-none">{user?.email}</div>
              </div>

              {/* Telefone */}
              <div>
                <label className="lbl">Telefone <span className="text-err">*</span></label>
                <input
                  type="tel"
                  className="inp"
                  placeholder="(11) 99999-9999"
                  value={celular}
                  onChange={e => setCelular(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
              </div>

              {/* Matérias */}
              {segGroups.length > 0 && (
                <div>
                  <label className="lbl">Matérias que leciona</label>
                  <div className="space-y-3 mt-2">
                    {segGroups.map(({ seg, subjs }) => (
                      <div key={seg.id}>
                        <div className="text-xs font-bold text-t2 uppercase tracking-wide mb-2">{seg.name}</div>
                        <div className="flex flex-wrap gap-2">
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
              )}

              {/* Erro */}
              {error && <p className="text-xs text-err">{error}</p>}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={saving || !celular.trim()}
                className="btn btn-dark w-full disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Salvando…' : 'Enviar cadastro'}
              </button>

              <button onClick={logout} className="btn btn-ghost w-full">
                Sair da conta
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">⏳</div>
              <h2 className="text-xl font-extrabold mb-2">Aguardando aprovação</h2>
              <p className="text-sm text-t2">Seus dados foram enviados. O administrador irá revisar seu cadastro.</p>
            </div>

            <div className="text-left space-y-2 mb-6 bg-surf2 rounded-xl p-4 text-sm">
              <div><span className="text-t3 mr-1">Nome:</span>{user?.displayName}</div>
              <div><span className="text-t3 mr-1">E-mail:</span>{user?.email}</div>
              <div><span className="text-t3 mr-1">Telefone:</span>{celular}</div>
              <div>
                <span className="text-t3 mr-1">Matérias:</span>
                {selectedSubjs.length > 0
                  ? selectedSubjs.map(id => store.subjects.find(s => s.id === id)?.name).filter(Boolean).join(', ')
                  : <span className="text-t3 italic">Nenhuma selecionada</span>}
              </div>
            </div>

            <button onClick={logout} className="btn btn-ghost w-full">
              Sair da conta
            </button>
          </>
        )}
      </div>
    </div>
  )
}
