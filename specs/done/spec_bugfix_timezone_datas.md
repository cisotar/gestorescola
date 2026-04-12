# Spec: Bugfix — Datas erradas na marcação de faltas e seleção de substitutos

## Visão Geral

**O problema:** em várias telas do sistema, a data exibida na grade semanal não corresponde ao dia da semana correto. Exemplo reportado: segunda-feira 06/04 aparece rotulada como "07/04", e ao clicar na célula o modal abre para 07/04 (que é terça-feira), mostrando as aulas erradas.

**A causa:** mistura inconsistente entre duas formas de trabalhar com datas em JavaScript:
- Componentes usam `new Date()` / `getDay()` no fuso **local** do navegador
- Mas convertem o resultado para ISO string via `toISOString()`, que retorna data em **UTC**

Em fusos como o brasileiro (BRT, UTC−3), uma data local vira um ISO string do dia seguinte (ou anterior), dependendo da hora. O mesmo vale para `parseDate("2026-04-06")`, que em navegadores padrão interpreta a string como meia-noite UTC — no Brasil isso é 21:00 do dia 05/04, e `getDay()` retorna o dia errado.

**Por que é urgente:** o bug não é só cosmético. A função `rankCandidates` (que escolhe o melhor substituto) usa `dateToDayLabel(date)` para descobrir "que dia da semana é esse" e casar com os horários dos professores. Se a conversão estiver deslocada em 1 dia, o sistema pode estar **oferecendo o substituto errado** (quem tem aula na terça aparece como disponível para cobrir uma falta de segunda, e vice-versa).

**O objetivo:** corrigir o tratamento de datas para que toda a aplicação trabalhe consistentemente em horário local — tanto na exibição quanto na lógica de negócio — eliminando o deslocamento de 1 dia.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind
- **Estado:** Zustand (`useAppStore`)
- **Datas:** API nativa `Date` do JavaScript (sem biblioteca — é a origem do bug)
- **Fuso-alvo:** horário local do navegador (tipicamente BRT, UTC−3)

---

## Páginas e Rotas Afetadas

### CalendarPage — `/calendar`

**Descrição:** Calendário semanal interativo. É onde o bug foi originalmente detectado.

**Onde o bug aparece:**
- A grade mostra os 7 dias da semana com rótulos `dd/MM` incorretos (deslocados em 1 dia em certos horários)
- Ao clicar numa célula para marcar falta, o modal abre referente ao dia errado
- As aulas listadas no modal correspondem ao dia errado (ou ficam vazias, se o professor não tem aula no dia "errado")

**Behaviors a corrigir:**
- [ ] Ao abrir a página numa segunda-feira 06/04, a coluna "Segunda" da grade exibe "06/04", não "07/04"
- [ ] Clicar na célula de segunda abre o modal com `date === "2026-04-06"`, não `"2026-04-07"`
- [ ] A lista de aulas do professor corresponde ao dia real (segunda → aulas de segunda)
- [ ] O indicador visual de "hoje" na grade marca a coluna certa

### CalendarDayPage — `/calendar/day`

**Descrição:** Visualização mobile do dia. Recebe `activeDate` via `location.state` vinda da CalendarPage.

**Onde o bug aparece:**
- Como a data chega via `location.state` da CalendarPage (que já calcula errado), essa tela herda o problema
- `dateToDayLabel(activeDate)` retorna o dia errado quando a string ISO não é tratada como local

**Behaviors a corrigir:**
- [ ] A página mostra o dia da semana correspondente à data passada
- [ ] As aulas listadas são as do dia real, não do dia seguinte

### AbsencesPage — `/absences`

**Descrição:** Relatório de ausências em 4 abas (Por Professor / Dia / Semana / Mês). Filtra slots por intervalo de datas.

**Onde o bug aparece:**
- Aba "Por Semana" usa `weekStart(filterDate)` — se `filterDate` é uma ISO string que vira UTC errada, o intervalo de 5 dias fica deslocado
- Filtros de dia específico podem não casar com os slots salvos quando há deslocamento

**Behaviors a corrigir:**
- [ ] Filtro de semana inclui corretamente segunda a sexta do intervalo desejado
- [ ] Filtro de dia específico retorna os slots daquele dia exato

### SubstitutionsPage — `/substitutions`

**Descrição:** Página nova criada no épico anterior. Tem a aba "Dia" que mostra a grade do dia selecionado.

**Onde o bug aparece:**
- A aba "Dia" usa `new Date().getDay()` para calcular "primeira segunda-feira do mês" e navegar dias — se o cálculo estiver inconsistente, o mesmo deslocamento aparece aqui
- A aba "Semana" usa `weekStart()` — idem
- O ranking da aba "Ranking" usa `businessDaysBetween(monthStart, monthEnd)` para contar aulas no mês — pode contar dias errados se as bordas do mês forem calculadas em UTC

**Behaviors a corrigir:**
- [ ] A aba Dia seleciona a data correta ao abrir (hoje, no fuso local)
- [ ] A aba Semana navega pela semana correta
- [ ] O ranking do mês considera o mês local inteiro, sem deslocamento

### SchoolSchedulePage — `/school-schedule`

**Descrição:** Grade horária da escola inteira. Pode consumir `dateToDayLabel` em algum lugar.

**Behaviors a corrigir:**
- [ ] Auditar se há uso de datas locais vs UTC e corrigir se encontrar

---

## Componentes / Funções Afetadas

### `src/lib/helpers.js` — ponto central do bug

| Função | Linha aproximada | Problema atual | Correção |
|---|---|---|---|
| `parseDate(s)` | ~L69 | `new Date("2026-04-06")` interpreta como UTC meia-noite, que no BRT vira 05/04 21:00 | Fazer split explícito em `[ano, mês, dia]` e criar `new Date(y, m-1, d)` (meia-noite local) |
| `formatISO(d)` | — | Se usar `toISOString().split('T')[0]`, retorna UTC | Usar `d.getFullYear()`, `d.getMonth()+1`, `d.getDate()` para compor a string no fuso local |
| `dateToDayLabel(s)` | ~L77 | Depende de `parseDate` — herda o bug | Após corrigir `parseDate`, fica automaticamente correto |
| `weekStart(s)` | — | Depende de `parseDate` | Idem |
| `businessDaysBetween(from, to)` | — | Pode ter deslocamento nas bordas | Auditar e ajustar se necessário |

### `src/pages/CalendarPage.jsx`

| Função/Variável | Linha aproximada | Problema | Correção |
|---|---|---|---|
| `getWeekDates(offset)` | ~L15–25 | Calcula `mon` local mas retorna `d.toISOString().split('T')[0]` (UTC) | Trocar a linha de retorno por composição manual com `getFullYear/Month/Date` locais |
| `todayISO` | ~L408 | `new Date().toISOString().split('T')[0]` — UTC direto | Usar o novo helper `toLocalISO(new Date())` |

### `src/lib/absences.js`

| Função | Linha aproximada | Problema | Correção |
|---|---|---|---|
| `isBusy(teacherId, date, timeSlot, ...)` | ~L28–40 | Chama `dateToDayLabel(date)` — herda o bug | Sem alteração direta, corrige automaticamente quando `parseDate` for consertada |
| `rankCandidates(...)` | ~L51–105 | Usa `isBusy` e `monthlyLoad` — herda o bug | Idem |
| `monthlyLoad(teacherId, referenceDate, ...)` | — | Usa `businessDaysBetween` e `dateToDayLabel` — herda o bug | Idem |

### `src/pages/SubstitutionsPage.jsx`

- Qualquer uso de `new Date()...toISOString().split('T')[0]` deve virar `toLocalISO(new Date())`
- A aba Dia, Semana e Ranking dependem do comportamento de `parseDate`, `weekStart` e `businessDaysBetween` corretos

### `src/pages/AbsencesPage.jsx`, `src/pages/CalendarDayPage.jsx`

- Usos transitivos do helper — corrigem-se automaticamente quando `helpers.js` for consertado

---

## Modelos de Dados (contexto)

Sem mudança no schema do banco. Os dados afetados são:

- **`schedules[]`** — campo `day` é label textual (`"Segunda"`, `"Terça"`...). É a "verdade" do dia da semana de cada aula.
- **`absences[].slots[]`** — campo `date` é ISO string (`"YYYY-MM-DD"`) e campo `day` é label textual. **Cuidado:** se algum registro foi criado com a data errada, ele ficará incoerente (`date` aponta para 07/04 mas `day` diz `"Segunda"`). A spec **não** inclui migração de dados — isso seria outro trabalho.

---

## Regras de Negócio (consistência de datas)

1. **Uma string ISO `"YYYY-MM-DD"` representa um dia no fuso local do usuário**, não UTC. Toda conversão para `Date` deve criar o objeto em meia-noite local, não UTC meia-noite.

2. **Nenhuma função do projeto deve usar `toISOString().split('T')[0]`** para gerar uma data "hoje". Sempre usar o novo helper `toLocalISO(date)`.

3. **Nenhuma função deve criar `new Date("YYYY-MM-DD")` diretamente** quando o objetivo é representar aquele dia no fuso local. Sempre passar pelo `parseDate` corrigido.

4. **A função que decide "que dia da semana é essa data"** (`dateToDayLabel`) é o ponto onde o casamento com `schedules[].day` acontece. Ela precisa ser 100% confiável porque `rankCandidates` e `isBusy` dependem dela para oferecer o substituto certo.

5. **Testes manuais obrigatórios pós-correção:**
   - Trocar o fuso do navegador para UTC (via DevTools → Sensors → Location) e validar que o sistema continua funcionando
   - Trocar para fuso asiático (UTC+9, adiantado) e validar
   - Navegar por várias semanas em CalendarPage e confirmar que os rótulos batem
   - Criar uma falta numa segunda e confirmar que o slot salvo tem `date` segunda e `day === "Segunda"`
   - Atribuir um substituto a essa falta e confirmar que os candidatos ranqueados têm aula em segunda-feira

---

## Fora do Escopo (v1)

- **Migração de dados existentes:** ausências criadas antes da correção podem estar com `date` e `day` inconsistentes. Um script de migração seria outro esforço — esta spec só corrige o código daqui pra frente.
- **Troca da API `Date` por biblioteca (date-fns, dayjs, luxon):** o projeto hoje usa a API nativa e o bug pode ser corrigido sem adicionar dependências. Migrar para uma biblioteca de datas é uma modernização separada.
- **Suporte a fuso internacional do servidor:** o sistema assume que todos os usuários estão no mesmo fuso (Brasil). Multi-fuso é um projeto inteiro à parte.
- **Testes automatizados:** o projeto não tem test runner configurado. Validação é manual, conforme o checklist da seção "Regras de Negócio" acima.
- **Auditoria completa de TODOS os usos de `new Date()` no projeto:** a correção foca nos pontos conhecidos identificados na investigação. Se aparecerem novos usos durante a execução, eles entram no escopo caso a caso.

---

## Resumo da Correção Mínima

**Dois arquivos principais:**

1. **`src/lib/helpers.js`** — adicionar `toLocalISO(d)`, corrigir `parseDate(s)` para interpretar ISO como local, auditar `formatISO` para usar componentes locais.

2. **`src/pages/CalendarPage.jsx`** — substituir `toISOString().split('T')[0]` por `toLocalISO(...)` em `getWeekDates` e `todayISO`.

**Efeito cascata (zero mudança de código, só herdam a correção):**
- `dateToDayLabel`, `weekStart`, `businessDaysBetween` — ficam corretos automaticamente
- `rankCandidates`, `isBusy`, `monthlyLoad` — passam a oferecer o substituto certo
- `CalendarDayPage`, `AbsencesPage`, `SubstitutionsPage` (todas as abas) — os rótulos e filtros ficam corretos

**Busca adicional a fazer durante a execução:** `grep -r "toISOString().split" src/` para achar outros usos do antipattern e corrigir.
