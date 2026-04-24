# Spec: Refatoração de Estilo — Frame de Grade Horária em PendingPage

## Visão Geral

Refatoração de layout e estilo do step `schedule` na `PendingPage` (etapa de cadastro de nova professor). O frame "Preencha sua grade horária" deve expandir para ocupar quase toda a largura disponível, permitindo que a `ScheduleGrid` seja exibida em maior detalhe. Além disso, aplicar bloqueios visuais (padrão diagonal) nos horários já preenchidos pelo professor (par entrada/saída por dia), tornando claro quais períodos estão indisponíveis para aulas.

## Stack Tecnológica

- **Frontend:** React 18 + TypeScript (JSX), Tailwind CSS
- **Componentes:** PendingPage (co-localizados), ScheduleGrid (importado)
- **Estilo:** Tailwind CSS + classes customizadas em `index.css`
- **Ícones/Padrões:** SVG ou CSS linear-gradient para diagonal strikethrough

---

## Páginas e Rotas

### PendingPage — `/` (role=pending, step='schedule')

**Descrição:** Step `schedule` (2º de 3 passos do onboarding). Usuário já preencheu dados pessoais, matérias e horários de trabalho (entrada/saída). Agora cadastra aulas na grade horária semanal. Layout deve ser mais horizontal para aproveitar melhor o espaço.

**Componentes:**

- **Coluna Esquerda (resumo — pode encolher):**
  - `DadosEnviadosCard`: resumo de dados (nome, email, whatsapp, matérias)
  - `ContadorAulas`: exibe X aula(s) cadastrada(s) + aviso se vazio
  - `BotaoConcluir`: botão desabilitado se `myScheduleCount === 0`

- **Coluna Direita (expandido):**
  - `ScheduleGrid`: grade de 5 dias × N períodos, onde:
    - Células com horários bloqueados (entrada/saída preenchidos) mostram padrão diagonal
    - Células disponíveis (fora dos horários preenchidos) permitem clicar para adicionar aula
    - Cada dia mostra: Segunda, Terça, Quarta, Quinta, Sexta

**Behaviors:**

- [ ] Frame principal ocupa quase toda a largura da tela (remover padding/margin excessivos)
- [ ] Coluna direita (ScheduleGrid) é expandida ao máximo
- [ ] Coluna esquerda fica em tamanho fixo reduzido (ex: 200-280px) ou float-left
- [ ] Células de horários bloqueados exibem padrão diagonal (strikethrough visual)
- [ ] Ao hover, bloqueados mostram dica: "Indisponível (seu horário de trabalho)"
- [ ] Usuário pode adicionar aual em células disponíveis
- [ ] Contagem de aulas atualiza em tempo real ao adicionar/remover

---

## Componentes Compartilhados

**ScheduleGrid** (`src/components/ui/ScheduleGrid.jsx`):
- Grade semanal (Segunda–Sexta) × períodos por turno
- Props: `teacher`, `store`
- Comportamento: renderiza células clicáveis para aulas, marcadas com "bloqueadas" se fora do horário de trabalho
- Nesta refat: será expandido e receberá estilo diagonal para horários bloqueados

---

## Modelos de Dados

### `horariosSemana` (state em PendingPage)

```js
{
  "Segunda": { entrada: "07:00", saida: "12:30" },
  "Terça": { entrada: "07:00", saida: "12:30" },
  // ... demais dias (vazio se não trabalha nesse dia)
}
```

### `schedules` (Firestore, estado em store.schedules)

```js
{
  id: "mx3p9q1",
  teacherId: user.uid,
  day: "Segunda",
  timeSlot: "seg-fund|manha|1",
  turma: "6º Ano A",
  subjectId: "subj-bio"
}
```

---

## Regras de Negócio

1. **Bloqueio visual por horário:** Horários fora do par entrada/saída do dia devem ser visualmente bloqueados (padrão diagonal, cor amortecida).

2. **Largura de frame:** O container do step `schedule` deve ocupar ~90-95% da tela, não ~max-w-4xl como antes.

3. **Responsividade:** Em mobile (< 768px), manter layout empilhado (coluna esquerda acima, direita abaixo) ou ocultá-la inteiramente.

4. **Clareza de estado:** Bloqueados devem ser visuamente distintos (não apenas desabilitados, mas com padrão diagonal ou cor diferente).

---

## Alterações Cirúrgicas Necessárias

### 1. Alterar largura do container (PendingPage.jsx, linha ~244)

**Antes:**
```jsx
const containerMax = step === 'schedule' ? 'max-w-5xl' : 'max-w-4xl'
```

**Depois:**
```jsx
const containerMax = step === 'schedule' ? 'w-full lg:w-[95vw]' : 'max-w-4xl'
// Ou: const containerMax = step === 'schedule' ? 'max-w-7xl lg:max-w-[95vw]' : 'max-w-4xl'
```

### 2. Redimensionar grid do layout (PendingPage.jsx, linha ~381)

**Antes:**
```jsx
<div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
```

**Depois:**
```jsx
<div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-start">
// Ou: <div className="flex flex-col lg:flex-row gap-4">
```

Objetivo: reduzir coluna esquerda, aumentar direita.

### 3. Adicionar estilo de bloqueio diagonal (ScheduleGrid.jsx ou index.css)

**Nova classe em `index.css`:**
```css
.schedule-cell-bloqueado {
  background: repeating-linear-gradient(
    45deg,
    rgba(0, 0, 0, 0.05),
    rgba(0, 0, 0, 0.05) 10px,
    rgba(0, 0, 0, 0.1) 10px,
    rgba(0, 0, 0, 0.1) 20px
  );
  opacity: 0.6;
  cursor: not-allowed;
  position: relative;
}

.schedule-cell-bloqueado::after {
  content: "Indisponível";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.625rem;
  color: rgba(107, 103, 96, 0.5); /* t3 com opacidade */
  font-weight: 600;
}
```

Ou usando Tailwind com `@apply`:
```css
@layer components {
  .cell-blocked {
    @apply bg-opacity-60 cursor-not-allowed relative;
    background-image: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 10px,
      rgba(0, 0, 0, 0.05) 10px,
      rgba(0, 0, 0, 0.05) 20px
    );
  }
}
```

### 4. Aplicar classe em ScheduleGrid

Verificar `ScheduleGrid.jsx` e adicionar lógica:
- Para cada célula que corresponde a um horário fora do `horariosSemana[day].entrada` até `.saida`, aplicar classe `cell-blocked` ou similar
- Passar `horariosSemana` como prop de `ScheduleGrid` (se não já passar) para que possa detectar bloqueios

---

## Fora do Escopo (v1)

- Animações de transição ao alterar tamanho
- Customização de cor/padrão do bloqueio via admin
- Drag-and-drop de aulas (já existe, sem mudança)
- Responsividade muito detalhada para tablets (apenas mobile/desktop)
- Suporte a múltiplos turnos simultâneos na visualização (única grade por turno)

