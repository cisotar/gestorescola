// GradeList — lista de séries dentro de um segmento (TabSegments)

import { useState } from 'react'
import GradeRow from './GradeRow'

export default function GradeList({ seg, store }) {
  const [gradeInput, setGradeInput] = useState('')

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          className="inp"
          placeholder="Ex: 5º Ano, 4ª Série…"
          value={gradeInput}
          onChange={e => setGradeInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && gradeInput.trim()) {
              store.addGrade(seg.id, gradeInput.trim()); setGradeInput('')
            }
          }}
        />
        <button className="btn btn-dark" onClick={() => {
          if (!gradeInput.trim()) return
          store.addGrade(seg.id, gradeInput.trim()); setGradeInput('')
        }}>+ Série</button>
      </div>
      <div className="space-y-3">
        {seg.grades.map(grade => <GradeRow key={grade.name} seg={seg} grade={grade} store={store} />)}
      </div>
    </div>
  )
}
