# Spec: Bloqueio de Marcação de Faltas em Slots de Formação

## Visão Geral

Impedir que o sistema registre ausências (`absences/`) cujos slots correspondam a aulas de formação (`sharedSeries[].type === 'formation'`). O professor em formação (ex.: ATPCG, ATPCA, Multiplica, PDA) não está em regência de aula — falta não se aplica e não deve gerar demanda de substituto. A camada de segurança inviolável é implementada nas Firestore Security Rules; a camada de UI apenas orienta o usuário antes do write.

---

## Stack Tecnológica

- **Frontend:** React 18 + React Router 6 + Zustand — SPA em `/src/pages/` e `/src/components/`
- **Backend/Auth:** Firebase Auth (Google OAuth) + Firestore (fonte da verdade)
- **Regras de Segurança:** Firestore Security Rules (`firestore.rules`)
- **Estado Global:** Zustand (`useAppStore`, `useAuthStore`)
- **Lógica de Negócio:** `src/lib/helpers.js` (`isFormationSlot`), `src/lib/absences.js`

---

## Páginas e Rotas

### CalendarPage — `/calendar`

**Descrição:** Calendário semanal interativo onde admin e coordenadores visualizam a grade de ausências, acionam o ranking de substitutos e registram faltas slot a slot. É a principal interface de criação de ausências.

**Componentes:**
- Modal de slot (inline, uso único): exibe detalhes do slot selecionado e botão "Marcar Falta"
- `SuggestionPills`: exibe sugestões de substitutos — já usa `isFormationSlot` para suprimir candidatos

**Behaviors:**
- [ ] Detectar slot de formação: ao montar o modal de slot, verificar `isFormationSlot(sched.turma, sched.subjectId, store.sharedSeries)` para o schedule associado ao slot
- [ ] Desabilitar botão "Marcar Falta": se `isFormation === true`, renderizar o botão de marcação desabilitado (`disabled`, opacidade reduzida, cursor não permitido)
- [ ] Exibir hint visual: exibir texto explicativo junto ao botão desabilitado — "Slot de formação: falta não aplicável"
- [ ] Bloquear ação de criação no store: na action `addAbsence` do `useAppStore`, filtrar slots de formação antes de passar para `_createAbsence` — se todos os rawSlots forem de formação, cancelar a operação e emitir `toast('Slots de formação não permitem marcação de falta', 'warn')`

---

### CalendarDayPage — `/calendar/day`

**Descrição:** Versão mobile do calendário semanal. Exibe cards colapsáveis por período e permite marcação de falta. Recebe contexto via `location.state`.

**Componentes:**
- Card de slot (inline, uso único): card colapsável com botão de marcação de falta

**Behaviors:**
- [ ] Detectar slot de formação: verificar `isFormationSlot(sched.turma, sched.subjectId, store.sharedSeries)` para cada slot renderizado
- [ ] Desabilitar botão "Marcar Falta": renderizar desabilitado com hint "Slot de formação" quando `isFormation === true`
- [ ] Manter consistência com CalendarPage: o badge `badge-formation` "Dispensa de Substituição" já existente permanece inalterado — apenas o botão de marcação é bloqueado adicionalmente

---

## Componentes Compartilhados

- `isFormationSlot(turma, subjectId, sharedSeries)` em `src/lib/helpers.js`: função pura já existente — detecta se um slot pertence a uma `sharedSeries` de `type === 'formation'`. Nenhuma alteração necessária.
- `SuggestionPills` em `src/components/ui/SuggestionPills.jsx`: já consome `isFormationSlot` para suprimir sugestões em slots de formação. Nenhuma alteração necessária.

---

## Firestore Security Rules

Esta é a camada de segurança principal — inviolável via console Firebase, API direta ou qualquer cliente não autorizado.

### Regra atual (`absences/{doc}`)

```
match /absences/{doc} {
  allow read: if true;
  allow write: if isAuthenticated();
}
```

### Regra proposta

```
match /absences/{doc} {
  allow read: if true;

  allow create: if isAuthenticated()
    && !hasFormationSlot(request.resource.data.slots);

  allow update: if isAuthenticated()
    && !hasFormationSlot(request.resource.data.slots);

  allow delete: if isAuthenticated();
}
```

**Nova função auxiliar** a adicionar no bloco de funções do `firestore.rules`:

```
function hasFormationSlot(slots) {
  // Rejeita o write se qualquer slot do array tiver turma cujo nome
  // corresponda a sharedSeries de formação.
  // Como as Rules não têm acesso ao meta/config em tempo de execução,
  // a detecção é feita por convenção de nomenclatura:
  // turmas de formação têm subjectId prefixado com "formation-".
  return slots.size() > 0
    && slots[0].subjectId.matches('formation-.*');
}
```

> **Nota de implementação:** As Firestore Rules não podem fazer `get()` dentro de arrays de sub-campos em `request.resource.data.slots`. A estratégia viável é validar pelo `subjectId` do slot — todos os slots de formação usam `subjectId` prefixado com `"formation-"` (conforme `db.js` linhas 420–423: `'formation-atpcg'`, `'formation-atpca'`, `'formation-multiplica'`, `'formation-pda'`). Esta convenção deve ser documentada como contrato e mantida em qualquer criação futura de sharedSeries de tipo `formation`.

**Alternativa mais robusta (se a convenção de prefixo for insuficiente):** Adicionar um campo `isFormation: true` diretamente em cada slot ao serializar no `useAppStore.addAbsence`, e rejeitar writes onde `slots[0].isFormation == true` nas Rules. Esta alternativa elimina dependência de convenção de nomenclatura de `subjectId`.

---

## Modelos de Dados

### `absences/` — sem alteração estrutural

```js
{
  id:        string,
  teacherId: string,           // FK → teachers[].id
  createdAt: string,           // ISO datetime
  status:    'open' | 'partial' | 'covered',
  slots: [
    {
      id:           string,
      date:         string,    // "YYYY-MM-DD"
      day:          string,    // "Segunda" | ... | "Sexta"
      timeSlot:     string,    // "segmentId|turno|aulaIdx"
      scheduleId:   string | null,
      subjectId:    string | null,   // formation-* para slots de formação
      turma:        string,
      substituteId: string | null
    }
  ]
}
```

**Campo relevante para a regra:** `slots[n].subjectId` — quando prefixado com `"formation-"`, indica slot de formação e deve ser bloqueado na escrita.

### `meta/config — sharedSeries[]`

```js
sharedSeries: [
  {
    id:   string,           // ex: "shared-formacao"
    name: string,           // ex: "FORMAÇÃO"
    type: 'formation' | 'elective'
    // type === 'formation' → slots não demandam substituto e NÃO devem gerar ausência
    // type === 'elective'  → slots demandam substituto normalmente
  }
]
```

---

## Regras de Negócio

1. **Slots de formação nunca geram ausência:** Um slot cujo `schedule.turma` pertence a uma `sharedSeries` de `type === 'formation'` não deve ser gravado na coleção `absences/`. A regra vale independentemente do role do usuário que tenta o write.

2. **A Firestore Rule é a camada inviolável:** A validação no cliente (UI desabilitada, filtro no store) é orientativa e melhora a UX, mas a regra no `firestore.rules` é a única garantia real — ela bloqueia writes mesmo via Firebase Console, REST API ou SDK direto.

3. **Convenção de subjectId para formação:** Toda sharedSeries de `type === 'formation'` deve ter seus activities com `subjectId` prefixado por `"formation-"`. Esta convenção é o mecanismo que permite à Firestore Rule inspecionar slots sem `get()` cruzado em `meta/config`.

4. **Slots mistos (formação + regular) em uma mesma ausência:** Se o usuário tentar criar uma ausência com slots de tipos diferentes (formação e regular juntos), a Rule deve rejeitar o write. A solução correta é filtrar os slots de formação no cliente **antes** de montar o objeto de ausência, enviando ao Firestore apenas os slots regulares.

5. **Tipo `elective` não é afetado:** Slots de `sharedSeries` com `type === 'elective'` seguem o fluxo normal de ausência e substituição — o bloqueio é exclusivo para `type === 'formation'`.

6. **Sem impacto retroativo:** Ausências já gravadas com slots de formação (se existirem) não são removidas automaticamente. A regra é aplicada apenas para writes futuros.

---

## Fora do Escopo (v1)

- Migração/limpeza de ausências de formação já gravadas no Firestore antes desta implementação
- Validação de `type === 'elective'` — eletivas continuam com comportamento atual
- Alteração no algoritmo de ranking de candidatos (`rankCandidates`) — já exclui slots de formação corretamente
- Alteração na geração de relatórios PDF — `reports.js` já filtra `isFormationSlot` nos cálculos
- Notificação ao usuário via email/WhatsApp quando uma tentativa de falta em formação é bloqueada
- Interface de auditoria de writes bloqueados pelas Rules
