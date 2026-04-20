// TabSegments — gerenciamento de segmentos com TurnoSelector e GradeList

import { useState } from 'react'
import useAppStore from '../../../store/useAppStore'
import { toast } from '../../../hooks/useToast'
import TurnoSelector from '../shared/TurnoSelector'
import { GradeList } from '../teachers'

export default function TabSegments() {
  const store = useAppStore()
  const [name, setName] = useState('')

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="font-bold text-sm mb-3">Novo Segmento</div>
        <div className="flex gap-2">
          <input
            className="inp"
            placeholder="Ex: Educação Infantil"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && name.trim()) {
                store.addSegment(name.trim()); setName(''); toast('Segmento criado', 'ok')
              }
            }}
          />
          <button className="btn btn-dark" onClick={() => {
            if (!name.trim()) return
            store.addSegment(name.trim()); setName(''); toast('Segmento criado', 'ok')
          }}>
            Adicionar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {store.segments.map(seg => (
          <div key={seg.id} className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-base">{seg.name}</div>
                <div className="text-xs text-t3">{seg.grades.length} série{seg.grades.length !== 1 ? 's' : ''}</div>
              </div>
              <button
                className="btn btn-ghost btn-xs text-err"
                onClick={() => { if (confirm('Remover segmento?')) store.removeSegment(seg.id) }}
              >
                ✕ Remover
              </button>
            </div>

            <TurnoSelector seg={seg} store={store} />
            <GradeList seg={seg} store={store} />
          </div>
        ))}
      </div>
    </div>
  )
}
