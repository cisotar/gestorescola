import { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { isSharedSeries } from '../../lib/helpers'
import Modal from './Modal'

/**
 * AddScheduleModal - Modal para adicionar aula a um professor
 *
 * @param {boolean} open - Se o modal está aberto
 * @param {function} onClose - Callback ao fechar modal
 * @param {Object} teacher - Objeto professor com { id, subjectIds, ... }
 * @param {string} segId - ID do segmento selecionado
 * @param {string} turno - Turno: 'manha' ou 'tarde'
 * @param {string|number} aulaIdx - Índice da aula (número ou 'e' + número para especial)
 * @param {string} day - Dia da semana: 'Segunda', 'Terça', etc.
 * @param {Object} store - Store useAppStore() com segments, subjects, areas, sharedSeries, schedules, teachers
 * @param {function} onSave - Callback ao salvar: onSave({ teacherId, subjectId, turma, day, timeSlot })
 */
export default function AddScheduleModal({ open, onClose, teacher, segId, turno, aulaIdx, day, store, onSave }) {
  const seg = store.segments.find(s => s.id === segId)
  const slot = `${segId}|${turno}|${aulaIdx}`

  // Apenas matérias do professor que pertencem a este segmento
  const mySubjs = (teacher.subjectIds ?? [])
    .map(sid => store.subjects.find(s => s.id === sid))
    .filter(Boolean)
    .filter(s => {
      const area = store.areas.find(a => a.id === s.areaId)
      return (area?.segmentIds ?? []).includes(segId)
    })

  const [subjId, setSubjId] = useState(mySubjs[0]?.id ?? '')
  const [grade,  setGrade]  = useState('')
  const [turma,  setTurma]  = useState('')

  const grades = seg?.grades ?? []
  const allTurmasForGrade = grade
    ? (grades.find(g => g.name === grade)?.classes ?? []).map(c => `${grade} ${c.letter}`)
    : []
  const selectedSharedSeries = store.sharedSeries.find(ss => ss.name === turma) ?? null

  // Helper para detectar se área é compartilhada
  function isSharedSchedule(schedule, store) {
    const subj = store.subjects.find(s => s.id === schedule.subjectId)
    const area = store.areas.find(a => a.id === subj?.areaId)
    return area?.shared === true
  }

  // Turmas bloqueadas: têm ao menos 1 ocupante de área não-compartilhada
  const hardBlockedTurmas = new Set(
    store.schedules
      .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
      .filter(s => !isSharedSchedule(s, store) && !isSharedSeries(s.turma, store.sharedSeries))
      .map(s => s.turma)
  )
  // Mapa turma → primeiro nome do professor que a ocupa (para exibição)
  const occupiedByTeacher = {}
  store.schedules
    .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
    .forEach(s => {
      const prof = store.teachers.find(t => t.id === s.teacherId)
      occupiedByTeacher[s.turma] = prof?.name.split(' ')[0] ?? '?'
    })

  const save = () => {
    if (!turma) return
    const isShared = isSharedSeries(turma, store.sharedSeries)
    if (store.schedules.find(s => s.teacherId === teacher.id && s.day === day && s.timeSlot === slot))
      { alert('Conflito: professor já tem aula neste horário.'); return }
    if (!isShared && hardBlockedTurmas.has(turma))
      { alert('Conflito: esta turma já tem professor neste horário.'); return }
    if (!isShared) {
      const turmaHasSharedOccupant = store.schedules.some(
        s => s.timeSlot === slot && s.day === day && s.turma === turma
          && s.teacherId !== teacher.id && isSharedSchedule(s, store)
      )
      if (turmaHasSharedOccupant) {
        const newSubj = store.subjects.find(s => s.id === subjId)
        const newArea = store.areas.find(a => a.id === newSubj?.areaId)
        if (!newArea?.shared)
          { alert('Esta turma está reservada para área compartilhada.'); return }
      }
    }
    if (isShared && !subjId)
      { alert('Selecione a matéria.'); return }
    onSave({ teacherId: teacher.id, subjectId: subjId || null, turma, day, timeSlot: slot })
  }

  const pillBase = 'px-3 py-1 rounded-full text-sm border transition-colors cursor-pointer'
  const pillOff  = `${pillBase} bg-surf2 border-bdr text-t2 hover:border-t3`
  const pillOn   = `${pillBase} bg-navy border-transparent text-white font-semibold shadow-sm`
  const pillLock = `${pillBase} bg-surf2 border-bdr text-t3 opacity-50 cursor-not-allowed`

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Aula">
      <div className="space-y-5">

        {/* Ano / Série */}
        <div>
          <label className="lbl">Ano / Série</label>
          {grades.length === 0
            ? <p className="text-xs text-t3">Nenhuma série cadastrada neste segmento.</p>
            : <div className="flex flex-wrap gap-2 mt-1">
                {grades.map(g => (
                  <button
                    key={g.name}
                    type="button"
                    className={grade === g.name ? pillOn : pillOff}
                    onClick={() => { setGrade(g.name); setTurma('') }}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
          }
        </div>

        {/* Turma */}
        <div>
          <label className="lbl">Turma</label>
          {!grade
            ? <p className="text-xs text-t3 mt-1">Selecione o Ano/Série primeiro.</p>
            : allTurmasForGrade.length === 0
              ? <p className="text-xs text-t3 mt-1">Nenhuma turma cadastrada para {grade}.</p>
              : <div className="flex flex-wrap gap-2 mt-1">
                  {allTurmasForGrade.map(t => {
                    const locked = hardBlockedTurmas.has(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        className={locked ? pillLock : turma === t ? pillOn : pillOff}
                        disabled={locked}
                        onClick={() => !locked && setTurma(t)}
                        title={locked ? `Ocupado por ${occupiedByTeacher[t] ?? '?'}` : undefined}
                      >
                        {locked ? `🔒 ${t} · ${occupiedByTeacher[t] ?? '?'}` : t}
                      </button>
                    )
                  })}
                </div>
          }
        </div>

        {/* Turmas Compartilhadas */}
        {store.sharedSeries.length > 0 && (
          <div className="pt-3 border-t border-bdr">
            <div className="text-[10px] font-bold text-t3 uppercase tracking-wider mb-2">Turmas Compartilhadas</div>
            <div className="flex flex-wrap gap-2">
              {store.sharedSeries.map(ss => (
                <button
                  key={ss.id}
                  type="button"
                  className={turma === ss.name ? pillOn : pillOff}
                  onClick={() => { setGrade(''); setTurma(ss.name); setSubjId('') }}
                >
                  {ss.name}
                </button>
              ))}
            </div>

            {selectedSharedSeries && (
              <div className="mt-3">
                <div className="text-[10px] font-bold text-t3 uppercase tracking-wider mb-2">Matéria</div>
                <div className="flex flex-wrap gap-2">
                  {mySubjs.map(subj => (
                      <button
                        key={subj.id}
                        type="button"
                        className={subjId === subj.id ? pillOn : pillOff}
                        onClick={() => setSubjId(subj.id)}
                      >
                        {subj.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Matéria */}
        <div>
          <label className="lbl">Matéria <span className="font-normal text-t3">(opcional)</span></label>
          {mySubjs.length === 0
            ? <p className="text-xs text-t3 mt-1">Nenhuma matéria vinculada a este segmento.</p>
            : <div className="flex flex-wrap gap-2 mt-1">
                <button
                  type="button"
                  className={subjId === '' ? pillOn : pillOff}
                  onClick={() => setSubjId('')}
                >
                  — sem matéria —
                </button>
                {mySubjs.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={subjId === s.id ? pillOn : pillOff}
                    onClick={() => setSubjId(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
          }
        </div>

        <div className="flex gap-2 pt-1">
          <button
            className="btn btn-dark flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={save}
            disabled={!turma}
          >
            Adicionar
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  )
}
