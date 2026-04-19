# Spec: Faltas em Turmas de Formação — Dispensa de Substituição

**Versão:** 1.0 | **Data:** 2026-04-19 | **Escopo:** v1.0

---

## Visão Geral

Projeto que implementa comportamento especial para faltas em **turmas compartilhadas de formação** (ex: ATPCG, ATPCA). Atualmente, faltas em turmas com `type === "formation"` estão sendo:
- Contabilizadas no saldo de faltas (deduzindo carga)
- Permitindo seleção de substituto na UI (abas de ausências, calendário)
- Criando slots de demanda (aparecendo como "falta sem substituto")

**Comportamento desejado:** Faltas em formação devem ser registradas para auditoria, mas **nunca** deduzem carga horária, nunca criam demanda de substituto, e nunca exibem opção de seleção de substituto. A UI deve exibir badge especial "Dispensa de Substituição".

---

## Stack Tecnológica

- **Frontend:** React 18.3.1 + React Router 6.26.0
- **Estado:** Zustand 4.5.4 (useAppStore + useAuthStore)
- **Backend:** Firebase Firestore (sem servidor próprio)
- **Autenticação:** Firebase Auth (Google OAuth)
- **Estilização:** Tailwind CSS 3.4.10
- **Build:** Vite 5.4.1

---

## Páginas e Rotas

### HomePage — `/home`
**Descrição:** Página inicial para professores. Exibe saudação, stats do mês e action cards.

**Componentes:**
- Avatar e saudação do professor logado
- KPI Cards: faltas totais, substituições realizadas, carga semanal
- Action Cards: acessar grade, ausências, substituições

**Behaviors:**
- [ ] Exibir faltas mensais (EXCLUINDO turmas de FORMAÇÃO)
- [ ] Exibir substituições realizadas no mês
- [ ] Exibir carga semanal (EXCLUINDO turmas de FORMAÇÃO em monthlyLoad)
- [ ] Não contabilizar turmas de FORMAÇÃO na saudação "você tem X faltas este mês"

---

### DashboardPage — `/dashboard`
**Descrição:** Painel administrativo e coordenador. Exibe alertas globais, tabelas de carga, stats.

**Componentes:**
- KPI Cards globais (professores, aulas/semana, faltas totais, sem substituto)
- Tabela de carga por professor (cores: verde/amarelo/vermelho)
- Alertas: coordenadores aguardando aprovação, slots descuertos
- WorkloadCards: distribuição de carga por faixa

**Behaviors:**
- [ ] Exibir carga total por professor em KPIs (EXCLUINDO FORMAÇÃO)
- [ ] Não incluir slots de FORMAÇÃO no badge "sem substituto"
- [ ] WorkloadCards: usar monthlyLoad() que já filtra FORMAÇÃO (verificar)
- [ ] Badges de alerta não devem mencionar faltas de FORMAÇÃO

---

### CalendarPage — `/calendar`
**Descrição:** Calendário semanal interativo. Exibe grade de ausências e permite seleção de substituto.

**Componentes:**
- Calendário semanal (seg–sex)
- Grid de slots com cores por status (aberto/parcial/coberto)
- Modal de slot: ranking de substitutos + pills de sugestão
- ToggleRuleButtons: qualitative / quantitative

**Behaviors:**
- [ ] Renderizar slots de FORMAÇÃO com badge "Dispensa de Substituição" (não clicável)
- [ ] Não abrir modal de seleção de substituto ao clicar em slot FORMAÇÃO
- [ ] Não exibir SuggestionPills para slots FORMAÇÃO
- [ ] Desabilitar botões de atribuição de substituto para FORMAÇÃO
- [ ] Manter visual do slot (destacado, talvez com cor especial) mas sem interatividade

---

### CalendarDayPage — `/calendar/day`
**Descrição:** Versão mobile do calendário. Pills de dias + cards colapsáveis por período.

**Componentes:**
- Pills de dias (seg–sex)
- Cards colapsáveis: cada período exibe slots
- Mesmo modal de slot que CalendarPage

**Behaviors:**
- [ ] Renderizar slots de FORMAÇÃO com badge "Dispensa de Substituição"
- [ ] Não permitir navegação para modal de seleção em slots FORMAÇÃO
- [ ] Desabilitar interatividade em slots FORMAÇÃO

---

### AbsencesPage — `/absences`
**Descrição:** 4 abas de relatório (por professor / dia / semana / mês). Exibe ausências com status e opção de editar/deletar.

**Componentes:**
- Tabs: Por Professor / Por Dia / Por Semana / Por Mês
- Tabelas: data, professor, turma, status, ações
- Modal de edição: adicionar/remover slots, atribuir substituto
- Export PDF por aba

**Behaviors:**
- [ ] Exibir badge "Dispensa de Substituição" para slots com type === "formation"
- [ ] Não exibir pills de sugestão de substituto para slots FORMAÇÃO
- [ ] Desabilitar modal de seleção de substituto em slots FORMAÇÃO (ou renderizar versão read-only)
- [ ] Não contar slots FORMAÇÃO no "total de faltas" resumido por professor/dia
- [ ] Permitir deletar slots FORMAÇÃO (mesma UI que slots regulares, mas sem opção de substituição)

---

### SubstitutionsPage — `/substitutions`
**Descrição:** 5 abas de relatório (histórico, ranking, etc). Exibe substituições realizadas e estatísticas.

**Componentes:**
- Tabs: Histórico / Ranking / Por Professor / Por Dia / Por Mês
- Tabelas com filtros e export PDF

**Behaviors:**
- [ ] Não incluir slots de FORMAÇÃO nos relatórios de substituições
- [ ] Ranking de substitutos deve descartar substituições em FORMAÇÃO
- [ ] Não exibir aviso "falta descoberta" se todos os slots descobertos são FORMAÇÃO

---

### SettingsPage — `/settings`
**Descrição:** Página de configurações. Admin: 8 abas. Coordenador/Teacher: perfil + histórico.

**Componentes:**
- Aba "Formação" (admin only): CRUD de turmas compartilhadas (create, edit delete, toggle type)
- Listagem: nome, tipo (formation / elective), ações
- Modal: editar nome e tipo de turma

**Behaviors:**
- [ ] Exibir turmas com badge "Dispensa de Substituição" se type === "formation"
- [ ] Admin pode editar type entre "formation" e "elective" (não retroativo para faltas antigas)
- [ ] Avisar: mudança de type afeta apenas **futuras** faltas dessa turma

---

## Componentes Compartilhados

### SuggestionPills
**Uso:** CalendarPage, AbsencesPage (modal de edição)  
**Modificação:** Não renderizar se slot é de FORMAÇÃO. Props:
- `slot` — o slot de ausência
- `candidates` — ranking retornado de rankCandidates()
- `onSelect` — callback ao clicar em um candidato
- **Novo:** `hideForFormation` ou verificar se `slot.turma` é FORMAÇÃO

### SuggestionPill
**Uso:** Dentro de SuggestionPills  
**Modificação:** Nenhuma (apenas não será renderizado por SuggestionPills se FORMAÇÃO)

### Badge / Pill Especial
**Novo componente ou classe CSS:** Para exibir "Dispensa de Substituição"  
**Styling:** `bg-blue-l text-blue` ou similar (cor neutra para informativo, não alerta)

---

## Modelos de Dados

### meta/config — Turmas Compartilhadas
```js
sharedSeries: [
  {
    id: "shared-formacao",
    name: "FORMAÇÃO",
    type: "formation",      // ✅ JÁ EXISTE — "formation" | "elective"
    // formation: não demanda substituto (ex: ATPCG, ATPCA)
    // elective: demanda substituto como aulas regulares
  }
]
```

**Status:** Campo `type` já está implementado na arquitetura. Nenhuma alteração no modelo necessária.

---

### absences/
```js
{
  id: "ab7r3n2",
  teacherId: "lv9k2a7",
  createdAt: "2026-04-14T10:30:00.000Z",
  status: "open",         // "open" | "partial" | "covered"
  
  slots: [
    {
      id: "sl2x8k1",
      date: "2026-04-14",
      day: "Segunda",
      timeSlot: "seg-fund|manha|1",
      scheduleId: "mx3p9q1",
      subjectId: "subj-bio",      // null para FORMAÇÃO
      turma: "FORMAÇÃO",          // indica se é turma compartilhada
      substituteId: null          // NUNCA deve ser preenchido para FORMAÇÃO
    }
  ]
}
```

**Nota:** O modelo já suporta `turma` e `subjectId`. A lógica de negócio é implementada via funções, não via alterações ao modelo.

---

## Regras de Negócio

### Regra 1: Registro de Faltas
**Se:** Uma falta é em turma com `type === "formation"`  
**Então:**
- A ausência **é registrada** no banco em `absences[]`
- O slot é criado normalmente (para auditoria)
- MAS `substituteId` nunca é preenchido (nem via UI, nem via backend)

### Regra 2: Cálculo de Carga Horária
**Se:** `monthlyLoad()` está calculando carga de um professor para uma referenceDate  
**Então:**
- Aulas regulares contam normalmente
- Ausências em FORMAÇÃO **não deduzem** carga (já está OK em absences.js)
- Ausências em ELETIVA ou regulares **deduzem** carga
- Substituições em qualquer turma **contam** como carga realizada

**Código atual (absences.js:26–34):** ✅ Já filtra FORMAÇÃO corretamente
```js
const absenceLoad = (absences || []).reduce((acc, ab) => {
  if (ab.teacherId !== teacherId) return acc
  return acc + ab.slots.filter(sl =>
    sl.date >= monthStart &&
    sl.date <= referenceDate &&
    !isFormacao(sl.turma, sl.subjectId)  // ✅ Filtra FORMAÇÃO
  ).length
}, 0)
```

### Regra 3: Demanda de Substituto
**Se:** Um slot é de FORMAÇÃO  
**Então:**
- `rankCandidates()` **NÃO** deve incluir esse slot na análise
- Ou: `rankCandidates()` deve marcar o slot como "dispensado"
- UI não deve exibir "falta descoberta" se o único slot descoberto é FORMAÇÃO
- Reporte de "carga descoberta" não inclui FORMAÇÃO

### Regra 4: UI de Seleção de Substituto
**Se:** Usuário clica em um slot de FORMAÇÃO na CalendarPage / AbsencesPage  
**Então:**
- Modal não abre (ou abre read-only sem opção de seleção)
- Badge "Dispensa de Substituição" é exibido no slot
- SuggestionPills não são renderizadas
- Botões de "Atribuir Substituto" estão desabilitados

### Regra 5: Visibilidade em Relatórios
**Se:** Um relatório está sendo gerado (PDF ou tabulação)  
**Então:**
- Faltas de FORMAÇÃO **aparecem** no relatório (auditoria)
- MAS devem ser claramente marcadas como "Dispensa de Substituição"
- MAS não contabilizam no total de "faltas descobertas" ou "demanda de substitutos"

---

## Fluxo de Implementação

### Fase 1: Lógica Backend (funções em absences.js)

#### 1.1 Helper: Identificar turmas FORMAÇÃO
**Arquivo:** `src/lib/absences.js`  
**Função:** Criar helper `isFormationSlot(slot, sharedSeries)` que retorna true se:
- `slot.turma` está em `sharedSeries` com `type === "formation"` OU
- `slot.subjectId` aponta para uma activity de FORMAÇÃO

**Status:** Funções `isSharedSeries()` e `getSharedSeriesActivity()` já existem em helpers.js. Reutilizar.

#### 1.2 Filtro: monthlyLoad() — JÁ OK
**Arquivo:** `src/lib/absences.js:26–34`  
**Status:** ✅ Já filtra FORMAÇÃO. Não há alterações necessárias. Verificar em testes.

#### 1.3 Filter: rankCandidates() — verificação
**Arquivo:** `src/lib/absences.js:141–206`  
**Situação:** Função recebe `slotSegmentId` do timeSlot. Para FORMAÇÃO, `subjectId === null`.  
**Resultado:** Todos os candidatos recebem `score === 4` (correto). Desempate por carga (correto).  
**Status:** ✅ Funcionamento já está correto. Nenhuma mudança necessária.

#### 1.4 Helper: Detectar slot FORMAÇÃO para UI
**Novo:** Função `isFormationSlot(turma, subjectId, sharedSeries)`  
**Retorna:** `true` se é turma de FORMAÇÃO  
**Uso:** Em componentes UI para renderizar badge e desabilitar interatividade  
**Localização:** `src/lib/helpers.js`

### Fase 2: UI — CalendarPage

#### 2.1 Renderizar slot FORMAÇÃO com badge
**Arquivo:** `src/pages/CalendarPage.jsx`  
**Modificação:**
- Ao renderizar um slot, verificar `isFormationSlot(slot.turma, slot.subjectId, sharedSeries)`
- Se true:
  - Renderizar badge "Dispensa de Substituição" em cor especial (azul/neutro)
  - Remover `onClick` handler (ou redirecionar sem abrir modal)
  - Aplicar classe CSS `opacity-75` ou `cursor-not-allowed`

#### 2.2 Não abrir modal para FORMAÇÃO
**Arquivo:** `src/pages/CalendarPage.jsx`  
**Modificação:**
- Handler `handleSlotClick()`: verificar se `isFormationSlot()`
- Se true: não chamar `setSelectedSlot()` ou `setModalOpen(true)`
- Apenas exibir toast informativo ou nada (silencioso)

#### 2.3 SuggestionPills: não renderizar para FORMAÇÃO
**Arquivo:** `src/pages/CalendarPage.jsx`  
**Modificação:**
- Ao renderizar `<SuggestionPills>`, adicionar guard:
  ```jsx
  {!isFormationSlot(selectedSlot.turma, selectedSlot.subjectId, sharedSeries) && (
    <SuggestionPills candidates={...} onSelect={...} />
  )}
  ```

#### 2.4 Status badge: incluir FORMAÇÃO
**Arquivo:** `src/pages/CalendarPage.jsx`  
**Modificação:**
- Badge de status (aberto/parcial/coberto) deve exibir alternativa para FORMAÇÃO
- Se todos os slots descobertos são FORMAÇÃO: exibir "Todos cobertos" ou "Dispensa em vigor"

---

### Fase 3: UI — CalendarDayPage

#### 3.1 Renderizar badge FORMAÇÃO em cards
**Arquivo:** `src/pages/CalendarDayPage.jsx`  
**Modificação:**
- Ao renderizar slot no card colapsável, adicionar badge "Dispensa de Substituição"
- Remover `onClick` que navega para modal

#### 3.2 Desabilitar navegação para modal
**Arquivo:** `src/pages/CalendarDayPage.jsx`  
**Modificação:**
- Handler de clique no card: verificar `isFormationSlot()`
- Se true: não navegar, exibir toast ou fazer nada

---

### Fase 4: UI — AbsencesPage

#### 4.1 Exibir badge em tabelas
**Arquivo:** `src/pages/AbsencesPage.jsx`  
**Modificação:**
- Em cada tab (Por Professor / Por Dia / Semana / Mês)
- Ao renderizar linha com slot, adicionar badge "Dispensa de Substituição" se FORMAÇÃO
- Totalizadores: não contar slots FORMAÇÃO

#### 4.2 Modal de edição: desabilitar seleção de substituto
**Arquivo:** `src/pages/AbsencesPage.jsx`  
**Modificação:**
- Modal ao clicar em slot para editar
- Se slot é FORMAÇÃO:
  - SuggestionPills não renderizadas
  - Campos de input estão desabilitados
  - Permitir deletar o slot (botão delete ativo)
  - Label informativo: "Turma de formação — sem necessidade de substituto"

#### 4.3 Contadores por abas
**Arquivo:** `src/pages/AbsencesPage.jsx`  
**Modificação:**
- Badge "total de faltas": contar apenas não-FORMAÇÃO
- Badge "descobertas": contar apenas não-FORMAÇÃO
- Em relatórios PDF: exibir FORMAÇÃO separadamente ou com marcação especial

---

### Fase 5: UI — SuggestionPills

#### 5.1 Guard para FORMAÇÃO
**Arquivo:** `src/components/ui/SuggestionPills.jsx`  
**Modificação:**
- Props nova (opcional): `hideForFormation` ou verificar internamente
- Ou: retornar `null` se `isFormationSlot(slot.turma, slot.subjectId)`
- Função pode ficar mais segura: se receber props inválido, fazer gracefully

---

### Fase 6: Componente Badge "Dispensa de Substituição"

#### 6.1 Novo componente ou CSS class
**Opção A:** Classe CSS reutilizável em index.css
```css
.badge-formation {
  @apply inline-block px-2 py-1 rounded-md bg-blue-100 text-blue-700 text-xs font-semibold;
}
```

**Opção B:** Componente React `<FormationBadge />`
```jsx
export function FormationBadge() {
  return <span className="inline-block px-2 py-1 rounded-md bg-blue-100 text-blue-700 text-xs font-semibold">
    Dispensa de Substituição
  </span>
}
```

**Recomendação:** Classe CSS (Opção A) — mais simples e reutilizável

---

### Fase 7: Relatórios (PDF)

#### 7.1 generateXxxHTML — marcar FORMAÇÃO
**Arquivo:** `src/lib/reports.js`  
**Modificação:**
- Ao renderizar linhas de slots em HTML, adicionar marca para FORMAÇÃO
- Ex: coluna adicional com "Dispensa" ou cor de fundo especial
- Contar linhas: separar FORMAÇÃO de regulares no resumo

#### 7.2 Recálculo de totalizadores em PDF
**Arquivo:** `src/lib/reports.js`  
**Modificação:**
- Totalizadores ("X faltas descobertas") excluem FORMAÇÃO
- Ou: exibir dois totalizadores:
  - "Faltas (sem FORMAÇÃO): X"
  - "Faltas em Formação (sem substituto requerido): Y"

---

## Impacto Técnico — Resumo de Arquivos

| Arquivo | Tipo | Impacto |
|---|---|---|
| `src/lib/helpers.js` | Lógica | ADD: `isFormationSlot(turma, subjectId, sharedSeries)` |
| `src/lib/absences.js` | Lógica | VERIFY: `monthlyLoad()` (já está OK); VERIFY: `rankCandidates()` (já está OK) |
| `src/lib/reports.js` | Lógica | UPDATE: totalizadores em PDFs excluem FORMAÇÃO |
| `src/pages/CalendarPage.jsx` | UI | ADD badge; DISABLE click para FORMAÇÃO; HIDE SuggestionPills |
| `src/pages/CalendarDayPage.jsx` | UI | ADD badge; DISABLE click para FORMAÇÃO |
| `src/pages/AbsencesPage.jsx` | UI | ADD badge; UPDATE contadores; DISABLE modal para FORMAÇÃO |
| `src/components/ui/SuggestionPills.jsx` | UI | ADD guard para não renderizar se FORMAÇÃO |
| `src/index.css` | CSS | ADD `.badge-formation` ou similar |
| `src/store/useAppStore.js` | Store | NO CHANGES (model já suporta type em sharedSeries) |

---

## Fora do Escopo (v1)

- [ ] Retroatividade: faltas FORMAÇÃO antigas não sofrem recálculo se tipo mudar
- [ ] Migração de dados: se uma turma muda de "elective" para "formation", faltas antigas continuam com o comportamento antigo
- [ ] Validação de coordenadores: não permitir que coordenadores adicionem aulas em FORMAÇÃO (já existe em `addSchedule`)
- [ ] Notificações: não enviar notificação de "falta descoberta" para FORMAÇÃO
- [ ] Integração com WhatsApp: notificações de FORMAÇÃO são silenciosas
- [ ] Dashboard: widgets separadas para FORMAÇÃO vs regular (consolidação futura)

---

## Checklist de Implementação

- [ ] Helper `isFormationSlot()` criado em helpers.js
- [ ] monthlyLoad() verificado e testado (FORMAÇÃO exclui absenceLoad)
- [ ] rankCandidates() verificado e testado (FORMAÇÃO sem impacto)
- [ ] CalendarPage: badge "Dispensa de Substituição" renderizada
- [ ] CalendarPage: clique em FORMAÇÃO não abre modal
- [ ] CalendarPage: SuggestionPills não renderizam para FORMAÇÃO
- [ ] CalendarDayPage: badge renderizada e clique desabilitado
- [ ] AbsencesPage: badges exibidas em todas as abas
- [ ] AbsencesPage: modal de edição desabilita seleção para FORMAÇÃO
- [ ] AbsencesPage: totalizadores excluem FORMAÇÃO
- [ ] SuggestionPills: guarda contra renderização para FORMAÇÃO
- [ ] Classe CSS `.badge-formation` definida em index.css
- [ ] Relatórios: FORMAÇÃO marcada ou separada
- [ ] Relatórios: totalizadores excluem FORMAÇÃO
- [ ] Testes manuais: criar ausência em FORMAÇÃO e verificar saldo
- [ ] Testes manuais: verificar que não aparece em "sem substituto"
- [ ] Documentação: atualizar architecture.md com comportamento FORMAÇÃO

---

## Exemplo Prático (Teste Manual)

### Setup
```
Turma: FORMAÇÃO (type: "formation")
Prof: Ana (id: "ana123")
Horário de terça: seg-fund|manha|1 até 3 (3 aulas)
  - 1ª aula: FORMAÇÃO
  - 2ª aula: FORMAÇÃO
  - 3ª aula: Biologia (regular)
```

### Ação: Ana falta na terça
```
Criar absence com 3 slots:
- slot 1: FORMAÇÃO
- slot 2: FORMAÇÃO
- slot 3: Biologia
```

### Verificação Esperada

**1. HomePage (Ana logada)**
- "Você tem 1 falta este mês" (não 3)
- Carga mensal: -1 (apenas slot 3)

**2. CalendarPage (Admin vendo Ana na terça)**
- 3 slots visíveis
- Slots 1–2: com badge "Dispensa de Substituição", sem clique interativo, cinza
- Slot 3: normal, azul/aberto, clicável, com SuggestionPills

**3. AbsencesPage (aba Por Professor)**
- Ana: "1 falta descoberta" (não 3)
- Linha de slot 1: badge "Dispensa de Substituição"
- Linha de slot 2: badge "Dispensa de Substituição"
- Linha de slot 3: status "aberta", botão "Atribuir Substituto"

**4. AbsencesPage (aba Por Dia)**
- Terça: "1 falta descoberta" (não 3)
- Grid de 3 linhas; slots 1–2 com badge

**5. SubstitutionsPage (Ranking)**
- Não inclui slots 1–2 (FORMAÇÃO)
- Inclui apenas slot 3 (Biologia)

**6. DashboardPage (KPIs)**
- "Faltas descobertas: 1" (não 3)
- "Carga sem substituto: 1 aula" (não 3)

---

## Documentação

### Atualizar architecture.md
Adicionar seção em "Modelo de Dados" ou "Regras de Negócio":

```markdown
### Comportamento Especial de Turmas de Formação (type === "formation")

Turmas compartilhadas com `type: "formation"` (ex: ATPCG, ATPCA) têm tratamento diferente de faltas:

| Aspecto | Comportamento |
|---|---|
| Registro | ✅ Faltas SÃO registradas em `absences[]` (auditoria) |
| Carga horária | ❌ NÃO deduzem carga (`monthlyLoad` filtra) |
| Substituto | ❌ Nunca criam demanda (`rankCandidates` não afetado) |
| UI de seleção | ❌ Modal de seleção não abre |
| Badge visual | ✅ "Dispensa de Substituição" exibida sempre |
| Relatórios | ✅ Aparecem marcados especialmente; não contam em totalizadores |

**Implementação:** Helper `isFormationSlot(turma, subjectId, sharedSeries)` em `helpers.js` usado em toda UI.
```
