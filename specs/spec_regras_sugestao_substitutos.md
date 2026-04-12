# Spec: Regras Inteligentes de Sugestão de Substitutos

## Visão Geral
Implementar dois algoritmos de sugestão automática de professores substitutos (qualitativo e quantitativo) que auxiliam o administrador na seleção rápida, mantendo autonomia para escolher manualmente qualquer professor. As sugestões são exibidas como 3 pills no modal de atribuição de substituição, com a quantidade de aulas do mês em destaque.

**Problema resolvido:** Reduzir tempo de decisão ao atribuir substituições, oferecendo recomendações inteligentes sem limitar a liberdade do ADM.

---

## Stack Tecnológica
- Frontend: React 18.3.1 + React Router 6.26.0
- Estado: Zustand 4.5.4
- Backend: Firebase Firestore + Cloud Functions (futura)
- Estilização: Tailwind CSS 3.4.10
- Dados: `absences.js` (ranking), `useAppStore` (state)

---

## Páginas e Rotas

### Página de Substituições — `/calendar` ou `/calendar/day`
**Descrição:** Modal de atribuição de substituição ao clicar em um slot vazio no calendário. Exibe pills com sugestões inteligentes na parte superior, seguidas pela lista completa de professores para seleção manual.

**Componentes:**
- `SubstitutionModal`: modal principal
- `SuggestionPills`: container com 3 pills de sugestões (qualitativo ou quantitativo)
- `SuggestionPill`: pill individual com nome, regra ativa e total de aulas do mês
- `TeacherList`: lista completa de professores para seleção manual
- `ToggleRuleButtons`: botões "Qualitativo" e "Quantitativo"
- `DownloadComprovante`: botão para gerar PDF após atribuição

**Behaviors (o que o usuário pode fazer):**
- [ ] Alternar entre regra qualitativa e quantitativa via pills toggle
- [ ] Clicar em uma suggestion pill para atribuir rapidamente
- [ ] Visualizar total de aulas do mês para cada professor sugerido
- [ ] Ver lista completa de professores e selecionar manualmente qualquer um
- [ ] Confirmar atribuição e receber comprovante em PDF
- [ ] Fechar o modal clicando no botão fechar ou fora da área do modal

---

## Componentes Compartilhados

### `SuggestionPills`
Exibe 3 pills com professores sugeridos. Controlada por toggle "Qualitativo" / "Quantitativo".
- Props: `absenceSlot`, `ruleType` ('qualitative' | 'quantitative'), `onSelectSuggestion`
- Renderiza: 3 x `SuggestionPill` ou mensagem "Sem sugestões disponíveis"

### `SuggestionPill`
Pill clicável com nome do professor e total de aulas do mês.
- Props: `teacher`, `monthlyAulas`, `onClick`
- Estilo: background `accent-l`, borda `accent`, hover mais escuro
- Exibe: nome, ícone de checkmark, total de aulas

### `ToggleRuleButtons`
Dois botões lado a lado: "Qualitativo" e "Quantitativo".
- Props: `activeRule`, `onRuleChange`
- Estilos: ativo = `btn-dark`, inativo = `btn-ghost`

### `TeacherListWithWorkload`
Lista scrollável de todos os professores disponíveis, ordenados por carga.
- Props: `teachers`, `absenceSlot`, `onSelectTeacher`
- Para cada professor: nome + total de aulas do mês

---

## Modelos de Dados

### Absence (Ausência)
```js
{
  id: string,              // uid
  teacherId: string,       // professor ausente
  createdAt: timestamp,
  status: 'open' | 'partial' | 'covered',
  slots: [
    {
      slot: string,        // "seg-fund|manha|1"
      subId: string | null // professor substituto atribuído ou null
    }
  ]
}
```

### Teacher (Professor)
```js
{
  id: string,
  name: string,
  email: string,
  subjectIds: string[],    // matérias que leciona
  areaIds: string[],       // áreas (derivado de subjects)
  status: 'approved' | 'pending' | 'inactive'
}
```

### Schedule (Grade Horária)
```js
{
  id: string,
  teacherId: string,
  day: string,             // 'monday', 'tuesday', etc
  timeSlot: string,        // "seg-fund|manha|1"
  turma: string,
  subjectId: string
}
```

### Meta Config
```js
{
  segments: [
    { id: 'seg-fund', name: 'Fundamental', turnos: ['manha', 'tarde'] }
  ],
  subjects: [
    { id: 'sub-mat', name: 'Matemática', areaId: 'area-exatas' }
  ],
  areas: [
    { id: 'area-exatas', name: 'Ciências Exatas' }
  ],
  periodConfigs: { ... }
}
```

---

## Regras de Negócio

### 1. Regra Qualitativa
**Quando ativa:** Prioriza compatibilidade da matéria/área do professor ausente.

**Ordem hierárquica de sugestão:**
1. **Nível 1 (Máxima afinidade):** Professores que lecionam a mesma matéria do professor ausente
2. **Nível 2 (Afinidade alta):** Professores da mesma área de conhecimento
3. **Nível 3 (Fallback):** Outros professores da unidade

**Critério de desempate:** Se dois ou mais professores estão no mesmo nível hierárquico, sugerir o que tiver **menor quantidade de aulas dadas desde o início do mês até o momento** (`monthlyLoad`).

**Resultado:** Top 3 professores com melhor score qualitativo.

**Cálculo:**
```js
score(teacher) = (hierarchyLevel * 1000) + (monthlyLoad)
// Menor score vence (nível baixo + poucas aulas)
```

### 2. Regra Quantitativa
**Quando ativa:** Ignora matéria/área e foca apenas em distribuição equilibrada de carga.

**Função:** As 3 sugestões automáticas serão **obrigatoriamente os 3 professores com o menor número total de aulas dadas no mês** (incluindo aulas fixas na grade + substituições já realizadas).

**Cálculo:**
```js
candidates = todos os professores disponíveis
ordenar por monthlyLoad(teacherId, referenceDate) crescente
retornar top 3
```

### 3. Exibição de Informações
**Campo substituído:** Em vez de exibir "horas", exibir **quantidade de aulas dadas desde o início do mês até o momento**.

**Formato:** "12 aulas" ou "2 aulas" (singular/plural).

**Onde aparece:**
- Nas 3 suggestion pills (lado do nome)
- Na lista completa de professores (ao lado de cada um)
- Recalculado em tempo real ao confirmar cada atribuição

### 4. Autonomia do Administrador
As regras servem apenas para **sugestões rápidas**. O ADM **sempre pode**:
- Visualizar a lista completa de professores (abaixo das pills)
- Selecionar **qualquer professor** da lista, independentemente das regras
- Clicar fora das pills para ver a lista expandida

**Comportamento:** Sugestões não são obrigatórias — apenas atalhos.

### 5. Finalização e Fechamento
- **Download de comprovante:** Após atribuir, botão "Baixar PDF" fica disponível (usa `reports.js`)
- **Fechar modal:** Clicando no botão "✕", pressionando Escape, ou clicando fora da área do modal

---

## Fluxo de Interação

```
1. ADM clica no slot vazio (timeSlot ausente)
   ↓
2. SubstitutionModal abre
   ├─ Toggle: Qualitativo / Quantitativo (padrão: Qualitativo)
   ├─ 3 suggestion pills aparecem
   └─ Lista completa abaixo
   ↓
3. ADM escolhe:
   a) Clicar em uma pill → atribui imediatamente (rápido)
   b) Selecionar na lista → atribui (manual)
   ↓
4. Absência atualizada em Firestore
   ↓
5. "Baixar PDF" fica habilitado
   ↓
6. Modal fecha (manual ou auto-close)
```

---

## Implementação Técnica

### Função Principal: `suggestSubstitutes(absenceSlot, ruleType)`
**Localização:** `src/lib/absences.js`

**Assinatura:**
```js
export const suggestSubstitutes = (
  absenceSlot,    // { slot: "seg-fund|manha|1", absentTeacherId: "..." }
  ruleType,       // 'qualitative' | 'quantitative'
  store           // referência ao useAppStore
) => {
  // Retorna array de 3 teacher objects ordenado por score descrescente
  // ou menos se houver menos de 3 disponíveis
  return [teacher1, teacher2, teacher3]
}
```

### Lógica de Qualitativo
```js
if (ruleType === 'qualitative') {
  const absentTeacher = store.teachers.find(t => t.id === absenceSlot.absentTeacherId)
  const absentSubject = absentTeacher.subjectIds[0] // ou todos
  const absentArea = config.subjects.find(s => s.id === absentSubject)?.areaId

  const candidates = store.teachers.filter(t => t.status === 'approved' && !isBusy(...))
  
  // Score = (hierarchyLevel * 1000) + monthlyLoad
  const scored = candidates.map(teacher => {
    let hierarchyLevel = 3 // default: outro professor
    
    if (teacher.subjectIds.includes(absentSubject)) {
      hierarchyLevel = 1 // mesma matéria
    } else if (teacher.areaIds.includes(absentArea)) {
      hierarchyLevel = 2 // mesma área
    }
    
    const load = monthlyLoad(teacher.id, referenceDate, store)
    return { teacher, score: hierarchyLevel * 1000 + load }
  })

  return scored.sort((a, b) => a.score - b.score).slice(0, 3)
}
```

### Lógica de Quantitativo
```js
if (ruleType === 'quantitative') {
  const candidates = store.teachers.filter(t => t.status === 'approved' && !isBusy(...))
  
  const withLoads = candidates.map(teacher => ({
    teacher,
    load: monthlyLoad(teacher.id, referenceDate, store)
  }))

  return withLoads.sort((a, b) => a.load - b.load).slice(0, 3)
}
```

### Função Existente: `monthlyLoad(teacherId, referenceDate, store)`
Já existe em `absences.js`. Retorna total de aulas (fixas + substituições) no mês da `referenceDate`.

### Função Existente: `isBusy(teacherId, date, timeSlot, ...)`
Já existe. Detecta conflito de horário na grade fixa.

### Estado no Modal
```js
const [ruleType, setRuleType] = useState('qualitative')
const suggestions = useMemo(
  () => suggestSubstitutes(absenceSlot, ruleType, store),
  [absenceSlot, ruleType, store]
)
```

---

## Especificação de UI

### Suggestion Pills Container
```
┌──────────────────────────────────────────────┐
│ Regra:  [Qualitativo]  [Quantitativo]        │
├──────────────────────────────────────────────┤
│ ┌──────────────┬──────────────┬────────────┐ │
│ │ Maria Silva  │ João Santos  │ Ana Costa  │ │
│ │ 8 aulas      │ 7 aulas      │ 6 aulas    │ │
│ └──────────────┴──────────────┴────────────┘ │
└──────────────────────────────────────────────┘
```

**Estilo das pills:**
- Background: `bg-accent-l` (#FFF7ED)
- Borda: `border border-accent` (#C05621)
- Padding: `px-4 py-3`
- Raio: `rounded-lg`
- Cursor: pointer, hover = background mais escuro

**Toggle buttons:**
- Ativo: `btn-dark` (navy preenchido)
- Inativo: `btn-ghost` (transparente com borda)
- Spacing: gap-2 entre botões

### Lista Completa
Abaixo das pills, scrollável, com todos os professores não sugeridos + os sugeridos desmarcados:
```
┌─────────────────────────────┐
│ Professor         │ 8 aulas │
│ Professor         │ 7 aulas │
│ Professor         │ 6 aulas │
│ ...                         │
└─────────────────────────────┘
```

---

## Fora do Escopo (v1)
- [ ] Configuração de pesos/prioridades das regras (fixo por spec)
- [ ] Regras customizadas por segmento/área/matéria
- [ ] Machine learning ou análise de padrões históricos
- [ ] Notificações automáticas ao professor substituto
- [ ] Agendamento prévio de substituições (v+1)
- [ ] Integração com SMS/WhatsApp de confirmação
- [ ] Relatório de desempenho do substituto vs professor ausente
- [ ] Bloqueio de certos professores para certas substituições
- [ ] Lógica de "professor preferido" configurável
