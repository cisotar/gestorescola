import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function SchoolScheduleRedirect() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const turma = searchParams.get('turma')
    const newPath = turma ? `/grades?turma=${turma}` : '/grades'
    navigate(newPath, { replace: true })
  }, [navigate, searchParams])

  return null
}
