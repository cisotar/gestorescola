# Design System — GestãoEscolar

**Atualizado:** 2026-04-08

---

## 1. Tokens de Cor

Definidos em `tailwind.config.js`. Usar sempre os tokens — nunca valores hex avulsos.

### Cores Base

| Token | Hex | Uso |
|---|---|---|
| `navy` | `#1A1814` | Botões primários, navbar, texto de maior peso |
| `accent` | `#C05621` | Destaque de marca, links ativos, `GestãoEscolar` logo |
| `accent-l` | `#FFF7ED` | Background suave de destaque |
| `surf` | `#FFFFFF` | Cards, modais, inputs — superfícies brancas |
| `surf2` | `#F4F2EE` | Backgrounds secundários, hover de botão ghost, disabled |
| `bg` | `#F7F6F2` | Background de página (corpo inteiro) |
| `bdr` | `#E5E2D9` | Bordas de cards, inputs, separadores |

### Hierarquia de Texto

| Token | Hex | Uso |
|---|---|---|
| `t1` | `#1A1814` | Texto primário (títulos, labels, valores) |
| `t2` | `#6B6760` | Texto secundário (descrições, subtítulos) |
| `t3` | `#A09D97` | Texto terciário (placeholders, hints, desabilitados) |

### Estados

| Token | Hex | Par de fundo | Uso |
|---|---|---|---|
| `ok` | `#16A34A` | `ok-l` `#F0FDF4` | Sucesso, aprovado, coberto |
| `err` | `#C8290A` | `err-l` `#FFF1EE` | Erro, falta sem substituto |
| `warn` | `#D97706` | — | Alerta, carga horária elevada |

### Paleta de Cores para Áreas (`COLOR_PALETTE`)

10 variantes usadas para colorir áreas de conhecimento e professores.
Cada variante tem 5 props: `bg`, `bd`, `tx`, `dt`, `tg`.

| Índice | Cor | bg | bd | tx |
|---|---|---|---|---|
| 0 | Azul | `#EFF6FF` | `#93C5FD` | `#1E3A8A` |
| 1 | Violeta | `#F5F3FF` | `#C4B5FD` | `#4C1D95` |
| 2 | Verde | `#F0FDF4` | `#86EFAC` | `#14532D` |
| 3 | Âmbar | `#FFFBEB` | `#FCD34D` | `#78350F` |
| 4 | Rosa | `#FFF1F2` | `#FDA4AF` | `#881337` |
| 5 | Teal | `#F0FDFA` | `#5EEAD4` | `#134E4A` |
| 6 | Ciano | `#ECFEFF` | `#67E8F9` | `#164E63` |
| 7 | Laranja | `#FFF7ED` | `#FDBA74` | `#7C2D12` |
| 8 | Fúcsia | `#FDF4FF` | `#E879F9` | `#701A75` |
| 9 | Cinza | `#F1F5F9` | `#94A3B8` | `#1E293B` |

`COLOR_NEUTRAL` → `{ bg:'#F9FAFB', bd:'#D1D5DB', tx:'#374151', dt:'#6B7280', tg:'#F3F4F6' }`

---

## 2. Tipografia

**Fontes:** carregadas via Google Fonts no `index.html`

| Família | Token | Uso |
|---|---|---|
| Figtree | `font-sans` | Todo o texto da aplicação (default) |
| DM Mono | `font-mono` | Código, horários, slots técnicos |

### Escala de Tamanhos (uso frequente)

| Classe Tailwind | Tamanho | Uso típico |
|---|---|---|
| `text-xs` | 12px | Labels (`lbl`), badges, metadados |
| `text-sm` | 14px | Texto padrão de UI, botões, descrições |
| `text-base` | 16px | Conteúdo principal, nomes |
| `text-lg` | 18px | Subtítulos de seção |
| `text-xl` | 20px | Títulos de card, modal headers |
| `text-2xl` | 24px | Títulos de página |
| `text-3xl` | 30px | Logo, headings principais |

### Pesos

| Classe | Uso |
|---|---|
| `font-normal` | Texto corrido |
| `font-semibold` | Botões, valores de destaque |
| `font-bold` | Labels de formulário, nomes |
| `font-extrabold` | Títulos de página, logo |

---

## 3. Border Radius

Configurados no `tailwind.config.js` (override dos defaults do Tailwind):

| Token | Valor | Uso |
|---|---|---|
| `rounded` (default) | `8px` | Botões, inputs, badges, chips |
| `rounded-lg` | `12px` | Cards menores, dropdowns |
| `rounded-xl` | `16px` | Cards principais (`.card`), seções |
| `rounded-2xl` | `20px` | Modais, painéis grandes |
| `rounded-full` | `9999px` | Pills, avatares, badges circulares |

---

## 4. Classes Utilitárias (definidas em `src/index.css`)

### Botões

```html
<!-- Base obrigatória para todos os botões -->
<button class="btn btn-dark">Salvar</button>
<button class="btn btn-ghost">Cancelar</button>
<button class="btn btn-danger">Excluir</button>

<!-- Modificadores de tamanho (combinar com variante) -->
<button class="btn btn-ghost btn-sm">Pequeno</button>
<button class="btn btn-ghost btn-xs">Extra pequeno</button>
```

| Classe | Estilo | Uso |
|---|---|---|
| `btn` | Base: flex, gap-2, px-4 py-2, rounded-lg, font-semibold, text-sm | Obrigatório em todo botão |
| `btn-dark` | `bg-navy text-white hover:bg-t2` | Ação primária |
| `btn-ghost` | `bg-surf2 border border-bdr hover:bg-bdr` | Ação secundária / cancelar |
| `btn-danger` | `bg-err-l text-err border border-red-200` | Ações destrutivas |
| `btn-sm` | `px-3 py-1.5 text-xs` | Botões menores inline |
| `btn-xs` | `px-2 py-1 text-xs` | Botões em tabela ou lista densa |

> `disabled:opacity-50 disabled:cursor-not-allowed` já incluso no `.btn`

### Card

```html
<div class="card">
  <!-- bg-surf rounded-xl border border-bdr p-5 -->
</div>
```

### Input

```html
<input class="inp" type="text" placeholder="Digite aqui..." />
```

`w-full px-3 py-2 rounded-lg border border-bdr bg-surf text-t1 text-sm placeholder-t3`
`focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy`

### Label

```html
<label class="lbl">Nome do campo</label>
```

`block text-xs font-bold text-t2 uppercase tracking-wider mb-1.5`

### Badge

```html
<span class="badge bg-ok-l text-ok">Aprovado</span>
<span class="badge bg-err-l text-err">Pendente</span>
```

`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold`

### Pill

```html
<span class="pill">Segunda</span>
```

`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-surf2 text-t2 border border-bdr`

### Scroll Fino

```html
<div class="overflow-y-auto scroll-thin">...</div>
```

Scrollbar de 4px com cor `bdr`. Usar em modais e listas longas.

---

## 5. Componentes

### Modal

```jsx
<Modal open={open} onClose={onClose} title="Título" size="md">
  {/* conteúdo */}
</Modal>
```

| Prop | Valores | Default |
|---|---|---|
| `size` | `sm` / `md` / `lg` / `xl` | `md` |

- `sm` → `max-w-sm` — confirmações simples
- `md` → `max-w-md` — formulários
- `lg` → `max-w-2xl` — listas com detalhes
- `xl` → `max-w-4xl` — tabelas, conteúdo largo

Comportamento: fecha com Escape ou clique no overlay. Body tem `overflow-y-auto scroll-thin` com `max-h-[90vh]`.

### ActionCard

```jsx
<ActionCard
  icon="📅"
  label="Marcar Substituições"
  desc="Abra o calendário semanal"
  to="/calendar"
  primary={false}
/>
```

- `primary={false}` (default) → `bg-surf border-bdr` com hover sutil
- `primary={true}` → `bg-navy text-white` com sombra

Hover: `hover:-translate-y-0.5 hover:shadow-lg` — animação de elevação.
Sempre tem chevron `›` no canto inferior direito.

### Toast

```js
import { toast } from '../hooks/useToast'

toast('Professor salvo', 'ok')
toast('Conflito de horário', 'warn')
toast('Erro ao salvar', 'err')
toast('Salvo localmente', 'local')
```

Auto-hide após 3000ms. Posição: fixed bottom-center, z-9999.

---

## 6. Paleta de Cores de Áreas — Como Usar

```js
import { COLOR_PALETTE, COLOR_NEUTRAL } from '../lib/constants'
import { colorOfTeacher } from '../lib/helpers'

// Por índice (área)
const cor = COLOR_PALETTE[area.colorIdx] ?? COLOR_NEUTRAL

// Por professor (baseado na primeira matéria)
const cor = colorOfTeacher(teacher, store)

// Aplicar:
<div style={{ background: cor.bg, borderColor: cor.bd, color: cor.tx }}>
  {/* conteúdo colorido */}
</div>

// tg = background mais claro (tag/chip dentro do card)
<span style={{ background: cor.tg, color: cor.tx }}>Matéria</span>
```

---

## 7. Padrões de Layout

### Responsividade

- Mobile-first. Breakpoints: `md` (768px), `lg` (1024px)
- Calendário e grade horária: mobile < 1024px → redireciona para CalendarDayPage
- Navbar: `hidden md:flex` (desktop) / `md:hidden` (mobile hamburger)

### Grid de Cards

```html
<!-- Action cards em grid responsivo -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <ActionCard ... />
</div>
```

### Seção com título

```html
<div class="mb-6">
  <h2 class="text-lg font-bold text-t1 mb-4">Título da seção</h2>
  <!-- conteúdo -->
</div>
```

### Formulário padrão

```html
<div class="space-y-4">
  <div>
    <label class="lbl">Nome</label>
    <input class="inp" type="text" />
  </div>
  <div class="flex justify-end gap-2 pt-2">
    <button class="btn btn-ghost" onClick={onClose}>Cancelar</button>
    <button class="btn btn-dark">Salvar</button>
  </div>
</div>
```

---

## 8. Padrões de UX

### Feedback de Ação

| Situação | Padrão |
|---|---|
| Ação bem-sucedida | `toast('Mensagem', 'ok')` |
| Aviso / conflito | `toast('Mensagem', 'warn')` |
| Erro | `toast('Mensagem', 'err')` |
| Salvo offline | `toast('Salvo localmente', 'local')` |
| Salvando (async) | Botão com texto `'…'` e `disabled` |
| Campo salvo inline | Confirmação textual `✓ Salvo` próxima ao campo |

### Estados de Elementos Interativos

- **Hover de card:** `hover:-translate-y-0.5 hover:shadow-lg`
- **Hover de linha:** `hover:bg-surf2`
- **Selecionado / ativo:** `bg-navy text-white` ou `bg-accent-l text-accent border-accent`
- **Desabilitado:** `opacity-50 cursor-not-allowed` (via `.btn` ou `disabled:` prefix)

### Hierarquia de Botões por Contexto

- **Ação primária:** `btn btn-dark` — única por tela/modal
- **Ação secundária:** `btn btn-ghost` — cancelar, fechar, voltar
- **Ação destrutiva:** `btn btn-danger` — excluir, remover
- **Ação inline / tabela:** `btn btn-ghost btn-sm` ou `btn btn-ghost btn-xs`

### Modais

- Sempre têm título no header
- Botão `×` no canto superior direito
- Footer com ações alinhado à direita: `flex justify-end gap-2`
- Ordem: `[Cancelar] [Ação Primária]`

### Pills de Navegação (ex: abas, dias da semana)

```html
<!-- Ativa -->
<button class="px-3 py-1.5 rounded-full text-sm font-semibold bg-navy text-white">
  Segunda
</button>

<!-- Inativa -->
<button class="px-3 py-1.5 rounded-full text-sm font-semibold bg-surf2 text-t2 border border-bdr hover:bg-bdr">
  Terça
</button>
```

### Indicadores de Status de Ausência

| Status | Visual sugerido |
|---|---|
| `covered` | `text-ok`, ícone `✓` |
| `partial` | `text-warn`, ícone `⚠` |
| `open` | `text-err`, ícone `✕` |

### Indicadores de Carga Horária

| Threshold | Cor |
|---|---|
| < `workloadWarn` (20) | `ok` |
| ≥ `workloadWarn` | `warn` |
| ≥ `workloadDanger` (26) | `err` |
