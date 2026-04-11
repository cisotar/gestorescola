# Spec: Página de Dia Mobile (`/calendar/day`)

## Contexto

`src/pages/CalendarPage.jsx` exibe uma grade semanal após selecionar um professor.
No mobile essa grade é ilegível e a UX de marcar faltas / atribuir substitutos
dentro de um modal ficaria densa demais. A solução é uma **página dedicada de dia**,
com comportamento 100% nativo: botão "voltar" do celular retorna ao calendário,
URL própria e tela inteira para o conteúdo.

---

## Fluxo Completo

### Desktop (≥ lg) — sem alteração

1. Seleciona professor → grade semanal aparece na página
2. Clica numa célula → `DayModal` abre para aquele dia

### Mobile (< lg) — novo fluxo

1. Seleciona professor → navega para `/calendar/day`
2. `/calendar/day` abre no **dia atual da semana**
3. Pills `Seg · Ter · Qua · Qui · Sex` no topo permitem trocar o dia
4. Swipe lateral avança/retrocede o dia
5. Botão "voltar" (nativo do celular ou botão na página) retorna para `/calendar`
6. **A grade semanal não é renderizada no mobile**

---

## Abrangência

| Quem | Caminho | Ação na página de dia |
|---|---|---|
| Admin | `/calendar` → seleciona professor → `/calendar/day` | Marcar faltas, atribuir substitutos |
| Professor | `/calendar` → (seleciona a si mesmo) → `/calendar/day` | Ver aulas do dia |

---

## Arquivos Alterados / Criados

| Arquivo | Ação |
|---|---|
| `src/pages/CalendarDayPage.jsx` | **[NOVO]** página mobile de dia |
| `src/pages/CalendarPage.jsx` | Redirecionar para `/calendar/day` no mobile ao selecionar professor; ocultar grade no mobile |
| `src/App.jsx` | Registrar rota `/calendar/day` |

---

## Passagem de Estado entre Páginas

O estado necessário na `CalendarDayPage` (professor selecionado, segmento, datas da semana)
é passado via `location.state` do React Router — sem query params, sem Firestore.

```js
// em CalendarPage.jsx, no onClick do TeacherCard (mobile):
navigate('/calendar/day', {
  state: {
    teacherId: t.id,
    segId:     seg.id,
    weekDates: dates,   // array ['2025-04-07', …, '2025-04-11']
    todayISO,
  }
})
```

Se o usuário acessar `/calendar/day` diretamente sem state (ex: refresh), redirecionar
para `/calendar` com `<Navigate to="/calendar" replace />`.

---

## `CalendarDayPage.jsx` — Estrutura

```
<div>                              ← tela inteira
  <header>                         ← nome do professor + botão voltar
  <nav>                            ← pills Seg–Sex (sticky top-14)
  <main>                           ← conteúdo do dia (scroll vertical)
    lista de períodos do dia ativo
    ações admin (marcar falta, substitutos) — inline, sem modal extra
</div>
```

### Header

```jsx
{/* MOBILE-DAY-PAGE: cabeçalho — remova junto com o arquivo para reverter */}
<div className="flex items-center gap-3 mb-4">
  <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm">← Voltar</button>
  <div>
    <div className="font-extrabold text-base">{teacher.name}</div>
    <div className="text-xs text-t2">{DAYS[activeDayIdx]} · {formatBR(dates[activeDayIdx])}</div>
  </div>
</div>
```

### Pills (sticky)

```jsx
<div className="flex gap-1.5 overflow-x-auto scroll-thin pb-1 sticky top-14 bg-bg z-10 py-2">
  {DAYS.map((d, i) => (
    <button
      key={d}
      onClick={() => setActiveDayIdx(i)}
      className={`flex flex-col items-center px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors
        ${activeDayIdx === i
          ? 'bg-navy text-white shadow-sm'
          : dates[i] === todayISO
            ? 'bg-accent-l text-accent'
            : 'bg-surf2 text-t2 border border-bdr'}`}
    >
      <span>{d}</span>
      <span className="font-mono font-normal text-[9px] opacity-70">{formatBR(dates[i])}</span>
    </button>
  ))}
</div>
```

### Swipe

```js
const touchStartX = useRef(null)
const onTouchStart = e => { touchStartX.current = e.touches[0].clientX }
const onTouchEnd   = e => {
  if (touchStartX.current === null) return
  const dx = e.changedTouches[0].clientX - touchStartX.current
  if (Math.abs(dx) < 40) return
  setActiveDayIdx(i => Math.min(Math.max(i + (dx < 0 ? 1 : -1), 0), 4))
  touchStartX.current = null
}
```

### Conteúdo do dia

Reutiliza a mesma lógica interna do `DayModal` existente em `CalendarPage.jsx`
(períodos, absMap, SubPicker, ações admin) — extraída ou copiada para a nova página.
**Não usa o componente `Modal`** — o conteúdo ocupa a tela inteira.

---

## Mudanças em `CalendarPage.jsx`

### 1. Redirecionar para a página no mobile

```js
const isMobile = () => window.innerWidth < 1024

// onClick do TeacherCard:
onClick={() => {
  setSelectedTeacher(t.id)
  setSelectedSeg(seg.id)
  setWeekOffset(0)
  if (isMobile()) {
    navigate('/calendar/day', { state: { teacherId: t.id, segId: seg.id, weekDates: dates, todayISO } })
  }
}}
```

### 2. Ocultar grade semanal no mobile

```jsx
{/* Grade — oculta no mobile (mobile usa /calendar/day) */}
<div className="hidden lg:block">
  {/* tabela existente sem alteração */}
</div>
```

---

## Mudanças em `App.jsx`

```jsx
import CalendarDayPage from './pages/CalendarDayPage'

// dentro de <Routes>:
<Route path="/calendar/day" element={<CalendarDayPage />} />
```

---

## Desfazer / Remover

1. Deletar `src/pages/CalendarDayPage.jsx`
2. Em `CalendarPage.jsx`: remover `if (isMobile()) navigate(...)` e restaurar `block` no wrapper da grade
3. Em `App.jsx`: remover a rota `/calendar/day`

---

## Verificação Manual

- [ ] Mobile — selecionar professor → navega para `/calendar/day` no dia atual
- [ ] Mobile — pills navegam entre os dias corretamente
- [ ] Mobile — swipe avança/retrocede o dia
- [ ] Mobile — pills ficam fixas no topo ao rolar o conteúdo
- [ ] Mobile — botão "Voltar" retorna para `/calendar` com professor mantido
- [ ] Mobile — refresh em `/calendar/day` redireciona para `/calendar` (sem state)
- [ ] Mobile — marcar falta (admin) funciona corretamente na nova página
- [ ] Mobile — atribuir substituto funciona corretamente na nova página
- [ ] Desktop — grade semanal e `DayModal` funcionam exatamente como antes
