// CreateSchoolModal — UI/validação local + submit assíncrono para criação de escola pelo SaaS admin.
// Integração com createSchoolFromAdmin (issue 417).

import { useState } from 'react'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

const SLUG_REGEX = /^[a-z0-9-]+$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeSlug(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function validateSlug(slug) {
  if (!slug) return 'Informe o slug da escola'
  if (slug.length < 3) return 'Mínimo 3 caracteres'
  if (!SLUG_REGEX.test(slug)) return 'Use apenas letras minúsculas, números e hífen'
  return ''
}

function validateEmail(email) {
  const trimmed = email.trim()
  if (!trimmed) return 'Informe um e-mail'
  if (!EMAIL_REGEX.test(trimmed)) return 'E-mail inválido'
  return ''
}

export default function CreateSchoolModal({ open, onClose, onSubmit }) {
  const [slug, setSlug] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null) // { field?: 'slug'|'form', message }

  const slugError = validateSlug(slug)
  const emailError = validateEmail(adminEmail)
  const isValid = !slugError && !emailError

  function resetState() {
    setSlug('')
    setAdminEmail('')
    setSlugTouched(false)
    setEmailTouched(false)
    setIsSubmitting(false)
    setSubmitError(null)
  }

  function handleClose() {
    if (isSubmitting) return
    resetState()
    onClose?.()
  }

  function handleSlugChange(e) {
    setSlug(normalizeSlug(e.target.value))
    if (submitError?.field === 'slug') setSubmitError(null)
  }

  function handleEmailChange(e) {
    setAdminEmail(e.target.value)
  }

  async function handleSubmit() {
    setSlugTouched(true)
    setEmailTouched(true)
    if (!isValid || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit?.({ slug, adminEmail: adminEmail.trim() })
    } catch (err) {
      const code = err?.code
      if (code === 'slug-taken') {
        setSubmitError({ field: 'slug', message: 'Slug já está em uso' })
      } else if (code === 'permission-denied') {
        setSubmitError({ field: 'form', message: 'Sem permissão para criar escolas' })
      } else {
        setSubmitError({ field: 'form', message: 'Erro ao criar escola. Tente novamente.' })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nova escola" size="sm">
      <div className="space-y-4">
        <div>
          <label className="lbl mb-1 block">Slug</label>
          <input
            className="inp w-full"
            type="text"
            placeholder="colegio-x"
            value={slug}
            onChange={handleSlugChange}
            onBlur={() => setSlugTouched(true)}
            maxLength={40}
            autoFocus
          />
          <p className="text-t3 text-sm mt-1">
            Link de convite: gestordesubstituicoes-react.web.app/join/{slug || '…'}
          </p>
          {slugTouched && slugError && (
            <p className="text-err text-sm mt-1">{slugError}</p>
          )}
          {!slugError && submitError?.field === 'slug' && (
            <p className="text-err text-sm mt-1">{submitError.message}</p>
          )}
        </div>

        <div>
          <label className="lbl mb-1 block">E-mail do admin local</label>
          <input
            className="inp w-full"
            type="email"
            placeholder="admin@escola.com"
            value={adminEmail}
            onChange={handleEmailChange}
            onBlur={() => setEmailTouched(true)}
            maxLength={120}
          />
          {emailTouched && emailError && (
            <p className="text-err text-sm mt-1">{emailError}</p>
          )}
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
            {isSubmitting ? <Spinner size={16} /> : 'Criar escola'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
