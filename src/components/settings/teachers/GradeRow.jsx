// GradeRow — linha de uma série dentro de GradeList (TabSegments)

import { useState } from 'react'

export default function GradeRow({ seg, grade, store }) {
  const [letter, setLetter] = useState('')
  return (
    <div className="bg-surf2 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-sm flex-1">{grade.name}</span>
        <input
          className="inp !w-24 py-1 text-xs"
          placeholder="Letra (A,B…)"
          value={letter}
          onChange={e => setLetter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && letter.trim()) {
              store.addClassToGrade(seg.id, grade.name, letter.trim()); setLetter('')
            }
          }}
        />
        <button className="btn btn-dark btn-xs" onClick={() => {
          if (!letter.trim()) return
          store.addClassToGrade(seg.id, grade.name, letter.trim()); setLetter('')
        }}>+</button>
        <button className="btn btn-ghost btn-xs text-err" onClick={() => store.removeGrade(seg.id, grade.name)}>✕</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {grade.classes.map(cls => (
          <span key={cls.letter} className="inline-flex items-center gap-1 px-2 py-0.5 bg-surf border border-bdr rounded-full text-xs font-semibold">
            {grade.name} {cls.letter}
            <button className="text-t3 hover:text-err" onClick={() => store.removeClassFromGrade(seg.id, grade.name, cls.letter)}>×</button>
          </span>
        ))}
        {grade.classes.length === 0 && <span className="text-xs text-t3">Nenhuma turma.</span>}
      </div>
    </div>
  )
}
