# Spec: Estilo Visual da Grade Horária no Mobile

## Visão Geral

Corrigir o visual da lista de períodos em `CalendarDayPage` para que os cards de horário não pareçam "flutuar" isoladamente na tela. No desktop, todos os períodos do professor ficam agrupados dentro de um card container (`card p-0 overflow-hidden`) que forma uma grade coesa. No mobile, cada período é um `card` separado com `space-y-2` entre eles — sem wrapper visual, sem separadores internos, resultando numa aparência fragmentada.

**Problema resolvido:** Dar aos períodos no mobile a mesma sensação visual de "grade agrupada" do desktop — os slots devem parecer pertencer a um conjunto, não flutuar soltos.

---

## Stack Tecnológica

- Frontend: React 18.3.1
- Estilização: Tailwind CSS 3.4.10 (tokens: `card`, `bdr`, `surf2`, `t2`, `t3`)
- Arquivo principal: `src/pages/CalendarDayPage.jsx`

---

## Páginas e Rotas

### CalendarDayPage (Mobile) — `/calendar/day`

**Descrição:** Página mobile de um professor para a semana. A seção de períodos exibe cards individuais para cada aula do dia. O problema visual é que esses cards ficam soltos na página — sem delimitação de grupo, sem separadores internos, sem container que os una visualmente.

**Componentes afetados:**
- Container de períodos por turno: `<div className="space-y-2">` — deve virar um card wrapper
- Card individual de período: `<div className="card p-3 ...">` — deve virar linha interna com separador, não card solto

**Behaviors (o que o usuário pode fazer):**
- [ ] Visualizar os períodos do dia agrupados visualmente por segmento/turno dentro de um container único
- [ ] Identificar visualmente que os slots pertencem ao mesmo bloco (grade do dia)
- [ ] Distinguir claramente slots com falta (background vermelho claro, borda vermelha) dos normais
- [ ] Ver o texto de turma/matéria em cor adequada quando há falta (alinhado com o desktop)
- [ ] Navegar entre dias via swipe ou pills sem perder o contexto visual da grade

---

## Componentes Compartilhados

Nenhum componente novo. Apenas alterações de classes CSS no JSX existente em `CalendarDayPage.jsx`.

---

## Modelos de Dados

Sem alterações. A lógica de dados permanece idêntica.

---

## Regras de Negócio

### 1. Wrapper por turno/segmento

Cada grupo de períodos de um segmento/turno deve ser envolvido por um container `card p-0 overflow-hidden` — o mesmo padrão do desktop.

**Antes (mobile atual):**
```jsx
<div className="space-y-2">
  <div className="card p-3 border-...">...</div>
  <div className="card p-3 border-...">...</div>
</div>
```

**Depois (mobile corrigido):**
```jsx
<div className="card p-0 overflow-hidden">
  <div className="border-b border-bdr/50 px-3 py-2.5 ...">...</div>
  <div className="border-b border-bdr/50 px-3 py-2.5 ...">...</div>
  <div className="px-3 py-2.5 ...">...</div>  {/* último sem border-b */}
</div>
```

### 2. Período como linha interna, não card solto

Cada período deixa de ser um `card` independente e passa a ser uma linha (`div`) dentro do wrapper, separada por `border-b border-bdr/50` — exatamente como as linhas de uma tabela no desktop.

- **Slot com falta:** `bg-[#FFF1EE] border-b border-[#FDB8A8]/50`
- **Slot normal:** `border-b border-bdr/50`
- **Último slot:** sem `border-b`

### 3. Cores de texto para falta (alinhamento com desktop)

No desktop, o texto dentro de um card com falta usa cores específicas:
- Turma: `text-[#7F1A06]`
- Matéria: `text-[#9A3412]`

No mobile, essas cores devem ser aplicadas também para consistência visual.

### 4. Slot sem aula ("Hora de estudo")

Slot sem `sched` deve ser exibido com `opacity-50` na linha, mantendo a estrutura de linha — não omitir do layout.

### 5. Comportamento inalterado

Toda a lógica de interação permanece idêntica:
- Botão "Marcar falta" / "Desfazer"
- `SubPicker` compact e modal
- `ToggleRuleButtons`
- Swipe entre dias

---

## Implementação Técnica

### Estrutura alvo para a seção de períodos

```jsx
{/* Container por segmento/turno */}
<div key={s.id}>
  {segPeriodos.length > 1 && (
    <div className="text-[11px] font-bold text-t2 uppercase tracking-wider mb-2 px-1">
      {s.name} — {turnoLabel}
    </div>
  )}

  {/* Wrapper card — agrupa todos os períodos do turno */}
  <div className="card p-0 overflow-hidden">
    {periodos.map((p, idx) => {
      // ... lógica existente ...
      const isLast = idx === periodos.length - 1

      return (
        <div
          key={p.slot}
          className={`flex items-start gap-3 px-3 py-2.5
            ${!isLast ? 'border-b' : ''}
            ${abs
              ? (!isLast ? 'border-[#FDB8A8]/50' : '') + ' bg-[#FFF1EE]'
              : (!isLast ? 'border-bdr/50' : '')
            }
            ${!sched ? 'opacity-50' : ''}`}
        >
          {/* Horário ancorado — mesma estrutura */}
          <div className="text-center min-w-[56px] shrink-0 bg-surf2 rounded-lg py-1.5 px-1">
            <div className="font-mono text-[11px] font-bold text-t2">{p.label}</div>
            <div className="font-mono text-[10px] text-t3">{p.inicio}–{p.fim}</div>
          </div>

          {/* Conteúdo — adicionar cores de texto para falta */}
          <div className="flex-1 min-w-0">
            {sched ? (
              <>
                <div className={`font-bold text-sm ${abs ? 'text-[#7F1A06]' : ''}`}>
                  {sched.turma}
                </div>
                <div className={`text-xs ${abs ? 'text-[#9A3412]' : 'text-t2'}`}>
                  {subj?.name ?? '—'}
                </div>
                {/* SubPicker — inalterado */}
              </>
            ) : (
              <span className="text-xs text-t3 italic">Hora de estudo</span>
            )}
          </div>

          {/* Ações — inalteradas */}
        </div>
      )
    })}
  </div>
</div>
```

---

## Fora do Escopo (v1)

- [ ] Alterar o layout do desktop (`CalendarPage.jsx`)
- [ ] Mudar a lógica de dados, absences ou schedules
- [ ] Adicionar animações de transição entre estados
- [ ] Criar componente reutilizável de grade (extrair para arquivo separado)
- [ ] Alterar o estilo dos botões de ação ("Marcar falta", "Desfazer")
- [ ] Modificar `SubPicker`, `ToggleRuleButtons` ou `FullCandidateList`
- [ ] Alterar comportamento de swipe ou navegação entre dias
