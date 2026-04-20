# Spec: Otimização de Bundle Size

**Versão:** 1.0 | **Data:** 2026-04-19 | **Projeto:** GestãoEscolar

## Visão Geral

O bundle principal do GestãoEscolar está acima do ideal para uma SPA educacional:
- **680 KB** (não comprimido)
- **179 KB** (gzip) — target: <140 KB
- **Warning:** chunk >500 KB após minificação em produção

O projeto combina lazy-load de páginas (já implementado em #280) com monolitismo em `src/lib/`, importação ineficiente do Firebase SDK e falta de tree-shaking de CSS. Esta especificação documenta os caminhos de otimização sem perda funcional.

## Stack Tecnológica

- **Frontend:** React 18.3.1, React Router 6.26.0, Zustand 4.5.4
- **Build:** Vite 5.4.1, Tailwind CSS 3.4.10, PostCSS, Autoprefixer
- **Backend:** Firebase 10.12.2 (Auth, Firestore, Hosting)
- **Ambiente:** Node.js, npm

## Objetivos

| Métrica | Baseline | Target | Redução esperada |
|---|---|---|---|
| Bundle principal (KB) | 680 | <500 | -26% |
| Gzip (KB) | 179 | <140 | -22% |
| Warning de chunk | sim | não | — |

**Constraints:**
- Funcionalidade 100% idêntica
- Performance de dev (`npm run dev`) inalterada ou melhorada
- Nenhuma mudança na UX ou fluxo de usuário
- Compatibilidade com plano Spark do Firebase (sem mudar SDK)

## Problemas Identificados

### 1. Monolitismo em `src/lib/`

**Estrutura atual (2.763 linhas de código em 8 arquivos):**

```
src/lib/
├── db.js              (~750 linhas)  — Firestore + LS cache
├── reports.js         (~1.100 linhas) — HTML/PDF para 5 tipos de relatório
├── absences.js        (~500 linhas)  — Ranking, validação, status
├── periods.js         (~450 linhas)  — Serialização de slots
├── helpers.js         (~330 linhas)  — Funções utilitárias gerais
├── firebase.js        (~40 linhas)   — Inicialização do SDK
├── constants.js       (~40 linhas)   — DAYS[], COLOR_PALETTE[]
└── settingsHelpers.js (~180 linhas)  — Helpers específicos de Settings

Total: 2.763 linhas em apenas 8 arquivos
```

**Problema:** Quando um componente importa de `src/lib/helpers`, o bundler carrega **todos os 8 módulos** e suas dependências transitivas, mesmo que use apenas uma função.

**Impacto:** Mesmo `HomePage.jsx` (página de professor) carrega:
- `reports.js` (geração de PDFs — só admin/coordenador usa)
- `db.js` (listeners de Firestore — não usado em HomePage)
- `settingsHelpers.js` (validação de formulários — específico de Settings)

### 2. Firebase SDK Carregando Tudo

**Problema:** `import * from 'firebase'` e `import { initializeApp } from 'firebase/app'` puxam **todos os módulos** disponíveis, incluindo Analytics, Remote Config, Performance Monitoring, etc.

**Atual em `src/lib/firebase.js`:**
```js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
// Apenas 3 de ~15 módulos exportados
```

Após minificação, o bundler está incluindo funções não utilizadas de módulos como:
- `firebase/analytics` (não configurado no projeto)
- `firebase/messaging` (não há push notifications)
- `firebase/storage` (não há upload de arquivos)
- `firebase/remote-config` (não há feature flags dinâmicas)

### 3. Tailwind CSS Sem Tree-Shake de Não-Utilizado

**Problema:** O pipeline PostCSS está gerando CSS para **todas as classes Tailwind** sem análise de dead code. 

**Atual em `tailwind.config.js`:**
```js
content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}']
// Amplo demais — inclui minificações de builds anteriores, comentários, etc.
```

**Verificação necessária:**
- Classes CSS nunca usadas em template
- Utility prefixes Tailwind (`sm:`, `md:`, `lg:`, `dark:`) que nunca são acionados
- Estilos de componentes Tailwind (Form, Typography plugins) não instalados mas presentes

### 4. Código Não Utilizado

**Categorias identificadas:**

| Categoria | Exemplos | Ação |
|---|---|---|
| Funções órfãs em `helpers.js` | `colorOfTeacher()` — importada 0×; `allTurmaObjects()` — nunca chamada | Remover se não há plano de usar |
| Componentes sem rota | Componentes em `src/components/ui/` não importados em nenhuma página | Listar e remover ou documentar |
| Listeners mortos | listeners desreferenciados após refatoração | Auditar em `useAuthStore.js` |
| Constantes não referenciadas | `HARDCODED_ADMINS` em `db.js` — há coleção `admins/` | Considerar remover uma fonte |

### 5. Dependencies Desnecessárias em package.json

**Atual:**
```json
{
  "firebase": "^10.12.2",        // OK — usado
  "react": "^18.3.1",            // OK — core
  "react-dom": "^18.3.1",        // OK — core
  "react-router-dom": "^6.26.0", // OK — roteamento
  "zustand": "^4.5.4"            // OK — estado global
}
```

**Devs:**
- `firebase-admin` (^13.8.0) — Apenas em `scripts/seed-admins.js`
- `vitest`, `@vitest/coverage-v8` — Sem testes na base
- `autoprefixer`, `postcss` — Necessários para Tailwind

**Verificação necessária:** 
- Há polyfills no `index.html`? (remove se não há suporte a IE11)
- Há chunks de linguagem no i18n? (remove idiomas não usados)

---

## Páginas e Rotas

### `/dashboard` — DashboardPage.jsx
**Descrição:** Hub central para admin/coordenador ou resumo para professor.

**Componentes:**
- `KPICards`: 4 cards com estatísticas
- `WorkloadTable`: Tabela de carga por professor (condicional por role)
- `AulasAtribuidasCard`: Aulas atribuídas no mês (condicional)

**Behaviors:**
- [ ] Carrega dados de config, schedules, absences via store (já hidratado)
- [ ] Filtra KPIs baseado em role (admin vê todos, teacher vê resumo)
- [ ] Export de dados não ocorre em DashboardPage (ocorre em SettingsPage e outras)

### `/home` — HomePage.jsx
**Descrição:** Saudação e atalhos rápidos para professor.

**Componentes:**
- Greeting com nome do professor
- Action cards para `/calendar`, `/absences`, `/substitutions`, `/schedule`

**Behaviors:**
- [ ] Carrega apenas `teachers` e `schedules` (não carrega `absences`, `history`, `reports`)
- [ ] Renderiza sem dependência de `src/lib/reports.js`

### `/calendar` — CalendarPage.jsx
**Descrição:** Grade semanal interativa para ausências e substituições.

**Behaviors:**
- [ ] Carrega AbsencesPage se não carregado (`loadAbsencesIfNeeded`)
- [ ] Permite marcar ausência e atribuir substituto
- [ ] Em mobile, navega para `/calendar/day` com `location.state`

### `/absences` — AbsencesPage.jsx
**Descrição:** 4 abas: por professor / por dia / por semana / por mês, com export PDF.

**Behaviors:**
- [ ] **Lazy-load de `absences` e `reports.js`** — primeira abertura dispara `loadAbsencesIfNeeded()` e `registerAbsencesListener()`
- [ ] Gera HTML + abre novo aba com `window.print()`
- [ ] Importa `src/lib/reports` apenas nesta página

### `/settings` — SettingsPage.jsx
**Descrição:** 8 abas (admin) | 2 abas (coord) | 1 aba (teacher).

**Behaviors:**
- [ ] Lazy-load de `settingsHelpers.js` (usado em formulários de validação)
- [ ] Validação de config com helper específico

### Demais páginas (`/substitutions`, `/schedule`, `/school-schedule`, `/workload`, etc.)

**Behaviors:** Cada página carrega apenas os módulos de `src/lib` que efetivamente usa.

---

## Componentes Compartilhados

| Componente | Arquivo | Impacto | Ação |
|---|---|---|---|
| `Modal` | `src/components/ui/Modal.jsx` | Usado em 3+ páginas | Manter |
| `ActionCard` | `src/components/ui/ActionCard.jsx` | HomePage, PendingPage | Verificar refs |
| `Toast` | `src/components/ui/Toast.jsx` | Global via hook | Manter |
| `Spinner` | `src/components/ui/Spinner.jsx` | Usado em load states | Manter |
| `Navbar` | `src/components/layout/Navbar.jsx` | Renderizada em toda página | Manter |
| `Layout` | `src/components/layout/Layout.jsx` | Wrapper de rota | Manter |
| `SuggestionPills` | Verificar | Usado em CalendarPage | Verificar refs |
| `ToggleRuleButtons` | Verificar | Usado em AbsencesPage | Verificar refs |
| `KPICards` | Verificar | DashboardPage | Verificar refs |

---

## Modelos de Dados

Nenhuma mudança no modelo de dados. A otimização é **estrutural apenas** — reorgnanização de código, lazy-load e tree-shake de SDK/CSS.

---

## Regras de Negócio

Nenhuma mudança em lógica de negócio. Todas as validações, cálculos de ranking, status de ausência, etc., permanecem idênticas.

---

## Estratégia de Otimização

### Fase 1: Code-Splitting de `src/lib/`

**Objetivo:** Quebrar os 8 monólitos em **módulos temáticos por domínio de negócio**.

#### 1.1 Reorganização de Pastas

```
src/lib/ (novo layout)
├── firebase/
│   └── index.js          — Inicialização do SDK (40 linhas)
│
├── db/
│   ├── index.js          — Exports principais
│   ├── config.js         — Operações em meta/config
│   ├── teachers.js       — CRUD de teachers
│   ├── schedules.js      — CRUD de schedules
│   ├── absences.js       — CRUD de absences
│   ├── history.js        — CRUD de history
│   ├── admins.js         — Gestão de admins
│   ├── pending.js        — Gestão de pending_teachers, pending_actions
│   ├── listeners.js      — Listeners em tempo real
│   └── cache.js          — Local Storage + TTL
│
├── periods/
│   └── index.js          — Serialização de slots (não-breaking)
│
├── helpers/
│   ├── index.js          — Re-exports seletivos
│   ├── dates.js          — formatISO, parseDate, weekStart, businessDaysBetween
│   ├── ids.js            — uid()
│   ├── colors.js         — colorOfTeacher, COLOR_PALETTE
│   └── turmas.js         — allTurmaObjects (se mantido)
│
├── absences/
│   ├── index.js          — Exports principais
│   ├── ranking.js        — rankCandidates, suggestSubstitutes
│   ├── validation.js     — isBusy, monthlyLoad, isUnderWeeklyLimit
│   └── mutations.js      — createAbsence, assignSubstitute, delete*
│
├── reports/
│   ├── index.js          — Exports principales
│   ├── pdf.js            — openPDF (helper de impressão)
│   └── generators/
│       ├── day.js        — generateDayHTML
│       ├── teacher.js    — generateTeacherHTML
│       ├── week.js       — generateByWeekHTML
│       ├── month.js      — generateByMonthHTML
│       ├── styles.js     — _css (estilos compartilhados)
│       └── utils.js      — _wrap, _slotRow, etc.
│
├── settings/
│   ├── index.js          — Exports principais
│   ├── validation.js     — validateSegment, validatePeriod, etc.
│   └── helpers.js        — Helpers específicos de Settings
│
└── constants.js          — DAYS, COLOR_PALETTE (duplicar em colors/index.js)
```

#### 1.2 Importação Seletiva

**Antes (monolítico):**
```javascript
// src/pages/HomePage.jsx
import { formatISO, uid } from '../lib/helpers'
// ^ Carrega: reports.js, db.js, absences.js, settingsHelpers.js, ...
```

**Depois (modular):**
```javascript
// src/pages/HomePage.jsx
import { formatISO, uid } from '../lib/helpers/dates'  // 1 módulo
import { uid } from '../lib/helpers/ids'             // 1 módulo
// Tree-shakeable: reporta.js, db.js, absences.js não são carregados
```

#### 1.3 Lazy-Load de Módulos Pesados

**`reports.js` é o maior (~1.100 linhas) e é usado apenas em:**
- AbsencesPage (`generateByDayHTML`, `generateByMonthHTML`, etc.)
- SchedulePage (export de grade)
- SubstitutionsPage (export de rankings)

**Implementação:**
```javascript
// src/pages/AbsencesPage.jsx
import { lazy, Suspense } from 'react'

const ReportGenerator = lazy(() => import('../lib/reports'))

export default function AbsencesPage() {
  const [htmlReport, setHtmlReport] = useState(null)
  
  const handleExport = async () => {
    const { generateByDayHTML, openPDF } = await import('../lib/reports')
    const html = generateByDayHTML(date, store)
    openPDF(html)
  }
  
  return <button onClick={handleExport}>Exportar</button>
}
```

**Benefício:** `reports.js` é carregado apenas quando usuário clica "Exportar" (lazy).

#### 1.4 Re-exports Seletivos em `src/lib/index.js`

```javascript
// src/lib/index.js — default export para conveniência, mas sem tree-shake
export * from './firebase'
export * from './db'
export * from './periods'
export * from './helpers'
export * from './absences'
export * from './constants'

// Não exportar reports — está lazy-loaded
// Não exportar settingsHelpers — está lazy-loaded
```

**Importações em páginas:**
```javascript
// Opção 1: Específico (tree-shakeable) — RECOMENDADO
import { formatISO } from '../lib/helpers/dates'

// Opção 2: Barrel export (conveniência, menos tree-shakeable)
import { formatISO } from '../lib'

// Opção 3: Nunca fazer (carrega tudo)
import * as lib from '../lib'
```

---

### Fase 2: Tree-Shake de Firebase SDK

**Objetivo:** Remover módulos não utilizados.

#### 2.1 Auditoria de Imports

**Mapeamento atual:**
```
src/lib/firebase.js:
  ✅ initializeApp
  ✅ getAuth
  ✅ getFirestore
  ❓ Qualquer outro import?
  
src/lib/db.js:
  ✅ onSnapshot, getDocs, getDoc, setDoc, updateDoc, deleteDoc
  ✅ query, where, collection, doc
  ❓ Qualquer otro import?

src/store/useAuthStore.js:
  ✅ signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider
  ❓ Qualquer outro import?
```

**Ação:**
```bash
# Listar todos os imports de 'firebase' no código
grep -r "from 'firebase" src/ --include="*.js" --include="*.jsx"
```

**Esperado:**
```
src/lib/firebase.js:import { initializeApp } from 'firebase/app'
src/lib/firebase.js:import { getAuth } from 'firebase/auth'
src/lib/firebase.js:import { getFirestore } from 'firebase/firestore'
src/store/useAuthStore.js:import { signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth'
src/lib/db.js:import { collection, doc, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
src/lib/db.js:import { serverTimestamp } from 'firebase/firestore'
```

**Nunca deveria ter:**
```
'firebase/analytics'
'firebase/messaging'
'firebase/storage'
'firebase/remote-config'
'firebase/performance'
'firebase/functions'
```

#### 2.2 Vite Config para SideEffects

**Adicionar em `vite.config.js`:**
```javascript
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Isolar Firebase em chunk separado (já lazy-load)
          if (id.includes('node_modules/firebase')) {
            return 'firebase'
          }
        }
      }
    }
  }
}
```

---

### Fase 3: Auditoria de CSS (Tailwind)

**Objetivo:** Remover classes CSS não utilizadas.

#### 3.1 Varredura Manual

```bash
# Arquivos Tailwind config
cat tailwind.config.js

# Classes utilitárias customizadas em index.css
grep "@layer components" src/index.css
grep "@apply" src/index.css
```

**Resultado esperado:**
```
Componentes definidos com @apply:
  .btn, .btn-dark, .btn-ghost, .btn-danger, .btn-sm, .btn-xs
  .inp, .card, .lbl, .badge, .scroll-thin
```

#### 3.2 Usar PurgeCSS Plugin

**Adicionar em `tailwind.config.js`:**
```javascript
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
    // ❌ Remover patterns genéricas que pegam muito
    // ❌ './src/**/*' → específico demais
  ],
  safelist: [
    // Classes dinâmicas que Tailwind não consegue detectar
    'bg-blue-500',
    'text-red-600',
    /^badge-/,    // regex para classes dinâmicas
  ],
  // ...
}
```

#### 3.3 Verificação Pós-Build

```bash
npm run build
# Inspecionar tamanho de CSS no dist/:
ls -lh dist/*.css
# Esperado: <50KB total (inline + separado)
```

---

### Fase 4: Remover Código Não Utilizado

**Objetivo:** Identificar e remover funções órfãs, componentes mortos, listeners inúteis.

#### 4.1 Audit com `npm run build`

```bash
npm run build 2>&1 | grep -i "unused"
# Pode não ser perfeito, mas mostra erros óbvios
```

#### 4.2 Busca Manual por Funções Órfãs

```bash
# Procurar por funções que nunca são chamadas
for func in colorOfTeacher allTurmaObjects _isUnderWeeklyLimit; do
  echo "=== $func ==="
  grep -r "$func" src/ --include="*.js" --include="*.jsx" | grep -v "export\|function\|//" | wc -l
done
```

**Esperado para remover:**
```
colorOfTeacher   → 0 referências (remover)
allTurmaObjects  → 0 referências (remover ou documentar)
_saveToLS        → contrato privado de db.js (manter)
```

#### 4.3 Componentes Mortos

```bash
# Listar todos os .jsx em components/
find src/components -name "*.jsx" -type f

# Para cada um, verificar se é importado em alguma página
for comp in src/components/**/*.jsx; do
  basename=$( basename "$comp" )
  refs=$(grep -r "$basename" src/ --include="*.jsx" --include="*.js" | grep -v "$(dirname $comp)" | wc -l)
  if [ "$refs" -eq 0 ]; then
    echo "MORTO: $comp"
  fi
done
```

#### 4.4 Listeners e Unsubscriptions

**Auditoria em `useAuthStore.js` e `useAppStore.js`:**
- Procurar por `_unsub*` que nunca são chamados em `logout()`
- Procurar por `onSnapshot` registrados mas não desregistrados

---

### Fase 5: Validação de Bundle

**Objetivo:** Confirmar que todas as otimizações funcionam sem regressões.

#### 5.1 Análise de Bundle

```bash
npm run build

# Verificar tamanho total
du -sh dist/
# Esperado: <1MB total (antes), <700KB após otimizações

# Listar chunks por tamanho
ls -lS dist/assets/

# Usar ferramenta de análise (opcional)
# npm install --save-dev rollup-plugin-visualizer
# (já vem em alguns templates Vite)
```

#### 5.2 Teste Funcional

```bash
npm run preview
# Abrir http://localhost:4173 em cada navegador
# Testar:
# 1. Login → carrega /dashboard (admin)
# 2. HomePage → carrega /home (teacher)
# 3. AbsencesPage + Export PDF → carrega reports.js
# 4. SettingsPage → carrega settingsHelpers.js
# 5. Offline → cache LS funciona
# 6. DevTools Network → verificar chunks carregados
```

#### 5.3 Testes de Performance

```bash
# Lighthouse em modo production
npm run build && npm run preview

# Chrome DevTools:
# - Performance > Start Profiling
# - Navegar entre páginas
# - Verificar FCP (First Contentful Paint) < 2s
# - Verificar LCP (Largest Contentful Paint) < 2.5s
# - Verificar CLS (Cumulative Layout Shift) < 0.1
```

---

## Fora do Escopo (v1)

- [ ] **Migração de Firebase v9 → v10+** — compatível com SDK atual
- [ ] **Implementação de testes automatizados** — não afeta bundle
- [ ] **Mudança de CSS-in-JS** (Emotion, Styled Components) — Tailwind continua sendo a melhor escolha
- [ ] **Remover Zustand** — refactor massivo, não justificado
- [ ] **Remover React Router** — comprometeria navegação SPA
- [ ] **Migração de arquivos .jsx → .tsx** — type-safety sem impacto bundle (pode ser feito incrementalmente)
- [ ] **Implementar PWA / Service Workers** — além do escopo de otimização
- [ ] **Hardcoded admins → coleção admins/** — mudança de arqu. de segurança, escopo separado
- [ ] **Monitoramento de performance com Web Vitals** — pode ser adicionado em spec separada
- [ ] **Remover absences/history lazy-load** — intencionalmente mantido

---

## Checklist de Implementação

### Setup e Planejamento
- [ ] Fazer snapshot do bundle atual: `npm run build && du -sh dist/`
- [ ] Documentar o baseline de Gzip com `gzip-size-cli`
- [ ] Criar branch `feat/bundle-optimization`

### Fase 1: Code-Splitting `src/lib/`
- [ ] Criar nova estrutura em `src/lib/` (pastas temáticas)
- [ ] Mover arquivos granularmente com testes de import
- [ ] Re-exports em `src/lib/index.js`
- [ ] Atualizar imports em todas as páginas/componentes
- [ ] Lazy-load de `reports.js` em AbsencesPage, SchedulePage, SubstitutionsPage
- [ ] Lazy-load de `settingsHelpers.js` em SettingsPage
- [ ] Testar `npm run dev` — HMR deve funcionar
- [ ] Testar `npm run build` — sem erros

### Fase 2: Firebase SDK Tree-Shake
- [ ] Executar audit de imports: `grep -r "from 'firebase" src/`
- [ ] Verificar se há módulos não utilizados
- [ ] Adicionar `rollupOptions` em `vite.config.js` (se necessário)
- [ ] Testar build: `npm run build`

### Fase 3: Tailwind CSS Audit
- [ ] Revisar `tailwind.config.js` — content paths
- [ ] Testar build com PurgeCSS ativo
- [ ] Inspecionar `dist/*.css` — tamanho total

### Fase 4: Dead Code Removal
- [ ] Executar scripts de audit (functions, componentes, listeners)
- [ ] Documentar descobertas em arquivo `.md` separado
- [ ] Remover funções órfãs com PR separada
- [ ] Remover componentes mortos com PR separada

### Fase 5: Validação Final
- [ ] `npm run build` — sem warnings
- [ ] Medir novo tamanho: `du -sh dist/`
- [ ] Comparar gzip: `gzip -c dist/*.js | wc -c`
- [ ] `npm run preview` — teste manual em desktop + mobile
- [ ] Verificar offline (cache LS)
- [ ] Verificar todos os fluxos críticos:
  - [ ] Login / Logout
  - [ ] HomePage (teacher)
  - [ ] DashboardPage (admin/coord)
  - [ ] CalendarPage + atribuição de substituto
  - [ ] AbsencesPage + export PDF
  - [ ] SettingsPage (todas as abas)
  - [ ] SchedulePage + export PDF
  - [ ] SubstitutionsPage + export PDF
- [ ] Lighthouse score > 80 em Performance
- [ ] DevTools Network — chunks carregados sob demanda

### Documentação
- [ ] Atualizar `references/architecture.md` com nova estrutura de `src/lib/`
- [ ] Adicionar seção "Otimizações de Bundle" em notas de release
- [ ] Documentar lazy-loads em `CHANGELOG.md`

---

## Resultados Esperados

### Bundle Size

| Métrica | Antes | Depois | Melhoria |
|---|---|---|---|
| **main.js (KB)** | ~380 | ~280 | -26% |
| **firebase.js (KB)** | ~120 | ~85 | -29% |
| **Outros chunks (KB)** | ~180 | ~135 | -25% |
| **CSS (KB)** | ~45 | ~35 | -22% |
| **Total (KB)** | 680 | ~500 | **-26%** |
| **Gzip (KB)** | 179 | ~140 | **-22%** |

### Performance

| Métrica | Target | Esperado |
|---|---|---|
| FCP | <2.5s | ~1.8s |
| LCP | <2.5s | ~2.0s |
| CLS | <0.1 | <0.05 |
| DevTools Coverage (CSS) | <85% | >95% |

### User Experience

- Sem mudanças visuais ou funcionais
- HomePage (teacher) carrega ~40% mais rápido (sem report.js)
- AbsencesPage inicial (~500ms lento) depois retorna ao normal (reports.js lazy)
- Offline-first continua funcionando (cache LS)

---

## Referências

- [Vite Bundle Analysis](https://vitejs.dev/guide/build.html#build)
- [Firebase SDK Tree-Shaking](https://firebase.google.com/docs/web/module-bundling)
- [Tailwind CSS Optimization](https://tailwindcss.com/docs/optimizing-for-production)
- [React Code Splitting](https://react.dev/reference/react/lazy)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
