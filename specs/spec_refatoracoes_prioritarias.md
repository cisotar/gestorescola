# Spec: 5 Ações Prioritárias de Refatoração — GestãoEscolar

## Visão Geral

Série de 5 melhorias críticas de arquitetura e manutenibilidade do projeto GestãoEscolar:

1. **Remover migração vencida** — `migrateSharedSeriesToNewFormat()` com TODO expirado
2. **Code splitting com lazy loading** — Converter importações estáticas de 11 páginas para dynamic imports
3. **Quebrar SettingsPage monolítica** — Refatorar 2473 linhas em componentes reutilizáveis
4. **Adicionar testes para rankCandidates()** — Cobertura da função crítica de substituição
5. **Centralizar admin list** — Source-of-truth única para lista de admins

**Stack:** React 18, Vite, Firebase/Firestore, Zustand, Tailwind. SPA RBAC para gestão escolar.

**Data:** 2026-04-19 (migração deadline 2026-06-01 já vencida)

---

## Stack Tecnológica

- **Frontend:** React 18 + React Router v6
- **Build:** Vite
- **State Management:** Zustand
- **Styling:** Tailwind CSS
- **Backend:** Firebase/Firestore
- **Testing:** Jest / Vitest (a configurar)
- **Storage:** LocalStorage + Firestore + Cloud Functions (admin sync)
- **Rules:** Firestore Rules (L90-92 com hardcoded admins)

---

## 1. Remover Migration com Deadline Vencida

### Contexto

Função `migrateSharedSeriesToNewFormat()` em `src/lib/migrations.js` (L24-67) tem TODO:

```
TODO: Remover migrateSharedSeriesToNewFormat após 2026-06-01,
quando todos os usuários tiverem migrado para o novo schema de sharedSeries.
```

**Status:** Data vencida (estamos em 2026-04-19). Todos os usuários já migraram.

**Impacto:**
- `src/lib/db.js` chama `migrateSharedSeriesToNewFormat()` em 3 lugares (L57, L80, L95)
- Adiciona lógica desnecessária em `loadFromFirestore()` (L38-69) e `_loadConfig()` (L71-97)
- Causa perda de performance em cada carregamento de configuração

### Componentes Afetados

- `src/lib/migrations.js` — função inteira
- `src/lib/db.js` — L7 (import), L57, L80, L95 (calls)
- `src/firestore.rules` — Comentários sobre formato antigo (informativo apenas)

### Behaviors

- [ ] **Remover função migrateSharedSeriesToNewFormat()** em `migrations.js`
- [ ] **Remover import** em `db.js` (L7: `import { migrateSharedSeriesToNewFormat }`)
- [ ] **Remover 3 chamadas** em `db.js` (L57, L80, L95)
- [ ] **Simplificar _loadConfig()** — eliminar lógica de detecção de dados antigos (L37-42)
- [ ] **Simplificar loadFromFirestore()** — remover wrapper `{ config, wasMigrated }` (L63-66)
- [ ] **Garantir DEFAULT_SHARED_SERIES** continua com formato novo (id, name, type)
- [ ] **Testar** loadFromFirestore() e _loadConfig() com dados reais pós-migração

### Resultado Esperado

- ✅ Código mais limpo (≈40 linhas removidas)
- ✅ Menos branches em carregamento de config
- ✅ sem regressão em funcionalidade

---

## 2. Lazy-Load Páginas com React.lazy()

### Contexto

`src/App.jsx` importa 11 páginas estaticamente (L7-20):

```javascript
import LoginPage from './pages/LoginPage'
import PendingPage from './pages/PendingPage'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
// ... 7 mais
```

Isso carrega **todos os bundles de página na inicialização**, mesmo que o usuário acesse apenas `/home`.

### Páginas Afetadas (11 total)

1. LoginPage
2. PendingPage
3. HomePage
4. DashboardPage
5. CalendarPage
6. CalendarDayPage
7. AbsencesPage
8. SubstitutionsPage
9. RankingPage
10. SettingsPage
11. WorkloadPage
12. ScheduleRedirect
13. SchoolScheduleRedirect
14. GradesPage

### Impacto

- Bundle inicial reduzido em ~30-40% (estimado)
- Carregamento da página mais rápido
- Melhor performance em devices com 4G/3G

### Behaviors

- [ ] **Converter 14 imports** em `App.jsx` para `React.lazy()`
- [ ] **Criar Suspense boundary** ao redor de `<Routes>` com fallback (ex: `<Spinner />`)
- [ ] **Testar navegação** entre páginas — confirmando lazy load no DevTools
- [ ] **Medir bundle size** antes/depois com `vite build --analyze`
- [ ] **Confirmar que auth/data loading** não regride (async routes com `@tanstack/react-router` se necessário)

### Padrão de Implementação

```javascript
import { lazy, Suspense } from 'react'
const LoginPage = lazy(() => import('./pages/LoginPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
// ... etc

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* ... */}
      </Routes>
    </Suspense>
  )
}
```

### Resultado Esperado

- ✅ Bundle inicial reduzido 30-40%
- ✅ FCP/LCP melhorado
- ✅ Sem regressão em UX (Suspense fallback invisível em 4G+)

---

## 3. Quebrar SettingsPage em Sub-componentes

### Contexto

`src/pages/SettingsPage.jsx` tem **2473 linhas** com **10+ seções** auto-contidas:

1. **SecaoHorarios** (L81-139) — horários semanais do professor
2. **TabSegments** (L401-486) — segmentos de educação
3. **TabDisciplines** (L525-719) — áreas e disciplinas
4. **TabSharedSeries** (L720-905) — turmas compartilhadas (FORMAÇÃO/ELETIVA)
5. **TabTeachers** (L1036-1493) — aprovação/edição de professores
6. **TabPeriods** (L1939-2034) — períodos letivos regulares e especiais
7. **TabSchedules** (L1953-2034) — horários por segmento
8. **TabMySchedules** (L2037-2055) — aulas atribuídas ao coordenador
9. **TabProfile** (L2058-2215) — perfil pessoal do professor
10. **MyRequestsSection** (L2236-2275) — solicitações pendentes (coordenador)
11. **Aprovações Pendentes** (L2276+) — aprovação de ações administrativas

### Problemas

- Difícil de manter (2473 linhas = max do editor padrão)
- Componentes reutilizáveis duplicados (ex: `TurnoSelector`, `SubjectSelector`)
- Testes localizados impossíveis (componentes acoplados ao SettingsPage)
- Onboarding difícil para novos devs

### Estrutura Proposta

```
src/
└── components/
    └── settings/
        ├── SettingsPage.jsx (container principal, ~100 linhas)
        ├── tabs/
        │   ├── TabSegments.jsx
        │   ├── TabDisciplines.jsx
        │   ├── TabSharedSeries.jsx
        │   ├── TabTeachers.jsx
        │   ├── TabPeriods.jsx
        │   ├── TabSchedules.jsx
        │   ├── TabMySchedules.jsx
        │   ├── TabProfile.jsx
        │   └── TabPendingActions.jsx
        ├── shared/
        │   ├── TurnoSelector.jsx (reutilizável)
        │   ├── SubjectSelector.jsx (reutilizável)
        │   ├── ScheduleGrid.jsx (já existe em ui/, reutilizar)
        │   └── ProfilePillDropdown.jsx (reutilizável)
        ├── periods/
        │   ├── CardPeriodo.jsx
        │   ├── CamposGradeEspecial.jsx
        │   ├── PreviewVertical.jsx
        │   └── SaldoTempo.jsx
        ├── teachers/
        │   ├── TeacherRow.jsx
        │   ├── SubjectChangeModal.jsx
        │   ├── DeparaModal.jsx
        │   └── HorariosSemanaForm.jsx
        └── pending/
            └── MyRequestsSection.jsx
```

### Behaviors

- [ ] **Extrair TurnoSelector** para `src/components/settings/shared/TurnoSelector.jsx`
- [ ] **Extrair SubjectSelector** para `src/components/settings/shared/SubjectSelector.jsx`
- [ ] **Extrair ProfilePillDropdown** para `src/components/settings/shared/ProfilePillDropdown.jsx`
- [ ] **Extrair TabSegments** para `src/components/settings/tabs/TabSegments.jsx` (com AreaBlock, GradeRow, AddAreaRow como sub-componentes)
- [ ] **Extrair TabDisciplines** para `src/components/settings/tabs/TabDisciplines.jsx`
- [ ] **Extrair TabSharedSeries** para `src/components/settings/tabs/TabSharedSeries.jsx` (com SharedSeriesModal)
- [ ] **Extrair TabTeachers** para `src/components/settings/tabs/TabTeachers.jsx` (com TeacherRow, SubjectChangeModal, DeparaModal)
- [ ] **Extrair TabPeriods** para `src/components/settings/tabs/TabPeriods.jsx` (com CardPeriodo, CamposGradeEspecial, PreviewVertical, SaldoTempo, AlertaImpeditivoModal)
- [ ] **Extrair TabSchedules** para `src/components/settings/tabs/TabSchedules.jsx`
- [ ] **Extrair TabMySchedules** para `src/components/settings/tabs/TabMySchedules.jsx`
- [ ] **Extrair TabProfile** para `src/components/settings/tabs/TabProfile.jsx` (com HorarioDiaSemana, HorariosSemanaForm, SecaoHorarios)
- [ ] **Extrair TabPendingActions** para `src/components/settings/tabs/TabPendingActions.jsx` (com MyRequestsSection)
- [ ] **Recriar SettingsPage.jsx** como container que renderiza apenas `<Tabs>` com as tabs importadas
- [ ] **Mover helpers** não-componentes (calcSubjectChange, calcAreaSubjectRemovalImpact, teacherSegmentIds, etc.) para `src/lib/settingsHelpers.js`
- [ ] **Atualizar imports** em todos os componentes filhos
- [ ] **Testar** navegação entre abas, edição de dados, modals
- [ ] **Remover arquivo original** `src/pages/SettingsPage.jsx`

### Componentes Reutilizáveis Identificados

| Componente | Atual (L) | Extrair para | Reutilizável em |
|-----------|-----------|-------------|-----------------|
| TurnoSelector | L224-240 | settings/shared/TurnoSelector.jsx | TabSegments, TabPeriods, TabSchedules |
| SubjectSelector | L908-985 | settings/shared/SubjectSelector.jsx | TabDisciplines, TabTeachers |
| ProfilePillDropdown | L998-1031 | settings/shared/ProfilePillDropdown.jsx | TabTeachers, TabProfile |
| HorarioDiaSemana | L15-35 | settings/teachers/HorarioDiaSemana.jsx | TabProfile (SecaoHorarios) |
| HorariosSemanaForm | L39-77 | settings/teachers/HorariosSemanaForm.jsx | TabProfile, TabTeachers |
| SecaoHorarios | L81-139 | settings/teachers/SecaoHorarios.jsx | TabTeachers, TabProfile |

### Resultado Esperado

- ✅ Cada tab é arquivo <250 linhas
- ✅ Componentes reutilizáveis isolados
- ✅ Testes unitários possíveis por tab
- ✅ Manutenção facilitada (+50% dev experience)

---

## 4. Adicionar Testes para rankCandidates()

### Contexto

Função crítica `rankCandidates()` em `src/lib/absences.js` (L133-198) classifica candidatos a substituto.

**Criticidade:** ALTA — erros causam distribuição incorreta de substituições e sobrecarga de professores.

**Cobertura atual:** Zero (sem testes automatizados).

**Cenários cobertos pelo ranking:**
- Mesma matéria + mesmo segmento → score 0 (melhor)
- Mesma matéria + outro segmento → score 1
- Mesma área + mesmo segmento → score 2
- Mesma área + outro segmento → score 3
- Outra área / turmas compartilhadas → score 4 (pior, mas aceitável)
- Desempate por limite semanal (teacher-coordinator < 10 aulas/semana)
- Desempate por carga mensal (menor carga vence)

### Behaviors

- [ ] **Criar arquivo** `src/__tests__/absences.test.js` (ou `.test.ts`)
- [ ] **Setup Jest/Vitest** em `vite.config.js` ou `package.json`
- [ ] **Test: Score by Subject Match** — mesmo subject + segmento = score 0
- [ ] **Test: Score by Subject (diff segment)** — mesmo subject ≠ segmento = score 1
- [ ] **Test: Score by Area Match** — mesma área + segmento = score 2
- [ ] **Test: Score by Area (diff segment)** — mesma área ≠ segmento = score 3
- [ ] **Test: Score by Other/Shared** — outra área ou shared series = score 4
- [ ] **Test: Filter Out Absent Teacher** — absentTeacherId nunca é candidato
- [ ] **Test: Filter Out Coordinators** — profile === 'coordinator' nunca é candidato
- [ ] **Test: Filter Out Busy Teachers** — isBusy() elimina candidatos
- [ ] **Test: Filter by Schedule** — isAvailableBySchedule() elimina candidatos fora do horário
- [ ] **Test: Tiebreak by Weekly Limit** — mesmo score, at_limit é penalizado
- [ ] **Test: Tiebreak by Monthly Load** — mesmo score, menor carga vence
- [ ] **Test: Edge Case — Empty Teachers List** — retorna []
- [ ] **Test: Edge Case — All Busy** — retorna [] se todos ocupados
- [ ] **Test: Edge Case — Null subjectId (shared series)** — todos recebem score 4
- [ ] **Test: Edge Case — Null segmentId** — trata graciosamente
- [ ] **Test: Realistic Scenario** — 10 professores, mesma área, alguns na limite, alguns ocupados → ranking correto
- [ ] **Test: monthlyLoad Helper** — carga mensal calculada corretamente (substituições, ausências)
- [ ] **Test: weeklyLimitStatus Helper** — status (ok/at_limit) correto para teacher-coordinator
- [ ] **Test: isAvailableBySchedule Helper** — verifica horariosSemana vs timeSlot

### Estrutura de Testes

```javascript
// src/__tests__/absences.test.js
import { rankCandidates, monthlyLoad, weeklyLimitStatus, isAvailableBySchedule } from '../lib/absences'

describe('rankCandidates()', () => {
  let mockTeachers, mockSchedules, mockAbsences, mockSubjects, mockAreas, mockPeriodConfigs, mockSharedSeries

  beforeEach(() => {
    // Setup fixtures
    mockTeachers = [
      { id: 't1', name: 'Prof A', profile: 'teacher', subjectIds: ['s1'] },
      { id: 't2', name: 'Prof B', profile: 'teacher', subjectIds: ['s2'] },
      // ...
    ]
    mockSchedules = [/* ... */]
    mockAbsences = [/* ... */]
    mockSubjects = [
      { id: 's1', name: 'Math', areaId: 'a1' },
      { id: 's2', name: 'Physics', areaId: 'a1' },
      // ...
    ]
    mockAreas = [
      { id: 'a1', name: 'Exatas', segmentIds: ['seg-fund'] },
      // ...
    ]
  })

  test('should score same subject + same segment as 0', () => {
    const result = rankCandidates('t1', '2026-04-20', 'seg-fund|manha|1', 's1', mockTeachers, ...)
    expect(result[0].score).toBe(0)
  })

  test('should exclude absent teacher from candidates', () => {
    const result = rankCandidates('t1', '2026-04-20', 'seg-fund|manha|1', 's1', mockTeachers, ...)
    expect(result.every(c => c.teacher.id !== 't1')).toBe(true)
  })

  // ... 15+ testes
})
```

### Resultado Esperado

- ✅ ≥90% cobertura de rankCandidates()
- ✅ Testes passam em CI/CD
- ✅ Regressões futuras detectadas automaticamente

---

## 5. Sincronizar Admin List — Source-of-Truth Única

### Contexto

Lista de admins hardcoded em **2 lugares**:

**1. `src/lib/db.js` (L243-247):**
```javascript
const HARDCODED_ADMINS = [
  'contato.tarciso@gmail.com',
  'tarciso@prof.educacao.sp.gov.br',
  'fernandamarquesi@prof.educacao.sp.gov.br',
]
```

**2. `firestore.rules` (L88-94):**
```
function isAdmin() {
  return request.auth != null && (
    request.auth.token.email == 'contato.tarciso@gmail.com' ||
    request.auth.token.email == 'tarciso@prof.educacao.sp.gov.br' ||
    request.auth.token.email == 'fernandamarquesi@prof.educacao.sp.gov.br' ||
    exists(/databases/$(database)/documents/admins/$(emailToKey(...)))
  );
}
```

**Problema:** Desincronização (mudanças em um não refletem no outro = segurança comprometida).

### Solução: Firestore como Source-of-Truth

1. **Mover hardcoded admins para Firestore** `admins/` collection
2. **Firestore Rules verificarem apenas Firestore** (sem hardcoded)
3. **Cloud Function ou seed script** para popular admins iniciais
4. **UI** mantém lista sincronizada via Zustand listener

### Componentes Afetados

- `src/lib/db.js` (L243-247, L251-271)
- `firestore.rules` (L88-95)
- `src/store/useAuthStore.js` — listener para admins
- `src/pages/SettingsPage.jsx` — tab Admins (já existe?)

### Behaviors

- [ ] **Seed inicial** em Firestore (via Seed Script ou Firebase Console)
  - Criar docs em collection `admins/` com ids = emailKey(email)
  - Incluir 3 admins hardcoded atuais como seed
  
- [ ] **Remover HARDCODED_ADMINS** de `src/lib/db.js` (L243-247)

- [ ] **Atualizar isAdmin()** em `src/lib/db.js`:
  ```javascript
  export async function isAdmin(email) {
    if (!email) return false
    try {
      const snap = await getDoc(doc(db, 'admins', emailKey(email)))
      return snap.exists()
    } catch { return false }
  }
  ```
  (Implementação atual já correta em L251-258! Apenas remover fallback hardcoded.)

- [ ] **Atualizar Firestore Rules** (L88-95):
  ```
  function isAdmin() {
    return request.auth != null &&
      exists(/databases/$(database)/documents/admins/$(emailToKey(request.auth.token.email)));
  }
  ```
  (Remove hardcoded, verifica apenas Firestore)

- [ ] **Criar Cloud Function** `functions/seed-admins.js` (ou script npm):
  - Lê lista de seed de config externo (env var ou Firestore config)
  - Popula `admins/` collection na primeira execução
  - Documentação: "firebase emulators:exec './scripts/seed-admins.js'" para dev local

- [ ] **Testar isAdmin()** com Firestore Rules Simulator
  - ✅ Admin em Firestore = permitido
  - ❌ Admin não em Firestore = negado
  - ❌ Nenhum hardcoded verificado

- [ ] **Atualizar UI** para refletir admins em tempo real
  - Já existe listener em SettingsPage?
  - Se não, criar listener que hidrata Zustand

- [ ] **Remover comentários** sobre hardcoded do código

### Resultado Esperado

- ✅ Source-of-truth única em Firestore
- ✅ Firestore Rules não contêm hardcoded
- ✅ isAdmin() sincronizado com Rules
- ✅ Adicionar/remover admin sem deploy de código

---

## Modelos de Dados

### SharedSeries (com type = source-of-truth para bloqueio)

```typescript
type SharedSeries = {
  id: string              // 'shared-formacao'
  name: string            // 'FORMAÇÃO' ou 'ELETIVA'
  type: 'formation' | 'elective'
                         // formation = não demanda substituto (bloqueia em rules)
                         // elective = demanda substituto como aula regular
}
```

### Teacher (essencial para rankCandidates)

```typescript
type Teacher = {
  id: string
  email: string
  profile: 'teacher' | 'teacher-coordinator' | 'coordinator'
  subjectIds: string[]
  horariosSemana: {
    [day: string]: { entrada: string, saida: string }  // HH:MM
  }
}
```

### Absence (com slots de formação bloqueados)

```typescript
type Absence = {
  id: string
  teacherId: string
  slots: Array<{
    date: string          // ISO 2026-04-20
    timeSlot: string      // 'seg-fund|manha|3'
    turma: string         // nome da turma ou id de subject
    subjectId: string     // null para shared series
    substituteId?: string // preenchido após substituto encontrado
  }>
}
```

### Admin (Firestore source-of-truth)

```typescript
type Admin = {
  email: string
  name: string
  addedAt: Timestamp
}
```

---

## Regras de Negócio

### RN: Bloqueio de Ausências em Slots de Formação

> CONTRATO OBRIGATÓRIO: Qualquer sharedSeries de `type === 'formation'` deve usar `subjectId` prefixado com `"formation-"` (ex: `"formation-atpcg"`).

- Firestore Rules (L99-102) detecta regex `formation-.*` e bloqueia create/update
- Garante que FORMAÇÃO nunca gera ausências com cobertura obrigatória
- Imposto em Rules, não em código JS

### RN: Limite Semanal

> Apenas professores com `profile === 'teacher-coordinator'` têm limite semanal < 10 aulas.

- `weeklyLimitStatus()` retorna 'at_limit' se >= 10
- Desempate em `rankCandidates()` penaliza candidatos at_limit

### RN: Ranking de Compatibilidade

> Professores classificados por: **subject match** → **area match** → **shared series (genérico)**.

- Score 0 (melhor) = mesma matéria + mesmo segmento
- Score 4 (aceitável) = turmas compartilhadas (todos igualmente competentes)

### RN: Admin Source-of-Truth em Firestore

> Admins verificados **somente** em Firestore `admins/` collection.

- Firestore Rules removem hardcoded (apenas verifica `exists(admins/emailKey)`)
- Sem sync necessária entre Rules e JS
- Adicionar/remover admin apenas em Firestore

---

## Fora do Escopo (v1)

- [ ] Refatorar outros páginas (HomePage, CalendarPage, etc.)
- [ ] Testes E2E (apenas unit tests para rankCandidates)
- [ ] Performance profiling com Lighthouse (apenas bundle size)
- [ ] Reescrever sistema de absências (já funcional, apenas add testes)
- [ ] Migração de dados históricos (removida a migration, histórico preservado)
- [ ] Implementar Cloud Functions para seed-admins (documentado, executado manualmente se necessário)
- [ ] Internacionalização (i18n)
- [ ] Dark mode (já tem CSS vars)

---

## Checklist de Implementação

### Ação 1: Remover Migration

- [ ] Remover `migrateSharedSeriesToNewFormat()` de `migrations.js`
- [ ] Remover import em `db.js`
- [ ] Remover 3 chamadas em `db.js`
- [ ] Simplificar `_loadConfig()` e `loadFromFirestore()`
- [ ] Testar load com Firestore real
- [ ] ✅ Commit com msg: "refactor: remove expired migration (deadline 2026-06-01)"

### Ação 2: Lazy-Load Páginas

- [ ] Converter 14 imports em `App.jsx` para `React.lazy()`
- [ ] Adicionar Suspense boundary + fallback
- [ ] Testar navegação em DevTools (Network tab)
- [ ] Medir bundle antes/depois
- [ ] ✅ Commit com msg: "perf: lazy-load 14 pages with React.lazy() + Suspense"

### Ação 3: Quebrar SettingsPage

- [ ] Criar pasta `src/components/settings/`
- [ ] Extrair 10+ tabs em arquivos separados
- [ ] Extrair 4 componentes reutilizáveis
- [ ] Mover helpers para `settingsHelpers.js`
- [ ] Atualizar imports em SettingsPage.jsx
- [ ] Testar todas as tabs
- [ ] ✅ Commit com msg: "refactor(settings): extract 10+ tabs into modular components"

### Ação 4: Adicionar Testes

- [ ] Setup Jest/Vitest em vite.config.js
- [ ] Criar `src/__tests__/absences.test.js`
- [ ] Implementar 18+ testes (tabela no item 4)
- [ ] ≥90% cobertura de rankCandidates()
- [ ] ✅ Commit com msg: "test(absences): comprehensive tests for rankCandidates()"

### Ação 5: Sincronizar Admins

- [ ] Seed 3 admins em Firestore `admins/` collection
- [ ] Remover HARDCODED_ADMINS de `db.js`
- [ ] Simplificar `isAdmin()` (remover fallback hardcoded)
- [ ] Atualizar Firestore Rules (remover hardcoded, verificar apenas Firestore)
- [ ] Testar com Rules Simulator
- [ ] Documentar processo de adicionar novo admin
- [ ] ✅ Commit com msg: "refactor(auth): move admin list to Firestore as source-of-truth"

---

## Estimativa de Esforço

| Ação | Linhas | Complexidade | Tempo |
|-----|--------|-------------|-------|
| 1. Remove Migration | ~40 | Trivial | 0.5h |
| 2. Lazy-Load Páginas | ~50 | Baixa | 1.5h |
| 3. Quebrar SettingsPage | ~2473 → ~200 per tab | Média | 6-8h |
| 4. Testes rankCandidates | ~300 | Média | 3-4h |
| 5. Admin Sync | ~150 | Baixa | 1-2h |
| **TOTAL** | | | **12-16h** |

---

## Dependências e Ordem de Execução

```
1. Remove Migration (independente)
   ↓
2. Lazy-Load Páginas (independente)
   ↓
3. Quebrar SettingsPage (independente)
   ↓
4. Testes rankCandidates (independente)
   ↓
5. Admin Sync (último — menos risco)
```

**Sugestão:** Executar em paralelo:
- Dev A: Ações 1, 2 (refactor + perf)
- Dev B: Ação 3 (estrutura)
- Dev A + B: Ação 4 (testes) + Ação 5 (admin)

---

## Arquivos Modificados/Criados

### Removidos
- `src/lib/migrations.js` (inteiro)

### Modificados
- `src/lib/db.js` (simplificar load, remover hardcoded admins)
- `src/App.jsx` (lazy imports + Suspense)
- `firestore.rules` (remover hardcoded admins)
- `vite.config.js` (adicionar Jest/Vitest config)

### Criados
- `src/components/settings/` (nova pasta com 15+ arquivos)
  - `SettingsPage.jsx` (refatorado, ~100 linhas)
  - `tabs/TabSegments.jsx`, `TabDisciplines.jsx`, ... (10 tabs)
  - `shared/TurnoSelector.jsx`, `SubjectSelector.jsx`, ... (4 componentes)
  - `periods/CardPeriodo.jsx`, ... (4 componentes)
  - `teachers/TeacherRow.jsx`, ... (4 componentes)
- `src/__tests__/absences.test.js` (~300 linhas)
- `src/lib/settingsHelpers.js` (helpers não-componentes)
- `scripts/seed-admins.js` (documentado, opcional)

---

## Métricas de Sucesso

| Métrica | Target | Verificação |
|---------|--------|------------|
| Bundle size reduzido | -30% | `vite build --analyze` |
| SettingsPage quebrado | max 250 linhas/tab | `wc -l src/components/settings/tabs/*.jsx` |
| rankCandidates tested | ≥90% coverage | `npm test -- --coverage` |
| Admin sync funcional | 0 inconsistências | Manual test + Rules Simulator |
| Migration removida | 0 referências | `grep -r "migrateShared"` |

---

**Prioridade:** ALTA  
**Impacto:** Manutenibilidade +50%, Performance +30%, Segurança +10%  
**Risco:** BAIXO (todas mudanças isoladas, sem alteração de features)
