# Design System — GestãoEscolar

**Versão:** 2.2.0 — **Atualizado:** 2026-04-14

> Guia de referência visual e funcional para desenvolvimento consistente da interface do GestãoEscolar. Toda decisão de estilo deve ser derivada deste documento. Nunca use valores hex avulsos, tamanhos arbitrários ou classes Tailwind sem ancoragem nos tokens aqui definidos.

---

## Sumário

1. [Fundamentos Visuais (Design Tokens)](#1-fundamentos-visuais-design-tokens)
   - 1.1 [Paleta de Cores Base](#11-paleta-de-cores-base)
   - 1.2 [Hierarquia de Texto](#12-hierarquia-de-texto)
   - 1.3 [Estados Semânticos](#13-estados-semânticos)
   - 1.4 [Paleta de Áreas de Conhecimento](#14-paleta-de-áreas-de-conhecimento)
   - 1.5 [Tipografia](#15-tipografia)
   - 1.6 [Espaçamento e Grid](#16-espaçamento-e-grid)
   - 1.7 [Border Radius](#17-border-radius)
2. [Biblioteca de Componentes (UI Kit)](#2-biblioteca-de-componentes-ui-kit)
   - 2.1 [Botões](#21-botões)
   - 2.2 [Inputs e Seletores](#22-inputs-e-seletores)
   - 2.3 [Cards](#23-cards)
   - 2.4 [ActionCard](#24-actioncard)
   - 2.5 [Modais](#25-modais)
   - 2.6 [Toast (Notificações)](#26-toast-notificações)
   - 2.7 [Spinner e Estados de Carregamento](#27-spinner-e-estados-de-carregamento)
   - 2.8 [Badges e Pills](#28-badges-e-pills)
   - 2.9 [SuggestionPill](#29-suggestionpill)
   - 2.10 [ToggleRuleButtons](#210-togglerulebuttons)
3. [Padrões de Layout](#3-padrões-de-layout)
   - 3.1 [Estrutura de Página](#31-estrutura-de-página)
   - 3.2 [Navbar](#32-navbar)
   - 3.3 [Grids Responsivos](#33-grids-responsivos)
   - 3.4 [Formulários](#34-formulários)
4. [Padrões de Experiência (UX Patterns)](#4-padrões-de-experiência-ux-patterns)
   - 4.1 [Feedback ao Usuário](#41-feedback-ao-usuário)
   - 4.2 [Estados Interativos](#42-estados-interativos)
   - 4.3 [Hierarquia de Ações](#43-hierarquia-de-ações)
   - 4.4 [Indicadores de Status](#44-indicadores-de-status)
5. [Responsividade e Mobile-First (PWA)](#5-responsividade-e-mobile-first-pwa)
6. [Acessibilidade (a11y)](#6-acessibilidade-a11y)
7. [Convenções de Tailwind CSS](#7-convenções-de-tailwind-css)

---

## 1. Fundamentos Visuais (Design Tokens)

### 1.1 Paleta de Cores Base

Definida em `tailwind.config.js`. **Regra absoluta:** nunca escreva valores hex diretamente no JSX. Use sempre os tokens abaixo via classes Tailwind (`bg-navy`, `text-accent`, etc.) ou como variáveis CSS quando necessário via `inline style`.

| Token | Hex | Uso Semântico |
|---|---|---|
| `navy` | `#1A1814` | Cor institucional primária. Navbar, botão primário (`btn-dark`), elementos de maior peso visual. Transmite autoridade e seriedade. |
| `accent` | `#C05621` | Laranja da marca. Links ativos na navbar, logo "GestãoEscolar", destaque de atenção positiva. **Não usar para erros** — já existe `err` para isso. |
| `accent-l` | `#FFF7ED` | Background suave laranja. Usado em `SuggestionPill`, tags de destaque, hover de seleção ativa. |
| `surf` | `#FFFFFF` | Superfície branca. Fundo de cards (`.card`), modais, inputs. O "papel" da interface. |
| `surf2` | `#F4F2EE` | Superfície cinza-quente. Background de hover em botões ghost, estados disabled, seções recuadas. |
| `bg` | `#F7F6F2` | Background global da página. Aplicado no `<body>` e no Layout. Cria contraste sutil com `surf`. |
| `bdr` | `#E5E2D9` | Cor de borda padrão. Usado em todos os elementos que precisam de separação sem peso visual excessivo. |

**Quando usar `accent` vs. `navy`:**
- `navy` → ação principal, o que o usuário *deve* fazer (salvar, confirmar, avançar)
- `accent` → destaque informacional, marca, seleção ativa na navegação

### 1.2 Hierarquia de Texto

| Token | Hex | Uso |
|---|---|---|
| `t1` | `#1A1814` | Texto primário. Títulos, labels, valores de dados, nomes de professores. Máxima legibilidade. |
| `t2` | `#6B6760` | Texto secundário. Descrições de cards, subtítulos, nomes de campos preenchidos, metadados. |
| `t3` | `#A09D97` | Texto terciário. Placeholders de inputs, hints, estados vazios ("Nenhum registro"), timestamps. |

**Regra de hierarquia:** dentro de um mesmo componente, o elemento mais importante recebe `t1`, o de suporte recebe `t2`, e o contextual/opcional recebe `t3`. Nunca use as três em sequência sem hierarquia visual clara.

### 1.3 Estados Semânticos

| Token | Hex | Background par | Uso no sistema |
|---|---|---|---|
| `ok` | `#16A34A` | `ok-l` `#F0FDF4` | Sucesso, aprovado, substituição coberta, salvo com sucesso |
| `err` | `#C8290A` | `err-l` `#FFF1EE` | Erro crítico, falta sem substituto, campo inválido, ação destrutiva |
| `warn` | `#D97706` | *(sem variante `-l`)* | Alerta, carga horária elevada, conflito resolvível, atenção |

**Regra de uso par bg + cor:** sempre que usar `text-ok`, `text-err` ou `text-warn` em um badge ou chip, pare o background com o par correspondente (`ok-l`, `err-l`). Isso garante contraste WCAG AA.

```jsx
// Correto
<span className="badge bg-ok-l text-ok">Coberto</span>
<span className="badge bg-err-l text-err">Sem substituto</span>

// Incorreto — fundo branco com texto colorido perde contraste
<span className="badge text-ok">Coberto</span>
```

### 1.4 Paleta de Áreas de Conhecimento

10 variantes cromáticas para identificar visualmente áreas de conhecimento e seus professores. Cada variante tem 5 propriedades:

| Prop | Função |
|---|---|
| `bg` | Background do card ou container principal da área |
| `bd` | Cor da borda do container |
| `tx` | Cor de texto principal dentro do container |
| `dt` | Texto em destaque (valores numéricos, ícones) |
| `tg` | Background de tags/chips internos ao container colorido |

| Índice | Nome | `bg` | `bd` | `tx` |
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
| 9 | Cinza/Slate | `#F1F5F9` | `#94A3B8` | `#1E293B` |

`COLOR_NEUTRAL` → `{ bg:'#F9FAFB', bd:'#D1D5DB', tx:'#374151', dt:'#6B7280', tg:'#F3F4F6' }` — usado quando área/professor não tem cor atribuída.

**Como aplicar no código:**

```js
// src/lib/helpers.js
import { colorOfAreaId, colorOfTeacher } from '../lib/helpers'

// Via área
const cor = colorOfAreaId(area.id, store)  // usa COLOR_PALETTE[area.colorIdx]

// Via professor (pega a cor da primeira matéria do professor)
const cor = colorOfTeacher(teacher, store)

// Fallback automático para COLOR_NEUTRAL se não encontrar
```

```jsx
// Aplicar ao container
<div
  className="rounded-xl border p-4"
  style={{ background: cor.bg, borderColor: cor.bd, color: cor.tx }}
>
  <span className="text-sm font-bold">{teacher.name}</span>
  {/* Tag interna — usa tg como background */}
  <span
    className="text-xs font-semibold px-2 py-0.5 rounded-full"
    style={{ background: cor.tg, color: cor.tx }}
  >
    Matemática
  </span>
</div>
```

### 1.5 Tipografia

**Fontes carregadas em `index.html` via Google Fonts:**

```html
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

| Família | Token Tailwind | Pesos disponíveis | Uso |
|---|---|---|---|
| **Figtree** | `font-sans` (default) | 400, 500, 600, 700, 800 | Todo o texto de interface — títulos, labels, botões, corpo |
| **DM Mono** | `font-mono` | 400, 500 | Horários (`08:00`), slots de grade, código técnico |

**Escala tipográfica e contexto de uso:**

| Classe Tailwind | Tamanho rem/px | Peso recomendado | Onde usar |
|---|---|---|---|
| `text-xs` | 0.75rem / 12px | `font-bold` | Labels de campo (`.lbl`), badges, metadados secundários, timestamps |
| `text-sm` | 0.875rem / 14px | `font-semibold` / `font-normal` | Texto padrão de UI, botões, descrições de cards, itens de lista |
| `text-base` | 1rem / 16px | `font-normal` / `font-semibold` | Conteúdo principal, nomes de professores em cards |
| `text-lg` | 1.125rem / 18px | `font-bold` | Subtítulos de seção, headers de modal |
| `text-xl` | 1.25rem / 20px | `font-bold` | Títulos de cards expandidos, modais grandes |
| `text-2xl` | 1.5rem / 24px | `font-extrabold` | Títulos de página (`<h1>`) |
| `text-3xl` | 1.875rem / 30px | `font-extrabold` | Logo, headings de dashboard |

**Pesos e seus papéis:**

| Classe | Peso | Papel |
|---|---|---|
| `font-normal` | 400 | Texto corrido, valores em tabelas, placeholders visíveis |
| `font-medium` | 500 | Subtítulos discretos, labels de navegação inativos |
| `font-semibold` | 600 | Botões, valores numéricos importantes, nomes em listas |
| `font-bold` | 700 | Titles de seção, labels de formulário, nomes em destaque |
| `font-extrabold` | 800 | Títulos de página, logo da aplicação |

**Exemplo de hierarquia tipográfica em um card:**

```jsx
<div className="card">
  {/* Título do card — text-base font-bold text-t1 */}
  <p className="text-base font-bold text-t1">Prof. João Silva</p>

  {/* Subtítulo/metadado — text-sm text-t2 */}
  <p className="text-sm text-t2">Matemática · Ensino Médio</p>

  {/* Dado contextual — text-xs text-t3 */}
  <p className="text-xs text-t3">Última ausência: 10/04/2026</p>
</div>
```

### 1.6 Espaçamento e Grid

O sistema de espaçamento segue o padrão do Tailwind (múltiplos de 4px). As convenções abaixo garantem alinhamento visual consistente.

**Espaçamento interno de containers:**

| Contexto | Classe | Valor |
|---|---|---|
| Card padrão (`.card`) | `p-5` | 20px |
| Modal body | `p-4` | 16px |
| Seção de formulário | `space-y-4` | 16px entre campos |
| Header de página | `mb-6` | 24px |
| Separação entre título e conteúdo de seção | `mb-4` | 16px |
| Gap entre botões de ação | `gap-2` | 8px |
| Gap entre cards em grid | `gap-4` | 16px |

**Container máximo de página:**

```jsx
// src/components/layout/Layout.jsx
<main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
  <Outlet />
</main>
```

- `px-4` em mobile, `px-6` em telas `sm+`
- `py-6` de padding vertical constante
- Largura máxima de 1400px para não esticar demais em ultrawide

### 1.7 Border Radius

Configurados como override no `tailwind.config.js` para manter valores exatos do design:

| Classe Tailwind | Valor | Aplicação |
|---|---|---|
| `rounded` | `8px` | Botões (`.btn`), inputs (`.inp`), badges, chips pequenos |
| `rounded-lg` | `12px` | Dropdowns, tooltips, componentes menores |
| `rounded-xl` | `16px` | Cards principais (`.card`), seções de conteúdo |
| `rounded-2xl` | `20px` | Modais, painéis laterais, overlays |
| `rounded-full` | `9999px` | Pills de navegação, avatares, badges circulares (`.pill`, `.badge`) |

---

## 2. Biblioteca de Componentes (UI Kit)

### 2.1 Botões

Toda ação interativa deve usar a classe base `.btn` combinada com uma variante. **Nunca crie um botão sem a classe `.btn`.**

```jsx
// Ação primária — uma por modal/seção
<button className="btn btn-dark">Salvar</button>

// Ação secundária — cancelar, fechar, voltar
<button className="btn btn-ghost">Cancelar</button>

// Ação destrutiva — excluir, remover, desativar
<button className="btn btn-danger">Excluir professor</button>

// Tamanhos reduzidos (combinar com variante)
<button className="btn btn-ghost btn-sm">Filtrar</button>
<button className="btn btn-ghost btn-xs">✕</button>
```

**Anatomia da classe `.btn` (definida em `src/index.css`):**

```css
.btn {
  /* Layout */
  @apply inline-flex items-center justify-center gap-2;
  /* Espaçamento */
  @apply px-4 py-2;
  /* Visual */
  @apply rounded-lg font-semibold text-sm;
  /* Comportamento */
  @apply transition-all duration-150 cursor-pointer border-0;
  /* Estado desabilitado */
  @apply disabled:opacity-50 disabled:cursor-not-allowed;
}
```

| Classe | Visual | Caso de uso |
|---|---|---|
| `btn-dark` | `bg-navy text-white hover:bg-t2` | Ação primária — salvar, confirmar, avançar |
| `btn-ghost` | `bg-surf2 text-t1 border border-bdr hover:bg-bdr` | Ação secundária — cancelar, fechar, voltar |
| `btn-danger` | `bg-err-l text-err border border-red-200 hover:bg-red-100` | Ação destrutiva — excluir, remover |
| `btn-sm` | `px-3 py-1.5 text-xs` | Botões inline, dentro de listas ou headers |
| `btn-xs` | `px-2 py-1 text-xs` | Botões em células de tabela, ações contextuais muito densas |

**Estado de carregamento em botão:**

```jsx
<button className="btn btn-dark" disabled={saving}>
  {saving ? '…' : 'Salvar'}
</button>
```

### 2.2 Inputs e Seletores

**Input de texto:**

```jsx
<div>
  <label className="lbl">Nome do professor</label>
  <input
    className="inp"
    type="text"
    placeholder="Ex: João Silva"
    value={value}
    onChange={e => setValue(e.target.value)}
  />
</div>
```

**Anatomia do `.inp`:**

```css
.inp {
  @apply w-full px-3 py-2 rounded-lg border border-bdr;
  @apply bg-surf text-t1 text-sm placeholder-t3;
  /* Estado de foco */
  @apply focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy;
  @apply transition-colors;
}
```

**Estado de erro em input:**

```jsx
<div>
  <label className="lbl">E-mail</label>
  <input
    className={`inp ${hasError ? 'border-err focus:ring-err/20 focus:border-err' : ''}`}
    type="email"
  />
  {hasError && (
    <p className="text-xs text-err mt-1">E-mail inválido</p>
  )}
</div>
```

**Select (seletor):**

```jsx
<select className="inp">
  <option value="">Selecione uma matéria</option>
  <option value="mat">Matemática</option>
</select>
```

O seletor herda todos os estilos do `.inp` sem modificações adicionais.

**Label:**

```css
.lbl {
  @apply block text-xs font-bold text-t2 uppercase tracking-wider mb-1.5;
}
```

Labels são sempre em maiúsculas, tamanho `text-xs`, espaçamento tracking largo — seguem o padrão de "label de formulário profissional".

### 2.3 Cards

O `.card` é a unidade de container mais usada na interface.

```jsx
<div className="card">
  <p className="text-base font-bold text-t1">Conteúdo aqui</p>
</div>
```

```css
.card {
  @apply bg-surf rounded-xl border border-bdr p-5;
}
```

**Variações de card:**

```jsx
// Card com hover (clicável)
<div className="card hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer">

// Card colorido por área (inline style)
<div
  className="rounded-xl border p-4"
  style={{ background: cor.bg, borderColor: cor.bd }}
>

// Card com header separado
<div className="card p-0 overflow-hidden">
  <div className="px-5 py-3 border-b border-bdr bg-surf2">
    <h3 className="text-sm font-bold text-t1">Título</h3>
  </div>
  <div className="p-5">
    {/* corpo */}
  </div>
</div>
```

### 2.4 ActionCard

Componente de navegação rápida usado em dashboards. Localização: `src/components/ui/ActionCard.jsx`.

```jsx
<ActionCard
  icon="📅"           // emoji ou elemento — renderizado em text-3xl
  label="Calendário"  // texto principal — text-sm font-bold
  desc="Ver semana atual e marcar substituições"  // texto de apoio — text-xs
  to="/calendar"      // path de navegação (react-router Link)
  primary={false}     // false = padrão claro | true = navy escuro
/>
```

**Anatomia visual:**

```
┌─────────────────────────────┐
│  📅                          │  ← ícone (text-3xl, mb-2)
│                              │
│  Calendário          ›       │  ← label (font-bold) + chevron (text-2xl, bottom-right)
│  Ver semana atual            │  ← desc (text-xs, flex-1)
└─────────────────────────────┘
  min-height: 140px
```

**Variantes:**

| `primary` | Background | Texto | Borda | Sombra |
|---|---|---|---|---|
| `false` (default) | `bg-surf` | `text-t1` | `border-bdr hover:border-t3` | `hover:shadow-lg` |
| `true` | `bg-navy` | `text-white` | `border-transparent` | `shadow-md hover:shadow-lg` |

**Hover universal:** `hover:-translate-y-0.5 transition-all duration-200` — elevação sutil em ambas as variantes.

**Quando usar `primary={true}`:** somente no card de ação mais importante da tela (ex: "Registrar Ausência" no dashboard do professor). Máximo de 1 card primário por grid.

**Grid recomendado:**

```jsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <ActionCard icon="📅" label="Calendário" desc="..." to="/calendar" primary />
  <ActionCard icon="👥" label="Professores" desc="..." to="/teachers" />
  <ActionCard icon="📊" label="Relatórios" desc="..." to="/reports" />
  <ActionCard icon="⚙️" label="Configurações" desc="..." to="/settings" />
</div>
```

### 2.5 Modais

Localização: `src/components/ui/Modal.jsx`.

```jsx
<Modal
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title="Registrar Ausência"
  size="md"
>
  {/* conteúdo do modal */}
</Modal>
```

**Tamanhos disponíveis:**

| `size` | `max-width` | Caso de uso |
|---|---|---|
| `sm` | `max-w-sm` (384px) | Confirmações simples, alertas de 1-2 linhas |
| `md` | `max-w-md` (448px) | Formulários padrão (default) |
| `lg` | `max-w-2xl` (672px) | Listas com detalhes, formulários complexos |
| `xl` | `max-w-4xl` (896px) | Tabelas, grade horária, conteúdo expandido |

**Comportamento e acessibilidade:**

- **Backdrop:** `bg-black/40` no `fixed inset-0 z-[200]`
- **Fechar:** tecla `Escape` ou clique no backdrop
- **Foco:** o modal deve receber foco ao abrir (`autoFocus` no primeiro input ou no botão de fechar)
- **Scroll:** body do modal tem `overflow-y-auto scroll-thin max-h-[90vh]`
- **z-index:** 200 — garante sobrepor navbar (z-50) e outros overlays

**Estrutura interna padrão:**

```jsx
<Modal open={open} onClose={onClose} title="Título" size="md">
  {/* Corpo do modal */}
  <div className="space-y-4">
    <div>
      <label className="lbl">Campo</label>
      <input className="inp" />
    </div>
  </div>

  {/* Footer de ações — sempre ao final, alinhado à direita */}
  <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-bdr">
    <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
    <button className="btn btn-dark" onClick={handleSave}>Salvar</button>
  </div>
</Modal>
```

**Ordem dos botões no footer:** `[Cancelar/Ghost]` → `[Ação Primária/Dark]`. Nunca inverta.

### 2.6 Toast (Notificações)

O sistema de toast usa Zustand (`src/hooks/useToast.js`). O componente `<Toast />` é renderizado uma única vez no `Layout.jsx`.

**API de uso:**

```js
import { toast } from '../hooks/useToast'

// Ação bem-sucedida
toast('Professor salvo com sucesso', 'ok')

// Aviso / situação que precisa atenção
toast('Conflito de horário detectado', 'warn')

// Erro
toast('Erro ao salvar. Tente novamente.', 'err')

// Salvo localmente (modo offline/pendente)
toast('Salvo localmente', 'local')
```

**Tipos e visual:**

| Tipo | Background | Texto | Borda | Quando usar |
|---|---|---|---|---|
| `ok` | `bg-ok-l` | `text-ok` | `border-green-200` | CRUD bem-sucedido, aprovação, confirmação |
| `warn` | `bg-amber-50` | `text-amber-800` | `border-amber-200` | Conflito resolvível, aviso de limite, alerta não-crítico |
| `err` | `bg-err-l` | `text-err` | `border-red-200` | Falha de operação, erro de validação crítico, permissão negada |
| `local` | `bg-surf2` | `text-t2` | `border-bdr` | Dados salvos localmente sem sync com servidor |

**Comportamento:**
- **Posição:** `fixed bottom-6 left-1/2 -translate-x-1/2` — centralizado na base da tela
- **z-index:** 9999 — sempre visível
- **Auto-hide:** 3000ms após exibição
- **Animação:** aparece com `opacity-0 → opacity-100` e `translate-y-3 → translate-y-0`

**Mensagens — boas práticas:**

```js
// Bom: específico e afirmativo
toast('Ausência de João Silva registrada', 'ok')

// Ruim: genérico
toast('Sucesso', 'ok')

// Bom: ação clara no erro
toast('Sem conexão. Dados salvos localmente.', 'local')

// Ruim: técnico demais
toast('Firebase: permission-denied', 'err')
```

### 2.7 Spinner e Estados de Carregamento

Localização: `src/components/ui/Spinner.jsx`.

```jsx
import Spinner from '../components/ui/Spinner'

// Tamanho padrão (24px)
<Spinner />

// Tamanho customizado
<Spinner size={16} />
<Spinner size={32} />

// Com classes adicionais
<Spinner size={20} className="text-accent" />
```

**Visual:** `rounded-full border-2 border-bdr border-t-navy animate-spin`

**Padrões de uso por contexto:**

```jsx
// 1. Tela inteira carregando (page loader)
<div className="flex items-center justify-center min-h-[60vh]">
  <Spinner size={32} />
</div>

// 2. Botão com ação assíncrona em andamento
<button className="btn btn-dark" disabled={loading}>
  {loading ? <><Spinner size={16} /> Salvando…</> : 'Salvar'}
</button>

// 3. Seção carregando (substitui lista/tabela)
<div className="card flex items-center justify-center py-8">
  <Spinner size={24} />
</div>

// 4. Inline dentro de texto
<span className="flex items-center gap-2 text-sm text-t2">
  <Spinner size={14} /> Carregando professores…
</span>
```

**Skeleton loading (quando usar):** para listas com estrutura conhecida (ex: lista de professores), prefira skeleton placeholders a um Spinner central — reduz a percepção de lentidão. Implemente com `animate-pulse bg-surf2 rounded`:

```jsx
// Exemplo de skeleton para card de professor
<div className="card space-y-2 animate-pulse">
  <div className="h-4 bg-surf2 rounded w-3/4" />
  <div className="h-3 bg-surf2 rounded w-1/2" />
</div>
```

### 2.8 Badges e Pills

**Badge** — indicadores de status em linha, dentro de cards ou tabelas:

```jsx
<span className="badge bg-ok-l text-ok">Coberto</span>
<span className="badge bg-err-l text-err">Sem substituto</span>
<span className="badge bg-amber-50 text-amber-800">Parcial</span>
<span className="badge bg-surf2 text-t2">Inativo</span>
```

```css
.badge {
  @apply inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold;
}
```

**Pill** — chips de navegação, filtros, dias da semana, tags:

```jsx
// Pill de navegação — ativo
<button className="px-3 py-1.5 rounded-full text-sm font-semibold bg-navy text-white">
  Segunda
</button>

// Pill de navegação — inativo
<button className="px-3 py-1.5 rounded-full text-sm font-semibold bg-surf2 text-t2 border border-bdr hover:bg-bdr">
  Terça
</button>

// Pill estático (classe utilitária .pill)
<span className="pill">08:00</span>
```

```css
.pill {
  @apply inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold;
  @apply bg-surf2 text-t2 border border-bdr;
}
```

**Badge de notificação (contador):**

```jsx
// Usado na navbar para pendências
<span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
  {count}
</span>
```

### 2.9 SuggestionPill

Componente específico para sugestão de substitutos. Localização: `src/components/ui/SuggestionPill.jsx`.

```jsx
<SuggestionPills
  suggestions={[
    { id: '1', name: 'Maria Souza', monthlyAulas: 12 },
    { id: '2', name: 'Carlos Lima', monthlyAulas: 18 },
  ]}
  onSelect={(teacher) => handleSelectSubstitute(teacher)}
/>
```

**Visual de cada pill:**

```
┌────────────────────────────┐
│  Maria Souza               │  ← nome (truncate, font-semibold)
│  12 aulas este mês         │  ← carga (text-xs text-t2)
└────────────────────────────┘
  bg-accent-l  border-accent  hover:bg-orange-100
```

**Lógica de cor:** `bg-accent-l border-accent` — laranja de marca para destacar que são sugestões do sistema (não escolhas manuais do usuário).

**Estado vazio:**

```jsx
// Renderizado por SuggestionPills quando suggestions.length === 0
<p className="text-sm text-t3">Sem sugestões disponíveis</p>
```

### 2.10 ToggleRuleButtons

Componente de seleção binária para alternar entre modos de regra. Localização: `src/components/ui/ToggleRuleButtons.jsx`.

```jsx
<ToggleRuleButtons
  activeRule="qualitative"         // 'qualitative' | 'quantitative'
  onRuleChange={(rule) => setRule(rule)}
/>
```

**Visual:**

```jsx
// Botão ativo → btn btn-sm btn-dark (navy)
// Botão inativo → btn btn-sm btn-ghost
```

Este padrão (dois botões btn-sm onde o ativo é btn-dark) deve ser o padrão para qualquer alternância binária de modo — não criar radio buttons customizados.

---

## 3. Padrões de Layout

### 3.1 Estrutura de Página

Toda página segue esta hierarquia:

```jsx
// Estrutura padrão de página
function MinhaPage() {
  return (
    <div>
      {/* Header da página */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-t1">Título da Página</h1>
          <p className="text-sm text-t2 mt-0.5">Subtítulo opcional</p>
        </div>
        {/* Ação global da página (opcional) */}
        <button className="btn btn-dark">Nova Ação</button>
      </div>

      {/* Conteúdo principal */}
      <div className="space-y-6">
        {/* Seção */}
        <div>
          <h2 className="text-lg font-bold text-t1 mb-4">Seção</h2>
          {/* cards, listas, etc. */}
        </div>
      </div>
    </div>
  )
}
```

### 3.2 Navbar

Localização: `src/components/layout/Navbar.jsx`.

**Especificações fixas:**
- Background: `bg-navy`
- Altura: `h-14` (56px)
- Posição: `sticky top-0 z-50` — sobrepõe conteúdo ao rolar
- Sombra: `shadow-sm`

**Versão Desktop (`hidden md:flex`):**

```
┌─────────────────────────────────────────────────────────────────────┐
│ navy bg, h-14, sticky top-0                                         │
│ GestãoEscolar | Início | Ausências | Substituições | ... | [avatar] │
└─────────────────────────────────────────────────────────────────────┘
```

- **Logo:** `"Gestão"` em `text-accent` + `"Escolar"` em `text-white`, `text-lg font-extrabold`
- **Links ativos:** `bg-white/20 text-white rounded-lg`
- **Links inativos:** `text-white/70 hover:text-white hover:bg-white/10 rounded-lg`
- **Padding dos links:** `px-3 py-1.5 text-sm font-semibold`
- **Badge admin:** `text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 uppercase tracking-wide`

**Versão Mobile (`md:hidden`):**

```
┌───────────────────────────────────┐
│ GestãoEscolar           [≡ menu] │  ← h-14, navy
└───────────────────────────────────┘
     ↓ ao clicar em [≡]
┌───────────────────────────────────┐
│ [avatar] Nome do usuário          │
│ ─────────────────────────────── │
│ Início                            │
│ Ausências                         │
│ Substituições                     │
│ ...                               │
│ ─────────────────────────────── │
│ Sair                              │
└───────────────────────────────────┘
  fixed top-14, bg-navy, z-50, panel
```

- O backdrop do menu mobile usa `fixed inset-0 z-40 bg-black/30`
- O painel usa `fixed top-14 z-50 bg-navy` com largura controlada

**Regras de navegação condicional:**
- Links de admin (Calendário, Carga Horária, Grade) só aparecem para usuários com `role === 'admin'`
- Badge de pendências usa `bg-accent` e fica posicionado absolutamente sobre o link

### 3.3 Grids Responsivos

**Grid de ActionCards (dashboard):**

```jsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <ActionCard ... />
</div>
```

**Grid de cards de professores/turmas:**

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {teachers.map(t => <TeacherCard key={t.id} teacher={t} />)}
</div>
```

**Lista vertical (relatórios, ausências):**

```jsx
<div className="space-y-3">
  {items.map(item => <ItemCard key={item.id} item={item} />)}
</div>
```

**Linha horizontal com itens de comprimento variável:**

```jsx
<div className="flex flex-wrap gap-2">
  {days.map(day => <DayPill key={day} day={day} />)}
</div>
```

### 3.4 Formulários

**Padrão completo de formulário em modal:**

```jsx
<Modal open={open} onClose={onClose} title="Registrar Ausência" size="md">
  <div className="space-y-4">

    {/* Campo simples */}
    <div>
      <label className="lbl">Professor</label>
      <select className="inp" value={teacher} onChange={e => setTeacher(e.target.value)}>
        <option value="">Selecione...</option>
        {teachers.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>

    {/* Campo com erro */}
    <div>
      <label className="lbl">Data</label>
      <input
        className={`inp ${errors.date ? 'border-err focus:ring-err/20' : ''}`}
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
      />
      {errors.date && (
        <p className="text-xs text-err mt-1">{errors.date}</p>
      )}
    </div>

    {/* Dois campos em linha */}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="lbl">Início</label>
        <input className="inp" type="time" />
      </div>
      <div>
        <label className="lbl">Fim</label>
        <input className="inp" type="time" />
      </div>
    </div>

  </div>

  {/* Footer */}
  <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-bdr">
    <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
    <button className="btn btn-dark" disabled={saving} onClick={handleSave}>
      {saving ? '…' : 'Registrar'}
    </button>
  </div>
</Modal>
```

---

## 4. Padrões de Experiência (UX Patterns)

### 4.1 Feedback ao Usuário

Todo ponto de interação que modifica estado deve ter feedback visual imediato.

| Situação | Padrão | Implementação |
|---|---|---|
| CRUD bem-sucedido | Toast `ok` | `toast('X salvo', 'ok')` |
| Conflito / aviso | Toast `warn` | `toast('Conflito: ...', 'warn')` |
| Erro de operação | Toast `err` | `toast('Erro ao salvar', 'err')` |
| Salvo offline | Toast `local` | `toast('Salvo localmente', 'local')` |
| Ação assíncrona em curso | Botão desabilitado + `…` | `disabled={saving}` + texto `'…'` |
| Campo salvo inline (sem modal) | Texto `✓ Salvo` temporário próximo ao campo | Estado local com timeout de 2s |
| Exclusão irreversível | Modal de confirmação antes de agir | Nunca excluir sem confirmação |

**Regras de mensagem de toast:**
1. Máximo 60 caracteres
2. Afirmativo: "Professor salvo" (não "Operação concluída")
3. Específico: "Ausência de João — Seg 14/04" (não "Ausência registrada")
4. Sem jargão técnico: "Sem conexão" (não "Network error: fetch failed")

### 4.2 Estados Interativos

**Elementos clicáveis:**

| Estado | Classes |
|---|---|
| Hover de card | `hover:-translate-y-0.5 hover:shadow-lg transition-all` |
| Hover de linha de lista | `hover:bg-surf2 cursor-pointer` |
| Selecionado / ativo | `bg-navy text-white` ou `bg-accent-l text-accent border-accent` |
| Desabilitado | `opacity-50 cursor-not-allowed` |
| Focus visível | `focus:ring-2 focus:ring-navy/20 focus:outline-none` |

**Transições padrão:** `transition-all duration-150` para a maioria dos elementos. `duration-200` para cards com translate.

### 4.3 Hierarquia de Ações

Toda tela ou modal deve ter no máximo **uma ação primária** (`btn-dark`). As demais são secundárias (`btn-ghost`) ou destrutivas (`btn-danger`).

```
Modal com formulário:
  ┌─────────────────────────────────────────┐
  │                                  [× ] │
  │  Título do Modal                       │
  ├─────────────────────────────────────────┤
  │  ...campos...                          │
  ├─────────────────────────────────────────┤
  │                  [Cancelar] [Salvar ▶] │
  └─────────────────────────────────────────┘
                    ghost      dark (primário)

Modal de confirmação destrutiva:
  ┌─────────────────────────────────────────┐
  │  Confirmar exclusão?                   │
  │  Esta ação não pode ser desfeita.      │
  ├─────────────────────────────────────────┤
  │              [Cancelar] [Excluir ⚠]   │
  └─────────────────────────────────────────┘
                    ghost      danger
```

### 4.4 Indicadores de Status

**Status de ausência:**

| Status | Classe de texto | Ícone | Exemplo visual |
|---|---|---|---|
| `covered` — coberta | `text-ok` | `✓` | `<span class="text-ok font-bold">✓ Coberta</span>` |
| `partial` — parcialmente coberta | `text-warn` | `⚠` | `<span class="text-warn font-bold">⚠ Parcial</span>` |
| `open` — sem substituto | `text-err` | `✕` | `<span class="text-err font-bold">✕ Aberta</span>` |

**Indicadores de carga horária (KPIs):**

| Threshold | Token de cor | Contexto |
|---|---|---|
| `< workloadWarn` (20 aulas/mês) | `text-ok` + `bg-ok-l` | Carga saudável |
| `≥ workloadWarn` (20) | `text-warn` | Atenção — próximo do limite |
| `≥ workloadDanger` (26) | `text-err` + `bg-err-l` | Sobrecarga — intervir |

```jsx
function WorkloadBadge({ count }) {
  const cls = count >= 26
    ? 'bg-err-l text-err'
    : count >= 20
    ? 'bg-amber-50 text-amber-800'
    : 'bg-ok-l text-ok'

  return <span className={`badge ${cls}`}>{count} aulas</span>
}
```

---

## 5. Responsividade e Mobile-First (PWA)

O GestãoEscolar é usado majoritariamente em celulares por professores. A estratégia é **mobile-first**: escrever o layout base para mobile e sobrescrever com breakpoints para telas maiores.

**Breakpoints em uso:**

| Prefixo | Largura | Dispositivo-alvo |
|---|---|---|
| *(sem prefixo)* | 0px+ | Mobile (base) |
| `sm:` | 640px+ | Tablets pequenos |
| `md:` | 768px+ | Tablets e desktops |
| `lg:` | 1024px+ | Desktops |

**Regras de responsividade:**

1. **Telas de grade horária e calendário semanal:** em `< lg` (< 1024px) redirecionar para a visão de dia (`CalendarDayPage`). Telas pequenas não suportam grade 5-colunas com legibilidade.

2. **Navbar:** desktop usa tabs horizontais (`hidden md:flex`); mobile usa hamburger + overlay (`md:hidden`).

3. **Grids de cards:** começam em 2 colunas e expandem:
   ```jsx
   // 2 col mobile → 4 col desktop
   grid grid-cols-2 lg:grid-cols-4

   // 1 col mobile → 2 col tablet → 3 col desktop
   grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
   ```

4. **Modais:** `max-w-*` com `w-full mx-4` garante que não colem nas bordas do celular.

**Usabilidade em toque:**

| Diretriz | Implementação |
|---|---|
| Área de toque mínima: 44×44px | Todo elemento clicável tem no mínimo `h-11` ou `py-3` em mobile |
| Botões de ação principais: largura total em mobile | `w-full sm:w-auto` nos footers de modal quando há espaço |
| Scroll horizontal em listas densas | `overflow-x-auto` com `scroll-thin` em tabelas horizontais |
| Headers fixos | `sticky top-0` na Navbar; considerar `sticky top-14` em subtabs de página |
| Evitar hover-only em mobile | Toda interação acessível via toque, sem depender de `:hover` |

**PWA — considerações de interface:**

- O arquivo `manifest.json` e `service worker` permitem instalação na homescreen
- A Navbar `sticky top-0` funciona como app bar nativa ao instalar como PWA
- Cores do tema do browser seguem `#1A1814` (navy) — definido no `manifest.json`
- Evite elementos `position: fixed` além da Navbar e Toast — conflito com área segura (safe-area-inset) em iOS

---

## 6. Acessibilidade (a11y)

### Contraste de Cores

Todas as combinações texto/fundo usadas no sistema atendem WCAG 2.1 AA (razão mínima 4.5:1 para texto normal, 3:1 para texto grande).

| Combinação | Razão estimada | Status |
|---|---|---|
| `t1` `#1A1814` sobre `surf` `#FFFFFF` | ~17:1 | ✓ AAA |
| `t2` `#6B6760` sobre `surf` `#FFFFFF` | ~5.5:1 | ✓ AA |
| `t3` `#A09D97` sobre `surf` `#FFFFFF` | ~3.2:1 | ✓ AA (texto grande) |
| `text-white` sobre `navy` `#1A1814` | ~16:1 | ✓ AAA |
| `text-ok` `#16A34A` sobre `ok-l` `#F0FDF4` | ~5:1 | ✓ AA |
| `text-err` `#C8290A` sobre `err-l` `#FFF1EE` | ~5.5:1 | ✓ AA |

**Nunca use `t3` para texto de conteúdo principal** — apenas para placeholders, hints e estados vazios.

### ARIA Labels

**Botões icônicos (sem texto visível):**

```jsx
// Botão de fechar modal
<button onClick={onClose} aria-label="Fechar modal">
  ×
</button>

// Botão de editar professor
<button onClick={onEdit} aria-label={`Editar ${teacher.name}`}>
  ✎
</button>

// Botão de hamburger menu
<button onClick={toggleMenu} aria-label="Abrir menu de navegação" aria-expanded={menuOpen}>
  {menuOpen ? '✕' : '≡'}
</button>
```

**Modais:**

```jsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
>
  <h2 id="modal-title">{title}</h2>
  {/* ... */}
</div>
```

**Inputs:**

```jsx
// Todo input deve ter label associado via htmlFor/id
<label htmlFor="teacher-name" className="lbl">Nome</label>
<input id="teacher-name" className="inp" type="text" />

// Nunca use apenas placeholder como label — não é acessível
```

**Indicadores de status:**

```jsx
// Ícone com contexto textual para leitores de tela
<span aria-label="Substituição coberta">
  <span aria-hidden="true" className="text-ok">✓</span>
  <span className="sr-only">Coberta</span>
</span>
```

### Foco e Navegação por Teclado

- Todo elemento interativo deve ser focável via Tab
- A ordem de foco deve seguir a ordem visual da página
- Modais devem fazer `focus trap` — Tab não sai do modal enquanto ele está aberto
- Ao fechar um modal, o foco deve retornar ao elemento que o abriu

```jsx
// Utilitário para elementos visualmente ocultos mas acessíveis
<span className="sr-only">Texto para leitor de tela</span>
// equivale a: position: absolute; width: 1px; height: 1px; overflow: hidden; ...
```

---

## 7. Convenções de Tailwind CSS

### Ordem de Classes

Organize as classes na seguinte ordem para facilitar leitura e revisão:

```
1. Layout (display, position, flex, grid)
2. Box Model (width, height, padding, margin)
3. Visual (background, border, shadow, rounded)
4. Tipografia (font, text, leading, tracking)
5. Interatividade (hover, focus, cursor, transition)
6. Responsividade (sm:, md:, lg: — sempre por último)
```

**Exemplo:**

```jsx
// Correto — ordem semântica
<div className="flex items-center gap-3 px-4 py-3 bg-surf border border-bdr rounded-xl text-sm font-semibold text-t1 hover:bg-surf2 transition-colors md:px-6">

// Evitar — ordem aleatória
<div className="text-t1 md:px-6 border-bdr hover:bg-surf2 flex border rounded-xl gap-3 bg-surf transition-colors items-center px-4 font-semibold py-3 text-sm">
```

### Classes Utilitárias Customizadas

Definidas em `src/index.css` — usar sempre que possível ao invés de reescrever as classes Tailwind equivalentes:

| Classe | Use quando |
|---|---|
| `.btn` + variante | Qualquer elemento de ação clicável |
| `.card` | Container de conteúdo com fundo branco, borda e padding padrão |
| `.inp` | Input de texto, select, textarea |
| `.lbl` | Label de campo de formulário |
| `.badge` | Indicador de status inline |
| `.pill` | Tag/chip de navegação ou filtro |
| `.scroll-thin` | Container com scroll vertical em listas/modais |

### Inline Styles — Quando São Aceitáveis

Inline styles **só** são aceitáveis para valores dinâmicos que não existem como token Tailwind:

```jsx
// Correto — cor dinâmica de área (não existe como token)
<div style={{ background: cor.bg, borderColor: cor.bd, color: cor.tx }}>

// Correto — dimensão calculada dinamicamente
<div style={{ width: `${percentage}%` }}>

// Incorreto — existe token Tailwind equivalente
<div style={{ backgroundColor: '#1A1814' }}>  {/* usar bg-navy */}
<div style={{ padding: '20px' }}>             {/* usar p-5 */}
```

### Evitar Classes Arbitrárias

```jsx
// Evitar — valor arbitrário fora do sistema
<div className="text-[13px] pt-[7px] bg-[#2c2c2c]">

// Correto — usar os tokens definidos
<div className="text-sm pt-2 bg-navy">
```

**Exceções permitidas:**
- `text-[10px]` — para badges de admin muito pequenos (sem token equivalente)
- `min-w-[16px]` — para dimensões de badge circular preciso
- `max-w-[1400px]` — largura máxima do container principal

### Separação de Concerns

Componentes complexos devem extrair variantes como constantes, não inline:

```jsx
// Bom — variante como constante
const BUTTON_VARIANTS = {
  primary: 'btn btn-dark',
  secondary: 'btn btn-ghost',
  danger: 'btn btn-danger',
}

// Bom — classes condicionais com template string clara
const inputClass = `inp ${hasError ? 'border-err focus:ring-err/20' : ''}`

// Evitar — lógica inline complexa dificulta leitura
<input className={`w-full px-3 py-2 rounded-lg border ${hasError ? 'border-err focus:ring-2 focus:ring-err/20' : 'border-bdr focus:ring-2 focus:ring-navy/20'} bg-surf text-t1 text-sm`} />
```

### Scroll Customizado

```jsx
// Usar em modais, listas longas, painéis com overflow
<div className="overflow-y-auto scroll-thin max-h-[60vh]">
  {/* conteúdo longo */}
</div>
```

`.scroll-thin` define scrollbar de 4px com cor `bdr` no webkit e `scrollbar-width: thin` no Firefox.

---

*Este documento deve ser atualizado sempre que novos componentes forem criados ou tokens modificados. Qualquer alteração em `tailwind.config.js` ou `src/index.css` exige revisão das seções correspondentes aqui.*
