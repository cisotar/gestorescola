# Spec: Relatório de Ausências — Exclusão em Lote + Envio por WhatsApp

## Visão Geral

Duas melhorias na página `/absences`:

1. **Exclusão em lote** — admin seleciona uma ou mais ausências com checkboxes e exclui em uma única ação com opção de desfazer (undo imediato).
2. **Envio por WhatsApp** — botão que abre o WhatsApp com a mensagem de relatório pré-formatada conforme o filtro ativo, sem envio automático via API.

Ambas as melhorias são válidas para todas as 4 visualizações: Por Professor, Por Dia, Por Semana, Por Mês.

---

## Stack Tecnológica

- **Frontend:** React 18 + Tailwind CSS (padrão existente)
- **Estado:** Zustand (`useAppStore`) + estado local (`useState`) em `AbsencesPage`
- **Persistência:** Firestore via ações existentes do store
- **WhatsApp:** `window.open('https://wa.me/...')` — sem API externa
- **Armazenamento do telefone:** `localStorage` (chave `gestao_whatsapp_phone`)

---

## Páginas e Rotas

### AbsencesPage — `/absences`

**Descrição:** Relatório de ausências com 4 visualizações. Agora com seleção/exclusão em lote e envio por WhatsApp.

---

## Componentes

### `SlotRow` (modificado)

**Behaviors:**
- [ ] Exibir checkbox à esquerda quando `showCheckboxes === true` e `isAdmin === true`
- [ ] Marcar/desmarcar slot individualmente via checkbox
- [ ] Indicação visual clara de selecionado: fundo `bg-accent-l` ou borda `border-accent`
- [ ] Remover botão ✕ individual quando modo seleção estiver ativo (substituído pelo checkbox)

### `BulkActionBar` (novo componente interno)

Barra de ações que aparece **fixada no fundo da tela** quando há itens selecionados.

**Behaviors:**
- [ ] Exibir contagem de itens selecionados: `"N ausência(s) selecionada(s)"`
- [ ] Botão `Excluir selecionadas` — dispara `handleBulkDelete`
- [ ] Botão `Desmarcar tudo` — limpa seleção
- [ ] Visível apenas quando `selectedIds.size > 0`
- [ ] Ocultar quando não há seleção

### `SelectionToolbar` (novo componente interno)

Barra de ferramentas que aparece acima do relatório quando admin está no modo seleção.

**Behaviors:**
- [ ] Botão toggle `☑ Selecionar` / `✕ Cancelar` para entrar/sair do modo seleção
- [ ] Quando ativo, exibir opções de seleção rápida:
  - `Selecionar tudo` — marca todos os slots visíveis no filtro atual
  - `Desmarcar tudo` — limpa seleção
  - `Só faltas` — seleciona apenas slots sem substituto (`sl.substituteId == null`)
  - `Só substituições` — seleciona apenas slots com substituto

### `WhatsAppButton` (novo componente interno)

Botão reutilizável com modal de número + link de envio.

**Behaviors:**
- [ ] Exibir botão `📱 WhatsApp` ao lado do `📄 Exportar PDF`
- [ ] Ao clicar, abrir modal com campo de número de telefone
- [ ] Preencher campo automaticamente com número salvo em `localStorage` (chave `gestao_whatsapp_phone`)
- [ ] Ao confirmar, salvar número no `localStorage` e abrir `window.open('https://wa.me/{phone}?text={msg}', '_blank')`
- [ ] Número formatado: apenas dígitos (remover espaços, traços, parênteses, `+`)
- [ ] Mensagem gerada por `buildWhatsAppMessage(slots, context, store)`

---

## Lógica de Estado em `AbsencesPage`

Estado adicionado ao componente raiz `AbsencesPage`:

```js
const [selectedIds,    setSelectedIds]    = useState(new Set())
const [selectionMode,  setSelectionMode]  = useState(false)
const [undoBuffer,     setUndoBuffer]     = useState(null) // { slots, absences }
```

Passar para os filhos via props: `selectedIds`, `onToggleSlot`, `onSelectAll`, `onClearAll`, `selectionMode`.

Ao trocar de aba (`setMode`): limpar seleção e desativar modo seleção.

---

## Exclusão em Lote

### Fluxo

1. Admin ativa modo seleção via `SelectionToolbar`
2. Marca checkboxes individuais ou usa seleção rápida
3. Clica `Excluir selecionadas` na `BulkActionBar`
4. Sistema salva cópia dos slots em `undoBuffer` antes de excluir
5. Chama `store.deleteManySlots(selectedIds)`
6. Limpa seleção e desativa modo seleção
7. Exibe toast com opção de desfazer: `"N ausência(s) removida(s) · Desfazer"`
8. Se admin clicar `Desfazer` no toast (dentro de ~5s): restaura via `store.restoreSlots(undoBuffer)` e limpa buffer
9. Após 5s sem undo: `undoBuffer` é limpo automaticamente

### Store — novas actions em `useAppStore`

```js
// Exclui múltiplos slots por ID (array ou Set)
deleteManySlots: (slotIds) => {
  const ids = new Set(slotIds)
  set(s => ({
    absences: s.absences.map(ab => ({
      ...ab,
      slots: ab.slots.filter(sl => !ids.has(sl.id)),
    })).filter(ab => ab.slots.length > 0),
  }))
  get().save()
},

// Restaura slots após undo (recebe snapshot das ausências pré-exclusão)
restoreAbsences: (absencesSnapshot) => {
  set({ absences: absencesSnapshot })
  get().save()
},
```

### Seleção por agrupamento

| Agrupamento | O que seleciona |
|---|---|
| Dia | Todos os slots em `sl.date === date` visíveis no filtro atual |
| Semana | Todos os slots em `sl.date >= monISO && sl.date <= friISO` |
| Mês | Todos os slots do mês/ano selecionado |
| Professor | Todos os slots de `sl.teacherId === selTeacher` |

Implementado no handler `onSelectAll(slots)` passando o array de slots já filtrado pela view atual.

### Regras de negócio
- Ao excluir um slot, se o slot tinha `substituteId`, a substituição também é excluída (já tratado pelo store — `deleteAbsenceSlot` remove o slot inteiro)
- Se todos os slots de uma ausência forem excluídos, a ausência (`absence`) é removida do array (filtro `filter(ab => ab.slots.length > 0)` em `deleteManySlots`)
- Apenas admin vê checkboxes e pode excluir

---

## Envio por WhatsApp

### Formato da mensagem

```
*Relatório de Ausência*

📅 Data: 10/04/2026
👤 Professor ausente: João Silva

Aulas:
1ª aula · 1º A · Matemática | Subst.: Maria Souza
2ª aula · 1º A · Física | Subst.: EM PROCESSAMENTO
```

Para semana/mês com múltiplos professores:

```
*Relatório de Ausência*

🗓 Semana: 07/04/2026 – 11/04/2026

---
👤 João Silva

Segunda-feira, 07/04:
1ª aula · 1º A · Matemática | Subst.: Maria Souza

---
👤 Ana Lima

Quarta-feira, 09/04:
3ª aula · 2º B · Física | Subst.: EM PROCESSAMENTO
```

### Função `buildWhatsAppMessage` em `src/lib/reports.js`

```js
export function buildWhatsAppMessage(mode, context, store) {
  // mode: 'teacher' | 'day' | 'week' | 'month'
  // context: { slots, label, teacher? }
  // Retorna string para encodeURIComponent
}
```

Utiliza helpers existentes: `formatBR`, `dateToDayLabel`, `slotLabel`, `teacherSubjectNames`.

Ordinal de aula: extrair `aulaIdx` do `timeSlot` (`"segId|turno|aulaIdx"`) e formatar como `"1ª aula"`, `"2ª aula"`, etc.

### Modal de envio

Campos:
- `Número WhatsApp` — input `tel`, placeholder `"55 11 99999-9999"`
- Botão `Abrir WhatsApp` — `window.open(url, '_blank')`
- Botão `Cancelar`

---

## Modelos de Dados

Nenhuma alteração no schema do Firestore. A exclusão em lote opera sobre `absences.slots` existente. O número de WhatsApp é armazenado apenas em `localStorage`.

---

## Regras de Negócio

1. Exclusão e checkboxes visíveis **apenas para admin**
2. Undo disponível apenas imediatamente após exclusão (toast com 5s de timeout)
3. Trocar de aba cancela modo seleção e limpa seleção
4. WhatsApp disponível para **todos** (admin e professor) — apenas visualização
5. Mensagem do WhatsApp reflete exatamente o filtro atual (período + professor selecionado)
6. Número de telefone sem formatação — apenas dígitos, sem `+`

---

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/AbsencesPage.jsx` | Estado de seleção, `BulkActionBar`, `SelectionToolbar`, `WhatsAppButton`, modificações em `SlotRow` e views |
| `src/store/useAppStore.js` | Novas actions: `deleteManySlots`, `restoreAbsences` |
| `src/lib/reports.js` | Nova função: `buildWhatsAppMessage` |

---

## Fora do Escopo (v1)

- Envio automático via API do WhatsApp Business
- Seleção de múltiplos destinatários WhatsApp
- Envio por e-mail
- Undo persistente (após reload)
- Edição de slots existentes
- Filtro por matéria ou turma dentro do relatório

---

## Verificação Manual

- [ ] Admin vê botão "Selecionar" em todas as 4 visualizações
- [ ] Checkboxes aparecem ao ativar modo seleção
- [ ] Seleção individual por checkbox funciona
- [ ] "Selecionar tudo" marca todos os slots visíveis no filtro atual
- [ ] "Só faltas" / "Só substituições" funcionam como esperado
- [ ] `BulkActionBar` aparece com contagem correta ao selecionar
- [ ] Exclusão em lote remove todos os slots selecionados
- [ ] Toast de undo aparece com contagem de itens removidos
- [ ] Undo restaura os slots removidos
- [ ] Trocar de aba cancela seleção
- [ ] Professor (não admin) NÃO vê checkboxes nem botão de excluir
- [ ] Botão WhatsApp aparece ao lado do PDF em todas as views
- [ ] Modal de número abre corretamente
- [ ] Número salvo no localStorage e pré-preenchido na próxima abertura
- [ ] Mensagem do WhatsApp reflete filtro atual (data / professor / semana / mês)
- [ ] "Subst.: EM PROCESSAMENTO" para slots sem substituto
- [ ] `window.open` abre WhatsApp com mensagem pré-preenchida
