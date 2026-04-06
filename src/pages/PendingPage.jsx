import useAuthStore from '../store/useAuthStore'

export default function PendingPage() {
  const { user, logout } = useAuthStore()
  const name = user?.displayName ?? ''

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-5">⏳</div>
        <h2 className="text-2xl font-extrabold mb-3">Aguardando aprovação</h2>
        <p className="text-sm text-t2 leading-relaxed mb-6">
          Olá, <strong>{name}</strong>!<br />
          Seu acesso foi solicitado e está aguardando aprovação pelo administrador.
          Em breve você receberá liberação para acessar o sistema.
        </p>
        <button
          onClick={logout}
          className="btn btn-ghost"
        >
          Sair
        </button>
      </div>
    </div>
  )
}
