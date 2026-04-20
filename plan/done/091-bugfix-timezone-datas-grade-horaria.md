# Plano Técnico — #91 Núcleo do fix de timezone (helpers.js)

## Escopo reduzido

Esta issue corrige **apenas** `parseDate` e `formatISO` em `src/lib/helpers.js`. Os 6 usos diretos do antipattern `toISOString().split('T')[0]` em outras páginas ficam para a #092.

## Análise do Codebase

**`src/lib/helpers.js` L69-70:**
```js
export const parseDate  = (s) => new Date(s + 'T12:00:00')  // workaround frágil
export const formatISO  = (d) => d.toISOString().split('T')[0]  // raiz do bug
```

**Diagnóstico:** `toISOString()` converte para UTC; em BRT, horários locais ≥ 21h "vazam" para o dia seguinte. `parseDate` atual funciona por acidente com o hack `T12:00:00` — frágil em fusos extremos.

**Cascata:** após corrigir as duas, todas as funções que herdam (`dateToDayLabel`, `weekStart`, `businessDaysBetween`, e em `absences.js`: `rankCandidates`, `isBusy`, `monthlyLoad`) ficam corretas automaticamente.

## Cenários

**Feliz:**
- `parseDate("2026-04-06").getDay() === 1` (segunda) em qualquer fuso
- `formatISO(new Date(2026, 3, 6, 22, 0, 0)) === "2026-04-06"` em BRT noturno
- Modal de falta abre com o dia certo e as aulas certas

**Bordas:**
- String vazia/null → `Invalid Date` (comportamento atual preservado)
- Fusos UTC, UTC+9, UTC−5 → todos corretos (componentes locais)
- `formatISO(Invalid Date)` → retorna `null` (nova guarda explícita)

## Schema de Banco de Dados
N/A. Dados existentes podem ter `slot.date` corrompido — migração fica fora do escopo.

## Arquivos a Criar
Nenhum.

## Arquivos a Modificar

### `src/lib/helpers.js` (L69-70)
```js
export const parseDate = (s) => {
  if (!s || typeof s !== 'string') return new Date(NaN)
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export const formatISO = (d) => {
  if (!d || isNaN(d.getTime())) return null
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```

## Arquivos que NÃO devem ser tocados
- `src/pages/CalendarPage.jsx`, `AbsencesPage.jsx`, `src/lib/reports.js` — responsabilidade da #092
- `src/lib/absences.js`, outras páginas — herdam correção automaticamente

## Dependências Externas
Nenhuma.

## Ordem de Implementação
1. Editar `src/lib/helpers.js` L69-70 (substituir as duas funções)
2. `npm run build` → zero erros
3. Validação manual: abrir `/calendar` em DevTools com timezone `America/Sao_Paulo`, registrar uma falta numa segunda e conferir que os substitutos oferecidos têm aula em segunda
4. Marcar acceptance criteria

## Decisão técnica
- `formatISO(Invalid Date)` passa a retornar `null` em vez de `"NaN-NaN-NaN"`. Nenhum consumidor atual do projeto passa `Invalid Date` intencionalmente, então é uma melhoria segura.
- A #091 isolada pode não eliminar 100% do sintoma visual na CalendarPage (`getWeekDates` tem seu próprio antipattern que será resolvido na #092), mas já corrige o impacto crítico em `rankCandidates` e a lógica de seleção de substitutos.
