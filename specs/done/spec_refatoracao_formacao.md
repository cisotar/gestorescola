# Spec: Refatoração — Registro de Atividades de Formação

## Visão Geral

Refatoração do modelo de registro de atividades de formação docente (ATPCG, ATPCA, Multiplica, PDA, Alinhamento). O modelo atual armazena o nome completo da atividade como `turma` (ex: `"FORMAÇÃO - ATPCG"`), deixando `subjectId` nulo. O novo modelo simplifica: a `turma` é sempre `"FORMAÇÃO"` e a diferenciação da atividade ocorre exclusivamente pelo `subjectId`, que aponta para um conjunto de matérias de formação hardcoded. Isso elimina a redundância visual, padroniza os dados e permite adicionar novas atividades sem alterar a lógica de conflito.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite, Tailwind CSS
- **Estado global:** Zustand (`useAppStore`)
- **Banco de dados:** Firebase Firestore (coleção `schedules`)
- **Auth:** Firebase Auth

---

## Diagnóstico do Modelo Atual

| Campo | Valor atual | Problema |
|---|---|---|
| `turma` | `"FORMAÇÃO - ATPCG"` | Nome redundante; lógica de detecção por string frágil |
| `subjectId` | `null` | Atividade não diferenciada por matéria — sem filtros possíveis |
| Detecção | `isFormationSeries(turma)` via array | Quebra se o nome mudar; difícil de estender |
| AddSlotModal | Pills de série completa | Bypassa completamente a seleção de matéria |

---

## Modelo Proposto

| Campo | Valor novo |
|---|---|
| `turma` | `"FORMAÇÃO"` (sempre, para qualquer atividade) |
| `subjectId` | ID hardcoded da atividade (ex: `"formation-atpcg"`) |
| Detecção | `isFormationTurma(turma)` → `turma === 'FORMAÇÃO'` |
| AddSlotModal | Seleciona turma "FORMAÇÃO" + matéria de formação do professor |

---

## Páginas e Rotas

### 1. AddScheduleModal — dentro de `SettingsPage` e `PendingPage`

**Descrição:** Modal de adição de aula. A seção "Formação" é refatorada: em vez de pills com o nome completo da atividade, exibe um único botão "FORMAÇÃO" (que define `turma`) e, ao selecioná-lo, mostra o seletor de matéria com as opções de formação hardcoded.

**Behaviors:**
- [ ] **Selecionar turma FORMAÇÃO:** botão único "FORMAÇÃO" aparece na seção separada do modal; ao clicar, define `turma = 'FORMAÇÃO'` e limpa a seleção de Série/Turma regular
- [ ] **Selecionar atividade pela matéria:** após escolher FORMAÇÃO, o seletor de matéria exibe as matérias de formação hardcoded (ATPCG, ATPCA, Multiplica, PDA, Alinhamento) em lugar das matérias regulares do professor
- [ ] **Salvar registro:** `onSave({ turma: 'FORMAÇÃO', subjectId: <id-hardcoded>, ... })` — `turma` e `subjectId` ambos preenchidos
- [ ] **Sem conflito de turma:** ao salvar com `turma = 'FORMAÇÃO'`, o sistema não bloqueia por outros professores já terem FORMAÇÃO no mesmo slot
- [ ] **Conflito do próprio professor mantido:** professor que já tem qualquer entrada no slot não pode adicionar outra

---

### 2. ScheduleGrid — dentro de `SettingsPage`, `PendingPage`, `SchedulePage`

**Descrição:** Grade horária interativa. Células de formação exibem "FORMAÇÃO" como turma e o nome da matéria de formação como atividade.

**Behaviors:**
- [ ] **Exibir célula de formação:** chip mostra `"FORMAÇÃO"` como linha principal e o nome da matéria (ex: "ATPCG") como linha secundária — mesmo layout das aulas regulares
- [ ] **Badge Fixo/Variável:** ATPCG e ATPCA exibem badge azul "Fixo"; Multiplica, PDA e Alinhamento exibem badge âmbar "Variável"
- [ ] **Remover entrada de formação:** botão ✕ funciona igual às aulas regulares via `removeSchedule`
- [ ] **Detecção de conflito atualizada:** `isFormationTurma(s.turma)` (verifica `s.turma === 'FORMAÇÃO'`) substitui `isFormationSeries(s.turma)` em todos os pontos de detecção

---

### 3. SchoolSchedulePage — `/grade-escolar`

**Behaviors:**
- [ ] **Exibir FORMAÇÃO na grade escolar:** células com `turma = 'FORMAÇÃO'` são exibidas com o nome da matéria de formação como identificador visual; não confundir com turmas regulares

---

### 4. Migração de Dados — script de one-shot

**Descrição:** Os schedules existentes com `turma` em `FORMATION_SERIES` precisam ser migrados para o novo modelo.

**Behaviors:**
- [ ] **Migrar turma:** `"FORMAÇÃO - ATPCG"` → `turma: "FORMAÇÃO"`, `subjectId: "formation-atpcg"`
- [ ] **Migrar todas as variantes:** ATPCA, MULTIPLICA, PDA mapeados para seus IDs hardcoded correspondentes
- [ ] **Executado como função pontual:** via função `migrateFormationSchedules()` em `db.js`, chamada manualmente pelo Admin ou via console

---

## Componentes Compartilhados

- **`AddScheduleModal`** (`src/pages/SettingsPage.jsx`, exportado): refatorado para usar `FORMATION_TURMA` e `FORMATION_SUBJECTS`
- **`ScheduleGrid`** (`src/pages/SettingsPage.jsx`, exportado): detecção de formação atualizada para `isFormationTurma`
- **`isFormationTurma`** (novo helper em `constants.js`): substitui `isFormationSeries`

---

## Modelos de Dados

### `schedules/{id}` — após refatoração

```
{
  id:        string,
  teacherId: string,
  turma:     'FORMAÇÃO',           // sempre esta string para formação
  subjectId: string,               // ID hardcoded da atividade (não null)
  day:       string,
  timeSlot:  string
}
```

### `FORMATION_SUBJECTS` — hardcoded em `constants.js`

```js
export const FORMATION_TURMA = 'FORMAÇÃO'

export const FORMATION_SUBJECTS = [
  { id: 'formation-atpcg',      name: 'ATPCG',      tipo: 'fixo'     },
  { id: 'formation-atpca',      name: 'ATPCA',      tipo: 'fixo'     },
  { id: 'formation-multiplica', name: 'Multiplica', tipo: 'variavel' },
  { id: 'formation-pda',        name: 'PDA',        tipo: 'variavel' },
  { id: 'formation-alinhamento',name: 'Alinhamento',tipo: 'variavel' },
]

export const isFormationTurma = (turma) => turma === FORMATION_TURMA
export const isFormationSubject = (subjectId) =>
  FORMATION_SUBJECTS.some(s => s.id === subjectId)
```

### Mapa de migração

| `turma` atual | `turma` novo | `subjectId` novo |
|---|---|---|
| `'FORMAÇÃO - ATPCG'` | `'FORMAÇÃO'` | `'formation-atpcg'` |
| `'FORMAÇÃO - ATPCA'` | `'FORMAÇÃO'` | `'formation-atpca'` |
| `'FORMAÇÃO - MULTIPLICA'` | `'FORMAÇÃO'` | `'formation-multiplica'` |
| `'FORMAÇÃO - PDA'` | `'FORMAÇÃO'` | `'formation-pda'` |

---

## Regras de Negócio

1. **`turma = 'FORMAÇÃO'` é compartilhada globalmente:** qualquer professor pode inserir FORMAÇÃO em qualquer slot sem conflito de turma — `isFormationTurma(s.turma)` bypassa o `hardBlockedTurmas`.
2. **`subjectId` é obrigatório para FORMAÇÃO:** ao salvar uma entrada de formação, `subjectId` deve ser um dos IDs de `FORMATION_SUBJECTS`; não pode ser `null`.
3. **Conflito do próprio professor mantido:** um professor não pode ter duas entradas no mesmo `timeSlot`/`day`, seja formação ou regular.
4. **IDs de formação são estáveis e hardcoded:** os IDs `"formation-*"` nunca são gerados por `uid()` — são constantes no código para garantir que a migração e a detecção funcionem de forma determinística.
5. **Matérias de formação não aparecem na seleção de matérias regulares:** `FORMATION_SUBJECTS` é uma lista separada; seus IDs não existem na coleção `subjects` do Firestore.
6. **Badge deriva do campo `tipo` da matéria de formação:** `tipo: 'fixo'` → badge azul "Fixo"; `tipo: 'variavel'` → badge âmbar "Variável".
7. **Formação conta como carga horária normal:** schedules com `turma = 'FORMAÇÃO'` são somados junto com aulas regulares em `WorkloadPage` e `monthlyLoad` — sem filtro especial.
8. **FORMAÇÃO aparece em EM e EF:** a turma FORMAÇÃO é transversal a todos os segmentos; não pertence a nenhum segmento específico e deve aparecer no modal de qualquer professor independentemente das matérias que leciona.

---

## Fora do Escopo (v1)

- Criação de novas atividades de formação pelo Admin via interface (lista é hardcoded)
- Relatório separado de horas de formação vs. horas de aula regular
- Validação de quais professores participam de qual atividade
- Notificação de convocação para reuniões de formação
- Cadastro em lote de ATPCG/ATPCA para múltiplos professores simultaneamente
