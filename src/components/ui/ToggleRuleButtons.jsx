export default function ToggleRuleButtons({ activeRule, onRuleChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-t2 uppercase tracking-wider">Regra:</span>
      <button
        className={`btn btn-sm ${activeRule === 'qualitative' ? 'btn-dark' : 'btn-ghost'}`}
        onClick={() => onRuleChange('qualitative')}
      >
        Qualitativo
      </button>
      <button
        className={`btn btn-sm ${activeRule === 'quantitative' ? 'btn-dark' : 'btn-ghost'}`}
        onClick={() => onRuleChange('quantitative')}
      >
        Quantitativo
      </button>
    </div>
  )
}
