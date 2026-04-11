# Spec: Correção de KPIs e Nova Página de Carga Horária (Admin)

## Visão Geral

Os KPIs do `DashboardPage` exibem valores inconsistentes com os dados reais: após exclusão de todas as ausências pela AbsencesPage, o Dashboard ainda mostra "14 faltas" e "10 sem substituto". Além disso, a tabela "Carga Horária" mistura fontes de dados (`store.absences` vs `store.history`) e precisa evoluir para uma página dedicada clicável.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind CSS (tokens customizados)
- **Estado:** Zustand (`useAppStore`, `useAuthStore`)
- **Backend/DB:** Firebase Firestore (`absences`, `schedules`, `teachers`, `history`)
- **Roteamento:** React Router v6

---

## Causa Raiz dos KPIs Incorretos

### Fonte de dados duplicada

| KPI / Coluna | Fonte atual | Fonte correta |
|---|---|---|
| StatPill "faltas registradas" | `store.absences` (slots) | `store.absences` — OK |
| StatPill "sem substituto" | `store.absences` (slots sem substituteId) | `store.absences` — OK |
| WorkloadTable coluna "Faltas" | `store.history` (entradas de histórico) | `store.absences` (slots por professor) |
| WorkloadTable coluna "Subs" | `store.history` (entradas de histórico) | `store.absences` (slots onde `substituteId === t.id`) |

A função `getTeacherStats` usa `history` para contar faltas e subs por professor — mas `history` é um log de substituições **confirmadas**, diferente de `store.absences` que são as ausências **ativas/atuais**. O Dashboard mistura as duas fontes, gerando a divergência com AbsencesPage.

### Ausência de listener em tempo real

`App.jsx` tem `onSnapshot` para a coleção `teachers`, mas **não** para `absences`. Após `deleteManySlots`, o store local é atualizado corretamente, mas se o usuário recarregar antes de `save()` completar (ou se `save()` falhar silenciosamente), Firestore pode ter dados desatualizados que serão relidos no próximo `loadFromFirestore()`.

---

## Páginas e Rotas

### DashboardPage (modificada) — `/dashboard`

**Descrição:** Página principal do admin. Exibe KPIs, alertas de sobrecarga, tabela de carga horária (agora clicável) e histórico de substituições.

**Componentes afetados:**
- `StatPill` — sem mudança estrutural, apenas garantir fonte correta
- `WorkloadTable` — corrigir cálculo de "Faltas" e "Subs" + tornar card clicável
- `getTeacherStats` (helper local) — reescrever para usar `store.absences`

**Behaviors:**
- [ ] Ver KPI "faltas registradas" refletindo exatamente `store.absences.flatMap(ab => ab.slots).length`
- [ ] Ver KPI "sem substituto" refletindo slots onde `substituteId == null` em `store.absences`
- [ ] Ver tabela de carga horária com "Faltas" = slots ausentes por professor (de `store.absences`)
- [ ] Ver tabela de carga horária com "Subs" = slots onde `substituteId === t.id` (de `store.absences`)
- [ ] Clicar no card "Carga Horária" → navega para `/workload`
- [ ] Após excluir ausências em AbsencesPage e voltar ao Dashboard, KPIs mostram 0

---

### WorkloadPage (nova) — `/workload`

**Descrição:** Tabela completa de carga horária de todos os professores. Mostra aulas por semana, total de faltas registradas e total de substituições realizadas. Acesso restrito a admin.

**Componentes internos:**
- `WorkloadPage` — página principal com tabela
- `WorkloadRow` — linha da tabela por professor (inline, sem export)

**Behaviors:**
- [ ] Ver tabela com todos os professores ordenados alfabeticamente
- [ ] Ver coluna "Aulas" = `schedules.filter(s => s.teacherId === t.id).length`
- [ ] Ver coluna "Faltas" = total de slots ausentes do professor em `store.absences`
- [ ] Ver coluna "Substituições" = total de slots onde `substituteId === t.id` em `store.absences`
- [ ] Ver barra de progresso na coluna "Aulas" (proporcional ao limite `workloadDanger`)
- [ ] Estado vazio quando não há professores cadastrados
- [ ] Botão "← Voltar" navega para `/dashboard`

---

## Componentes Compartilhados

Nenhum novo componente compartilhado — tudo definido localmente nas páginas.

O `ActionCard` existente em `src/components/ui/ActionCard.jsx` **não** é o mesmo componente do `DashboardPage` — o Dashboard define seu próprio `ActionCard` internamente. A navegação para WorkloadPage será via `useNavigate` no header do card, sem criar novo componente.

---

## Modelos de Dados

Nenhuma alteração de schema. As coleções já existem:

**`absences`** (Firestore)
```
{
  id: string,
  teacherId: string,
  createdAt: ISO string,
  status: 'open' | 'partial' | 'covered',
  slots: [{ id, date, timeSlot, turma, subjectId, substituteId? }]
}
```

**Fórmulas de cálculo corrigidas:**
```js
// Faltas por professor (de store.absences)
const faltas = absences
  .flatMap(ab => ab.slots)
  .filter(sl => sl.teacherId === t.id || ab.teacherId === t.id)
  .length

// Correto (absences já têm teacherId no nível do documento):
const faltas = absences
  .filter(ab => ab.teacherId === t.id)
  .reduce((acc, ab) => acc + ab.slots.length, 0)

// Substituições por professor (de store.absences)
const subs = absences
  .flatMap(ab => ab.slots)
  .filter(sl => sl.substituteId === t.id)
  .length
```

---

## Regras de Negócio

1. **KPIs do Dashboard** devem usar `store.absences` como única fonte — mesma fonte da AbsencesPage.
2. **"Faltas"** no contexto da tabela de carga horária = slots ativos em `store.absences` onde `ab.teacherId === t.id`.
3. **"Substituições"** = slots em `store.absences` onde `sl.substituteId === t.id` (independente do professor ausente).
4. **`store.history`** não deve ser usado para cálculo de KPIs — é apenas um log de texto para exibição no painel de histórico.
5. O card de Carga Horária no Dashboard deve navegar para `/workload` ao ser clicado (header do card vira botão).
6. A nova página `/workload` é exclusiva para admin (guard via `role === 'admin'` — consistente com padrão atual do App.jsx).

---

## Fora do Escopo (v1)

- Filtros por período na página de carga horária (semana/mês)
- Paginação ou busca por professor
- Exportação CSV/PDF da tabela de carga horária
- Listener `onSnapshot` em tempo real para a coleção `absences` (melhoria de infra separada)
- Alteração da coleção `history` ou sua lógica de escrita
