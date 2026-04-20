# Plano Técnico — #84 ScheduleGrid `substitutionMap`

### Análise do Codebase

- `src/pages/SettingsPage.jsx:1558` — `export function ScheduleGrid({ teacher, store, readOnly = false })`. Ponto único de edição.
- `src/pages/SettingsPage.jsx:1576` — `aulas` já é filtrado com `.filter(p => !p.isIntervalo)`, então o loop nunca inclui intervalos.
- `src/pages/SettingsPage.jsx:1605` — `const slot = ${seg.id}|${turno}|${p.aulaIdx}` é a string `timeSlot` usada como chave.
- `src/pages/SettingsPage.jsx:1625` — wrapper `<div className="space-y-1">` que contém os cards de schedule e os indicadores. O destaque entra aqui, entre o fim do `mine.map` (~L1649) e o comentário de indicadores (L1651).
- `references/design-system.md` — `text-ok` (`#16A34A`) já definido no Tailwind.
- Consumidores atuais (não alterar):
  - `SettingsPage.jsx:1542` (TabProfile) • `:1553` (ScheduleGridModal)
  - `SchedulePage.jsx:51` • `PendingPage.jsx:239` • `AbsencesPage.jsx:16` (só import)

### Cenários

**Sem a prop:** `substitutionMap === undefined` → optional chaining curto-circuita → zero diferença. Todos os consumidores atuais caem aqui.

**Com a prop preenchida:** consumidor passa `{ "seg-fund|manha|1": "Ana" }` → a célula desse slot em todos os dias exibe `✓ Ana` em `text-[10px] font-bold text-ok truncate` abaixo dos cards e acima dos indicadores.

**Casos de borda:**
- `{}` ou `null` → nada renderizado (optional chaining).
- Valor `""` → operador `&&` curto-circuita.
- Célula de intervalo → impossível, já filtrada em L1576.
- Mesmo slot em múltiplos dias → destaque aparece em todos (correto para o caso de uso).

**Erros:** nenhum — lookup em objeto plano.

### Schema de Banco de Dados
N/A.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**`src/pages/SettingsPage.jsx`** — duas edições na função `ScheduleGrid`:

1. **Linha 1558** — adicionar `substitutionMap` ao destructuring:
   ```jsx
   export function ScheduleGrid({ teacher, store, readOnly = false, substitutionMap }) {
   ```

2. **Entre linhas 1649 e 1651** — inserir dentro do `<div className="space-y-1">`, após o fechamento do `mine.map(...)` e antes do comentário `{/* Indicadores de bloqueio ... */}`:
   ```jsx
                               })}

                               {substitutionMap?.[slot] && (
                                 <div className="text-[10px] font-bold text-ok truncate">
                                   ✓ {substitutionMap[slot]}
                                 </div>
                               )}

                               {/* Indicadores de bloqueio — sem dados de terceiros */}
   ```

Nota: a variável é `slot` (não `slot.timeSlot`) — já é a string completa `seg.id|turno|aulaIdx`.

### Arquivos que NÃO devem ser tocados

- Consumidores atuais: `SettingsPage.jsx:1542`, `:1553` (ScheduleGridModal), `SchedulePage.jsx:51`, `PendingPage.jsx:239`, `AbsencesPage.jsx:16`.
- `SubstitutionsPage.jsx` — consumirá a nova prop em issue posterior.

### Dependências Externas
Nenhuma.

### Ordem de Implementação

1. Editar assinatura em `SettingsPage.jsx:1558` (adicionar `substitutionMap`).
2. Inserir o bloco condicional no `<div className="space-y-1">` (entre L1649 e L1651).
3. `npm run build` — verificar zero erros.
4. Smoke test visual: `/schedule`, `/settings` (TabProfile), `/pending` — grades devem estar idênticas.
