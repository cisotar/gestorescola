import { useState } from 'react'
import useAuthStore from '../store/useAuthStore'
import { updatePendingPhone } from '../lib/db'

export default function PendingPage() {
  const { user, logout } = useAuthStore()
  const [phone, setPhone]   = useState('')
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!phone.trim()) return
    setSaving(true)
    try {
      await updatePendingPhone(user.uid, phone.trim())
      setSaved(true)
    } catch (e) {
      alert('Erro ao salvar telefone: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg p-4">
      <div className="bg-surf border border-bdr rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h2 className="text-xl font-extrabold mb-2">Aguardando aprovação</h2>
        <p className="text-sm text-t2 leading-relaxed mb-6">
          Olá, <strong>{user?.displayName}</strong>!<br />
          Seu acesso está aguardando aprovação pelo administrador.
        </p>

        <div className="text-left space-y-3 mb-6">
          <div>
            <label className="text-xs font-bold text-t2 block mb-1">E-mail</label>
            <div className="inp bg-surf2 text-t3 cursor-not-allowed select-none">{user?.email}</div>
          </div>

          {saved ? (
            <div className="flex items-center gap-2 text-ok text-sm font-semibold py-2">
              <span>✓</span> Telefone salvo com sucesso
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-t2 block mb-1">Telefone (opcional)</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  className="inp flex-1"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !phone.trim()}
                  className="btn btn-dark"
                >
                  {saving ? '…' : 'Salvar'}
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={logout} className="btn btn-ghost w-full">
          Sair da conta
        </button>
      </div>
    </div>
  )
}
