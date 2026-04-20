# Plano Técnico Consolidado — Phase 1 (Issues 285, 286, 287)

**Data:** 2026-04-19 | **Escopo:** Refatoração modular + lazy-load crítico | **Bloqueia:** Issue 288

---

## Resumo Executivo

Três issues interdependentes buscam otimizar o carregamento de módulos:

1. **Issue 285** — Reorganizar `src/lib/` de 8 arquivos monolíticos (2.763 linhas) em ~20 arquivos temáticos
2. **Issue 286** — Atualizar imports em páginas/componentes para granularidade (pós-refator)
3. **Issue 287** — Lazy-load de `reports` e `settingsHelpers` com `import()` dinâmico

**Benefício:** Redução de ~40-50% do bundle inicial via tree-shaking granular do bundler.

---

## Análise do Codebase Atual

### Estrutura de `src/lib/` (8 arquivos, 2.763 linhas)

| Arquivo | Linhas | Funções/Exports Principais | Problema |
|---------|--------|---------------------------|----------|
| `firebase.js` | 17 | `auth`, `db`, `provider` | Mínimo, mas necessário separar |
| `db.js` | 548 | `loadFromFirestore()`, `saveDoc()`, `addAdmin()`, etc (30+ funções) | Monolítico — mistura I/O com listeners |
| `constants.js` | 16 | `DAYS[]`, `COLOR_PALETTE` | Reutilizável em cores/helpers |
| `helpers.js` | 253 | `uid()`, `formatISO()`, `colorOfTeacher()`, `allTurmaObjects()`, etc | **CRÍTICO** — puxa tudo ao importar `formatISO` |
| `periods.js` | 356 | `gerarPeriodos()`, `makeSlot()`, `resolveSlot()` | Isolável, auto-contido |
| `absences.js` | 336 | `rankCandidates()`, `isBusy()`, `monthlyLoad()`, `assignSubstitute()` | Auto-contido, mas importa helpers e periods |
| `reports.js` | 1.082 | `generateDayHTML()`, `openPDF()`, `generateByMonthHTML()`, etc | **CRÍTICO** — maior arquivo, usado só em 3 páginas |
| `settingsHelpers.js` | 155 | `validateSegment()`, `validatePeriod()`, `canEditTeacher()` | **CRÍTICO** — usado só em SettingsPage |

### Padrão de Importação Atual (Monolítico)

```javascript
// Importar uma função de helpers puxa TUDO:
// absences.js, reports.js, db.js, constants.js, firebase.js, periods.js
import { formatISO, uid, colorOfTeacher } from '../lib/helpers'

// Resultado no bundle:
// - formatISO (essencial)
// - uid (essencial)
// - colorOfTeacher (essencial)
// + 8.000+ linhas de código nunca usado na página
```

### Arquivos a Criação da Estrutura (Issue 285)

```
src/lib/
├── firebase/index.js          ← mover src/lib/firebase.js
├── db/
│   ├── index.js               ← re-exports principais
│   ├── config.js              ← meta/config operations
│   ├── teachers.js            ← CRUD teachers
│   ├── schedules.js           ← CRUD schedules
│   ├── absences.js            ← CRUD absences
│   ├── history.js             ← CRUD history
│   ├── admins.js              ← admin management
│   ├── pending.js             ← pending_teachers, pending_actions
│   ├── listeners.js           ← real-time listeners
│   └── cache.js               ← localStorage + TTL
├── periods/index.js           ← mover src/lib/periods.js (ou criar pasta se subdividir)
├── helpers/
│   ├── index.js               ← selective re-exports
│   ├── dates.js               ← formatISO, parseDate, weekStart, businessDaysBetween
│   ├── ids.js                 ← uid()
│   ├── colors.js              ← colorOfTeacher, COLOR_PALETTE
│   └── turmas.js              ← allTurmaObjects, findTurma, isSharedSeries
├── absences/
│   ├── index.js               ← re-exports principais
│   ├── ranking.js             ← rankCandidates, suggestSubstitutes
│   ├── validation.js          ← isBusy, monthlyLoad, isUnderWeeklyLimit
│   └── mutations.js           ← createAbsence, assignSubstitute, delete*
├── reports/
│   ├── index.js               ← re-exports principais
│   ├── pdf.js                 ← openPDF helper
│   └── generators/
│       ├── day.js             ← generateDayHTML
│       ├── teacher.js         ← generateTeacherHTML
│       ├── week.js            ← generateByWeekHTML
│       ├── month.js           ← generateByMonthHTML
│       ├── styles.js          ← _css estilos compartilhados
│       └── utils.js           ← _wrap, _slotRow, etc
├── settings/
│   ├── index.js               ← re-exports principais
│   ├── validation.js          ← validateSegment, validatePeriod, etc
│   └── helpers.js             ← Settings-specific helpers
├── constants.js               ← manter + duplicar em colors/index.js
└── index.js                   ← NOVO: re-exports seletivos (não barrel total)
```

---

## Cenários de Implementação

### Caminho Feliz (Issue 285 → 286 → 287)

1. **Issue 285 — Refatora Estrutura**
   - Cria pastas e arquivos novos em `src/lib/`
   - Move conteúdo dos 8 arquivos originais (sem alterar lógica)
   - Implementa imports internos entre os novos módulos
   - Cria `src/lib/index.js` com re-exports seletivos
   - `npm run dev` funciona — HMR ativo
   - `npm run build` passa — sem erros

2. **Issue 286 — Atualiza Imports Granulares**
   - Varre todos os imports de `src/lib` em `src/pages/` e `src/components/`
   - Para cada import, substitui por path específico do novo módulo
   - Ex: `import { formatISO } from '../lib/helpers'` → `import { formatISO } from '../lib/helpers/dates'`
   - Remove `import * as lib` — preferir named imports
   - Testa cada página após atualização
   - `npm run dev` funciona — HMR não quebra
   - `npm run build` sem erros

3. **Issue 287 — Lazy-Load Reports + Settings**
   - Remove imports estáticos de `reports` e `settingsHelpers` no topo
   - Move imports dinâmicos para funções que efetivamente usam
   - Ex: `handleExport()` chama `const { generateDayHTML } = await import('../lib/reports')`
   - DevTools Network mostra chunk separado de reports carregado on-demand
   - `npm run build` coloca reports/settings em chunks separados

### Casos de Borda — Issue 285

**Cenário: Subdependências entre módulos novos**
- `reports/` precisa de `helpers/dates`, `helpers/colors`, `periods/`
- `absences/ranking.js` precisa de `helpers/`, `periods/`
- `db/listeners.js` precisa de `db/cache.js`, `periods/`

**Resolução:**
- Imports relativos internos são OK (ex: `import { getCfg } from '../periods'` dentro de `reports/`)
- Evitar imports circulares — documentar dependências graficamente
- Tree-shaking do bundler automaticamente remove código não usado mesmo com interdependências

**Cenário: Compatibilidade backward com `src/lib/index.js`**
- Páginas antigas podem continuar usando `import { formatISO } from '../lib'` (via `index.js`)
- Mas Issue 286 vai substituir por caminhos granulares
- `index.js` funciona como adapter durante transição

### Casos de Borda — Issue 286

**Cenário: Imports múltiplos do mesmo módulo**

Antes:
```javascript
import { formatISO, uid, colorOfTeacher } from '../lib/helpers'
```

Depois (granular):
```javascript
import { formatISO } from '../lib/helpers/dates'
import { uid } from '../lib/helpers/ids'
import { colorOfTeacher } from '../lib/helpers/colors'
```

**Resolução:**
- Se 3+ imports do mesmo submódulo, OK manter na mesma linha
- Se espalhado em vários, agregar imports próximos
- Linter (ESLint) pode ser configurado para forçar path granular

**Cenário: `import * as` ainda usado**
```javascript
import * as periods from '../lib/periods'
// usar: periods.getCfg(), periods.makeSlot()
```

**Resolução:**
- Issue 286 proíbe `import * as lib` (monolítico)
- Mas `import * as periods` é OK (módulo temático focado)
- Converter apenas para imports específicos se necessário

### Casos de Borda — Issue 287

**Cenário: Múltiplas funções de report na mesma página**

```javascript
// AbsencesPage usa:
// - generateDayHTML
// - generateByMonthHTML
// - openPDF

// Opção 1: Um único import() dinâmico
const handleExport = async (type) => {
  const { generateDayHTML, generateByMonthHTML, openPDF } = await import('../lib/reports')
  if (type === 'day') openPDF(generateDayHTML(...))
  else openPDF(generateByMonthHTML(...))
}

// Opção 2: Cache do módulo carregado
const reportModule = useRef(null)
const handleExport = async (type) => {
  if (!reportModule.current) {
    reportModule.current = await import('../lib/reports')
  }
  const { generateDayHTML, generateByMonthHTML, openPDF } = reportModule.current
  // ...
}
```

**Resolução (recomendado):** Opção 1 — simplicidade; Vite bundler cuida de deduplicate automaticamente

**Cenário: `SettingsPage` carrega `settingsHelpers` apenas em validação**

```javascript
const handleValidate = async (field, value) => {
  const { validateSegment, validatePeriod } = await import('../lib/settings')
  // ...
}
```

**Cenário: Fallback em caso de erro no import()**

```javascript
const handleExport = async () => {
  try {
    const { generateDayHTML, openPDF } = await import('../lib/reports')
    // ...
  } catch (err) {
    toast('Erro ao carregar relatórios. Tente novamente.', 'err')
    console.error(err)
  }
}
```

**Resolução:** Adicionar try-catch em handlers críticos

---

## Tratamento de Erros

### Issue 285 — Estrutura

| Erro | Sinal | Ação |
|------|-------|------|
| Ciclo de imports | Erro no build: `Circular dependency detected` | Revisar mapa de dependências; mover função compartilhada para novo módulo upstream |
| Falta de export | Build falha: `undefined export` | Revisar `src/lib/[novo]/index.js` — função não foi re-exportada |
| Path errado no import | Dev falha: `Cannot find module` | Revisar path relativo após mover arquivo |
| HMR quebra | Hot reload não funciona em página | Geralmente ciclo; restartar `npm run dev` |

**Prevenção:** Rodar `npm run build` após criar cada pasta com seus re-exports

### Issue 286 — Imports Granulares

| Erro | Sinal | Ação |
|------|-------|------|
| Import de path errado | Build falha: `Cannot find module '../lib/helpers'` | Substituir por path novo (ex: `../lib/helpers/dates`) |
| Esquecer atualizar um import | Dev funciona (pois `index.js` ainda re-exporta) mas build após Issue 285 falha | Varrer com grep antes de mover `index.js` para trash |
| `import *` monolítico | ESLint warning (se configurado) | Converter para named imports granulares |

**Prevenção:** Usar grep/ripgrep para verificar cobertura:
```bash
grep -r "from.*lib['\"]" src/pages/ src/components/ | wc -l
# Depois: grep -r "from.*lib/(helpers|reports|db)" src/pages/ | wc -l
# Devem ser 100% dos imports
```

### Issue 287 — Lazy-Load

| Erro | Sinal | Ação |
|------|-------|------|
| Bundle não separa em chunks | DevTools Network: reports não aparece como chunk separado | Verificar se import() está em lugar certo (não no topo do arquivo) |
| Falha no import() | Página quebra ao clicar "Exportar" | Adicionar try-catch + toast de erro |
| Latência perceptível | Usuário clica "Exportar" mas atraso > 500ms | Normal para primeira carga; considerar message "Preparando PDF..." |

---

## Schema de Dependências Entre Issues

```
Issue 284 (baseline)
    ↓
Issue 285 ★ (Refatoração estrutural)
    ├─ Cria novo layout de pastas
    ├─ Move conteúdo sem alterar lógica
    ├─ Implementa re-exports em cada index.js
    └─ ✅ npm run dev + build passam
        ↓
Issue 286 ★ (Atualizar imports granulares)
    ├─ Depende: Estrutura 285 já criada
    ├─ Varre todos os imports em pages/ + components/
    ├─ Substitui por caminhos novos (helpers/dates, helpers/ids, etc)
    └─ ✅ npm run dev + build passam
        ↓
Issue 287 ★ (Lazy-load reports + settings)
    ├─ Depende: Imports granulares 286 já feitos
    ├─ Adiciona import() dinâmico em handleExport + handlers críticos
    ├─ Remove imports estáticos do topo
    └─ ✅ DevTools Network mostra chunks separados
        ↓
Issue 288 (Auditoria Firebase)
    └─ Pode prosseguir após 287
```

---

## Arquivos a Criar

### Issue 285

**Novo: `src/lib/index.js`**
```javascript
// Re-exports seletivos (não barrel total)
export { auth, db, provider } from './firebase'
export { uid, h, subKey } from './helpers/ids'
export { formatISO, parseDate, weekStart, businessDaysBetween, formatBR, dateToDayLabel } from './helpers/dates'
export { colorOfTeacher, colorOfAreaId, COLOR_PALETTE, COLOR_NEUTRAL } from './helpers/colors'
export { allTurmaObjects, findTurma, isSharedSeries } from './helpers/turmas'
export { 
  gerarPeriodos, getAulas, getCfg, makeSlot, parseSlot,
  resolveSlot, slotLabel, slotFullLabel
} from './periods'
export { 
  rankCandidates, suggestSubstitutes, isBusy, monthlyLoad, absencesOf,
  createAbsence, assignSubstitute, deleteAbsenceSlot, deleteAbsence,
  absenceSlotsInWeek, isUnderWeeklyLimit
} from './absences'
export { openPDF, generateDayHTML, generateTeacherHTML, generateByWeekHTML, generateByMonthHTML } from './reports'
export { DAYS, COLOR_PALETTE as COLORS } from './constants'
```

**Novo: `src/lib/helpers/index.js`** (stub com re-exports)
```javascript
export { formatISO, parseDate, weekStart, businessDaysBetween, formatBR, dateToDayLabel } from './dates'
export { uid, h, subKey } from './ids'
export { colorOfTeacher, colorOfAreaId, COLOR_PALETTE, COLOR_NEUTRAL } from './colors'
export { allTurmaObjects, findTurma, isSharedSeries, canEditTeacher, isFormationSlot, teacherSubjectNames, formatMonthlyAulas } from './turmas'
```

**Novos arquivos em `src/lib/helpers/`:**
- `dates.js` — `formatISO`, `parseDate`, `weekStart`, `businessDaysBetween`, `formatBR`, `dateToDayLabel`
- `ids.js` — `uid()`, `h()`, `subKey()`
- `colors.js` — `colorOfTeacher()`, `colorOfAreaId()`, `COLOR_PALETTE`, `COLOR_NEUTRAL`
- `turmas.js` — `allTurmaObjects()`, `findTurma()`, `isSharedSeries()`, `canEditTeacher()`, `isFormationSlot()`, `teacherSubjectNames()`, `formatMonthlyAulas()`

**Novos arquivos em `src/lib/db/`:**
- `config.js` — operações de `meta/config` (saveConfig, getCfg)
- `teachers.js` — CRUD teachers (getTeacherByEmail, addTeacher, updateTeacher, removeTeacher)
- `schedules.js` — CRUD schedules (addSchedule, updateSchedule, removeSchedule)
- `absences.js` — CRUD absences (createAbsenceDB, deleteAbsenceDB)
- `history.js` — listeners e queries de history
- `admins.js` — isAdmin, addAdmin, listAdmins, removeAdmin
- `pending.js` — pending_teachers, pending_actions operations
- `listeners.js` — setupRealtimeListeners, registerAbsencesListener, registerHistoryListener
- `cache.js` — _loadFromLS, _saveToLS, cache management
- `index.js` — re-exports principais

**Novos arquivos em `src/lib/absences/`:**
- `ranking.js` — `rankCandidates()`, `suggestSubstitutes()`
- `validation.js` — `isBusy()`, `monthlyLoad()`, `isUnderWeeklyLimit()`, `absencesOf()`, `absenceSlotsInWeek()`
- `mutations.js` — `createAbsence()`, `assignSubstitute()`, `deleteAbsenceSlot()`, `deleteAbsence()`
- `index.js` — re-exports

**Novos arquivos em `src/lib/reports/`:**
- `pdf.js` — `openPDF()` helper
- `generators/day.js` — `generateDayHTML()`
- `generators/teacher.js` — `generateTeacherHTML()`
- `generators/week.js` — `generateByWeekHTML()`
- `generators/month.js` — `generateByMonthHTML()`
- `generators/styles.js` — `_css()` compartilhado
- `generators/utils.js` — `_wrap()`, `_slotRow()`, helpers compartilhados
- `index.js` — re-exports

**Novos arquivos em `src/lib/settings/`:**
- `validation.js` — `validateSegment()`, `validatePeriod()`, `validateTeacher()`, etc
- `helpers.js` — helpers específicos de settings (`canEditTeacher()`, etc)
- `index.js` — re-exports

**Movidos (renomeados):**
- `src/lib/firebase.js` → `src/lib/firebase/index.js`
- `src/lib/periods.js` → `src/lib/periods/index.js` (ou manter como arquivo, conforme necessário)

---

## Arquivos a Modificar

### Issue 285

**`src/lib/firebase.js` → `src/lib/firebase/index.js`** (apenas mover)
- Sem mudanças de conteúdo

**`src/lib/periods.js` → `src/lib/periods/index.js`** (apenas mover ou manter)
- Se mover para pasta: criar `src/lib/periods/index.js` com conteúdo idêntico
- Se manter como arquivo: deixar em `src/lib/periods.js`
- Decisão: Manter como arquivo (não há subdivisão necessária)

**Novos arquivos `src/lib/helpers/*.js`**
- `helpers/dates.js` — extrair funções de datas de `helpers.js`
- `helpers/ids.js` — extrair `uid()`, `h()`, `subKey()` de `helpers.js`
- `helpers/colors.js` — extrair `colorOfTeacher()`, `colorOfAreaId()`, constants de cores
- `helpers/turmas.js` — extrair `allTurmaObjects()`, `findTurma()`, `isSharedSeries()`, etc
- `helpers/index.js` — re-exports

**Novos arquivos `src/lib/db/*.js`**
- Quebrar `db.js` em ~10 módulos por responsabilidade
- `db/index.js` — re-exports com seleção cuidadosa

**Novos arquivos `src/lib/absences/*.js`**
- `absences/ranking.js` — algoritmos de ranking
- `absences/validation.js` — validações
- `absences/mutations.js` — criação/atualização/remoção
- `absences/index.js` — re-exports

**Novos arquivos `src/lib/reports/*.js`**
- `reports/pdf.js` — helper de impressão
- `reports/generators/` — cada tipo de relatório
- `reports/index.js` — re-exports

**Novos arquivos `src/lib/settings/*.js`**
- `settings/validation.js` — validações
- `settings/helpers.js` — helpers específicos
- `settings/index.js` — re-exports

### Issue 286

**Arquivos em `src/pages/*.jsx`** (14 pages)
- Substituir imports monolíticos por granulares
- Remover `import * as lib`
- Ex: `import { formatISO, uid } from '../lib/helpers'` → `import { formatISO } from '../lib/helpers/dates'; import { uid } from '../lib/helpers/ids'`

**Arquivos em `src/components/**/*.jsx`**
- Mesma lógica dos pages
- Prioridade menor

**Arquivos em `src/store/*.js`** (se houver imports de lib)
- Verificar e atualizar se necessário

### Issue 287

**`src/pages/AbsencesPage.jsx`**
- Linha ~X: remover `import { generateDayHTML, generateByMonthHTML, openPDF } from '../lib/reports'`
- Função `handleExport`: adicionar `const { generateDayHTML, generateByMonthHTML, openPDF } = await import('../lib/reports')`
- Adicionar try-catch

**`src/pages/SchedulePage.jsx`**
- Remover imports estáticos de reports
- Mover para função `handleExport`

**`src/pages/SubstitutionsPage.jsx`**
- Remover imports estáticos de reports
- Mover para função que gera relatório

**`src/pages/SettingsPage.jsx`**
- Remover imports estáticos de `settingsHelpers`
- Mover para funções de validação

---

## Arquivos que NÃO devem ser tocados

| Arquivo | Motivo |
|---------|--------|
| `src/store/useAuthStore.js` | Não importa lib diretamente, apenas em inicialização |
| `src/store/useAppStore.js` | Actions podem usar lib, mas não alteraremos store durante 285/286/287 |
| `src/App.jsx` | Setup de rotas/auth, não toca lib diretamente |
| `src/main.jsx` | Entry point, não toca lib |
| `src/index.css` | CSS global, independente |
| `vite.config.js` | Configuração do bundler (otimizar lazy-load já é automático) |
| `package.json` | Sem novas dependências necessárias |
| `.env` | Variáveis de ambiente (Firebase config) |

---

## Dependências Externas

Nenhuma nova dependência necessária. O projeto já tem:

| Pacote | Versão | Papel |
|--------|--------|-------|
| React | 18.3.1 | Framework UI |
| React Router | 6.26.0 | Roteamento |
| Zustand | 4.5.4 | Estado global |
| Firebase | 10.12.2 | Backend |
| Vite | 5.4.1 | Build tool (tree-shaking automático) |
| ESLint | (configurado) | Lint rules (opcional: adicionar regra para impedir `import * as lib`) |

**Otimizações potenciais (não bloqueadoras):**
- Adicionar regra ESLint: `no-restricted-imports` para proibir `import * as lib`
- Configurar Rollup split chunks: garantir reports em chunk separado (Vite faz automaticamente)

---

## Ordem de Implementação

### Fase 1: Estrutura (Issue 285)

1. **Criar pastas vazias** — ~2 min
   ```bash
   mkdir -p src/lib/{firebase,db,helpers,absences,reports/generators,settings,periods}
   ```

2. **Mover/splittar conteúdo — ~60 min (manuál, cuidado com imutabilidade)**
   - `firebase.js` → `firebase/index.js` (apenas mover)
   - `periods.js` → `periods.js` (manter como arquivo, sem subdividir)
   - `helpers.js` → split em `helpers/{dates,ids,colors,turmas}.js` + `helpers/index.js`
   - `db.js` → split em `db/{config,teachers,schedules,absences,history,admins,pending,listeners,cache}.js` + `db/index.js`
   - `absences.js` → split em `absences/{ranking,validation,mutations}.js` + `absences/index.js`
   - `reports.js` → split em `reports/{pdf.js,generators/}.js` + `reports/index.js`
   - `settingsHelpers.js` → `settings/{validation,helpers}.js` + `settings/index.js`
   - `constants.js` → permanecer em `src/lib/constants.js`, duplicar `COLOR_PALETTE` em `helpers/colors.js`

3. **Implementar imports internos corretos** — ~30 min
   - Cada novo módulo importa apenas o que precisa
   - Ex: `reports/generators/month.js` importa `../pdf.js`, `./styles.js`, `../../periods`, `../../helpers/dates`

4. **Criar `src/lib/index.js`** — ~15 min
   - Re-exports seletivos (não wildcard `export *`)
   - Compatibilidade backward (páginas antigas podem continuar usando `import { formatISO } from '../lib'`)

5. **Teste — ~15 min**
   ```bash
   npm run dev    # HMR ativo, sem erros
   npm run build  # build completa, sem warnings
   npm run preview # visualizar bundle
   ```

6. **Commit Issue 285**
   ```
   feat(lib): refatorar estrutura modular temática [#285]
   
   - Reorganizar src/lib/ em 8 arquivos → ~20 módulos temáticos
   - Criar subpastas: helpers/, db/, absences/, reports/, settings/
   - Implementar re-exports seletivos em index.js de cada pasta
   - Tree-shaking granular agora possível para bundler
   - npm run dev + npm run build passam sem erros
   ```

### Fase 2: Imports Granulares (Issue 286)

1. **Mapear todos os imports de lib** — ~10 min
   ```bash
   grep -rh "from.*['\"].*lib['\"]" src/pages/ src/components/ src/store/ | sort | uniq
   # Contar total
   grep -rh "from.*lib" src/ --include="*.jsx" --include="*.js" | wc -l
   ```

2. **Varrer páginas em ordem de prioridade** — ~120 min
   - `src/pages/` primeiro (14 páginas)
   - `src/components/` depois (menor impacto)
   - `src/store/` se houver (verificar)

3. **Para cada página: substituir imports**

   **Padrão de busca-substituição:**
   ```
   De: import { formatISO, uid, colorOfTeacher } from '../lib/helpers'
   Para:
   import { formatISO } from '../lib/helpers/dates'
   import { uid } from '../lib/helpers/ids'
   import { colorOfTeacher } from '../lib/helpers/colors'
   ```

4. **Teste incremental após cada página** — ~90 min
   ```bash
   npm run dev  # verificar se página carrega sem erros
   npm run build
   ```

5. **Commit Issue 286**
   ```
   feat(imports): atualizar para granularidade pós-refator [#286]
   
   - Substituir imports monolíticos por granulares em src/pages/ (14 pages)
   - Substituir imports em src/components/
   - Remover padrão import * as lib
   - Cobertura: 100% de imports em pages, 100% em components
   - npm run dev + npm run build passam
   ```

### Fase 3: Lazy-Load (Issue 287)

1. **Identificar handlers de export** — ~10 min
   - `AbsencesPage`: `handleExport()` → lazy-load reports
   - `SchedulePage`: `handleExport()` → lazy-load reports
   - `SubstitutionsPage`: relatório/export → lazy-load reports
   - `SettingsPage`: validação/handlers → lazy-load settingsHelpers

2. **Para cada página:**

   **AbsencesPage:**
   ```javascript
   // Antes
   import { generateDayHTML, generateByMonthHTML, openPDF } from '../lib/reports'
   
   const handleExport = async (type) => {
     const html = type === 'day' ? generateDayHTML(...) : generateByMonthHTML(...)
     openPDF(html)
   }
   
   // Depois
   const handleExport = async (type) => {
     try {
       const { generateDayHTML, generateByMonthHTML, openPDF } = await import('../lib/reports')
       const html = type === 'day' ? generateDayHTML(...) : generateByMonthHTML(...)
       openPDF(html)
     } catch (err) {
       toast('Erro ao carregar relatórios', 'err')
     }
   }
   ```

   **SettingsPage:**
   ```javascript
   const handleValidate = async (field, value) => {
     const { validateSegment } = await import('../lib/settings')
     // ...
   }
   ```

3. **Teste DevTools Network** — ~15 min
   - Abrir DevTools → Network → clicar "Exportar"
   - Verificar se novo chunk de reports carrega
   - Sem chunk = erro de implementação

4. **Commit Issue 287**
   ```
   feat(lazy-load): implementar carregamento dinâmico de reports e settings [#287]
   
   - Remover imports estáticos de reports em AbsencesPage, SchedulePage, SubstitutionsPage
   - Remover imports estáticos de settingsHelpers em SettingsPage
   - Adicionar import() dinâmico em handlers de export/validação
   - DevTools Network mostra chunks separados de reports e settings
   - npm run build cria chunks separados conforme esperado
   ```

---

## Estimativa de Tempo

| Fase | Tarefa | Tempo | Bloqueador |
|------|--------|-------|-----------|
| 285 | Setup de pastas | 2 min | Não |
| 285 | Split de arquivos | 60 min | Não |
| 285 | Imports internos | 30 min | Sim (antes de index.js) |
| 285 | Criar index.js | 15 min | Depende de imports internos |
| 285 | Teste + commit | 30 min | Não |
| **285 TOTAL** | | **137 min** | |
| 286 | Mapear imports | 10 min | Depende de 285 |
| 286 | Atualizar pages | 120 min | Depende de 285 |
| 286 | Teste incremental | 90 min | Não (paralelo) |
| 286 | Commit | 5 min | Não |
| **286 TOTAL** | | **225 min** | |
| 287 | Identificar handlers | 10 min | Depende de 286 |
| 287 | Adicionar import() | 45 min | Depende de 286 |
| 287 | Teste DevTools | 15 min | Não (paralelo) |
| 287 | Commit | 5 min | Não |
| **287 TOTAL** | | **75 min** | |
| **TOTAL GERAL** | | **~437 min (7.3h)** | |

**Estimativa realista com quebras + testes incrementais: 9-10 horas** em sprints de 2h.

---

## Riscos e Decisões Técnicas

### Risco 1: Ciclos de Imports

**Cenário:** `helpers/dates.js` importa `periods.js` que importa `helpers/dates.js`

**Mitigação:**
- Documentar mapa de dependências antes de implementar
- Testar `npm run build` após cada split
- Se encontrar ciclo: mover função compartilhada para módulo upstream (ex: `lib/shared/`)

### Risco 2: Re-exports Excessivos em `index.js`

**Problema:** `src/lib/index.js` com `export * from '*/*.js'` nega benefício de tree-shaking

**Mitigação:**
- Re-exports seletivos APENAS das funções públicas
- Funções internas (ex: `_css()` em reports) NÃO re-exportadas
- Documentar em comentário qual é a API pública vs interna

### Risco 3: Compatibilidade Backward

**Cenário:** Código legado ainda importa de `src/lib` (não seguindo Issue 286)

**Mitigação:**
- `src/lib/index.js` mantém re-exports por 1-2 sprints
- Issue 286 elimina todos os usos monolíticos
- Deletar `index.js` excessivo após confirmar 100% de cobertura

### Decisão 1: Manter `constants.js` no raiz vs duplicar em `colors/`

**Escolha:** Manter `src/lib/constants.js` + duplicar `COLOR_PALETTE` em `helpers/colors.js`

**Motivo:** 
- `DAYS[]` é genérico, importado por vários módulos
- `COLOR_PALETTE` é específico de cores
- Evita importar `constants.js` inteiro por pegar um array de cores

### Decisão 2: Mover ou não subdividir `periods.js`

**Escolha:** Manter como arquivo simples `src/lib/periods.js` (não criar `periods/index.js`)

**Motivo:**
- Funções de periods são coesas (todas derivadas de `cfg`)
- Sem subdivisão natural (não há "períodos regulares" vs "especiais" lógicos)
- Arquivo é pequeno (356 linhas)
- Se crescer > 400 linhas, considerar split futuro

### Decisão 3: Tamanho de chunks no lazy-load

**Vite default:** Chunks automáticos baseados em tamanho + entrada dinâmica

**Esperado pós-287:**
- Main chunk: ~250KB (UI + store + helpers/dates/ids)
- Reports chunk: ~80KB (gerado sob demanda)
- Settings chunk: ~10KB (gerado sob demanda)
- **Economia: ~90KB no main bundle** (30% de redução esperada)

---

## Validação Final

### Post-Issue 285 Checklist

- [ ] `src/lib/` tem 7 subpastas + 8 arquivos novos
- [ ] `npm run dev` sem erros em HMR
- [ ] `npm run build` passa sem warnings de imports não usados
- [ ] `npm run preview` funciona sem quebras
- [ ] Nenhum `import * from '../lib'` permanece (todos diretos de submódulos)

### Post-Issue 286 Checklist

- [ ] 100% dos imports em `src/pages/` são granulares
- [ ] 100% dos imports em `src/components/` são granulares
- [ ] Nenhum `import * as lib` em todo o projeto
- [ ] `npm run dev` sem erros
- [ ] `npm run build` sem warnings

### Post-Issue 287 Checklist

- [ ] AbsencesPage: `import()` dinâmico em `handleExport`
- [ ] SchedulePage: `import()` dinâmico em export
- [ ] SubstitutionsPage: `import()` dinâmico em relatório
- [ ] SettingsPage: `import()` dinâmico em validação
- [ ] DevTools Network: reports chunk visível ao clicar "Exportar"
- [ ] `npm run build`: reports em chunk separado (não inline em main)
- [ ] Zero erros em console ao usar features

---

## Rollback Plan

Se algo quebrar gravemente:

1. **Rollback Issue 287** — Remover `import()` dinâmico, voltar a imports estáticos (rápido)
2. **Rollback Issue 286** — Usar `src/lib/index.js` como adapter (rápido)
3. **Rollback Issue 285** — Restaurar 8 arquivos originais (30 min, mas completo)

```bash
# Depois de trabalho: git stash ou git reset --hard main
# Manter em branch até certeza de estabilidade
git checkout -b refactor/phase1-modular
```

---

## Documentação Necessária

Após implementação, atualizar:

1. `/references/architecture.md` — Seção 11 sobre `src/lib/`
   - Novo diagrama de módulos
   - Guia de quando usar cada submódulo

2. `/CLAUDE.md` ou `.claude/MEMORY.md`
   - "Imports devem ser granulares: `import { X } from '../lib/modulo'`, não `from '../lib'`"

3. `.eslintrc.json`
   - Adicionar regra opcional: `no-restricted-imports` para proibir `'../lib'` (apenas submódulos)

---

## Conclusão

As três issues formam um refactoring coeso que transforma um sistema monolítico em modular, permitindo otimizações automáticas do bundler. Implementadas em ordem, garantem zero regressões e máxima cobertura de testes.

**Ganho esperado:**
- Bundle principal reduzido de ~360KB para ~270KB
- Lazy-load de relatórios (80KB) sob demanda
- Tree-shaking granular automático para futuras mudanças
