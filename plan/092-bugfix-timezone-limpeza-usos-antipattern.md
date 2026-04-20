# Plano Técnico — #92 Limpeza dos 6 usos do antipattern

**Depende da #91 aplicada.**

## Análise do Codebase

**Grep `toISOString().split` em `src/`:**
| # | Arquivo | Linha | Import `formatISO`? |
|---|---|---|---|
| 1 | `src/pages/CalendarPage.jsx` | 22 (dentro de `getWeekDates`) | **Não** — adicionar |
| 2 | `src/pages/CalendarPage.jsx` | 408 (`todayISO`) | mesmo import |
| 3 | `src/pages/AbsencesPage.jsx` | 259 (`useState(filterDate)`) | **Sim** (L4) |
| 4 | `src/pages/AbsencesPage.jsx` | 471 (`const today`) | mesmo import |
| 5 | `src/lib/reports.js` | 228 (`friISO`) | verificar |
| 6 | `src/lib/reports.js` | 232 (dentro de `.map`) | mesmo import |

## Cenários

**Feliz:** todos os 6 pontos passam a usar `formatISO` corrigido (da #91). Grade semanal mostra datas corretas à noite em BRT. PDFs exibem datas corretas. Navegação de semana em AbsencesPage funciona.

**Bordas:**
- Arquivo modificado entre #91 e #92 → re-rodar grep antes de substituir.
- `reports.js` pode já importar `formatISO`; no-op se sim.

## Arquivos a Criar
Nenhum.

## Arquivos a Modificar

### `src/pages/CalendarPage.jsx`
- L5: adicionar `formatISO` ao import de `'../lib/helpers'`
- L22: `return d.toISOString().split('T')[0]` → `return formatISO(d)`
- L408: `new Date().toISOString().split('T')[0]` → `formatISO(new Date())`

### `src/pages/AbsencesPage.jsx` (import já existe)
- L259: `useState(new Date().toISOString().split('T')[0])` → `useState(formatISO(new Date()))`
- L471: `const today = new Date().toISOString().split('T')[0]` → `const today = formatISO(new Date())`

### `src/lib/reports.js`
- Verificar/adicionar `formatISO` ao import de `'./helpers'`
- L228: `friDate.toISOString().split('T')[0]` → `formatISO(friDate)`
- L232: `d.toISOString().split('T')[0]` → `formatISO(d)`

## Arquivos que NÃO devem ser tocados
- `src/lib/helpers.js` — corrigido na #91
- `src/lib/absences.js` — herda correção
- Demais páginas — não aparecem no grep

## Dependências Externas
Nenhuma.

## Ordem de Implementação
1. `grep -rn "toISOString().split" src/` — confirmar 6 pontos
2. CalendarPage.jsx — import + L22 + L408
3. AbsencesPage.jsx — L259 + L471
4. reports.js — import (se faltar) + L228 + L232
5. `grep` novamente — zero resultados
6. `npm run build` — zero erros
7. Validação manual em múltiplos fusos + teste de regressão

## Validação Manual Obrigatória
- **BRT noite:** abrir `/calendar` simulando 22h segunda, coluna "Segunda" correta, modal abre com dia certo
- **Fusos:** UTC, Tokyo, New York — sem deslocamento
- **PDFs:** relatório de semana com data final correta
- **Regressão:** todas as páginas em horário normal sem quebrar
