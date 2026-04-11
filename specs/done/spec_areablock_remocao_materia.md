# Spec: Proteção ao Remover Matéria de uma Área (AreaBlock)

## Visão Geral

Ao editar o textarea de matérias em `AreaBlock` (`TabAreas`), o admin pode apagar uma linha e salvar — isso remove a matéria do sistema silenciosamente. Se professores tiverem schedules vinculados àquela matéria, esses schedules ficam com `subjectId` órfão: a matéria sumiu, mas a referência persiste no Firestore.

O fluxo de aviso + migração já existe para o caso de edição de perfil do professor (`SubjectChangeModal`, `calcSubjectChange`, `migrateScheduleSubject`). Esta spec conecta esse mesmo fluxo ao `AreaBlock`.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Estado:** Zustand (`useAppStore` — `subjects`, `teachers`, `schedules`)
- **Arquivo:** `src/pages/SettingsPage.jsx`, `src/store/useAppStore.js`

---

## Páginas e Rotas

### SettingsPage — `/settings` → aba de áreas

**Componentes afetados:**
- `AreaBlock` — card de cada área com textarea de matérias e botão Salvar
- `SubjectChangeModal` — modal já existente de migração/remoção (reaproveitado)

---

**Behaviors:**

- [ ] Ao salvar `AreaBlock` sem matérias removidas em uso: salva normalmente (comportamento atual mantido)
- [ ] Ao salvar `AreaBlock` com 1 matéria removida que tem schedules: abre `SubjectChangeModal` com contagem de professores e schedules afetados
  - Opção "Migrar" disponível somente se houver exatamente 1 matéria adicionada no mesmo save (troca 1-para-1)
  - Opção "Remover horários" deleta os schedules afetados e confirma o save
  - Opção "Cancelar" descarta o save, textarea volta ao estado anterior
- [ ] Ao salvar `AreaBlock` com múltiplas matérias removidas que têm schedules: abre aviso listando professores afetados; apenas "Confirmar remoção" ou "Cancelar" (sem migração, pois é ambíguo)
- [ ] Schedules órfãos nunca persistem: ao confirmar remoção, os schedules são deletados do Firestore via `deleteDocById`
- [ ] `subjectIds` dos professores afetados são limpos (comportamento atual de `saveAreaWithSubjects` mantido)

---

## Modelos de Dados

Sem alteração de modelos. A lógica opera sobre `schedules.subjectId` e `teachers.subjectIds` já existentes.

---

## Regras de Negócio

### Detecção de impacto (novo helper ou extensão de `calcSubjectChange`)

```js
// Para cada subjectId removido, verificar se há schedules usando-o
function calcAreaSubjectRemovalImpact(removedSubjectIds, schedules, teachers) {
  const affectedSchedules = schedules.filter(s => removedSubjectIds.includes(s.subjectId))
  const affectedTeacherIds = [...new Set(affectedSchedules.map(s => s.teacherId))]
  const affectedTeachers = teachers.filter(t => affectedTeacherIds.includes(t.id))
  return { affectedSchedules, affectedTeachers }
}
```

### Fluxo de save em `AreaBlock`

1. Calcular `removedIds` (matérias que saíram do textarea)
2. Se `removedIds` vazio → `saveAreaWithSubjects(...)` direto (sem modal)
3. Se `removedIds` não vazio → calcular impacto:
   - Se nenhum schedule afetado → `saveAreaWithSubjects(...)` direto
   - Se schedules afetados → abrir `SubjectChangeModal` com contexto:
     - `isSwap` = `removedIds.length === 1 && addedIds.length === 1`
     - `onMigrate` (somente se `isSwap`): chamar `migrateScheduleSubject` + `saveAreaWithSubjects`
     - `onRemove`: deletar schedules afetados via `deleteDocById` + `saveAreaWithSubjects`
     - `onCancel`: resetar textarea ao estado salvo anterior

### `saveAreaWithSubjects` (store)

Atualmente já limpa `teachers.subjectIds`. **Não alterar** — a remoção dos schedules é responsabilidade do caller (`AreaBlock`) pois depende da decisão do admin (migrar vs. remover).

---

## Componentes Compartilhados

- `SubjectChangeModal` (linha 97 em `SettingsPage.jsx`) — **reaproveitado sem alteração**. O modal já suporta os três cenários: migração, remoção e cancelamento.

---

## Fora do Escopo

- Migração de múltiplos-para-múltiplos (ex: 3 matérias removidas → 3 adicionadas)
- Aviso ao remover uma área inteira (caso `removeArea`) — escopo separado
- Alteração de regras do Firestore Security Rules
