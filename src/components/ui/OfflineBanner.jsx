import useNetworkStore from '../../store/useNetworkStore'

export default function OfflineBanner() {
  const online = useNetworkStore(s => s.online)
  if (online) return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-warn text-white text-sm font-semibold px-4 py-2 text-center shadow-md">
      Você está offline — algumas ações ficarão indisponíveis até a conexão voltar.
    </div>
  )
}
