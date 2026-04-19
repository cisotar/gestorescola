# Spec: Correção e Simplificação de Turmas Compartilhadas

## Visão Geral

Atualmente, o sistema permite turmas compartilhadas (como "FORMAÇÃO") em que múltiplos professores podem registrar aulas no mesmo horário. Porém, a estrutura de dados está desnecessariamente complexa:
- O campo `activities[]` não mais é necessário — as atividades não trazem valor na Grade Horária
- Os campos `tipo: "fixo"|"variavel"` e `order` são redundantes
- A lógica de ausências e carga horária confunde "turmas compartilhadas" com "atividades variáveis"

Esta spec **simplifica a estrutura de dados** e **clarifica as regras de negócio** em torno de dois tipos de turmas compartilhadas:

1. **FORMAÇÃO** — ausência **não demanda substituto** (ex: ATPCG, PDA, Alinhamento)
2. **ELETIVA** — ausência **demanda substituto** (ex: Oficinas, Eletivas)

Ambas contam como "aula dada" no `monthlyLoad()`, e múltiplos professores podem usar a mesma turma no mesmo horário sem gerar conflito.

---

## Stack Tecnológica

- **Frontend:** React 18 + Tailwind CSS
- **Estado:** Zustand (`useAppStore`)
- **Banco de dados:** Firestore — coleção `meta/config`
- **Lógica de negócio:** `src/lib/absences.js`, `src/lib/helpers.js`
- **Build/Deploy:** Vite + Firebase Hosting

---

## Páginas e Rotas

### Configurações — `/settings?tab=shared` (Nova aba "Turmas Compartilhadas")

**Descrição:** Área de administração para gerenciar turmas compartilhadas. O admin visualiza a lista atual, cria novas turmas (FORMAÇÃO ou ELETIVA) e exclui as que não têm mais horários registrados.

**Componentes:**
- `SharedSeriesTab`: lista todas as turmas compartilhadas cadastradas com seus tipos
- `SharedSeriesCard`: exibe nome, tipo (badge "Formação" ou "Eletiva") e ações (editar, excluir)
- `SharedSeriesModal`: modal para criar ou editar turma compartilhada com seletor de tipo
- `CreateSharedSeriesButton`: botão flutuante ou ação primária para criar nova turma

**Behaviors:**
- [ ] Criar turma compartilhada: admin preenche nome (ex: "FORMAÇÃO", "ELETIVA") e escolhe tipo ("formation" ou "elective")
- [ ] Exibir aviso visual se turma já existe com mesmo nome (case-insensitive)
- [ ] Editar nome de turma compartilhada existente (sem poder alterar o tipo após criação)
- [ ] Excluir turma compartilhada: só permitido se não há nenhum `schedule` usando `turma: "nome da turma"`
- [ ] Ao tentar deletar turma em uso: exibir modal informando quantos horários seriam afetados
- [ ] Salvar no Firestore via `saveConfig()` após cada mutação
- [ ] Validação: nome não pode ser vazio e deve ser único (comparação insensível a maiúsculas)

---

### Grade Horária do Professor — `SchedulePage` — `/schedule`

**Descrição:** Ao adicionar/editar um horário, se o professor selecionar uma turma compartilhada, o sistema não mais exige a seleção de "atividade" — apenas a turma é armazenada.

**Behaviors:**
- [ ] Modal de adição de aula: manter seção "Turma" com seletor de todas as turmas (regulares + compartilhadas)
- [ ] Ao selecionar uma turma compartilhada (ex: "FORMAÇÃO"), **não exibir** campo de seleção de atividade
- [ ] Ao selecionar uma turma regular (ex: "6º Ano A"), **não** permitir turmas compartilhadas
- [ ] Ao salvar: registrar `schedule.turma = "FORMAÇÃO"` (string) e deixar `subjectId = null` (ou vazio)
- [ ] Múltiplos professores podem ter aulas no mesmo `day` + `timeSlot` com a mesma `turma` compartilhada (sem conflito)
- [ ] Célula da grade exibe apenas o nome da turma compartilhada (sem atividade ou badge de tipo)
- [ ] Validação: turma compartilhada + turma regular não podem coexistir no mesmo `timeSlot` para professores diferentes

---

### Grade Escolar — `SchoolSchedulePage` — `/school-schedule`

**Descrição:** Exibe a grade de toda a escola com filtros por segmento e turno.

**Behaviors:**
- [ ] Células de turma compartilhada exibem apenas o nome (ex: `"FORMAÇÃO"` ou `"ELETIVA"`)
- [ ] Sem exibição de atividades, badges ou IDs
- [ ] Múltiplas células na mesma posição horizontal exibem todos os professores da turma compartilhada naquele slot
- [ ] Mantém cor baseada na primeira matéria do professor (se aplicável; caso contrário, usa cor padrão de turma compartilhada)

---

## Modelos de Dados

### Estrutura Anterior (REMOVER)

```js
// ❌ ANTES — ainda em produção
sharedSeries: [
  {
    id: "shared-formacao",
    name: "FORMAÇÃO",
    activities: [
      { id: "formation-atpcg", name: "ATPCG", tipo: "fixo", order: 0 },
      { id: "formation-pda", name: "PDA", tipo: "variavel", order: 1 }
    ]
  }
]

// E na schedule:
schedule.turma = "FORMAÇÃO"
schedule.subjectId = "formation-atpcg"  // ← REMOVER ESTA REFERÊNCIA
```

---

### Estrutura Nova (IMPLEMENTAR)

#### `meta/config.sharedSeries[]`

Armazenada no mesmo documento `meta/config`, campo `sharedSeries` (array). Cada turma compartilhada é mínima e estruturada:

```js
{
  id: "shared-formacao",           // uid() — gerado na criação, imutável
  name: "FORMAÇÃO",                // nome exibido na Grade Horária
  type: "formation" | "elective"   // "formation" = sem demanda de substituto
                                   // "elective"  = com demanda de substituto
  // ✅ REMOVIDOS: activities[], tipo, order — não mais necessários
}
```

**Exemplo de configuração completa após migração:**

```js
meta/config:
{
  segments: [...],
  periodConfigs: {...},
  areas: [...],
  subjects: [...],
  
  sharedSeries: [
    {
      id: "shared-formacao",
      name: "FORMAÇÃO",
      type: "formation"
    },
    {
      id: "shared-eletiva",
      name: "ELETIVA",
      type: "elective"
    },
    {
      id: "shared-atendimento",
      name: "ATENDIMENTO",
      type: "formation"
    }
  ],
  
  workloadWarn: 20,
  workloadDanger: 26,
  updatedAt: Timestamp
}
```

---

#### `schedules/` — Grade Horária (SEM MUDANÇAS)

```js
{
  id: "mx3p9q1",
  teacherId: "lv9k2a7",
  day: "Segunda",
  timeSlot: "seg-fund|manha|1",
  turma: "FORMAÇÃO",           // pode ser turma regular "6º Ano A" ou compartilhada "FORMAÇÃO"
  subjectId: null              // ✅ NOVO: agora null para turmas compartilhadas
}
```

**Regra:** se `turma` tem correspondência em `sharedSeries[].name`, então `subjectId` deve ser `null`.

---

#### `absences/` — Faltas (MUDANÇAS NO TRATAMENTO)

Estrutura do documento não muda, mas a **lógica de slot** é revisada:

```js
{
  id: "ab7r3n2",
  teacherId: "lv9k2a7",
  createdAt: "2026-04-14T10:30:00.000Z",
  status: "open",
  
  slots: [
    {
      id: "sl2x8k1",
      date: "2026-04-14",
      day: "Segunda",
      timeSlot: "seg-fund|manha|1",
      scheduleId: "mx3p9q1",
      subjectId: null,           // ← null se turma compartilhada
      turma: "FORMAÇÃO",
      substituteId: null
    }
  ]
}
```

**Lógica de status:**
- Se `turma` refere a `sharedSeries` com `type: "formation"` → **não** cria demanda de substituto (slot fica em aberto, status nunca é `covered`)
- Se `turma` refere a `sharedSeries` com `type: "elective"` → **cria** demanda de substituto (como turma regular)
- Se `turma` é regular → cria demanda de substituto (comportamento atual)

---

## Regras de Negócio

### 1. Tipos de Turmas Compartilhadas

| Tipo | Nome exibido | Demanda substituto | Conta em monthlyLoad | Exemplo |
|---|---|:---:|:---:|---|
| `formation` | "FORMAÇÃO" | ❌ Não | ✅ Sim | ATPCG, PDA, Alinhamento |
| `elective` | "ELETIVA" | ✅ Sim | ✅ Sim | Oficinas, Eletivas opcionais |

---

### 2. Detecção de Turma Compartilhada

**Helper: `isSharedSeries(turmaName, sharedSeries)`**

```js
// Em helpers.js
export function isSharedSeries(turmaName, sharedSeries = []) {
  if (!turmaName) return false
  return sharedSeries.some(ss => ss.name === turmaName)
}
```

Usado em:
- `absences.js` — para decidir se cria demanda de substituto
- `absences.js` — para decidir se inclui em `monthlyLoad()`
- `periods.js` — para renderização diferenciada na grade

---

### 3. Ausências e Demanda de Substituto

**Função revisada: `_calcStatus(slots, sharedSeries)`**

```js
function _calcStatus(slots, sharedSeries = []) {
  const demandsSubstitute = (slot) => {
    const isFormacao = isSharedSeries(slot.turma, sharedSeries)
    if (!isFormacao) return true  // turma regular demanda
    
    const shared = sharedSeries.find(ss => ss.name === slot.turma)
    if (!shared) return true  // fallback: demanda se não encontrar
    
    return shared.type !== 'formation'  // true se type === 'elective'
  }
  
  const slotsWithDemand = slots.filter(demandsSubstitute)
  
  if (slotsWithDemand.length === 0) return 'open'  // nenhum slot demanda
  
  const hasAllCovered = slotsWithDemand.every(sl => sl.substituteId)
  if (hasAllCovered) return 'covered'
  
  const someHasSub = slotsWithDemand.some(sl => sl.substituteId)
  return someHasSub ? 'partial' : 'open'
}
```

**Exemplos:**
- Professor ausente em FORMAÇÃO (Segunda 1ª aula): absence.status sempre `'open'` (sem demanda de cobertura)
- Professor ausente em ELETIVA (Segunda 1ª aula) sem substituto: absence.status `'open'`
- Professor ausente em ELETIVA (Segunda 1ª aula) com substituto: absence.status `'covered'`
- Professor ausente em turma regular (Segunda 1ª aula) + FORMAÇÃO (Segunda 2ª aula): status só reflete FORMAÇÃO cobertura (segunda aula ignorada em status)

---

### 4. Carga Horária Mensal

**Função revisada: `monthlyLoad(teacherId, referenceDate, schedules, absences, sharedSeries)`**

```js
export function monthlyLoad(teacherId, referenceDate, schedules, absences, sharedSeries = []) {
  const ref        = parseDate(referenceDate)
  const monthStart = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2,'0')}-01`
  const days       = businessDaysBetween(monthStart, referenceDate)

  // ✅ NOVO: aulas de turmas compartilhadas (ambos os tipos) CONTAM
  const scheduledLoad = days.reduce((acc, d) => {
    const dayLabel = dateToDayLabel(d)
    if (!dayLabel) return acc
    return acc + schedules.filter(s =>
      s.teacherId === teacherId && s.day === dayLabel
    ).length  // REMOVIDO: filtro que excluía formação
  }, 0)

  // ✅ NOVO: slots de turmas compartilhadas do tipo 'elective' CONTAM
  // slots de turmas compartilhadas do tipo 'formation' são ignorados se não tiverem substituto
  const absenceLoad = (absences || []).reduce((acc, ab) => {
    if (ab.teacherId !== teacherId) return acc
    return acc + ab.slots.filter(sl => {
      if (!(sl.date >= monthStart && sl.date <= referenceDate)) return false
      const isFormacao = isSharedSeries(sl.turma, sharedSeries)
      if (!isFormacao) return true  // turma regular conta na ausência
      // turma compartilhada tipo 'formation' NÃO conta
      const shared = sharedSeries.find(ss => ss.name === sl.turma)
      return shared?.type !== 'formation'
    }).length
  }, 0)

  const subsLoad = (absences || []).reduce((acc, ab) => {
    return acc + ab.slots.filter(sl =>
      sl.substituteId === teacherId && sl.date >= monthStart && sl.date <= referenceDate
    ).length
  }, 0)

  return Math.max(0, scheduledLoad - absenceLoad) + subsLoad
}
```

**Exemplos de cálculo:**

| Cenário | Aulas agendadas | Faltas | Substituições | monthlyLoad |
|---|:---:|:---:|:---:|:---:|
| 4 aulas turma regular | 4 | 0 | 0 | 4 |
| 4 aulas turma regular, 1 FORMAÇÃO | 5 | 0 | 0 | 5 |
| 4 aulas turma regular, 1 ELETIVA | 5 | 0 | 0 | 5 |
| 4 turmas regulares, ausente 1 dia turma regular | 4 | 1 | 0 | 3 |
| 4 turmas regulares, ausente 1 FORMAÇÃO | 4 | 0 | 0 | 4 (FORMAÇÃO ignorada) |
| 4 turmas regulares, ausente 1 ELETIVA, sem substituto | 4 | 1 | 0 | 3 |
| 4 turmas regulares, ausente 1 ELETIVA, com substituto | 4 | 0 | 1 | 5 |

---

### 5. Ocupação de Slots (isBusy)

**Função: `isBusy(teacherId, date, timeSlot, schedules, absences)`**

Não muda de comportamento, mas clarificar:
- Professor com aula em FORMAÇÃO no slot → **marca como ocupado** (válido, não faz substituição)
- Professor com aula em ELETIVA no slot → **marca como ocupado** (válido, pode ser substituto se tiver disponibilidade)
- Professor já designado como substituto (qualquer turma) → **marca como ocupado**

---

### 6. Ranking de Candidatos

**Função: `rankCandidates(...)`** — sem mudanças lógicas, mas **clarificar comportamento**

O cálculo de score não muda (matéria → área). Porém:
- Se slot é de turma compartilhada, `subjectId` será `null` → score será sempre `4` (outra área)
- Isto é aceitável: em FORMAÇÃO/ELETIVA, qualquer professor é candidato
- Não há "compatibilidade de matéria" para turmas compartilhadas (por design)

---

### 7. Exclusão Protegida

Não é possível deletar `sharedSeries` ou turma compartilhada que ainda tem horários registrados em `schedules`:

```js
// No modal de confirmação de exclusão:
const inUseCount = schedules.filter(s => s.turma === sharedSeriesName).length
if (inUseCount > 0) {
  toast(`Não é possível excluir "${sharedSeriesName}" — há ${inUseCount} aula(s) registrada(s)`, 'err')
  return
}
```

---

### 8. Unicidade de Nome

Não podem existir duas turmas compartilhadas com o mesmo nome (case-insensitive):

```js
const exists = sharedSeries.some(ss =>
  ss.name.toLowerCase() === newName.toLowerCase() && ss.id !== currentId
)
if (exists) {
  toast(`Turma "${newName}" já existe`, 'err')
  return
}
```

---

### 9. Migração de Dados

**One-shot migration function** (executada uma única vez no boot ou via admin action):

```js
// src/lib/migrations.js
export function migrateSharedSeriesToNewFormat(config) {
  const newSharedSeries = (config.sharedSeries ?? [])
    .map(ss => {
      // Se já tem campo 'type', deixa como está
      if (ss.type) return ss
      
      // Senão, assume 'formation' para turmas antigas de FORMAÇÃO
      return {
        id: ss.id,
        name: ss.name,
        type: ss.name === 'FORMAÇÃO' ? 'formation' : 'elective'
        // ✅ Remove: activities, tipo, order
      }
    })
  
  return { ...config, sharedSeries: newSharedSeries }
}

// Chamar em db.js durante hydrate se needed:
if (loadedConfig?.sharedSeries?.[0]?.activities) {
  loadedConfig = migrateSharedSeriesToNewFormat(loadedConfig)
}
```

**Também migrar schedules existentes:**

```js
// Encontrar todos os schedules com subjectId que refere a activity antiga
// schedule.subjectId: "formation-atpcg" → schedule.subjectId: null
const newSchedules = schedules.map(s => {
  const isOldActivityId = sharedSeries.some(ss =>
    ss.activities?.some(a => a.id === s.subjectId)
  )
  if (isOldActivityId) {
    return { ...s, subjectId: null }
  }
  return s
})
```

---

## Fora do Escopo (v1)

- Permissões granulares por turma compartilhada (restringir quais professores podem usar cada turma)
- Histórico de alterações nas turmas compartilhadas (audit trail)
- Importação/exportação de turmas compartilhadas via CSV
- Relatórios específicos por turma compartilhada
- Cores customizadas por turma compartilhada
- Atividades dentro de turmas compartilhadas (mantém compatibilidade atual, mas não usa)

---

## Checklist de Implementação

### Estrutura de Dados
- [ ] Remover campo `activities[]` de `sharedSeries`
- [ ] Remover campos `tipo` e `order` de estruturas antigas
- [ ] Adicionar campo `type: "formation" | "elective"` a cada `sharedSeries`
- [ ] Criar função de migração `migrateSharedSeriesToNewFormat()`
- [ ] Criar função de migração de `schedules` para setar `subjectId = null` para turmas compartilhadas

### Lógica de Negócio (`src/lib/absences.js`)
- [ ] Revisar `_calcStatus(slots, sharedSeries)` — FORMAÇÃO não demanda substituto
- [ ] Revisar `monthlyLoad()` — aulas FORMAÇÃO contam, mas ausências FORMAÇÃO não
- [ ] Revisar `rankCandidates()` — notar que turmas compartilhadas têm score sempre 4
- [ ] Adicionar parâmetro `sharedSeries` a funções que precisam

### Helpers (`src/lib/helpers.js`)
- [ ] Criar `isSharedSeries(turmaName, sharedSeries)` — detecta turma compartilhada
- [ ] Revisar `isFormacao()` — agora deve chamar `isSharedSeries()` em vez de hardcoded

### UI — Configurações (`/settings?tab=shared`)
- [ ] Criar nova aba "Turmas Compartilhadas"
- [ ] Listar turmas com badge de tipo ("Formação" ou "Eletiva")
- [ ] Modal de criar/editar com campo de tipo seletor
- [ ] Modal de confirmação com contagem de aulas em uso
- [ ] Validação de unicidade de nome (case-insensitive)

### UI — Grade Horária (`SchedulePage`)
- [ ] Revisar modal de adição de aula
- [ ] Ao selecionar turma compartilhada, não exibir campo de atividade/matéria
- [ ] Ao salvar, setar `subjectId = null` para turmas compartilhadas
- [ ] Atualizar exibição de células: mostrar apenas nome da turma

### UI — Grade Escolar (`SchoolSchedulePage`)
- [ ] Atualizar renderização de células — mostrar apenas nome da turma compartilhada
- [ ] Suportar múltiplas células no mesmo slot com professores diferentes

### Testes
- [ ] Testar migração de dados: schedules antigos com `subjectId = "formation-atpcg"` → `null`
- [ ] Testar ausência FORMAÇÃO: não gera demanda de substituto
- [ ] Testar ausência ELETIVA: gera demanda de substituto
- [ ] Testar cálculo de monthlyLoad: FORMAÇÃO não conta em ausência
- [ ] Testar exclusão protegida: não permite deletar turma em uso

---

## Estimativa de Impacto

| Área | Mudanças | Risco | Complexidade |
|---|---|:---:|:---:|
| **Dados** | Remoção de `activities[]`, adição de `type` | Baixo | Baixa |
| **Lógica de Ausências** | Revisão de 3 funções (`_calcStatus`, `monthlyLoad`, `rankCandidates`) | Médio | Média |
| **Grade Horária** | Remoção de campo de matéria ao selecionar turma compartilhada | Baixo | Baixa |
| **Configuração** | Nova aba de gerenciamento de turmas | Baixo | Baixa |
| **Migração** | One-shot migration de dados existentes | Alto | Média |

**Esforço total estimado:** 40–60 horas de desenvolvimento + testes

---

## Referências Cruzadas

- **Spec anterior:** `spec_turmas_compartilhadas_dinamicas.md` — contexto de por que turmas compartilhadas existem
- **Arquivo de lógica:** `src/lib/absences.js` — funções impactadas
- **Arquivo de helpers:** `src/lib/helpers.js` — funções de detecção
- **Arquitetura:** `references/architecture.md` — seção 4 (Modelo de Dados)
