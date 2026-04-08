import { useNavigate } from 'react-router-dom'

export default function ActionCard({ icon, label, desc, to, primary = false }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      className={`
        relative flex flex-col items-start gap-1.5 p-5 rounded-xl border text-left
        transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg min-h-[140px]
        ${primary
          ? 'bg-navy border-transparent text-white shadow-md'
          : 'bg-surf border-bdr hover:border-t3'}
      `}
    >
      <div className="text-3xl leading-none mb-1">{icon}</div>
      <div className={`text-sm font-bold leading-tight ${primary ? 'text-white' : 'text-t1'}`}>{label}</div>
      <div className={`text-xs leading-relaxed flex-1 ${primary ? 'text-white/70' : 'text-t2'}`}>{desc}</div>
      <div className={`absolute bottom-3.5 right-4 text-2xl font-light ${primary ? 'text-white/40' : 'text-t3'}`}>›</div>
    </button>
  )
}
