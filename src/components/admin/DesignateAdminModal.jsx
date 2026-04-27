// DesignateAdminModal — UI/validação local + submit assíncrono para troca do
// admin local de uma escola pelo SaaS admin (issue 424).
// Padrão visual e de estado segue CreateSchoolModal (issue 417).

import { useState } from 'react'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(email) {
  const trimmed = email.trim()
  if (!trimmed) return 'Informe um e-mail'
  if (!EMAIL_REGEX.test(trimmed)) return 'E-mail inválido'
  return ''
}

export default function DesignateAdminModal({ open, onClose, school, onSubmit }) {
  const [adminEmail, setAdminEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null) // { field?: 'form', message }

  const emailError = validateEmail(adminEmail)
  const isValid = !emailError

  function resetState() {
    setAdminEmail('')
    setEmailTouched(false)
    setIsSubmitting(false)
    setSubmitError(null)
  }

  function handleClose() {
    if (isSubmitting) return
    resetState()
    onClose?.()
  }

  function handleEmailChange(e) {
    setAdminEmail(e.target.value)
    if (submitError) setSubmitError(null)
  }

  async function handleSubmit() {
    setEmailTouched(true)
    if (!isValid || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit?.({ adminEmail: adminEmail.trim() })
      resetState()
    } catch (err) {
      const code = err?.code
      if (code === 'permission-denied') {
        setSubmitError({ field: 'form', message: 'Sem permissão para designar admin local' })
      } else {
        setSubmitError({ field: 'form', message: 'Erro ao designar admin local. Tente novamente.' })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Designar admin local" size="sm">
      <div className="space-y-4">
        {school && (
          <div className="rounded-md border border-bdr bg-surf2 p-3 text-sm">
            <div className="text-t1 font-medium">{school.name || school.slug}</div>
            <div className="text-t3 mt-0.5">
              Admin atual:{' '}
              <span className="text-t2">{school.adminEmail || '—'}</span>
            </div>
          </div>
        )}

        <div>
          <label className="lbl mb-1 block">Novo e-mail do admin local</label>
          <input
            className="inp w-full"
            type="email"
            placeholder="admin@escola.com"
            value={adminEmail}
            onChange={handleEmailChange}
            onBlur={() => setEmailTouched(true)}
            maxLength={120}
            autoFocus
          />
          {emailTouched && emailError && (
            <p className="text-err text-sm mt-1">{emailError}</p>
          )}
          <p className="text-t3 text-sm mt-1">
            O novo admin terá acesso elevado no próximo login (ou imediatamente,
            se já for membro desta escola).
          </p>
        </div>

        {submitError?.field === 'form' && (
          <p className="text-err text-sm">{submitError.message}</p>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button
            className="btn"
            onClick={handleClose}
            disabled={isSubmitting}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="btn btn-dark flex items-center justify-center min-w-[120px]"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            type="button"
          >
            {isSubmitting ? <Spinner size={16} /> : 'Designar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
