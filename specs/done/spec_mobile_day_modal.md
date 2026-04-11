# Spec: Modal de Dia com Navegação no Mobile

## Contexto

`src/pages/CalendarPage.jsx` exibe uma grade semanal após selecionar um professor.
No mobile, essa grade é ilegível. O fluxo desejado é diferente: ao selecionar
um professor, o sistema deve abrir **diretamente um modal** mostrando apenas um dia,
com navegação interna entre os dias da semana.

---

## Comportamento Atual (a substituir no mobile)

1. Usuário seleciona professor → grade semanal aparece na página
2. Usuário clica numa célula da grade → `DayModal` abre para aquele dia

## Comportamento Desejado no Mobile (< lg)

1. Usuário seleciona professor → **`DayModal` abre imediatamente**, no dia atual da semana
2. Dentro do modal, pills `Seg · Ter · Qua · Qui · Sex` permitem navegar entre os dias
3. Swipe lateral dentro do modal avança/retrocede o dia
4. **A grade semanal não aparece no mobile** — o modal é o único ponto de entrada

No desktop (≥ lg): comportamento atual inalterado.

---

## Abrangência

Dois caminhos de uso, mesmo componente:

| Quem | Caminho | Ação no modal |
|---|---|---|
| Admin | Calendário → professor → modal | Marcar faltas, atribuir substitutos |
| Professor | Calendário → grade própria → modal | Ver aulas do dia |

---

## Mudanças em `CalendarPage.jsx`

### 1. Abrir o modal automaticamente ao selecionar professor (mobile)

No handler `onClick` do `TeacherCard`, detectar se é mobile e, em caso positivo,
abrir o `DayModal` diretamente no dia atual:

```js
// helper — verdadeiro se viewport < lg (1024px)
const isMobileViewport = () => window.innerWidth < 1024

// no onClick do TeacherCard:
onClick={() => {
  setSelectedTeacher(t.id)
  setSelectedSeg(seg.id)
  setWeekOffset(0)
  if (isMobileViewport()) setModalDate(todayISO) // abre modal direto no mobile
}}
```

### 2. Pills de dias dentro do `DayModal`

O `DayModal` recebe dois novos props opcionais:

```js
// props adicionais — só usados no mobile via CalendarPage
onPrevDay?: () => void
onNextDay?: () => void
days?: string[]       // ['Segunda', 'Terça', …]
dates?: string[]      // ['2025-04-07', …]
activeDayIdx?: number
onDaySelect?: (idx: number) => void
```

Dentro do modal, **acima da barra de ações rápidas**, inserir o bloco:

```jsx
{/* MOBILE-DAY-MODAL: pills de navegação — remova este bloco para voltar ao comportamento original */}
{days && (
  <div
    className="flex gap-1.5 mb-4 overflow-x-auto scroll-thin pb-1"
    onTouchStart={onTouchStart}
    onTouchEnd={onTouchEnd}
  >
    {days.map((d, i) => (
      <button
        key={d}
        onClick={() => onDaySelect(i)}
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
)}
{/* fim MOBILE-DAY-MODAL */}
```

### 3. Estado de navegação em `TabCalendar` (ou `CalendarPage`)

```js
// índice do dia ativo no modal mobile (0=Seg … 4=Sex)
const todayIdx = Math.min(Math.max((new Date().getDay() || 7) - 1, 0), 4)
const [activeDayIdx, setActiveDayIdx] = useState(todayIdx)

// ao mudar o dia pelo pill ou swipe, atualiza modalDate para a data correspondente
const handleDaySelect = (idx) => {
  setActiveDayIdx(idx)
  setModalDate(dates[idx])  // dates vem do getWeekDates(weekOffset)
}
```

### 4. Swipe dentro do modal

O `DayModal` recebe `onTouchStart` / `onTouchEnd` de fora (via props) ou implementa
internamente com `useRef`. Ao detectar swipe:

```js
const touchStartX = useRef(null)
const onTouchStart = e => { touchStartX.current = e.touches[0].clientX }
const onTouchEnd   = e => {
  if (touchStartX.current === null) return
  const dx = e.changedTouches[0].clientX - touchStartX.current
  if (Math.abs(dx) < 40) return
  handleDaySelect(activeDayIdx + (dx < 0 ? 1 : -1))  // clamp dentro de [0,4]
  touchStartX.current = null
}
```

### 5. Grade semanal no mobile

A grade semanal existente deve ficar **oculta no mobile** quando o modal for o ponto
de entrada. Usar `hidden lg:block` no wrapper da grade. No desktop, a grade continua
abrindo o `DayModal` ao clicar em uma célula, como já funciona.

---

## O que NÃO muda

- `DayModal` internamente — lógica de marcar faltas, substitutos, PDF, ações rápidas
- Comportamento no desktop
- `SettingsPage` — modal de grade do professor (caminho Configurações → Horários)

---

## Arquivos Alterados

| Arquivo | Ação |
|---|---|
| `src/pages/CalendarPage.jsx` | Único arquivo modificado |

---

## Desfazer / Remover

Para reverter ao comportamento original no mobile:
1. Remover a chamada `if (isMobileViewport()) setModalDate(...)` no `onClick` do `TeacherCard`
2. Remover o bloco marcado com `MOBILE-DAY-MODAL` dentro do `DayModal`
3. Remover `hidden lg:block` do wrapper da grade (restaurar `block`)

---

## Verificação Manual

- [ ] Mobile — selecionar professor → modal abre direto no dia atual, sem mostrar a grade
- [ ] Mobile — pills dentro do modal navegam entre os dias corretamente
- [ ] Mobile — swipe dentro do modal avança/retrocede o dia
- [ ] Mobile — marcar falta (admin) funciona normalmente dentro do modal
- [ ] Mobile — ao fechar o modal e selecionar outro professor, o modal abre no dia atual novamente
- [ ] Desktop — grade semanal e DayModal funcionam exatamente como antes
