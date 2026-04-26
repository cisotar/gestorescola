import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'

export default function LoginPage() {
  const { login, user } = useAuthStore()
  const location = useLocation()
  const navigate  = useNavigate()
  const redirect  = location.state?.redirect

  // Após login bem-sucedido, redireciona para a rota de origem (ex: /join/:slug)
  useEffect(() => {
    if (user && redirect) {
      navigate(redirect, { replace: true })
    }
  }, [user, redirect, navigate])

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg p-4">
      <div className="bg-surf border border-bdr rounded-2xl shadow-xl p-12 w-full max-w-sm text-center">
        <div className="text-3xl font-extrabold tracking-tight mb-2">
          <span className="text-accent">Gestão</span>
          <span className="text-navy">Escolar</span>
        </div>
        <p className="text-sm text-t2 mb-8">Sistema de Faltas e Substituições</p>

        <button
          onClick={login}
          className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl border border-bdr bg-surf text-t1 font-semibold text-sm hover:bg-surf2 hover:border-t3 transition-all shadow-sm"
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
          </svg>
          Entrar com Google
        </button>

        <p className="text-xs text-t3 mt-5 leading-relaxed">
          Apenas usuários cadastrados e aprovados têm acesso ao sistema.
        </p>
      </div>
    </div>
  )
}
