import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'
import useSchoolStore from '../store/useSchoolStore'
import { toast } from '../hooks/useToast'
import { uid } from '../lib/helpers/ids'
import { createSchool, getSchoolSlug } from '../lib/db'
import Spinner from '../components/ui/Spinner'

function SlugInput({ value, onChange, status }) {
  return (
    <div>
      <input
        className="inp w-full"
        type="text"
        placeholder="ex: escola-municipal-abc"
        value={value}
        onChange={onChange}
        maxLength={40}
      />
      {status === 'checking' && (
        <p className="text-t3 text-sm mt-1">Verificando…</p>
      )}
      {status === 'available' && (
        <p className="text-ok text-sm mt-1">Disponível</p>
      )}
      {status === 'taken' && (
        <p className="text-err text-sm mt-1">Já está em uso</p>
      )}
    </div>
  )
}

function SlugPreview({ slug }) {
  return (
    <p className="text-t3 text-sm mt-1">
      Link de convite: gestordesubstituicoes-react.web.app/join/{slug || '…'}
    </p>
  )
}

function SchoolFormCard({ name, slug, slugStatus, onNameChange, onNameBlur, onSlugChange, onSubmit, loading }) {
  const isDisabled = !name.trim() || !slug.trim() || slugStatus !== 'available' || loading || slugStatus === 'checking'

  return (
    <div className="bg-surf border border-bdr rounded-2xl shadow-xl p-12 w-full max-w-sm">
      <div className="text-3xl font-extrabold tracking-tight mb-2 text-center">
        <span className="text-accent">Gestão</span>
        <span className="text-navy">Escolar</span>
      </div>
      <p className="text-sm text-t2 mb-8 text-center">Configure sua escola para começar.</p>

      <div className="flex flex-col gap-4">
        <div>
          <label className="lbl mb-1 block">Nome da escola</label>
          <input
            className="inp w-full"
            type="text"
            placeholder="ex: Escola Municipal ABC"
            value={name}
            onChange={onNameChange}
            onBlur={onNameBlur}
            maxLength={80}
            required
          />
        </div>

        <div>
          <label className="lbl mb-1 block">Slug</label>
          <SlugInput
            value={slug}
            onChange={onSlugChange}
            status={slugStatus}
          />
          <SlugPreview slug={slug} />
        </div>

        <button
          className="btn btn-dark w-full mt-2 flex items-center justify-center"
          disabled={isDisabled}
          onClick={onSubmit}
        >
          {loading ? <Spinner size={16} /> : 'Criar escola'}
        </button>
      </div>

      <div className="text-center mt-6">
        <button
          className="text-sm text-t3 hover:text-t2 transition-colors"
          onClick={() => useAuthStore.getState().logout()}
          type="button"
        >
          Sair
        </button>
      </div>
    </div>
  )
}

function normalizeSlug(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export default function CreateSchoolPage() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState('idle')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    const isValidSlug = slug && slug.length >= 3 && /^[a-z0-9-]+$/.test(slug)

    if (!isValidSlug) {
      setSlugStatus('idle')
      return
    }

    setSlugStatus('checking')

    const timer = setTimeout(async () => {
      const result = await getSchoolSlug(slug)
      setSlugStatus(result ? 'taken' : 'available')
    }, 400)

    return () => clearTimeout(timer)
  }, [slug])

  function handleNameChange(e) {
    setName(e.target.value)
  }

  function handleNameBlur() {
    if (!slug.trim()) {
      setSlug(normalizeSlug(name))
    }
  }

  function handleSlugChange(e) {
    const normalized = normalizeSlug(e.target.value)
    setSlug(normalized)
  }

  async function handleCreateSchool() {
    if (!user) return

    setLoading(true)

    try {
      const schoolId = uid()
      await createSchool(schoolId, name, slug, user.uid)
      await useSchoolStore.getState().setCurrentSchool(schoolId)
      await useSchoolStore.getState().loadAvailableSchools(user.uid)
      navigate('/settings', { replace: true })
    } catch {
      toast('Erro ao criar escola. Tente novamente.', 'err')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg p-4">
      <SchoolFormCard
        name={name}
        slug={slug}
        slugStatus={slugStatus}
        onNameChange={handleNameChange}
        onNameBlur={handleNameBlur}
        onSlugChange={handleSlugChange}
        onSubmit={handleCreateSchool}
        loading={loading}
      />
    </div>
  )
}
