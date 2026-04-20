// TabDisciplines — áreas e disciplinas com blocos editáveis por segmento

import { useState } from 'react'
import useAppStore from '../../../store/useAppStore'
import { toast } from '../../../hooks/useToast'
import { COLOR_PALETTE } from '../../../lib/constants'
import { calcAreaSubjectRemovalImpact } from '../../../lib/settingsHelpers'
import DeparaModal from '../teachers/DeparaModal'

// ─── AreaBlock ────────────────────────────────────────────────────────────────

function AreaBlock({ area, store }) {
  const cv   = COLOR_PALETTE[area.colorIdx % COLOR_PALETTE.length]
  const subs = store.subjects.filter(s => s.areaId === area.id)
  const [name,       setName]       = useState(area.name)
  const [txt,        setTxt]        = useState(subs.map(s => s.name).join('\n'))
  const [deparaOpen, setDeparaOpen] = useState(false)
  const [deparaData, setDeparaData] = useState(null)

  const doSave = (lines) => {
    store.saveAreaWithSubjects(area.id, name.trim() || area.name, lines)
    toast('Disciplinas salvas', 'ok')
  }

  const save = () => {
    const lines      = txt.split('\n').map(l => l.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    const prevNames  = subs.map(s => s.name)
    const removedNames = prevNames.filter(n => !lines.includes(n))
    const addedNames   = lines.filter(n => !prevNames.includes(n))

    if (removedNames.length === 0) { doSave(lines); return }

    const removedSubjectIds = subs.filter(s => removedNames.includes(s.name)).map(s => s.id)
    const { affectedSchedules } =
      calcAreaSubjectRemovalImpact(removedSubjectIds, store.schedules, store.teachers)

    if (affectedSchedules.length === 0) { doSave(lines); return }

    const removedSubjSet = new Set(removedSubjectIds)
    const removedSubjectsWithCount = removedSubjectIds.map(id => {
      const subj = store.subjects.find(s => s.id === id) ?? { id, name: id }
      const count = store.schedules.filter(s => s.subjectId === id).length
      return { id, name: subj.name, scheduleCount: count }
    })
    const newSubjects = addedNames.map(n => ({ id: n, name: n }))
    const availableSubjects = [
      ...store.subjects.filter(s => !removedSubjSet.has(s.id)),
      ...newSubjects,
    ]
    setDeparaData({ removedSubjectsWithCount, availableSubjects, lines, mode: 'save' })
    setDeparaOpen(true)
  }

  const handleDeparaConfirm = (mapping) => {
    if (!deparaData) return

    if (deparaData.mode === 'remove') {
      Object.entries(mapping).forEach(([fromId, toId]) => {
        if (!toId) {
          store.schedules
            .filter(s => s.subjectId === fromId)
            .forEach(s => store.removeSchedule(s.id))
        } else {
          store.migrateMultipleSubjects(fromId, toId)
        }
      })
      store.removeArea(area.id)
      setDeparaOpen(false)
      return
    }

    // modo 'save'
    let savedAlready = false
    const doSaveOnce = () => {
      if (!savedAlready) { doSave(deparaData.lines); savedAlready = true }
    }

    Object.entries(mapping).forEach(([fromId, toId]) => {
      if (!toId) {
        store.schedules
          .filter(s => s.subjectId === fromId)
          .forEach(s => store.removeSchedule(s.id))
      } else {
        const isNewSubject = !store.subjects.find(s => s.id === toId)
        if (isNewSubject) {
          doSaveOnce()
          const newId = useAppStore.getState().subjects.find(
            s => s.areaId === area.id && s.name === toId
          )?.id
          if (newId) store.migrateMultipleSubjects(fromId, newId)
        } else {
          store.migrateMultipleSubjects(fromId, toId)
        }
      }
    })

    doSaveOnce()
    setDeparaOpen(false)
  }

  return (
    <>
      <div className="rounded-xl border-l-4 p-3 bg-surf border border-bdr" style={{ borderLeftColor: cv.dt }}>
        <div className="flex items-center gap-2 mb-2">
          <input
            className="font-bold text-sm flex-1 bg-transparent outline-none border-b border-transparent hover:border-bdr focus:border-navy px-1 py-0.5 transition-colors"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <span className="text-xs text-t3">{subs.length} disc.</span>
          <button className="btn btn-dark btn-xs" onClick={save}>Salvar</button>
          <button className="btn btn-ghost btn-xs text-err" onClick={() => {
            const areaSubjIds = subs.map(s => s.id)
            const { affectedSchedules } = calcAreaSubjectRemovalImpact(areaSubjIds, store.schedules, store.teachers)
            if (affectedSchedules.length === 0) {
              if (confirm(`Remover área "${area.name}"?`)) store.removeArea(area.id)
              return
            }
            const removedSubjectsWithCount = subs.map(subj => ({
              id: subj.id,
              name: subj.name,
              scheduleCount: store.schedules.filter(s => s.subjectId === subj.id).length,
            }))
            const removedSubjSet = new Set(areaSubjIds)
            const availableSubjects = store.subjects.filter(s => !removedSubjSet.has(s.id))
            setDeparaData({ removedSubjectsWithCount, availableSubjects, lines: null, mode: 'remove' })
            setDeparaOpen(true)
          }}>✕</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-t2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={area.shared ?? false}
            onChange={e => store.updateArea(area.id, { shared: e.target.checked })}
            className="accent-accent"
          />
          Área compartilhada
        </label>
        <textarea
          className="inp text-xs font-mono resize-y min-h-[80px] w-full"
          placeholder="Uma disciplina por linha…"
          value={txt}
          onChange={e => setTxt(e.target.value)}
          onBlur={save}
        />
      </div>
      <DeparaModal
        open={deparaOpen}
        removedSubjects={deparaData?.removedSubjectsWithCount ?? []}
        availableSubjects={deparaData?.availableSubjects ?? []}
        onConfirm={handleDeparaConfirm}
        onCancel={() => {
          if (deparaData?.mode !== 'remove') setTxt(subs.map(s => s.name).join('\n'))
          setDeparaOpen(false)
        }}
      />
    </>
  )
}

// ─── AddAreaRow ───────────────────────────────────────────────────────────────

function AddAreaRow({ segId, store }) {
  const [name, setName] = useState('')
  const add = () => {
    if (!name.trim()) return
    store.addArea(name.trim(), store.areas.length % 9, [segId])
    setName('')
    toast('Área criada', 'ok')
  }
  return (
    <div className="flex gap-2 mt-3">
      <input className="inp" placeholder="Nova área…" value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && add()} />
      <button className="btn btn-dark" onClick={add}>＋</button>
    </div>
  )
}

// ─── TabDisciplines ───────────────────────────────────────────────────────────

export default function TabDisciplines() {
  const store = useAppStore()

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${store.segments.length || 1}, 1fr)` }}>
      {store.segments.map(seg => {
        const segAreas = store.areas.filter(a => (a.segmentIds ?? []).includes(seg.id))
        return (
          <div key={seg.id}>
            <div className="font-bold text-sm mb-3 pb-2 border-b border-bdr">{seg.name}</div>
            <div className="space-y-3">
              {segAreas.map(area => <AreaBlock key={area.id} area={area} store={store} />)}
            </div>
            <AddAreaRow segId={seg.id} store={store} />
          </div>
        )
      })}
    </div>
  )
}
