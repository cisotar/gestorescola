// PreviewVertical — lista vertical unificada de períodos regulares e especiais

import { toMin } from '../../../lib/periods'

export default function PreviewVertical({ items }) {
  if (!items || items.length === 0) return null

  return (
    <div className="bg-surf2 rounded-xl p-3">
      <div className="text-[11px] font-bold text-t2 uppercase tracking-wide mb-2">Preview</div>
      <div className="flex flex-col gap-0.5">
        {items.map((b, i) => {
          const dur = Math.max(0, toMin(b.fim) - toMin(b.inicio))
          const isAulaEspecial = b.isEspecial && !b.isIntervalo
          const isIntervaloEspecial = b.isEspecial && b.isIntervalo
          const rowCls = [
            'flex items-center gap-2 px-2 py-1 rounded text-[11px]',
            isAulaEspecial
              ? 'border-l-2 border-accent text-accent'
              : isIntervaloEspecial
                ? 'border-l-2 border-dashed border-accent text-t2'
                : b.isIntervalo
                  ? 'text-t3'
                  : 'text-t2',
          ].join(' ')
          const icone = b.isIntervalo ? '⏸' : '▶'
          return (
            <div key={i} className={rowCls}>
              <span className="shrink-0 opacity-70">{icone}</span>
              <span className="font-medium">{b.label}</span>
              <span className="ml-auto shrink-0 font-mono opacity-80">{b.inicio}–{b.fim}</span>
              {b.isIntervalo && (
                <span className="shrink-0 text-[10px] opacity-60">({dur} min)</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
