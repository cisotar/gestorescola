# Spec: Visualização por Dia no Mobile (CalendarPage)

## Contexto

`src/pages/CalendarPage.jsx` exibe uma grade semanal em tabela (Segunda → Sexta) que funciona bem no desktop mas é ilegível no mobile — o usuário precisa rolar horizontalmente para ver todos os dias.

A mudança é **apenas para mobile** (`< lg`). No desktop, nada muda.

---

## Comportamento Esperado

### Mobile (< lg)

- A grade semanal é substituída por uma **visualização de dia único**.
- Ao abrir a página, o dia exibido é o **dia atual da semana** (ex: se for quarta, abre em Quarta). Fora do intervalo Seg–Sex, abre em Segunda.
- **Navegação entre dias:**
  - **Pills dos dias** fixas no topo do card (`sticky`), estilo `Seg · Ter · Qua · Qui · Sex`
  - **Swipe lateral** (touch): deslizar para esquerda avança o dia, para direita retrocede
- O conteúdo do dia (lista de períodos/aulas) rola verticalmente normalmente abaixo das pills.

### Desktop (≥ lg)

Sem qualquer alteração. A tabela semanal continua igual.

---

## Toggle On/Off (Admin via Interface)

Para facilitar testes e permitir desativar o comportamento sem tocar no código, haverá um toggle visual **apenas para admins** no card de cabeçalho do professor.

- **Localização:** dentro do `<div className="card mb-4 ...">` que já exibe o nome do professor e a navegação de semana (linha ~462 de `CalendarPage.jsx`)
- **Aparência:** botão pequeno `btn btn-ghost btn-xs` com label `📱 Modo dia` / `📅 Modo semana`
- **Persistência:** `localStorage` com chave `"ge_mobile_day_view"` (valor `"1"` = ativo, ausente = inativo). Padrão: **ativo**.

> Para desativar permanentemente via código, basta remover o bloco marcado com o comentário
> `{/* MOBILE-DAY-VIEW: pills + single-day — remova este bloco para voltar à tabela */}`

---

## Arquivos Alterados

| Arquivo | Ação |
|---|---|
| `src/pages/CalendarPage.jsx` | Único arquivo modificado |

Nenhum novo arquivo. Nenhuma alteração no Firestore ou stores.

---

## Plano de Implementação

### 1. Estado local na função `TabCalendar` (linha ~384)

```js
// MOBILE-DAY-VIEW: índice do dia selecionado (0=Seg … 4=Sex)
const todayIdx = Math.min(Math.max((new Date().getDay() || 7) - 1, 0), 4)
const [activeDayIdx, setActiveDayIdx] = useState(todayIdx)
// Toggle admin — lê localStorage; padrão ativo (true)
const [mobileDayView, setMobileDayView] = useState(
  () => localStorage.getItem('ge_mobile_day_view') !== '0'
)
const toggleMobileDayView = () =>
  setMobileDayView(v => { localStorage.setItem('ge_mobile_day_view', v ? '0' : '1'); return !v })
```

### 2. Swipe handler (dentro do card da grade)

```jsx
// MOBILE-DAY-VIEW: swipe
const touchStartX = useRef(null)
const onTouchStart = e => { touchStartX.current = e.touches[0].clientX }
const onTouchEnd   = e => {
  if (touchStartX.current === null) return
  const dx = e.changedTouches[0].clientX - touchStartX.current
  if (Math.abs(dx) < 40) return
  setActiveDayIdx(i => dx < 0 ? Math.min(i + 1, 4) : Math.max(i - 1, 0))
  touchStartX.current = null
}
```

### 3. Botão toggle no cabeçalho (só admin)

Adicionar dentro do `<div className="card mb-4 ...">`, ao lado dos botões `←` / `→` de semana:

```jsx
{/* MOBILE-DAY-VIEW: toggle admin */}
{isAdmin && (
  <button className="btn btn-ghost btn-xs lg:hidden" onClick={toggleMobileDayView}>
    {mobileDayView ? '📅 Semana' : '📱 Dia'}
  </button>
)}
```

### 4. Bloco condicional da grade (substituir `<div className="card p-0 overflow-hidden">`)

```jsx
{/* MOBILE-DAY-VIEW: pills + single-day — remova este bloco para voltar à tabela */}
{mobileDayView && (
  <div className="lg:hidden ...">  {/* pills + conteúdo de 1 dia */}
  </div>
)}
{/* Tabela semanal — desktop sempre visível; mobile só se mobileDayView=false */}
<div className={mobileDayView ? 'hidden lg:block' : 'block'}>
  {/* tabela existente sem alteração */}
</div>
{/* fim MOBILE-DAY-VIEW */}
```

### 5. Pills dos dias

```jsx
// sticky no topo do card mobile
<div className="flex gap-1.5 p-3 border-b border-bdr sticky top-0 bg-surf z-10 overflow-x-auto">
  {DAYS.map((d, i) => (
    <button
      key={d}
      onClick={() => setActiveDayIdx(i)}
      className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors
        ${activeDayIdx === i
          ? 'bg-navy text-white shadow-sm'
          : dates[i] === todayISO
            ? 'bg-accent-l text-accent'
            : 'bg-surf2 text-t2 hover:border-t3 border border-bdr'}`}
    >
      {d}
    </button>
  ))}
</div>
```

---

## Verificação Manual

- [ ] Mobile — abrir `/calendar` com professor selecionado: grade abre no dia atual
- [ ] Mobile — tocar nas pills navega entre dias corretamente
- [ ] Mobile — swipe para esquerda avança o dia; swipe para direita retrocede
- [ ] Mobile — pills ficam fixas no topo ao rolar o conteúdo do dia
- [ ] Mobile (admin) — botão `📅 Semana` / `📱 Dia` aparece e alterna o layout
- [ ] Mobile — preferência persiste ao recarregar a página (localStorage)
- [ ] Desktop — tabela semanal inalterada, pills e toggle invisíveis
- [ ] Remover o bloco `MOBILE-DAY-VIEW` restaura o comportamento original sem efeitos colaterais
