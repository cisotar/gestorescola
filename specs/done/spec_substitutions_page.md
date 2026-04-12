# Spec: SubstitutionsPage

## Visão Geral

Página de relatório de substituições que lista todas as aulas cujos slots possuem `substituteId` preenchido em `absences[].slots`. Permite ao admin visualizar quem cobriu quem, em qual período, com filtros por substituto, segmento, turma e mês. Segue o padrão de layout e componentes de `AbsencesPage.jsx`.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind CSS (design-system.md)
- **Estado:** Zustand (`useAppStore`, `useAuthStore`)
- **Banco:** Firestore — coleções `absences`, `schedules`, `teachers`
- **Utilitários:** `helpers.js`, `periods.js`, `absences.js` (`monthlyLoad`), `reports.js`
- **Rota nova:** `/substitutions`

---

## Páginas e Rotas

### SubstitutionsPage — `/substitutions`

**Descrição:** O admin vê todos os eventos de substituição (slots com `substituteId`) agrupados por 5 abas. Professores só podem ver as abas relacionadas a si mesmos (aba Substituto filtrada automaticamente para o próprio usuário).

**Componentes internos (definidos no mesmo arquivo, sem export):**

| Componente | Responsabilidade |
|---|---|
| `SubFilterToolbar` | Dropdown de substituto, segmento, turma e mês/ano |
| `SubSlotRow` | Linha de evento: horário + turma + substituto cobriu faltante |
| `TeacherSubCard` | Card de professor com indicadores de cobertura e saldo |
| `ViewBySubstitute` | Aba 1 — cards de cada substituto com lista de aulas cobertas |
| `ViewByDay` | Aba 2 — ScheduleGrid com destaque de célula onde houve substituição |
| `ViewByWeek` | Aba 3 — lista cronológica de eventos filtrada por semana |
| `ViewByMonth` | Aba 4 — lista cronológica de eventos filtrada por mês |
| `ViewRanking` | Aba 5 — ranking de carga real por professor (próprias + substituições) |

**Behaviors (o que o usuário pode fazer):**

- [ ] **Navegar pelas abas:** clicar em qualquer das 5 abas (Substituto, Dia, Semana, Mês, Ranking) para alternar o modo de visualização; ao trocar de aba todos os filtros de seleção granular (professor/data selecionados) são resetados, mas os filtros globais (substituto, segmento, turma, mês) são mantidos.
- [ ] **Filtrar por substituto:** selecionar um professor no dropdown "Substituto" para exibir apenas os eventos onde esse professor cobriu alguém; a opção "Todos" exibe todos.
- [ ] **Filtrar por segmento:** selecionar um segmento no dropdown para restringir os eventos às turmas daquele segmento.
- [ ] **Filtrar por turma:** após selecionar um segmento, filtrar por uma turma específica dentro desse segmento.
- [ ] **Filtrar por mês/ano:** selecionar mês e ano de referência para exibir apenas substituições ocorridas naquele período.
- [ ] **Aba Substituto — expandir card:** clicar em um `TeacherSubCard` para exibir ou ocultar a lista de aulas cobertas pelo professor no período filtrado.
- [ ] **Aba Dia — visualizar grade:** ver a `ScheduleGrid` do dia com as células de substituição exibindo o apelido (ou nome) do substituto em destaque com cor `ok`.
- [ ] **Aba Semana — navegar por semana:** avançar/retroceder semanas via setas para ver a lista cronológica de substituições da semana selecionada.
- [ ] **Aba Mês — navegar por mês:** alternar mês/ano pelo filtro global para ver a lista cronológica do mês completo.
- [ ] **Aba Ranking — ver carga real:** visualizar todos os professores ordenados pela carga total (aulas da grade + aulas cobertas no mês).
- [ ] **Aba Ranking — alternar ordenação:** clicar no botão de alternância para mudar entre ordenação por "Carga Total" e "Apenas Substituições".
- [ ] **Gerar PDF — Folha de Ponto:** na aba Substituto (com professor selecionado), clicar em "PDF Folha de Ponto" para gerar um relatório simples com datas e turmas cobertas pelo professor no período.
- [ ] **Gerar PDF — Extrato de Saldo:** na aba Substituto (com professor selecionado), clicar em "PDF Extrato" para gerar o balanço com lista de faltas cometidas vs. substituições realizadas.
- [ ] **Gerar PDF — Ranking:** na aba Ranking, clicar em "PDF Ranking" para gerar o relatório completo de carga de todos os professores.

---

## Componentes Compartilhados (reutilizados)

| Componente | Origem | Uso |
|---|---|---|
| `ScheduleGrid` | `SettingsPage.jsx` | Aba Dia — grade com destaque de substituição |
| `Modal` | `components/ui/Modal.jsx` | Eventuais detalhes expandidos |
| `Spinner` | `components/ui/Spinner.jsx` | Loading state se necessário |

---

## Modelos de Dados

### Slot de substituição (derivado de `absences[].slots`)
```js
{
  id:           string,        // uid
  absenceId:    string,        // id da ausência pai
  teacherId:    string,        // professor faltante
  timeSlot:     string,        // "segId|turno|aulaIdx"
  turma:        string,        // ex: "8A"
  subjectId:    string,
  substituteId: string,        // professor substituto (preenchido = evento de substituição)
  date:         string,        // ISO "YYYY-MM-DD"
}
```

### Dados derivados para `TeacherSubCard`
```js
{
  teacher:        Teacher,     // professor substituto
  covered:        number,      // total de slots cobertos no período filtrado
  balance:        number,      // covered - absenceCount (faltas cometidas pelo mesmo professor)
  coveredSlots:   Slot[],      // lista dos slots cobertos, ordenada por data
}
```

### Dados derivados para `ViewRanking`
```js
{
  teacher:        Teacher,
  scheduled:      number,      // aulas da grade no mês (via schedules)
  substitutions:  number,      // slots onde substituteId === teacher.id no mês
  total:          number,      // scheduled + substitutions
}
```

---

## Regras de Negócio

1. **Filtro de substituto automático (professor logado):** quando `role === 'teacher'`, o dropdown de substituto é fixado no próprio usuário e ocultado — o professor só vê os eventos em que ele foi o substituto.

2. **Cálculo de saldo (`TeacherSubCard`):**
   - `covered` = quantidade de slots em `absences[].slots` onde `substituteId === teacher.id` e a data está no período filtrado.
   - `absenceCount` = quantidade de slots em `absences[].slots` onde `teacherId === teacher.id` e a data está no período filtrado.
   - `balance = covered - absenceCount` — positivo é favorável ao professor.

3. **Cálculo de carga real (`ViewRanking`):**
   - `scheduled` = contagem de entradas em `schedules` com `teacherId === teacher.id` que representam aulas (não intervalos) no mês — usa `monthlyLoad` de `absences.js` ou lógica equivalente.
   - `substitutions` = contagem de slots cobertos no mês (mesma lógica do saldo).
   - `total = scheduled + substitutions`.

4. **Cor de substituição confirmada:** células e linhas de substituição confirmada usam `text-ok` e `bg-ok-l` (token `ok` do design system).

5. **Aba Dia — integração com ScheduleGrid:** a grade existente recebe uma prop adicional (ex: `substitutionMap`) — um objeto `{ [timeSlot]: substituteDisplayName }` — para renderizar o destaque nas células corretas. Não modificar a lógica interna da `ScheduleGrid`; a prop extra é opcional e aditiva.

6. **Formato de evento nas abas Semana/Mês:**
   ```
   [Horário] [Turma] — <Substituto> cobriu <Faltante>
   ```
   Ex: `"1ª Aula (07:00–07:50) · 8A — João cobriu Maria"`

7. **Relatórios PDF:** usar `openPDF` de `reports.js`. Adicionar três novas funções neste arquivo:
   - `generateSubstitutionTimesheetHTML(teacher, slots, store)` — Folha de Ponto.
   - `generateSubstitutionBalanceHTML(teacher, coveredSlots, absenceSlots, store)` — Extrato de Saldo.
   - `generateSubstitutionRankingHTML(rankingData, month, year, store)` — Ranking.

8. **Sem seleção em lote:** a `SubstitutionsPage` é somente leitura — não há delete de slots aqui. Omitir `SelectionToolbar` e `BulkActionBar`.

9. **Rota protegida:** acessível para `admin` e `teacher` (mesma regra de `AbsencesPage`).

---

## Fora do Escopo (v1)

- Edição ou deleção de substituições diretamente nesta página.
- Notificações por WhatsApp a partir desta página.
- Substituições de professores externos (sem conta no sistema).
- Paginação da lista (não necessária no volume atual).
- Visualização por professor **faltante** (coberto) — a aba Substituto foca em quem cobriu.
