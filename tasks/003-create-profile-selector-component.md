title:	[UI] Criar componente ProfileSelector com auto-posicionamento
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	338
--
## Context
Modal de professores pendentes precisa de dropdown para seleção de perfil que se posiciona automaticamente (cima/baixo). Criar componente reutilizável que integre detectDropdownPlacement() e renderize dropdown sem overflow do modal.

## What to do
- Criar novo componente `src/components/ProfileSelector.jsx` (ou em `src/components/ui/` se preferir)
- Componente deve ser um dropdown controlado que aceita props:
  - `value`: perfil selecionado (`null` | `"teacher"` | `"coordinator"` | `"teacher-coordinator"`)
  - `onChange(newValue)`: callback ao selecionar opção
  - `disabled`: se true, desabilita seleção
  - `triggerClassName`: classes Tailwind para o botão trigger
  - `containerRef`: ref do modal (para cálculo de bounds)
  - `dropdownHeight`: altura do dropdown (default 120px)
- Usar Headless UI Listbox ou CSS puro com React hooks
- Implementar:
  - `useRef()` para trigger e dropdown
  - `useEffect()` para calcular placement ao abrir dropdown
  - `useState()` para isOpen
  - Chamar `detectDropdownPlacement()` ao abrir
  - Renderizar com classes Tailwind: `top-full` ou `bottom-full` baseado em placement
- Opções hardcoded: 
  - `{ value: "teacher", label: "Professor" }`
  - `{ value: "coordinator", label: "Coordenador" }`
  - `{ value: "teacher-coordinator", label: "Prof. Coordenador" }`
- Fechar dropdown ao selecionar (auto-close)
- Suportar teclado: Tab, Arrow Up/Down, Enter, Escape

## Files affected
- `src/components/ProfileSelector.jsx` — novo componente
- `src/components/ui/index.js` — exportar ProfileSelector (se houver arquivo de exports)

## Acceptance criteria
- [x] Componente renderiza com botão trigger ("Selecionar Perfil" ou valor selecionado)
- [x] Ao clicar, dropdown abre na posição calculada por detectDropdownPlacement()
- [x] Dropdown exibe 3 opções com labels em português
- [x] Seleção chama onChange() e fecha dropdown
- [x] Suporta valor null (não selecionado) e valores válidos
- [x] Teclado funciona (Tab entra no componente, Arrow seleciona, Enter confirma, Esc fecha)
- [x] Dropdown não vaza do modal (respeitando containerRef)
- [x] Possui visual feedback (opção selecionada destacada)

## Notes
- Integração com PendingTeacherItem será próxima issue
- Dependências: 001 (helper), 002 (schema clarificado)
- Pode usar Headless UI se já disponível no projeto, senão CSS puro

---

## Plano Técnico

### Análise do Codebase

O projeto não usa Headless UI (apenas React Router, Zustand, Firebase, Tailwind). A estratégia é CSS puro + React hooks.

**Componentes e padrões existentes que serão reutilizados:**
- `/src/components/ui/Modal.jsx` — padrão de fechar com Escape, click no backdrop
- `/src/lib/helpers/dropdown.js` — `detectDropdownPlacement(trigger, height, container)` que retorna `"down"` ou `"up"`
- `/src/components/settings/shared/TurnoSelector.jsx` — exemplo de seletor simples com `select` HTML
- Classes Tailwind: `inp`, `btn`, `lbl` (definidas em `index.css`), cores semânticas (`t1`, `t2`, `t3`, `bdr`, `surf`)

**Padrão de estado:**
- `useState()` para `isOpen`, `selectedProfile`
- `useRef()` para `triggerRef`, `dropdownRef`
- `useEffect()` para calcular placement ao abrir

**Formato de imports esperado:**
```javascript
import { useState, useRef, useEffect } from 'react'
import { detectDropdownPlacement } from '../lib/helpers/dropdown'
```

---

### Cenários

**Caminho Feliz:**
1. Modal pendente abre (PendingPage)
2. Usuário clica no botão trigger "Selecionar Perfil" (exibe valor atual ou placeholder)
3. `useEffect` executa `detectDropdownPlacement()` com:
   - `triggerRef.current` (elemento do botão)
   - `120` (altura fixa do dropdown com 3 opções × ~40px)
   - `containerRef` (passado como prop, refere-se ao modal container)
4. Dropdown renderiza com `top-full` (if `placement === "down"`) ou `bottom-full` (if `placement === "up"`)
5. Usuário clica em uma opção → `onChange(newValue)` chamado, dropdown fecha automaticamente
6. Label do botão atualiza para "Professor", "Coordenador" ou "Prof. Coordenador"

**Casos de Borda:**
- Se `value === null`: botão exibe "Selecionar Perfil" (placeholder)
- Se `disabled === true`: botão visual desabilitado (opacidade 50%), click sem efeito
- Se container ausente: fallback para viewport (usar `window.innerHeight`)
- Se modal for redimensionado: placement recalculado apenas ao abrir (não é reativo)
- Teclado em dropdown aberto:
  - `Arrow Up/Down`: move focus entre opções
  - `Enter`: seleciona opção focada
  - `Escape`: fecha dropdown
  - `Tab`: sai do componente e fecha dropdown

**Tratamento de Erros:**
- Se `detectDropdownPlacement` retornar `undefined` (erro): renderiza `"down"` como fallback seguro
- Se `onChange` chamar com valor inválido (fora das 3 opções): ignorar (deixar componente controlado responsável)

---

### Estados e Handlers

**Estado interno:**
```javascript
const [isOpen, setIsOpen] = useState(false)
const [placement, setPlacement] = useState('down') // 'down' | 'up'
const [focusedIdx, setFocusedIdx] = useState(-1) // índice opção com keyboard focus
```

**Refs:**
```javascript
const triggerRef = useRef(null)
const dropdownRef = useRef(null)
```

**Handlers principais:**
1. `handleOpenDropdown()`: calcula placement via `detectDropdownPlacement()`, abre, reseta `focusedIdx = -1`
2. `handleSelectOption(value)`: chama `onChange(value)`, fecha dropdown
3. `handleKeyDown(e)`: detecta Tab/Esc/Arrow Up/Down dentro do dropdown aberto
4. `handleClickOutside()`: fecha dropdown (click fora)

---

### Integração com Store

**NÃO acessa Zustand.** O componente é **controlado** — recebe `value` e `onChange` como props. A lógica de persistência fica a cargo do consumidor (PendingPage ou outro).

Props esperadas:
```javascript
ProfileSelector({
  value: null | "teacher" | "coordinator" | "teacher-coordinator",
  onChange: (newValue) => { ... },
  disabled: false,
  containerRef: HTMLElement | null,
  dropdownHeight: 120,
  triggerClassName: "..."
})
```

---

### Estilos Tailwind

**Botão trigger:**
- Base: `px-4 py-2 rounded-lg border text-sm font-medium transition-colors`
- Cor: `bg-surf border-bdr text-t1`
- Hover (ativo): `hover:border-t1 hover:shadow-sm`
- Disabled: `disabled:opacity-50 disabled:cursor-not-allowed`
- Tamanho: altura ~40px (padding 8px vertical + 16px font)

**Dropdown container:**
- Posição: `absolute left-0 z-50`
- Dinamicamente: `top-full` (down) ou `bottom-full` (up)
- Tamanho: `w-full min-w-max` (min-w-max garante não encolher abaixo do trigger)
- Estilos: `bg-surf border border-bdr rounded-lg shadow-lg overflow-hidden`

**Opções:**
- Layout: `flex flex-col`
- Cada opção: `px-4 py-2.5 hover:bg-surf2 cursor-pointer text-sm text-t1 transition-colors`
- Selecionada: `bg-accent-l text-accent font-semibold`
- Focada (keyboard): `bg-surf2 outline-none` (visualmente similar ao hover)

---

### Acessibilidade (a11y)

1. **ARIA roles e atributos:**
   - Trigger: `role="button"` + `aria-haspopup="listbox"` + `aria-expanded={isOpen}`
   - Dropdown: `role="listbox"` + `aria-label="Perfil do professor"`
   - Opções: `role="option"` + `aria-selected={value === optionValue}`

2. **Teclado:**
   - Trigger: focável via `tabIndex={0}`
   - Space/Enter abre dropdown (listener no trigger)
   - Arrow Up/Down navega opções (listener no dropdownRef)
   - Enter seleciona opção focada
   - Escape fecha dropdown

3. **Foco:**
   - Trigger always focável
   - Ao abrir dropdown, foco não muda (permanece no trigger)
   - Ao fechar, retorna ao trigger
   - Arrow Up/Down em dropdown não muda foco do DOM, apenas visual com `focusedIdx`

---

### Arquivos a Criar

- **`src/components/ui/ProfileSelector.jsx`** — componente principal (120–160 linhas)
  - Props: `value`, `onChange`, `disabled`, `containerRef`, `dropdownHeight`, `triggerClassName`
  - Opções hardcoded com labels em português
  - Hooks: `useState` (isOpen, placement, focusedIdx), `useRef` (triggerRef, dropdownRef), `useEffect` (detectPlacement + listeners)
  - Handlers: select, keyboard (Arrow, Enter, Escape), outside-click
  - Renderiza botão trigger + dropdown condicional
  - Classes Tailwind para posicionamento dinâmico

---

### Arquivos a Modificar

- **`src/components/ui/Modal.jsx`** — nenhuma mudança necessária
- **`src/lib/helpers/index.js`** — já exporta `detectDropdownPlacement`, sem alteração
- **Consumidor final (PendingPage)** — será feito em issue 005 (Integração com PendingTeacherItem)

---

### Arquivos que NÃO devem ser tocados

- `src/store/useAppStore.js` — nenhuma ação precisa ser adicionada (é controlado)
- `src/lib/db.js` — nenhuma I/O (persistência é no consumidor)
- Outras páginas/componentes — sem dependência deste componente até issue 005

---

### Dependências Externas

- **React 18.3.1** — `useState`, `useRef`, `useEffect` já disponíveis
- **Tailwind CSS 3.4.10** — classes de posicionamento, cores, efeitos já disponíveis
- **`src/lib/helpers/dropdown.js`** — `detectDropdownPlacement()` versão 001 (já merged)

Nenhuma dependência npm nova necessária.

---

### Ordem de Implementação

1. **Estrutura base e renderização (30min)**
   - Criar arquivo `ProfileSelector.jsx`
   - Definir props, estado (`isOpen`, `placement`, `focusedIdx`)
   - Renderizar botão trigger com label dinâmico
   - Renderizar dropdown container (sempre, vamos ocultar via `!isOpen`)
   - Renderizar 3 opções hardcoded com labels

2. **Lógica de abertura/fechamento (20min)**
   - Implementar `handleOpenDropdown()` que chama `detectDropdownPlacement()`
   - Implementar `handleSelectOption()` que chama `onChange()` + fecha
   - Implementar click-outside via `useEffect` com listener global
   - Testar: clicar abre, clica opção fecha, clica fora fecha

3. **Keyboard e acessibilidade (25min)**
   - Adicionar `role`, `aria-*` no trigger e dropdown
   - Implementar `handleKeyDown` no trigger (Space, Enter abre)
   - Implementar `handleKeyDown` no dropdown (Arrow Up/Down, Enter, Escape)
   - Manter visual feedback com `focusedIdx`
   - Testar: Tab entra, Arrow navega, Enter seleciona, Escape fecha

4. **Estilos e posicionamento dinâmico (20min)**
   - Aplicar classes Tailwind para trigger (padding, border, hover)
   - Aplicar classes para dropdown container (absolute, z-50, border, sombra)
   - Renderizar `top-full` ou `bottom-full` baseado em `placement`
   - Renderizar opção selecionada com bg e text destacados
   - Testar visualmente em desktop (posição down e up)

5. **Testes de integração (15min)**
   - Verificar que `detectDropdownPlacement()` é chamado com 3 parâmetros corretos
   - Verificar callback `onChange()` passa valor correto
   - Verificar disabled bloqueia interação
   - Verificar containerRef é usado para calcular bounds

---

### Notas de Implementação

**Sobre o foco com Arrow Up/Down:**
O componente **não move o foco do DOM**, apenas rastreia `focusedIdx` internamente. Isso evita refoco constante e bugs de blur/focus. O visual feedback é apenas classes Tailwind (`bg-surf2`).

**Sobre a prop `dropdownHeight`:**
É usada como hint para `detectDropdownPlacement()`. Se a altura real dos 3 items for diferente de 120px, ajustar aqui. Hardcoded é ok por enquanto (3 opções × ~40px = 120px).

**Sobre `containerRef`:**
Pode ser `null` (usa viewport como fallback) ou um `HTMLElement` (como `.modal-body` da PendingPage). Isso garante que dropdown não vaze do modal em caso de restrição de bounds.

**Padrão de seleção:**
Quando usuário seleciona, componente NÃO atualiza `value` internamente (é controlado pelo pai via props). O pai recebe `onChange(newValue)` e decide se atualiza seu estado ou não.
