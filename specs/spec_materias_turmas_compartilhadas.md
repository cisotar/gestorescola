# Spec: Matérias em Turmas Compartilhadas

## Visão Geral

Turmas compartilhadas (`sharedSeries`) atualmente armazenam apenas nome e tipo. Esta feature adiciona um campo `subjects: string[]` à estrutura, permitindo que o admin cadastre uma lista de matérias para cada turma compartilhada. Quando um professor seleciona uma dessas turmas ao montar sua grade horária, um segundo select é exibido para ele escolher qual matéria ministrou. A matéria escolhida é salva no schedule como `sharedSubject` e exibida na grade horária abaixo do nome da turma.

O objetivo é dar visibilidade granular do conteúdo ministrado em turmas de formação e eletivas, sem alterar a lógica de exigência de substituto (que permanece no nível da turma via `type`).

---

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS 3 (padrão do projeto)
- Estado global: Zustand (`useAppStore`)
- Banco de dados: Firestore — coleção `schedules/` e documento `meta/config`
- Cache: LocalStorage `gestao_v7_cache` (incrementar chave para `gestao_v8_cache` por mudança de schema)

---

## Páginas e Rotas

### Settings — Turmas Compartilhadas — `/settings?tab=shared-series`

**Descrição:** Aba existente gerenciada por `TabSharedSeries.jsx`. Cada card de turma compartilhada ganha uma seção colapsável (ou inline) para gerenciar sua lista de matérias.

**Componentes:**
- `TabSharedSeries` (existente): recebe a nova seção de matérias inline nos cards
- `SharedSeriesModal` (existente, dentro de `TabSharedSeries.jsx`): NÃO precisa de mudanças — o gerenciamento de matérias ocorre diretamente no card da aba, não no modal de criação/edição
- `SubjectListInline` (novo, uso único — definir no mesmo arquivo `TabSharedSeries.jsx`): seção interna do card que lista matérias e permite adicionar/remover

**Behaviors:**
- [ ] Exibir lista: dentro de cada card de turma compartilhada, exibir a lista de matérias cadastradas em `series.subjects` (default `[]`); se vazia, exibir mensagem "Nenhuma matéria cadastrada"
- [ ] Adicionar matéria: exibir campo de texto (input `inp`) com botão "Adicionar"; ao submeter, trim o valor; se vazio, ignorar; se já existir na lista (case-insensitive), exibir alerta "Matéria já cadastrada"; caso contrário, chamar `store.updateSharedSeries(series.id, { subjects: [...series.subjects, novaMateria] })` e exibir toast de confirmação
- [ ] Adicionar via Enter: pressionar Enter no campo de texto deve acionar o mesmo comportamento de submissão do botão "Adicionar"
- [ ] Remover matéria: cada item da lista tem botão "×" (ou ícone de lixeira); ao clicar, remover a matéria do array via `store.updateSharedSeries(series.id, { subjects: series.subjects.filter(s => s !== materia) })` e exibir toast
- [ ] Persistência: `updateSharedSeries` já chama `saveConfig(get())` — não é necessária lógica adicional de persistência
- [ ] Turmas tipo `rest` não exibem seção de matérias: slots de descanso não têm matéria; a seção é omitida quando `series.type === 'rest'`
- [ ] Retrocompatibilidade de leitura: turmas sem campo `subjects` são tratadas como `subjects ?? []` — sem erro de renderização

---

### Grade Horária (professor) — `/schedule`

**Descrição:** `SchedulePage.jsx` renderiza `ScheduleGrid`, que abre `AddScheduleModal` ao clicar em "＋" numa célula. Quando o professor seleciona uma turma compartilhada que tem `subjects.length > 0`, um segundo select deve aparecer para a escolha da matéria.

**Componentes:**
- `AddScheduleModal` (`src/components/ui/AddScheduleModal.jsx`, existente): recebe mudança para exibir o segundo select condicionalmente
- `ScheduleGrid` (`src/components/ui/ScheduleGrid.jsx`, existente): exibe `sharedSubject` abaixo do nome da turma nas células

**Behaviors:**
- [ ] Detectar turma compartilhada com matérias: ao selecionar uma pill de turma compartilhada em `AddScheduleModal`, verificar se `selectedSharedSeries.subjects?.length > 0`
- [ ] Exibir select de matéria da turma compartilhada: se a condição acima for verdadeira, renderizar um `<select className="inp">` com opção vazia padrão "Selecione a matéria…" e as opções da lista `subjects` da turma; o select deve aparecer após a seção "Turmas Compartilhadas" e antes do botão "Adicionar"
- [ ] Ocultar select quando não aplicável: se `subjects` estiver vazio, se a turma selecionada não for compartilhada ou se for do tipo `rest`, o select de matéria da turma compartilhada NÃO é exibido (comportamento atual preservado)
- [ ] Validar seleção de matéria: se a turma compartilhada tem `subjects.length > 0`, a matéria da turma é obrigatória; bloquear o botão "Adicionar" (ou exibir alerta) se `sharedSubject` estiver vazio
- [ ] Salvar `sharedSubject` no schedule: ao chamar `onSave`, incluir o campo `sharedSubject: string | null` no objeto; `null` quando turma não compartilhada ou quando `subjects` vazio; string com o nome da matéria nos demais casos
- [ ] Resetar select ao trocar turma: ao clicar em outra turma (compartilhada ou regular), resetar `sharedSubject` para `''`
- [ ] Estado local do select: adicionar `const [sharedSubject, setSharedSubject] = useState('')` em `AddScheduleModal`

---

### Grade Horária — exibição de slots — `/schedule` e `/school-schedule`

**Descrição:** Células da `ScheduleGrid` exibem atualmente o nome da turma (`s.turma`) e a matéria (`subjLabel`). Para slots de turmas compartilhadas com `sharedSubject` preenchido, exibir a matéria da turma abaixo do nome, em fonte menor.

**Componentes:**
- `ScheduleGrid` (`src/components/ui/ScheduleGrid.jsx`): ajuste na renderização do mini-card de cada schedule dentro das células
- `SchoolGrid` (`src/components/ui/SchoolGrid.jsx`): verificar se há renderização similar que precise do mesmo ajuste

**Behaviors:**
- [ ] Exibir `sharedSubject` no card da célula: quando `s.sharedSubject` existir (truthy), renderizar uma terceira linha no mini-card da célula abaixo de `subjLabel`, com `text-[9px] text-t3 truncate italic` contendo o valor de `s.sharedSubject`
- [ ] Não exibir linha extra quando ausente: se `s.sharedSubject` for `null`, `undefined` ou string vazia, a terceira linha não é renderizada (retrocompatibilidade total com schedules existentes)
- [ ] Aplicar em ambos os tipos de slot: a exibição se aplica tanto a slots regulares (`_tipo === 'regular'`) quanto a slots especiais (`_tipo === 'especial'`) na `ScheduleGrid`

---

## Componentes Compartilhados

- `AddScheduleModal` (`src/components/ui/AddScheduleModal.jsx`): usado em `ScheduleGrid`; recebe novos estados e lógica de `sharedSubject`
- `ScheduleGrid` (`src/components/ui/ScheduleGrid.jsx`): usado em `SchedulePage` e `SchoolSchedulePage`; exibe `sharedSubject` nos mini-cards

---

## Modelos de Dados

### `meta/config` — `sharedSeries[]` (campo novo: `subjects`)

```js
// Antes
{ id: 'shared-formacao', name: 'FORMAÇÃO', type: 'formation' }

// Depois
{
  id: 'shared-formacao',
  name: 'FORMAÇÃO',
  type: 'formation',
  subjects: ['ATPCG', 'ATPCA', 'Reunião Pedagógica']  // string[], default []
}
```

Campo `subjects` é **opcional e retrocompatível**: turmas sem o campo continuam funcionando normalmente. Todo acesso ao campo deve usar `series.subjects ?? []`.

### `schedules/` (campo novo: `sharedSubject`)

```js
// Antes
{
  id: 'mx3p9q1',
  teacherId: 'lv9k2a7',
  day: 'Segunda',
  timeSlot: 'seg-fund|manha|1',
  turma: 'FORMAÇÃO',
  subjectId: null
}

// Depois
{
  id: 'mx3p9q1',
  teacherId: 'lv9k2a7',
  day: 'Segunda',
  timeSlot: 'seg-fund|manha|1',
  turma: 'FORMAÇÃO',
  subjectId: null,
  sharedSubject: 'ATPCG'   // string | null — null quando turma não compartilhada ou subjects vazio
}
```

Campo `sharedSubject` é **opcional e retrocompatível**: schedules existentes sem o campo são exibidos normalmente (a terceira linha do mini-card simplesmente não é renderizada).

---

## Regras de Negócio

1. **Matéria da turma compartilhada vs. matéria do professor:** São conceitos distintos. `sharedSubject` é o nome textual livre escolhido da lista `series.subjects`. `subjectId` (matéria do professor) permanece independente e continua sendo salvo ou não conforme a lógica atual. Para turmas `formation`, `subjectId` geralmente é `null`; esta feature não altera esse comportamento.

2. **Exigência de substituto não muda:** A lógica de `isFormationSlot` e `isRestSlot` em `src/lib/helpers/turmas.js` é determinada pelo `type` da turma compartilhada, não pelas matérias. Adicionar matérias a uma turma do tipo `formation` não a torna uma turma que exige substituto.

3. **Matéria obrigatória apenas se lista não-vazia:** Se o admin não cadastrar nenhuma matéria em uma turma compartilhada, o fluxo do professor permanece idêntico ao atual (sem segundo select). A obrigatoriedade de escolher `sharedSubject` existe apenas quando `subjects.length > 0`.

4. **Edição posterior:** O professor pode editar um schedule existente para adicionar ou alterar o `sharedSubject`. Isso ocorre via `updateSchedule` já existente no store — basta incluir `sharedSubject` no payload de mudanças.

5. **Nomes de matérias são texto livre:** Não há normalização automática. "ATPCG" e "atpcg" são consideradas duplicatas pelo admin apenas na validação case-insensitive durante o cadastro. O valor é armazenado e exibido exatamente como digitado.

6. **Cache LocalStorage:** A adição do campo `subjects` em `sharedSeries` (que faz parte de `meta/config`) e do campo `sharedSubject` em `schedules/` constituem mudanças de schema. A chave do cache deve ser incrementada de `gestao_v7_cache` para `gestao_v8_cache` para forçar limpeza em todos os clientes ativos ao fazer deploy.

7. **Coordenadores e aprovação:** `updateSharedSeries` chama `saveConfig` diretamente (não é uma das 20 actions guardadas pelo fluxo de aprovação). Admins são os únicos com acesso à aba de turmas compartilhadas — não há risco de interceptação.

---

## Fora do Escopo (v1)

- **Reordenação de matérias:** A lista é exibida na ordem de inserção. Drag-and-drop ou reordenação manual não serão implementados.
- **Matérias como entidades próprias:** `subjects` são strings livres, não referências a `subjects[]` (as matérias formais do sistema). Não há FK, ID ou vínculo com áreas de conhecimento.
- **Filtro/busca de grade por `sharedSubject`:** `SchoolSchedulePage` e relatórios não serão alterados para suportar filtro por matéria de turma compartilhada.
- **Exibição de `sharedSubject` em ausências e substituições:** Os fluxos de criação de ausência e ranking de substitutos não consomem `sharedSubject`. Ele é puramente informativo na grade horária.
- **Histórico de matérias:** Não há rastreamento de qual matéria foi ministrada em cada data específica — `sharedSubject` é um campo do schedule recorrente, não do slot de ausência.
- **Importação/exportação de matérias:** Sem CSV ou bulk-add de matérias via lista.
