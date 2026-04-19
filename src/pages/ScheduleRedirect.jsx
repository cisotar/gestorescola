import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function ScheduleRedirect() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const teacherId = searchParams.get('teacher')
    const newPath = teacherId ? `/grades?teacher=${teacherId}` : '/grades'
    navigate(newPath, { replace: true })
  }, [navigate, searchParams])

  return null
}
