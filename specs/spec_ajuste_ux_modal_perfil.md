# Spec: Ajuste de UX no Modal Aguardando Aprovação de Professores

## Visão Geral

Corrigir comportamento de responsividade do dropdown "Selecionar Perfil" no modal de aprovação de professores (`pending_teachers`). Atualmente, quando o menu é acionado nos últimos itens da lista, ele expande para baixo e fica parcialmente ou totalmente cortado pela borda inferior do modal. O comportamento esperado é detectar colisão com a borda do modal e abrir o dropdown para cima, mantendo todos os itens visíveis e acessíveis.

**Problema crítico:** Impossibilidade de selecionar perfis para professores que estão no final da lista no modal de aprovação.

## Stack Tecnológica

- **Frontend:** React 18.3.1 + React Router 6.26.0
- **Estilização:** Tailwind CSS 3.4.10 + classes customizadas
- **UI Primitivos:** Modal (componente `components/ui/Modal.jsx`)
- **Estado:** Zustand 4.5.4 (authStore + appStore)
- **Backend:** Firebase Firestore (coleção `pending_teachers`)
- **Detecção:** JavaScript puro (getBoundingClientRect, offsetParent)

## Páginas e Rotas

### Página de Aprovação de Professores — `/settings?tab=pending` (Admin only)

**Descrição:** Modal com lista de solicitações de acesso pendentes. Admin aprova/rejeita ou atribui perfil antes de aprovar. Cada item exibe email, nome e um dropdown "Selecionar Perfil" que colide com a borda do modal quando posicionado nos últimos itens.

**Componentes:**
- `SettingsPage`: página container com abas
- `PendingTeachersTab` (componente interno): lista de professores pendentes
- `PendingTeacherItem` (componente interno): card individual com dropdown de perfil
- Dropdown de perfil nativo ou customizado (Headless UI / Radix ou styled-select)

**Behaviors:**
- [ ] Renderizar lista de `pending_teachers` com status "pending"
- [ ] Exibir dropdown "Selecionar Perfil" em cada item com opções: "teacher", "coordinator", "teacher-coordinator"
- [ ] Detectar espaço disponível abaixo do trigger (botão)
- [ ] Se houver colisão com borda inferior do modal, abrir dropdown para cima
- [ ] Se houver espaço, abrir dropdown para baixo (padrão)
- [ ] Manter dropdown visível acima/abaixo sem overflow do modal
- [ ] Ao selecionar perfil, atualizar estado local do item
- [ ] Ao clicar "Aprovar", persistir perfil selecionado no Firestore e criar documento em `teachers/`
- [ ] Fechar modal após sucesso e exibir toast de confirmação
- [ ] Permitir mudança de perfil mesmo após seleção anterior (sem bloquear)

---

## Componentes Compartilhados

Nenhum novo componente compartilhado será criado nesta versão. O ajuste será implementado:
1. **Componente dropdown:** Usar biblioteca existente (ex: Headless UI, Radix UI) com opção `placement="auto"` ou implementar detecção manual em componente local
2. **Detecção de colisão:** Função pura `detectDropdownPlacement(triggerElement, dropdownHeight, modalRect)` em `helpers/` ou inline no componente

## Modelos de Dados

### `pending_teachers/{uid}`

```js
{
  id:          "firebase-uid-abc123",
  uid:         "firebase-uid-abc123",
  email:       "joao@escola.sp.gov.br",
  name:        "João Silva",
  photoURL:    "https://...",
  requestedAt: Timestamp,
  status:      "pending",      // "pending" | "approved"
  celular:     "11988887777",  // preenchido na PendingPage
  apelido:     "João",
  subjectIds:  ["subj-bio"],
  profile:     null            // ← NOVO: "teacher" | "coordinator" | "teacher-coordinator" | null
}
```

**Campo adicionado:** `profile` (string | null)
- Armazenado em `pending_teachers/{uid}` **antes** da aprovação
- Persistido para `teachers/{uid}.profile` quando admin clica "Aprovar"
- Permite admin definir o perfil do novo professor antes de criar o documento em `teachers/`

### `teachers/{uid}` (após aprovação)

```js
{
  id:         "firebase-uid-abc123",
  name:       "João Silva",
  email:      "joao@escola.sp.gov.br",
  celular:    "11988887777",
  whatsapp:   "",
  apelido:    "João",
  subjectIds: ["subj-bio"],
  status:     "approved",
  profile:    "teacher"        // ← Copiado de pending_teachers.profile
}
```

---

## Regras de Negócio

1. **Seleção de perfil é obrigatória antes da aprovação?**
   - NÃO. Se nenhum perfil for selecionado, usar default `profile: "teacher"` na aprovação.

2. **Mudança de perfil após seleção**
   - Permitida enquanto o profesor estiver em `pending_teachers` (status = "pending")
   - Não afeta nada no Firestore até que o admin clique "Aprovar"

3. **Validação de dropdown**
   - Detectar altura do dropdown antes de renderizar (usar refs e getBoundingClientRect)
   - Altura padrão esperada: ~120px (3 opções × 40px cada)
   - Margem de segurança: 16px (espaço mínimo entre dropdown e borda do modal)

4. **Responsividade do modal**
   - Modal em desktop: largura 600px, altura máxima 80vh com scroll interno
   - Modal em mobile: 100% da largura com max-height 90vh
   - Dropdown deve respeitar overflow do modal (não vazar para fora)

5. **Performance**
   - Detecção de colisão executada apenas quando dropdown é aberto (lazy)
   - Usar `getBoundingClientRect()` para cálculos de posição (evita reflows)
   - Não re-calcular se tamanho do modal não mudou (cache simples)

---

## Requisitos Funcionais

### RF1: Detecção de Colisão com Borda do Modal

O sistema deve automaticamente detectar se há espaço suficiente abaixo do botão "Selecionar Perfil" para exibir o dropdown sem ultrapassar a borda inferior do modal.

**Critério:** Se `(triggerBottom + dropdownHeight + margin) > modalBottom`, abrir para cima.

**Inputs:**
- `triggerElement`: elemento HTML do botão "Selecionar Perfil"
- `dropdownHeight`: altura do dropdown em pixels (aproximadamente 120px)
- `modalElement`: elemento HTML do modal ou seu container com scroll

**Output:**
- `placement: "up"` ou `placement: "down"`

### RF2: Renderização do Dropdown em Duas Direções

O dropdown deve ser visível e acessível independentemente da direção (cima/baixo).

**Critérios:**
- Quando `placement: "down"`: dropdown renderiza abaixo do trigger com margem de ~8px
- Quando `placement: "up"`: dropdown renderiza acima do trigger com margem de ~8px
- Dropdown nunca ultrapassa bordas laterais do modal (mesmo em mobile com viewport estreita)
- Scroll interno do modal não causa desaparecimento prematuro do dropdown

### RF3: Integração com Biblioteca de Dropdown (ou CSS puro)

Implementar usando:
- **Opção A:** Headless UI `<Popover>` / Radix UI `<Select>` com prop `side="auto"` (se disponível)
- **Opção B:** CSS puro com `position: absolute` + `top/bottom` calculados dinamicamente via JavaScript

**Preferência:** Usar biblioteca existente no projeto se houver; caso contrário, implementar com CSS puro + `useEffect` para cálculo de posição.

### RF4: Persistência de Seleção de Perfil

O perfil selecionado no dropdown deve ser armazenado em estado local do componente até que o admin clique "Aprovar".

**Fluxo:**
1. Admin abre dropdown de um professor
2. Seleciona "Coordinator" (ex.)
3. Estado local do item é atualizado: `selectedProfile: "coordinator"`
4. Dropdown fecha automaticamente
5. Botão "Aprovar" exibe o perfil selecionado (visual feedback)
6. Ao clicar "Aprovar", chamar `approveTeacher(uid, profile: "coordinator", ...)`
7. Firestore recebe e cria `teachers/{uid}` com `profile: "coordinator"`

### RF5: Comportamento em Mobile

Em telas pequenas (`< 768px`), o modal ocupa mais da altura da viewport, aumentando a probabilidade de colisão. O dropdown deve:
- Abrir para cima se houver espaço
- Abrir para baixo se houver espaço
- Se houver colisão nos dois sentidos, permitir scroll interno do dropdown (overflow-y: auto)

---

## Requisitos Técnicos

### RT1: Função de Detecção de Placement

**Arquivo:** `src/lib/helpers/dropdown.js` (novo)

```js
/**
 * Detecta se um dropdown deve abrir para cima ou para baixo
 * baseado no espaço disponível no seu container.
 *
 * @param {HTMLElement} triggerElement - Elemento que abre o dropdown
 * @param {number} dropdownHeight - Altura estimada do dropdown em px (ex: 120)
 * @param {HTMLElement|null} containerElement - Modal ou container com scroll (se null, usa viewport)
 * @returns {string} "up" | "down"
 */
export function detectDropdownPlacement(triggerElement, dropdownHeight, containerElement = null) {
  // Implementação aqui
}
```

**Lógica:**
1. Obter `triggerElement.getBoundingClientRect()` → `{ top, bottom, left, right, height, width }`
2. Obter container bounds (modal ou viewport)
3. Calcular espaço disponível abaixo: `containerBottom - triggerBottom`
4. Calcular espaço disponível acima: `triggerTop - containerTop`
5. Comparar: `spaceBelow > (dropdownHeight + margin)` ? "down" : "up"

### RT2: Componente Dropdown com Placement Automático

**Local:** `components/ui/PendingTeacherItem.jsx` ou inline em `SettingsPage.jsx`

**Usar:**
- React 18+ hooks: `useRef`, `useState`, `useEffect`
- Se usar biblioteca: Headless UI `Combobox` ou Radix UI `Select` com positioning automático
- Se usar CSS puro: `position: absolute` com classes Tailwind `top-full` / `bottom-full`

**Props:**
```jsx
<ProfileSelector
  value={selectedProfile}
  onChange={handleProfileChange}
  triggerClassName="btn btn-sm btn-ghost"
  options={[
    { value: "teacher", label: "Professor" },
    { value: "coordinator", label: "Coordenador" },
    { value: "teacher-coordinator", label: "Prof. Coordenador" }
  ]}
/>
```

### RT3: Atualização de `approveTeacher()` no Store

**Arquivo:** `src/store/useAppStore.js`

**Assinatura atual:**
```js
approveTeacher(uid, email, name, celular, apelido, subjectIds)
```

**Assinatura nova:**
```js
approveTeacher(uid, email, name, celular, apelido, subjectIds, profile = "teacher")
```

**Mudanças:**
1. Aceitar parâmetro `profile` (default: `"teacher"` para retrocompatibilidade)
2. Ao chamar `saveDoc('teachers', { ..., profile })`, incluir o perfil
3. Atualizar também `pending_teachers/{uid}` com `profile` antes de converter em `teachers`

### RT4: Teste Visual em Modal com Scroll

**Cenários:**
- Modal com 5 professores → dropdown no 4º item (perto da borda)
- Modal com 10 professores → scroll interno ativo → dropdown no último item (9º ou 10º)
- Tela mobile 375px → modal ocupa 90% da altura → dropdown testado em vários pontos

---

## Comportamento Esperado

### Caso de Teste 1: Dropdown abre para baixo (espaço disponível)

```
[Modal com 80vh de altura]
  ┌─────────────────────┐
  │ Professores Pendentes│
  │                     │
  │ 1. João Silva       │
  │    [Sel. Perfil ▼]  │
  │                     │
  │ 2. Maria Santos     │
  │    [Sel. Perfil ▼]  │ ← aqui, há espaço abaixo
  │                     │
  │    [dropdown abre   │
  │     para baixo]     │
  │    ┌─────────────┐  │
  │    │ Professor   │  │
  │    │ Coordenador │  │
  │    │ Prof.Coord. │  │
  │    └─────────────┘  │
  │                     │
  └─────────────────────┘
```

### Caso de Teste 2: Dropdown abre para cima (colisão com borda)

```
[Modal com 80vh de altura]
  ┌─────────────────────┐
  │ Professores Pendentes│
  │ [lista com scroll]  │
  │ ...                 │
  │ 8. Pedro Costa      │
  │    ┌─────────────┐  │
  │    │ Professor   │  │ ← dropdown abre
  │    │ Coordenador │  │   para cima
  │    │ Prof.Coord. │  │
  │    └─────────────┘  │
  │ 9. Alice Martins    │
  │    [Sel. Perfil ▼]  │ ← trigger aqui (perto da borda)
  │                     │
  └─────────────────────┘
```

### Caso de Teste 3: Seleção de perfil e aprovação

```
Admin clica em "Selecionar Perfil" do professor João Silva
  └─ Dropdown abre (direção auto-detectada)
  └─ Admin clica em "Coordenador"
  └─ Dropdown fecha, estado local: { selectedProfile: "coordinator" }
  └─ Botão "Aprovar" fica com visual destacado (ex: "Aprovar como Coordenador")
  └─ Admin clica "Aprovar"
  └─ `approveTeacher(uid, ..., profile: "coordinator")` é chamado
  └─ Firestore: `teachers/{uid}` criado com `profile: "coordinator"`
  └─ Modal fecha, toast: "João Silva aprovado como Coordenador"
```

---

## Casos de Teste

| ID | Cenário | Pré-condições | Passos | Resultado Esperado | Prioridade |
|---|---|---|---|---|---|
| CT-1 | Dropdown abre para baixo | Modal aberto, professor no meio da lista | Clicar em "Selecionar Perfil" | Dropdown renderiza abaixo sem colisão | 🔴 |
| CT-2 | Dropdown abre para cima | Modal aberto, professor no final da lista, scroll ativo | Clicar em "Selecionar Perfil" do penúltimo/último item | Dropdown renderiza acima, totalmente visível | 🔴 |
| CT-3 | Seleção persiste | Modal aberto, dropdown aberto | Selecionar uma opção (ex: "Coordenador") | Dropdown fecha, perfil selecionado permanece visível no componente | 🔴 |
| CT-4 | Dropdown fecha ao selecionar | Modal aberto, dropdown aberto | Clicar em uma opção | Dropdown fecha automaticamente | 🟡 |
| CT-5 | Mudança de seleção | Modal aberto, perfil já selecionado | Clicar em "Selecionar Perfil" novamente, escolher outra opção | Nova seleção substitui a anterior (permite mudança) | 🟡 |
| CT-6 | Default "teacher" se nenhum selecionado | Modal aberto, nenhum perfil selecionado | Clicar "Aprovar" sem selecionar perfil | Admin é aprovado como "teacher" (default) | 🟡 |
| CT-7 | Mobile responsivo | Viewport 375px, modal aberto | Clicar em "Selecionar Perfil" de itens próximos à borda | Dropdown ajusta posição sem vazar da lateral | 🟡 |
| CT-8 | Persistência no Firestore | Perfil selecionado e aprovação completada | Recarregar a página e verificar coleção `teachers/` | Campo `profile` contém o valor selecionado | 🔴 |

---

## Critérios de Aceitação

### CA-1: Detecção Automática de Colisão

- [x] Função `detectDropdownPlacement()` implementada em `src/lib/helpers/dropdown.js`
- [x] Retorna `"up"` quando não há espaço abaixo (com margem de 16px)
- [x] Retorna `"down"` quando há espaço
- [x] Funciona com modal em qualquer tamanho (desktop, tablet, mobile)

### CA-2: Dropdown Visível e Acessível

- [x] Dropdown nunca é cortado pela borda inferior do modal
- [x] Dropdown nunca vaza lateralmente em telas pequenas
- [x] Todos os 3 itens do dropdown são clicáveis independentemente da direção
- [x] Teclado (Tab, setas, Enter) funciona em ambas as direções

### CA-3: Integração com Seleção de Perfil

- [x] Dropdown exibe 3 opções: "Professor", "Coordenador", "Prof. Coordenador"
- [x] Seleção é armazenada em estado local até "Aprovar"
- [x] Mudanças de seleção são permitidas antes da aprovação
- [x] Visual feedback indica perfil selecionado (ex: check mark ou highlight)

### CA-4: Persistência no Firestore

- [x] Ao clicar "Aprovar", `profile` é salvo em `teachers/{uid}`
- [x] Perfil vem de `pending_teachers.profile` ou default `"teacher"`
- [x] Documento em `teachers/` contém o campo `profile` com valor correto

### CA-5: Teste de Regressão

- [x] Fluxo de aprovação existente continua funcionando (sem quebra de compatibilidade)
- [x] Professores antigos sem campo `profile` são tratados com default `"teacher"`
- [x] Toast de sucesso exibe "Aprovado como [Perfil]" em vez de apenas "Aprovado"

---

## Fora do Escopo (v1)

- [ ] Edição de perfil após professor ser aprovado (requer migração de dados)
- [ ] Bulk approval de múltiplos professores de uma vez
- [ ] Validação de limites de coordenadores por escola
- [ ] Dropdown com busca/filtro de perfis (usar select estático)
- [ ] Animação de transição para dropdown (usar fade nativa do CSS)
- [ ] Integração com temas escuros (usar apenas tokens existentes do design system)
- [ ] Histórico de mudanças de perfil antes da aprovação (não é requisito)

---

## Resumo Técnico

| Item | Descrição |
|---|---|
| **Arquivos a criar** | `src/lib/helpers/dropdown.js` |
| **Arquivos a modificar** | `src/store/useAppStore.js` (signature `approveTeacher`), `src/pages/SettingsPage.jsx` (ou componente inteiro) |
| **Dependências externas** | Nenhuma nova (usar Headless UI se já disponível, senão CSS puro) |
| **Backward compatibility** | ✅ Mantida — `profile` é `null` em pending_teachers antigos |
| **Testes críticos** | CT-1, CT-2, CT-8 (visual + persistência) |

