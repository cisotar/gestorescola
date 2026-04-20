// SubjectSelector — multi-select de disciplinas por segmento
// Reutilizado em TabDisciplines (AreaBlock), TabTeachers e TabProfile

import { useState } from 'react'
import { COLOR_PALETTE } from '../../../lib/constants'

export default function SubjectSelector({ store, selectedIds, onChange }) {
  const [activeSeg, setActiveSeg] = useState(store.segments[0]?.id ?? null)

  const toggle = (subjectId) => {
    const next = selectedIds.includes(subjectId)
      ? selectedIds.filter(x => x !== subjectId)
      : [...selectedIds, subjectId]
    onChange(next)
  }

  const segAreas = activeSeg
    ? store.areas.filter(a => (a.segmentIds ?? []).includes(activeSeg))
    : []

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {store.segments.map(seg => {
          const countSelected = store.subjects.filter(s => {
            const area = store.areas.find(a => a.id === s.areaId)
            return (area?.segmentIds ?? []).includes(seg.id) && selectedIds.includes(s.id)
          }).length
          return (
            <button
              key={seg.id}
              onClick={() => setActiveSeg(seg.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors flex items-center gap-1.5
                ${activeSeg === seg.id ? 'bg-navy text-white border-navy' : 'bg-surf text-t2 border-bdr hover:border-t3'}`}
            >
              {seg.name}
              {countSelected > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${activeSeg === seg.id ? 'bg-white/20 text-white' : 'bg-navy text-white'}`}>
                  {countSelected}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeSeg && (
        <div className="border border-bdr rounded-xl overflow-hidden">
          {segAreas.length === 0 ? (
            <p className="text-xs text-t3 p-4">Nenhuma área cadastrada para este segmento.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto scroll-thin">
              {segAreas.map(area => {
                const cv   = COLOR_PALETTE[area.colorIdx % COLOR_PALETTE.length]
                const subs = store.subjects.filter(s => s.areaId === area.id)
                if (!subs.length) return null
                return (
                  <div key={area.id}>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider sticky top-0"
                      style={{ background: cv.tg, color: cv.tx }}>
                      {area.name}
                    </div>
                    {subs.map(s => (
                      <label key={s.id}
                        className="flex items-center gap-2 px-4 py-2 text-sm cursor-pointer hover:bg-surf2 border-b border-bdr/40 last:border-0">
                        <input
                          type="checkbox"
                          className="accent-navy"
                          checked={selectedIds.includes(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
