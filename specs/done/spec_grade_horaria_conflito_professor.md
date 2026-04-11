# Spec: Informação de Conflito na Grade Horária

## Visão Geral

Quando um professor ou admin visualiza a grade horária e encontra um slot bloqueado (horário ocupado por outro professor), o sistema exibe apenas um ícone `—` ou `🔒` sem identificar quem registrou aquela aula. A melhoria exibe o nome do professor e a turma diretamente no slot bloqueado da grade, e também no modal de adição quando uma turma está travada.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Estado:** Zustand (`useAppStore`)
- **Dados:** `store.schedules` (array com `teacherId`, `timeSlot`, `day`, `turma`, `subjectId`) + `store.teachers`

---

## Páginas e Rotas

### SettingsPage — `/settings`

**Descrição:** Contém os componentes `ScheduleGrid` e `AddScheduleModal` onde os conflitos de horário são exibidos.

**Componentes afetados:**
- `ScheduleGrid` — grid de horários × dias do professor
- `AddScheduleModal` — modal de seleção de turma ao adicionar aula

**Behaviors:**
- [ ] Ver, no cell da grade onde todas as turmas já estão ocupadas (`—`), mini-cards com nome do professor e turma de cada aula registrada naquele slot/dia por outros professores
- [ ] Ver, no cell da grade com `teacherConflict` (🔒), além das próprias aulas já exibidas, os mini-cards dos outros professores que também têm aula naquele slot/dia (caso existam — garante visão completa do horário)
- [ ] Ver, no `AddScheduleModal`, o pill de turma bloqueada exibindo `🔒 Turma · NomeProfessor` (ou tooltip no mobile)
- [ ] Manter o bloqueio de adição em ambos os casos — apenas informação visual, sem alterar a regra de negócio

---

## Componentes Compartilhados

Nenhum novo componente — tudo implementado internamente nos componentes existentes em `SettingsPage.jsx`.

---

## Modelos de Dados

Sem alteração de schema. Os dados já existem:

**`schedules`** (store.schedules)
```js
{
  id: string,
  teacherId: string,    // quem registrou
  timeSlot: string,     // "segId|turno|aulaIdx"
  day: string,          // "Segunda" | "Terça" | ...
  turma: string,        // "1ª Série A"
  subjectId: string,
}
```

Para exibir o nome do professor: `store.teachers.find(t => t.id === s.teacherId)?.name`

---

## Regras de Negócio

1. **Bloqueio mantido:** as regras de conflito existentes não mudam — nenhum professor pode ter duas aulas no mesmo slot/dia; nenhuma turma pode ter dois professores no mesmo slot/dia.
2. **Mini-card de conflito** na grade: exibido apenas para aulas de **outros professores** (`s.teacherId !== teacher.id`) no mesmo `timeSlot` + `day`.
3. **Pill bloqueado** no modal: o texto passa de `🔒 {turma}` para `🔒 {turma} · {nomeProfessor}` onde `nomeProfessor` é o primeiro nome (`.split(' ')[0]`) do professor que ocupa aquela turma naquele slot/dia.
4. **Professor não encontrado:** exibir `"?"` em vez de crashar (professor pode ter sido removido).

---

## Fora do Escopo (v1)

- Indicar a matéria do professor conflitante (apenas nome e turma)
- Navegação para o perfil do professor conflitante ao clicar
- Alteração da lógica de persistência ou das regras de bloqueio
- Exibição de conflitos no `CalendarPage` ou `CalendarDayPage`
