# Spec: Migração de Horários ao Trocar Matérias de Professor

## Problema

Quando um professor tem uma matéria removida do seu perfil — seja pelo admin
ou pelo próprio professor — os horários cadastrados para aquela matéria ficam
inconsistentes: continuam existindo no sistema apontando para uma matéria que
aquele professor não leciona mais.

Esta spec define dois comportamentos:

1. **Remoção simples** (matéria A removida, nenhuma adicionada): os horários
   de A são excluídos automaticamente, após confirmação.

2. **Troca** (matéria A removida, matéria B adicionada): o sistema pergunta
   se os horários de A devem ser migrados para B ou removidos.

A pergunta só aparece se houver horários afetados. Se não houver, o save
acontece normalmente sem nenhum diálogo.

---

## Pontos de entrada

O save das matérias de um professor ocorre em dois lugares distintos:

| Local | Quem usa | Função atual |
|---|---|---|
| `TabTeachers` → modal de edição → botão Salvar | Admin | `save()` na linha ~437 |
| `TabProfile` → botão "Salvar alterações" | Próprio professor | `save()` na linha ~1239 |

Ambos precisam receber a mesma lógica de detecção + diálogo.

---

## Arquivo 1: `src/store/useAppStore.js`

### Duas novas actions (adicionar após `updateSchedule`)

```js
// Troca a matéria de todos os horários de um professor
// Usado quando Amanda troca Mat por Física e opta por migrar
migrateScheduleSubject: (teacherId, fromSubjectId, toSubjectId) => {
  set(s => ({
    schedules: s.schedules.map(x =>
      x.teacherId === teacherId && x.subjectId === fromSubjectId
        ? { ...x, subjectId: toSubjectId }
        : x
    ),
  }))
  get().save()
},

// Remove todos os horários de um professor para uma matéria específica
// Usado quando a matéria é removida sem substituta, ou quando o professor
// opta por recomeçar do zero
removeSchedulesBySubject: (teacherId, subjectId) => {
  set(s => ({
    schedules: s.schedules.filter(
      x => !(x.teacherId === teacherId && x.subjectId === subjectId)
    ),
  }))
  get().save()
},
```

---

## Arquivo 2: `src/pages/SettingsPage.jsx`

### Novo componente `SubjectChangeModal`

Adicionar antes de `TabTeachers`. Recebe o contexto da mudança e chama os
callbacks conforme a escolha do usuário.

```jsx
/**
 * ctx = {
 *   teacher:          { id, name },
 *   removedSubjects:  [{ id, name }],   // matérias que saíram
 *   addedSubjects:    [{ id, name }],   // matérias que entraram
 *   affectedCount:    number,           // quantos horários serão afetados
 *   onMigrate:        fn | null,        // null quando não é troca 1:1
 *   onRemove:         fn,
 *   onCancel:         fn,
 * }
 */
function SubjectChangeModal({ ctx }) {
  if (!ctx) return null

  const isSwap = ctx.removedSubjects.length === 1 && ctx.addedSubjects.length === 1
  const fromName = ctx.removedSubjects.map(s => s.name).join(', ')
  const toName   = ctx.addedSubjects.map(s => s.name).join(', ')
  const n        = ctx.affectedCount

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-surf rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-2xl text-center">📅</div>
        <h3 className="text-base font-bold text-center">
          {isSwap ? 'O que fazer com os horários?' : 'Horários serão removidos'}
        </h3>

        <p className="text-sm text-t2 leading-relaxed text-center">
          {isSwap ? (
            <>
              <strong>{ctx.teacher.name}</strong> tinha{' '}
              <strong>{n} horário{n !== 1 ? 's' : ''}</strong> de{' '}
              <strong>{fromName}</strong>.{' '}
              Esses horários podem ser migrados para{' '}
              <strong>{toName}</strong> ou removidos.
            </>
          ) : (
            <>
              <strong>{ctx.teacher.name}</strong> tinha{' '}
              <strong>{n} horário{n !== 1 ? 's' : ''}</strong> de{' '}
              <strong>{fromName}</strong>.{' '}
              Eles serão removidos ao salvar.
            </>
          )}
        </p>

        <div className="flex flex-col gap-2 pt-1">
          {isSwap && (
            <button className="btn btn-dark w-full" onClick={ctx.onMigrate}>
              Migrar para {toName}
            </button>
          )}
          <button
            className={`btn w-full ${isSwap ? 'btn-ghost text-err' : 'btn-dark'}`}
            onClick={ctx.onRemove}
          >
            {isSwap ? 'Remover horários' : 'Confirmar remoção'}
          </button>
          <button className="btn btn-ghost w-full" onClick={ctx.onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

### Helper compartilhado — calcular mudança de matérias

Adicionar fora dos componentes, junto aos outros helpers:

```js
/**
 * Compara subjectIds antigos e novos de um professor e retorna:
 * - removedIds: matérias que saíram
 * - addedIds: matérias que entraram
 * - affectedSchedules: horários do professor que usavam matérias removidas
 */
function calcSubjectChange(teacher, newSubjectIds, schedules) {
  const oldIds = teacher.subjectIds ?? []
  const removedIds = oldIds.filter(id => !newSubjectIds.includes(id))
  const addedIds   = newSubjectIds.filter(id => !oldIds.includes(id))
  const affectedSchedules = schedules.filter(
    s => s.teacherId === teacher.id && removedIds.includes(s.subjectId)
  )
  return { removedIds, addedIds, affectedSchedules }
}
```

---

### Modificar `save()` em `TabTeachers`

**Estado adicional** (junto aos outros `useState` de `TabTeachers`):

```js
const [subjectChangeCtx, setSubjectChangeCtx] = useState(null)
```

**Substituir `save()` atual:**

```js
const save = () => {
  if (!form.name.trim()) return

  if (editId) {
    const original = store.teachers.find(t => t.id === editId)
    const { removedIds, addedIds, affectedSchedules } =
      calcSubjectChange(original, form.subjectIds ?? [], store.schedules)

    if (affectedSchedules.length > 0) {
      // Há horários afetados — fechar o modal de edição e abrir o diálogo
      setModal(false)

      const isSwap = removedIds.length === 1 && addedIds.length === 1
      const subjectsById = Object.fromEntries(store.subjects.map(s => [s.id, s]))

      setSubjectChangeCtx({
        teacher: original,
        removedSubjects: removedIds.map(id => subjectsById[id] ?? { id, name: id }),
        addedSubjects:   addedIds.map(id => subjectsById[id] ?? { id, name: id }),
        affectedCount:   affectedSchedules.length,

        onMigrate: isSwap ? () => {
          store.migrateScheduleSubject(original.id, removedIds[0], addedIds[0])
          store.updateTeacher(editId, form)
          toast('Professor atualizado e horários migrados', 'ok')
          setSubjectChangeCtx(null)
        } : null,

        onRemove: () => {
          removedIds.forEach(sid => store.removeSchedulesBySubject(original.id, sid))
          store.updateTeacher(editId, form)
          toast('Professor atualizado e horários removidos', 'ok')
          setSubjectChangeCtx(null)
        },

        onCancel: () => setSubjectChangeCtx(null),
      })
      return
    }

    // Sem horários afetados — salva normalmente
    store.updateTeacher(editId, form)
    toast('Professor atualizado', 'ok')
  } else {
    store.addTeacher(form.name.trim(), form)
    toast('Professor adicionado', 'ok')
  }
  setModal(false)
}
```

**Renderizar o modal de contexto** (fora do `<Modal>` de edição, dentro do `return` de `TabTeachers`):

```jsx
<SubjectChangeModal ctx={subjectChangeCtx} />
```

---

### Modificar `save()` em `TabProfile`

**Estado adicional** (junto aos `useState` de `TabProfile`):

```js
const [subjectChangeCtx, setSubjectChangeCtx] = useState(null)
```

**Substituir `save()` atual:**

```js
const save = () => {
  const { removedIds, addedIds, affectedSchedules } =
    calcSubjectChange(t, selSubjs, store.schedules)

  if (affectedSchedules.length > 0) {
    const isSwap = removedIds.length === 1 && addedIds.length === 1
    const subjectsById = Object.fromEntries(store.subjects.map(s => [s.id, s]))

    setSubjectChangeCtx({
      teacher: t,
      removedSubjects: removedIds.map(id => subjectsById[id] ?? { id, name: id }),
      addedSubjects:   addedIds.map(id => subjectsById[id] ?? { id, name: id }),
      affectedCount:   affectedSchedules.length,

      onMigrate: isSwap ? () => {
        store.migrateScheduleSubject(t.id, removedIds[0], addedIds[0])
        store.updateTeacher(t.id, { celular, subjectIds: selSubjs })
        toast('Perfil salvo e horários migrados', 'ok')
        setSubjectChangeCtx(null)
      } : null,

      onRemove: () => {
        removedIds.forEach(sid => store.removeSchedulesBySubject(t.id, sid))
        store.updateTeacher(t.id, { celular, subjectIds: selSubjs })
        toast('Perfil salvo e horários removidos', 'ok')
        setSubjectChangeCtx(null)
      },

      onCancel: () => setSubjectChangeCtx(null),
    })
    return
  }

  // Sem horários afetados — salva normalmente
  store.updateTeacher(t.id, { celular, subjectIds: selSubjs })
  toast('Perfil salvo', 'ok')
}
```

**Renderizar o modal de contexto** dentro do `return` de `TabProfile`:

```jsx
<SubjectChangeModal ctx={subjectChangeCtx} />
```

---

## Resumo dos arquivos alterados

| Arquivo | O que muda |
|---|---|
| `src/store/useAppStore.js` | +2 actions: `migrateScheduleSubject`, `removeSchedulesBySubject` |
| `src/pages/SettingsPage.jsx` | +`SubjectChangeModal`, +`calcSubjectChange`, `save()` modificado em `TabTeachers` e `TabProfile` |

---

## Cenários e comportamento esperado

| Cenário | O que acontece |
|---|---|
| Admin remove Mat de Amanda, não adiciona nada. Amanda tem 3 horários de Mat | Diálogo: "Amanda tinha 3 horários de Matemática. Confirmar remoção?" → Confirmar / Cancelar |
| Admin remove Mat e adiciona Física. Amanda tem 3 horários de Mat | Diálogo: "3 horários de Matemática. Migrar para Física / Remover / Cancelar" |
| Amanda remove Mat do próprio perfil e adiciona Física (em TabProfile) | Mesmo diálogo acima, disparado ao clicar "Salvar alterações" |
| Admin edita nome ou telefone de Amanda sem alterar matérias | Sem diálogo — salva direto |
| Amanda adiciona uma matéria nova sem remover nenhuma | Sem diálogo — salva direto |
| Admin remove Mat e adiciona Física + Química (2 entradas) | Diálogo sem opção de migrar (não é troca 1:1): "Confirmar remoção" / Cancelar |

---

## Verificação manual

- [ ] Admin edita professor, remove matéria sem adicionar outra → diálogo de confirmação simples aparece
- [ ] Admin confirma → horários removidos, professor salvo, toast correto
- [ ] Admin cancela → nada muda, modal de edição fecha
- [ ] Admin troca 1 matéria por 1 → diálogo com opções Migrar / Remover / Cancelar
- [ ] Migrar → todos os horários da matéria antiga passam a apontar para a nova
- [ ] Professor edita próprio perfil (TabProfile) → mesma lógica ao clicar "Salvar alterações"
- [ ] Nenhum horário afetado → save imediato sem diálogo em todos os casos
- [ ] Troca de múltiplas matérias simultaneamente → diálogo sem botão Migrar
