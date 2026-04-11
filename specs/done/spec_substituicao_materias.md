# Spec: Substituição de Matérias e Áreas — Interface De-Para

## Visão Geral

Hoje, ao remover uma matéria ou uma área inteira, os horários vinculados a ela ficam "sem matéria" (exibem `—`). O admin precisa refazer toda a grade manualmente.

Esta spec transforma a exclusão em um **processo de transição guiado**: antes de confirmar a remoção, o admin vê uma tabela De-Para e decide o que entra no lugar de cada matéria que sai. Ao confirmar, todos os horários e vínculos de professores são atualizados em lote automaticamente.

## Stack Tecnológica
- Frontend: React 18 + Vite + Tailwind CSS (tema: `bg-surf`, `bg-surf2`, `border-bdr`, `btn`, `inp`, `lbl`, `text-t1/t2/t3`, `text-err`, `text-navy`)
- Estado: Zustand — `useAppStore` (`subjects`, `areas`, `teachers`, `schedules`)
- Firebase: Firestore — coleções `schedules`, `teachers`
- Persistência: `store.save()` (Firestore) + `deleteDocById`

---

## Páginas e Rotas

### SettingsPage — `/settings` (aba Disciplinas — `TabDisciplines`)

**Descrição:** O admin gerencia áreas do conhecimento e suas matérias. Cada área é um bloco editável com nome e lista de matérias (uma por linha em um `<textarea>`). Também há um botão para remover a área inteira.

**Componentes:**
- `AreaBlock` — bloco de uma área com nome, lista de matérias, checkbox "Área compartilhada" e botão remover
- `SubjectChangeModal` — modal existente para troca simples (1 matéria → 1 matéria); será **substituído** pelo `DeparaModal`
- `DeparaModal` — **novo** modal de mapeamento N:M De-Para

---

**Behaviors:**

- [ ] **B1 — Salvar área com matérias removidas (N:M):**
  Quando o admin clica em "Salvar" num `AreaBlock` e há matérias removidas com horários vinculados, **sempre** exibir o `DeparaModal` — inclusive no caso 1:1 que hoje exibe o `SubjectChangeModal`. O modal antigo deixa de ser usado neste fluxo.

- [ ] **B2 — Remover área inteira:**
  Quando o admin clica em ✕ num `AreaBlock`, se a área tiver matérias com horários vinculados, **interceptar** o `confirm()` atual e exibir o `DeparaModal` em vez de destruir diretamente. As matérias da área toda formam a coluna "Saindo". O admin pode mapear cada uma para uma matéria de outra área ou marcar "Remover sem substituir".

- [ ] **B3 — Remover matéria individual (futura):**
  Hoje não existe botão de remoção individual de matéria (só via edição do textarea). Fora do escopo desta spec.

---

## Componente Compartilhado: `DeparaModal`

**Descrição:** Modal com tabela De-Para. Exibido nos cenários B1 e B2.

**Estrutura visual:**
```
┌─────────────────────────────────────────────────────┐
│  Matérias sendo removidas                           │
│  Defina o que acontece com os horários de cada uma  │
│                                                     │
│  SAINDO              ENTRANDO                       │
│  ─────────────────── ──────────────────────────     │
│  Matemática I   ⮕   [▼ Selecione...         ]       │
│  Matemática II  ⮕   [▼ Álgebra              ]       │
│  Geometria      ⮕   [✓ Remover sem substituir]      │
│                                                     │
│  Impacto: 14 horários em 3 professores              │
│                                                     │
│       [ Cancelar ]   [ Confirmar substituição ]     │
└─────────────────────────────────────────────────────┘
```

**Behaviors do modal:**

- [ ] **B4 — Listar matérias saindo:** cada linha da tabela mostra o nome da matéria que será removida, o número de horários vinculados e um select com opções.

- [ ] **B5 — Select "Entrando":** as opções do select são todas as matérias existentes no sistema **exceto** as que estão sendo removidas. Inclui as matérias que estão sendo adicionadas no mesmo salvamento (matérias novas ainda sem ID — identificadas pelo nome). Opção fixa no topo: "— Remover sem substituir".

- [ ] **B6 — Resumo de impacto:** rodapé do modal exibe "X horários em Y professores serão atualizados" — calculado a partir das matérias que têm substituta selecionada.

- [ ] **B7 — Botão "Confirmar" habilitado sempre:** o admin pode confirmar mesmo sem preencher todas as substituições (as matérias sem substituta serão removidas e seus horários apagados).

- [ ] **B8 — Confirmar substituição em lote:**
  Ao confirmar:
  1. Para cada par (matéria saindo → matéria entrando): chamar `store.migrateMultipleSubjects(fromId, toId)` — migra horários de **todos os professores** de uma vez (diferente do `migrateScheduleSubject` atual que é por professor)
  2. Para cada matéria sem substituta: apagar os horários vinculados (`deleteDocById + store.removeSchedule`) e remover vínculo dos professores
  3. Executar o `doSave(lines)` original para persistir a nova lista de matérias
  4. Fechar o modal

- [ ] **B9 — Cancelar:** fecha o modal sem nenhuma alteração. Restaura o textarea ao estado original (comportamento igual ao `onCancel` atual).

---

## Modelos de Dados

Sem novas coleções. As operações atualizam documentos existentes em `schedules` e `teachers`.

**Operação de migração em lote:**
Para cada horário com `subjectId === fromId`:
- Atualizar `subjectId → toId` no Firestore e no estado Zustand

Para cada professor com `fromId` em sua lista de matérias:
- Substituir `fromId → toId` na lista de matérias do professor

---

## Regras de Negócio

- Se nenhuma matéria removida tiver horários vinculados, executar a remoção diretamente sem abrir o modal (comportamento atual preservado)
- Uma matéria pode ser substituída por outra de qualquer área — não apenas da mesma área
- "Remover sem substituir" é a opção padrão no select (nenhuma seleção = remoção)
- A migração é irreversível — não há desfazer após confirmar
- Matérias recém-adicionadas no mesmo salvamento (ainda sem ID) também podem ser escolhidas como substituta; nesse caso `doSave` deve rodar primeiro para criar o ID, e só então a migração usa esse novo ID

---

## Arquivos a Modificar

- `src/pages/SettingsPage.jsx`
  - `AreaBlock.save()`: substituir lógica de `SubjectChangeModal` pelo `DeparaModal` (suporta N:M)
  - `AreaBlock` botão ✕ (`removeArea`): interceptar com `DeparaModal` quando há horários
  - Novo componente `DeparaModal`

- `src/store/useAppStore.js`
  - Nova ação `migrateMultipleSubjects(fromId, toId)`: migra horários e vínculos de **todos** os professores (sem filtro por professor)

---

## Fora do Escopo (v1)
- Remoção individual de matéria por botão (hoje só existe via edição do textarea)
- Histórico ou auditoria das substituições realizadas
- Desfazer uma migração após confirmação
- Validação de conflito (dois professores no mesmo horário após migração)
- Interface De-Para para segmentos ou turmas
