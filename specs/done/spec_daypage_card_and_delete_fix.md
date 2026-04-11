# Spec: Cards de Aula e Fix de Desfazer em CalendarDayPage

## Arquivo único: `src/pages/CalendarDayPage.jsx`

---

## Problema 1 — Bug: "Desfazer" não funciona

### Causa raiz

O `absMap` em `CalendarDayPage` é construído com spread do slot:
```js
map[`${s.date}|${s.timeSlot}`] = { ...s, absenceId: ab.id }
```

O id do slot fica em `abs.id`. Mas o botão chama:
```js
deleteAbsenceSlot(abs.absenceId, abs.slotId)  // abs.slotId === undefined ❌
```

Em `DayModal` funciona porque o mapa é construído explicitamente:
```js
map[s.timeSlot] = { absenceId: ab.id, slotId: s.id, substituteId: s.substituteId }
```

### Fix

Alterar a construção do `absMap` em `CalendarDayPage` para expor `slotId` explicitamente,
alinhando com o padrão do `DayModal`:

```js
// antes
ab.slots.forEach(s => { map[`${s.date}|${s.timeSlot}`] = { ...s, absenceId: ab.id } })

// depois
ab.slots.forEach(s => {
  map[`${s.date}|${s.timeSlot}`] = {
    absenceId:   ab.id,
    slotId:      s.id,
    substituteId: s.substituteId,
    timeSlot:    s.timeSlot,
    date:        s.date,
  }
})
```

O mesmo padrão já é usado em `SubPicker` com `abs.absenceId` e `abs.slotId` — o fix resolve
o `SubPicker` e o botão "Desfazer" de uma vez.

---

## Problema 2 — Estética: cards expandidos e horário solto

### Comportamento atual

- O card de uma aula com falta marcada fica permanentemente expandido mostrando
  `SubPicker compact` (sugestões de substituto) mesmo após o substituto ser alocado.
- Quando expandido, o bloco do horário (label + horário) fica visualmente desalinhado
  porque não tem borda/fundo próprio para ancorá-lo ao conteúdo.

### Comportamento desejado

**Estado colapsado (padrão):**
```
┌──────────────────────────────────────────┐
│  Aula 1   8ºA · Matemática               │
│  08–09h   ✓ João Silva          [Desfazer]│
└──────────────────────────────────────────┘
```
Quando substituto já está alocado: card compacto, sem sugestões visíveis.

**Estado expandido (falta marcada, sem substituto):**
```
┌──────────────────────────────────────────┐
│  Aula 1   8ºA · Matemática         [Desfazer]│
│  08–09h   ── Sugestões ──                │
│           ● Prof. X  12h  ⭐             │
│           ● Prof. Y  8h   🔵             │
│           ver todos (5)                  │
└──────────────────────────────────────────┘
```
Quando sem substituto: card expandido mostrando `SubPicker compact`.

### Implementação

#### 1. Separar cards do container unificado

Cada período vira um card independente com borda e fundo próprios,
em vez de linhas dentro de um único `card` com `divide-y`:

```jsx
{/* Lista de períodos — cada um como card independente */}
<div className="space-y-2">
  {periodos.map(p => {
    ...
    return (
      <div key={p.aulaIdx} className={`card p-3 ${abs ? 'border-[#FDB8A8] bg-[#FFF1EE]' : ''}`}>
        ...
      </div>
    )
  })}
</div>
```

#### 2. Bloco do horário ancorado visualmente

Dar ao bloco do horário um fundo sutil para ancorá-lo:

```jsx
<div className="text-center min-w-[56px] shrink-0 bg-surf2 rounded-lg py-1.5 px-1">
  <div className="font-mono text-[11px] font-bold text-t2">{p.label}</div>
  <div className="font-mono text-[10px] text-t3">{p.inicio}–{p.fim}</div>
</div>
```

#### 3. Colapsar card após substituto alocado

Quando `sub` existe (substituto já alocado), exibir apenas o resumo inline
sem o `SubPicker compact`. O botão "↺ Trocar" do `SubPicker` modal ainda
fica acessível via toque no nome do substituto ou via link discreto.

```jsx
{abs && (
  sub ? (
    // Colapsado: substituto alocado — só resumo + link trocar
    <div className="flex items-center gap-2 flex-wrap mt-1">
      <span className="text-[11px] font-bold text-ok">✓ {sub.name}</span>
      {isAdmin && (
        <SubPicker ... />  // exibe apenas o link "↺ Trocar" (não compact)
      )}
    </div>
  ) : (
    // Expandido: sem substituto — mostra SubPicker compact com sugestões
    isAdmin && <SubPicker ... compact />
  )
)}
```

#### 4. Botão "Desfazer" → pill

Transformar o botão "Desfazer" de texto simples em pill para dar área de toque
adequada no mobile:

```jsx
// antes
<button className="text-[11px] text-err hover:underline" onClick={...}>
  Desfazer
</button>

// depois
<button
  className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-[#FDB8A8] text-err bg-[#FFF1EE] hover:bg-[#FDB8A8]/30 transition-colors"
  onClick={() => { deleteAbsenceSlot(abs.absenceId, abs.slotId); toast('Falta removida', 'ok') }}
>
  Desfazer
</button>
```

---

## Resumo das mudanças em `CalendarDayPage.jsx`

| Localização | Mudança |
|---|---|
| `absMap` (useMemo) | Expor `slotId: s.id` explicitamente — **fix do bug** |
| Container dos períodos | `card p-0 + divide-y` → `space-y-2` com `card` individual por período |
| Bloco do horário | Adicionar `bg-surf2 rounded-lg` para ancorar visualmente |
| Lógica `abs && sub` | Colapsar quando substituto alocado; expandir só quando sem substituto |
| Botão "Desfazer" | Transformar em pill com área de toque adequada |

---

## Verificação Manual

- [ ] Marcar falta em aula específica → botão "Desfazer" (pill) aparece
- [ ] Clicar em "Desfazer" → falta removida corretamente (sem precisar de "remover todas")
- [ ] Card sem substituto → expandido com sugestões visíveis
- [ ] Aceitar substituto → card colapsa para resumo `✓ Nome`
- [ ] Bloco de horário não fica solto visualmente dentro do card
- [ ] Cada aula tem seu próprio card com borda independente
