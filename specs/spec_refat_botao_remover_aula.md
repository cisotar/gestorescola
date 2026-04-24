# Spec: Refatoração do Botão de Remover Aula no ScheduleGrid

## Visão Geral

O botão de remoção de aula no componente `ScheduleGrid` usa atualmente um caractere "×" com `opacity-50` em repouso e `hover:opacity-100`. A proposta substitui esse elemento por um botão visualmente mais forte — fundo vermelho (`bg-err`) com ícone SVG de cesto de lixo — que aparece apenas no hover do card que o contém.

O problema atual: o "×" é visualmente ambíguo (confunde com outros fechamentos de UI), tem área de toque pequena e não comunica claramente que é uma ação destrutiva de remoção.

## Stack Tecnológica

- Frontend: React + Tailwind CSS
- Ícones: SVG inline (sem biblioteca externa)
- Arquivo alvo: `src/components/ui/ScheduleGrid.jsx`
- Tokens de design: conforme `references/design-system.md`

## Páginas e Rotas

### ScheduleGrid — componente sem rota própria

**Descrição:** Grade de horários (dias x aulas) renderizada em TabSchedules e ScheduleGridModal. Cada slot ocupado exibe um card com turma e matéria. O botão de remoção está dentro desse card.

**Componentes afetados:**

- Card regular (linha `_tipo === 'regular'`, fundo `bg-surf2`): linhas 223–243 do arquivo atual
- Card especial (linha `_tipo === 'especial'`, fundo `bg-white`): linhas 333–354 do arquivo atual

**Behaviors:**

- [ ] Ocultar o botão de remoção em repouso: o botão deve ter `opacity-0` por padrão e `group-hover:opacity-100` quando o card pai recebe hover
- [ ] Adicionar classe `group` ao `<div>` do card para acionar o seletor `group-hover` no botão filho
- [ ] Renderizar o botão com fundo vermelho sólido: usar `bg-err` (token `#C8290A`) e texto/ícone `text-white`
- [ ] Posicionar o botão com `absolute` no canto superior direito do card: `absolute -top-2 -right-2` (sobreposto levemente para fora do card) ou `absolute top-0.5 right-0.5` (dentro do card) — ver decisão abaixo
- [ ] Usar ícone SVG de cesto de lixo inline: sem dependência externa, SVG com `width="12" height="12"` dentro do botão
- [ ] Manter `onClick={() => removeSchedule(s.id)}` sem alteração
- [ ] Manter `aria-label="Remover aula"` para acessibilidade (botão sem texto visível)
- [ ] Aplicar `rounded` (8px conforme design system) e `p-1` ao botão
- [ ] Adicionar `transition-opacity duration-150` para suavizar o aparecimento
- [ ] Aplicar a mesma mudança nos dois tipos de card (regular e especial) — comportamento idêntico
- [ ] Garantir que o botão não acione drag: adicionar `onMouseDown={e => e.stopPropagation()}` para não conflitar com o `draggable` do card pai

---

## Componentes Compartilhados

- `ScheduleGrid` (exportado de `src/components/ui/ScheduleGrid.jsx`): usado em `TabSchedules` e `ScheduleGridModal`. A alteração é interna ao componente; nenhum consumer precisa ser atualizado.

## Modelos de Dados

Nenhuma alteração em modelos de dados. A lógica de `removeSchedule(s.id)` permanece intacta.

## Regras de Negócio

- O botão de remoção só é renderizado quando `readOnly === false` — essa condicional não muda.
- O hover que aciona a visibilidade do botão é no card (`<div>` com `relative`), não na célula da tabela.
- Posicionamento decidido: `absolute top-0.5 right-0.5` (dentro do card, sem sobrepor células vizinhas) — consistente com o comportamento atual, apenas substituindo o visual.
- O card já possui `relative` — necessário para o `absolute` do botão funcionar.
- O card já possui `cursor-grab` quando `!readOnly` — a classe `group` não conflita com isso.

## SVG do ícone de cesto de lixo

SVG inline recomendado (12x12, stroke-based para leveza visual):

```jsx
<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
  <polyline points="3 6 5 6 21 6" />
  <path d="M19 6l-1 14H6L5 6" />
  <path d="M10 11v6" />
  <path d="M14 11v6" />
  <path d="M9 6V4h6v2" />
</svg>
```

## Estrutura final do botão (referência de implementação)

```jsx
{!readOnly && (
  <button
    className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 bg-err text-white rounded p-1 transition-opacity duration-150"
    onClick={() => removeSchedule(s.id)}
    onMouseDown={e => e.stopPropagation()}
    aria-label="Remover aula"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  </button>
)}
```

E o `<div>` do card deve ganhar a classe `group`:

```jsx
// Card regular — antes
className={`relative bg-surf2 border border-bdr rounded-lg p-1.5 text-[11px]${!readOnly ? ' cursor-grab' : ''}`}

// Card regular — depois
className={`group relative bg-surf2 border border-bdr rounded-lg p-1.5 text-[11px]${!readOnly ? ' cursor-grab' : ''}`}

// Card especial — antes
className={`relative bg-white border border-bdr rounded-lg p-1.5 text-[11px]${!readOnly ? ' cursor-grab' : ''}`}

// Card especial — depois
className={`group relative bg-white border border-bdr rounded-lg p-1.5 text-[11px]${!readOnly ? ' cursor-grab' : ''}`}
```

## Fora do Escopo (v1)

- Confirmação antes de remover (modal "Tem certeza?") — remoção continua direta, sem confirmação
- Animação de saída do card ao remover
- Tooltip no botão de remoção
- Refatoração do drag-and-drop ou de qualquer outra funcionalidade do ScheduleGrid
- Alterações no `ScheduleGridModal`
- Responsividade mobile para o botão (grade horária já é desktop-only por design)
