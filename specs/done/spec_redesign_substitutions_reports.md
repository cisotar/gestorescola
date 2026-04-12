# Spec: Redesign dos Relatórios de Substituições (Alinhamento com Ausências)

## Visão Geral

Redesenhar a `SubstitutionsPage` para que sua estrutura visual, navegação e padrões de interação sejam **análogos** à `AbsencesPage`. O usuário não deve sentir que mudou de sistema — apenas de perspectiva (de "quem faltou" para "quem cobriu"). Mantemos da versão atual apenas os botões **Folha de Ponto** e **Extrato de Saldo**; todo o restante segue os padrões já validados na página de ausências.

## Stack Tecnológica
- Frontend: React 18 + Tailwind CSS (tokens existentes em `tailwind.config.js`)
- Estado: Zustand (`useAppStore`, `useAuthStore`)
- Backend/DB: Firebase Firestore
- Build: Vite
- PDF: Função `openPDF()` em `src/lib/reports.js`

## Páginas e Rotas

### Relatório de Substituições — `/substitutions`

**Descrição:** Página de relatórios de substituições com 4 abas de visualização + ranking, seguindo o layout e interações da `AbsencesPage`.

---

### Componentes Internos

#### 1. Abas de Navegação Superior (Tabs)

**Descrição:** 4 botões tipo pills integrados ao topo do painel principal, idênticos ao estilo da AbsencesPage.

| Aba | ID | Label |
|-----|----|-------|
| Por Substituto | `substitute` | 👤 Por Substituto |
| Por Dia | `day` | 📅 Por Dia |
| Por Semana | `week` | 🗓 Por Semana |
| Por Mês | `month` | 📆 Por Mês |

**Estilo:** Mesmos pills da AbsencesPage — ativo: `bg-navy text-white`, inativo: `bg-surf2 text-t2 border-bdr`.

**Behaviors:**
- [ ] Clicar numa aba alterna a visualização sem recarregar
- [ ] Filtros globais (mês/ano) persistem entre abas
- [ ] O Ranking é acessado dentro de uma das abas (ver seção 6)

---

#### 2. Aba "Por Substituto" — Layout Sidebar + Main (ViewBySubstitute)

**Descrição:** Réplica do padrão master-detail da aba "Por Professor" de ausências. Coluna esquerda com cards de professores substitutos; conteúdo central com perfil de substituição do docente selecionado.

**Componentes:**

- **Sidebar (coluna esquerda — 280px em desktop):**
  - Lista vertical de cards de professores que realizaram substituições no período
  - Cada card: avatar colorido (iniciais) + nome + badge com total de coberturas
  - Bordas arredondadas (`rounded-xl`), sombra leve, hover com destaque (`hover:border-t3`)
  - Max-height `65vh`, `overflow-y-auto`, `scroll-thin`
  - Card selecionado: borda `border-navy` ou fundo `accent-l`
  - Grid: `grid-cols-1 lg:grid-cols-[280px_1fr] gap-5`

- **Painel Central (professor selecionado):**
  - **Card de Cabeçalho:** Nome do professor + matéria(s) que leciona + botões de ação
  - **Botões de Exportação:** `📄 Folha de Ponto` | `📄 Extrato de Saldo` | `📄 PDF` | `📱 WhatsApp`
  - **Filtros Temporais Internos (Pills):** `Tudo` | `Dia` | `Semana` | `Mês` — segmentam as substituições desse professor sem sair da visão "Por Substituto"
  - **Lista de Substituições:** Cards empilhados verticalmente (ver componente SubSlotRow redesenhado)

**Behaviors:**
- [ ] Clicar num professor na sidebar carrega seu perfil no painel central
- [ ] Filtros temporais internos (pills) filtram apenas dados do professor selecionado
- [ ] Botão "Folha de Ponto" gera PDF com substituições do professor selecionado
- [ ] Botão "Extrato de Saldo" gera PDF com balanço faltas × substituições
- [ ] Botão "PDF" gera relatório completo do professor (análogo ao PDF da aba professor em ausências)
- [ ] Botão "WhatsApp" abre modal com campo de telefone e envia resumo formatado
- [ ] Seleção de filtro temporal (dia/semana/mês) exibe picker de data/semana/mês correspondente

---

#### 3. SubSlotRow Redesenhado (Card de Substituição Individual)

**Descrição:** Card empilhado representando uma aula substituída. Segue o mesmo padrão do `SlotRow` de ausências, mas com inversão lógica: onde ausências mostram o substituto, aqui mostra o **professor ausente** (dono original da aula).

**Conteúdo do Card:**
- Data (dia em que ocorreu)
- Horário/Aula (ex: "1ª Aula — 07:00–07:50")
- Série e Turma (ex: "8A")
- Matéria lecionada
- **Professor Ausente** (nome do professor original, na posição onde ausências mostrariam o substituto)

**Estilo:** `flex items-center gap-3 py-2.5 border-b border-bdr/60 last:border-0`, linhas alternadas com leve destaque.

**Behaviors:**
- [ ] Exibir checkbox quando `selectionMode === true` (admin only)
- [ ] Exibir botão de excluir (✕) quando admin e fora do modo seleção
- [ ] Exibir status visual claro do professor ausente

---

#### 4. Aba "Por Dia" (ViewByDay) — Lista Limpa, Sem Grade Horária

**Descrição:** Abandonar a grade horária (DayGridBySegment) atual. Substituir por uma **lista vertical de eventos** agrupados por professor substituto, idêntica ao padrão da ViewByDay de ausências.

**Componentes:**
- **Controles:** Date picker + pills rápidos (últimas 10 datas com substituições) + navegação ‹ ›
- **Conteúdo:** Slots filtrados pela data, agrupados por professor substituto (via GroupedBySubstitute)
- **Botões:** `📄 PDF` + `📱 WhatsApp` (quando há slots)

**GroupedBySubstitute:**
- Header por substituto: avatar + nome + contagem "X coberta(s)"
- Lista de SubSlotRow dentro de cada grupo

**Behaviors:**
- [ ] Selecionar data via picker ou pill rápido filtra os slots
- [ ] Navegação ‹ › avança/retrocede dias úteis
- [ ] Botão "Hoje" retorna ao dia atual
- [ ] Agrupamento por professor substituto com header colorido
- [ ] Botão PDF gera relatório do dia selecionado
- [ ] Botão WhatsApp envia resumo do dia

---

#### 5. Abas "Por Semana" e "Por Mês" (ViewByWeek / ViewByMonth) — Agrupamento Hierárquico

**Descrição:** Listas de substituições organizadas com hierarquia clara: **Dia → Professor Substituto → Lista de Aulas → Professor Ausente**. Cada semana/bloco de datas é contido em um container/card pai.

**ViewByWeek:**
- **Controles:** Navegação de semana (‹ ›) + "Hoje" + filtro de professor substituto
- **Layout:** Card pai por semana → seções por dia (Seg, Ter...) → dentro de cada dia, agrupado por substituto → SubSlotRow

**ViewByMonth:**
- **Controles:** Navegação mês/ano + pills de mês + filtro de professor substituto
- **Layout:** Card pai por semana do mês → seções por dia → agrupado por substituto → SubSlotRow

**Estilo dos containers:** `card` (bg-surf rounded-xl border border-bdr p-5) para cada bloco semanal.

**Behaviors:**
- [ ] Semana: navegação ‹ › avança/retrocede semanas (Seg–Sex)
- [ ] Mês: navegação ‹ › avança/retrocede meses; pills permitem seleção rápida do mês
- [ ] Filtro de professor substituto opcional (dropdown "Todos" ou específico)
- [ ] Hierarquia visual clara: Dia > Substituto > Aulas > Professor Ausente
- [ ] Cards semanais contêm os dados, evitando lista infinita
- [ ] Botão PDF gera relatório da semana/mês
- [ ] Botão WhatsApp envia resumo da semana/mês

---

#### 6. Ranking — Tabela de Performance Gerencial

**Descrição:** O ranking deixa de ser uma aba separada e passa a ser uma **seção dentro da aba "Por Mês"** (ou um botão de acesso rápido no topo), com formato de tabela gerencial.

**Formato de Tabela:**
| # | Professor | Aulas Próprias | Ausências | % Assiduidade |
|---|-----------|---------------|-----------|---------------|
| 1 | Avatar + Nome | Total de aulas que deveria dar | Total de faltas | Calculado |

**Colunas:**
1. Posição (ranking automático)
2. Nome do Professor (avatar com iniciais/foto + nome)
3. Aulas Próprias (total de aulas agendadas no período)
4. Ausências (total de faltas registradas)
5. % Assiduidade (consequência visual de Aulas vs. Faltas)

**Estilo:** Tabela com linhas alternadas, headers `bg-surf2`, borda `border-bdr`.

**Behaviors:**
- [ ] Ranking ordenado automaticamente por % de assiduidade (maior para menor)
- [ ] Botão para alternar ordenação (por assiduidade, por total de aulas, por ausências)
- [ ] Botão `📄 PDF Ranking` gera relatório em PDF
- [ ] Avatar colorido com iniciais na primeira coluna
- [ ] Barras visuais ou cores indicando faixas de assiduidade (verde > 90%, amarelo 70-90%, vermelho < 70%)

---

#### 7. Gestão de Dados — Seleção e Remoção em Massa

**Descrição:** Replicar o sistema de seleção em massa da AbsencesPage (SelectionToolbar + BulkActionBar + UndoBar).

**Componentes:**
- **SelectionToolbar:** Botão toggle `☑ Selecionar` / `✕ Cancelar` + botões rápidos: "Selecionar tudo", "Desmarcar tudo", "Só faltas", "Só substituições"
- **BulkActionBar:** Barra fixa inferior com contagem + botões "Desmarcar tudo" e "Excluir selecionadas"
- **UndoBar:** Barra fixa inferior pós-exclusão com contagem + botão "Desfazer" (5s auto-dismiss)

**Behaviors:**
- [ ] Admin pode ativar modo de seleção em qualquer aba
- [ ] Checkboxes aparecem em cada SubSlotRow quando modo seleção ativo
- [ ] "Selecionar tudo" marca todos os itens visíveis
- [ ] "Só faltas" filtra e seleciona apenas slots de falta (sem substituteId)
- [ ] "Só substituições" filtra e seleciona apenas slots com substituteId
- [ ] "Excluir selecionadas" remove os itens e exibe UndoBar
- [ ] "Desfazer" restaura snapshot anterior (dentro de 5s)
- [ ] Padding inferior automático (`pb-16`) quando barra de ação fixa visível

---

#### 8. Botões de Exportação PDF (Em Todas as Abas)

**Descrição:** Manter botões de exportação PDF em todas as visualizações, análogos aos de ausências.

**Behaviors:**
- [ ] Aba "Por Substituto": PDF do professor selecionado + Folha de Ponto + Extrato de Saldo
- [ ] Aba "Por Dia": PDF do dia selecionado
- [ ] Aba "Por Semana": PDF da semana selecionada
- [ ] Aba "Por Mês": PDF do mês selecionado
- [ ] Ranking: PDF do ranking

---

## Componentes Compartilhados

- **SlotRow / SubSlotRow:** Componente de linha de slot — reutilizar padrão da AbsencesPage com inversão lógica (mostrar professor ausente em vez de substituto)
- **SelectionToolbar / BulkActionBar / UndoBar:** Extrair de AbsencesPage e reutilizar
- **WhatsAppButton:** Componente modal com input de telefone e localStorage — reutilizar de AbsencesPage
- **GroupedBySubstitute:** Análogo ao GroupedByTeacher de ausências, agrupando por professor substituto
- **Modal, Spinner, Toast:** Componentes UI existentes em `src/components/ui/`

## Modelos de Dados

### Slot de Substituição (derivado de Absence)
```
{
  id: string                 // UID do slot
  absenceId: string          // ID da ausência pai
  teacherId: string          // Professor ausente (dono da aula)
  substituteId: string       // Professor substituto (quem cobriu)
  date: string               // "YYYY-MM-DD"
  timeSlot: string           // "segId|turno|aulaIdx"
  turma: string              // ex: "8A"
  subjectId: string          // Disciplina
}
```

### Ranking Entry (calculado)
```
{
  teacherId: string
  teacherName: string
  ownClasses: number         // Total de aulas agendadas
  absences: number           // Total de faltas
  attendanceRate: number     // % assiduidade = (own - absences) / own * 100
}
```

## Regras de Negócio

1. **Inversão Lógica:** Na visão de substituições, o campo destacado é o professor **ausente** (não o substituto); o substituto é o protagonista da sidebar/agrupamento
2. **Filtros globais** (mês/ano) persistem entre abas; filtros internos (dia/semana) são locais à aba
3. **Seleção em massa** disponível apenas para admins
4. **Undo** tem timeout de 5 segundos antes de confirmar exclusão permanente
5. **Folha de Ponto e Extrato de Saldo** são exclusivos da aba "Por Substituto"
6. **Ranking** usa dados reais (aulas agendadas vs. faltas), não pontuação abstrata
7. **Professor logado (role=teacher)** vê apenas suas próprias substituições, com filtro fixo
8. **WhatsApp** salva telefone no localStorage (key: `gestao_whatsapp_phone`)

## Fora do Escopo (v1)

- Notificações push/email de substituições
- Exportação para Excel/CSV (apenas PDF)
- Gráficos/charts de tendência
- Aprovação/rejeição de substituições
- Integração com calendário externo
- Histórico de alterações (audit log)
- Foto real do professor (apenas avatar com iniciais)
