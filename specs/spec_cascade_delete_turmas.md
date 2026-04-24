# Spec: Cascade Delete de Turmas com Cutoff Temporal

## Visão Geral

Ao remover uma turma (ex: "6º Ano C") da configuração de segmentos, o sistema atualmente apaga apenas o registro em `meta/config.segments`, deixando órfãos em `schedules/` e `absences/`. Esta feature implementa um cascade delete com cutoff temporal: ao confirmar a remoção, todos os schedules da turma são deletados (pois são recorrentes, sem data), e os slots de ausências futuros (date >= today) são deletados, preservando o histórico de faltas passadas para auditoria. O histórico em `history/` nunca é alterado.

## Stack Tecnológica

- Frontend: React 18.3.1 + Tailwind CSS 3.4.10
- Estado: Zustand 4.5.4 (`useAppStore`)
- Backend: Firebase Firestore 10.12.2 (sem servidor próprio)
- Banco de dados: Firestore — coleções `schedules/`, `absences/`, `admin_actions/` (nova), `pending_actions/`
- Utilitários: `src/lib/helpers/dates.js` (`formatISO`), `src/lib/db/index.js` (`deleteDocById`, `saveDoc`)

## Páginas e Rotas

### Gerenciamento de Segmentos — `/settings?tab=segments`

**Descrição:** Aba "Segmentos" da SettingsPage onde administradores e coordenadores gerenciam a hierarquia de segmentos → séries → turmas. O botão `×` ao lado de cada turma em `GradeRow` dispara o fluxo de remoção.

**Componentes:**

- `GradeRow` (`src/components/settings/teachers/GradeRow.jsx`): exibe as turmas de uma série como pills com botão `×`; ao clicar `×`, abre o `RemoveClassModal` em vez de chamar `store.removeClassFromGrade` diretamente
- `RemoveClassModal` (novo, co-localizado em `GradeRow.jsx`): modal de confirmação com resumo de impacto e botão de confirmação
- `ImpactSummary` (interno ao modal): seção que exibe os contadores de aulas e faltas afetadas

**Behaviors:**

- [ ] Behavior 1 — Abrir modal de confirmação: ao clicar `×` em uma turma pill, abrir `RemoveClassModal` passando `{ segId, gradeName, letter }` como contexto; não executar nenhuma deleção ainda
- [ ] Behavior 2 — Calcular impacto antes de exibir: ao abrir o modal, calcular sincronamente a partir do estado Zustand: (a) `schedulesCount` = total de schedules onde `turma === fullTurmaLabel`; (b) `futureSlots` = slots de absences onde `turma === fullTurmaLabel AND date >= today`; (c) `pastSlots` = slots onde `turma === fullTurmaLabel AND date < today`; (d) `absencesAffected` = absences que contêm ao menos um slot futuro da turma
- [ ] Behavior 3 — Exibir resumo de impacto no modal: mostrar quatro linhas de informação: "X aulas da grade serão deletadas", "X faltas futuras serão deletadas", "X faltas passadas serão mantidas (histórico)", "Data efetiva: [hoje formatado como DD/MM/AAAA]"
- [ ] Behavior 4 — Confirmar remoção (admin): ao clicar "Confirmar Remoção", executar `store.removeClassFromGradeCascade(segId, gradeName, letter)` que: (1) remove a turma de `meta/config`; (2) deleta todos os schedules da turma no Firestore e no store; (3) deleta slots futuros das absences afetadas e remove absences que ficarem sem slots; (4) registra em `admin_actions/`
- [ ] Behavior 5 — Confirmar remoção (coordenador): ao clicar "Confirmar Remoção", enviar para `pending_actions/` com `action: 'removeClassFromGradeCascade'` e `payload: { segId, gradeName, letter }`; exibir toast "Solicitação enviada para aprovação do ADM"
- [ ] Behavior 6 — Cancelar modal: ao clicar "Cancelar" ou fora do modal, fechar sem realizar nenhuma mutação
- [ ] Behavior 7 — Feedback pós-confirmação (admin): ao concluir todas as operações, fechar modal, exibir toast "Turma [label] removida. X aulas e Y faltas futuras deletadas." com tipo `ok`
- [ ] Behavior 8 — Estado de carregamento: durante a execução das deleções (operações assíncronas no Firestore), exibir spinner no botão "Confirmar Remoção" e desabilitar interações do modal

---

### Aprovação de Solicitações — `/settings?tab=approvals`

**Descrição:** Aba "Solicitações" da SettingsPage, acessível apenas ao admin. Exibe `PendingActionCard` para cada ação pendente, incluindo solicitações de `removeClassFromGradeCascade`.

**Componentes:**

- `PendingActionCard` (`src/components/settings/approvals/PendingActionCard.jsx`): exibe o resumo da ação pendente com botões de aprovar/rejeitar; já existente, sem alteração de layout necessária
- `TabApprovals` (`src/components/settings/tabs/TabApprovals.jsx`): lista todas as pending_actions; sem alteração necessária

**Behaviors:**

- [ ] Behavior 9 — Exibir solicitação de remoção de turma: o `summary` gravado em `pending_actions` deve ser legível, ex: "Remover turma 6º Ano C (cascade: X aulas, Y faltas futuras)"
- [ ] Behavior 10 — Aprovar solicitação: ao clicar "Aprovar" em `PendingActionCard`, executar `approvePendingAction(id, adminEmail)` que re-executa `removeClassFromGradeCascade` com o payload original; o cascade completo é executado neste momento
- [ ] Behavior 11 — Rejeitar solicitação: ao clicar "Rejeitar", abrir `RejectModal` com campo de motivo; gravar motivo em `pending_actions` e não executar o cascade

---

## Componentes Compartilhados

- `Modal` (`src/components/ui/Modal.jsx`): usado pelo `RemoveClassModal`; aceita `size="md"`, fecha com Escape e click no backdrop
- `Spinner` (`src/components/ui/Spinner.jsx`): exibido no botão de confirmação durante operações assíncronas
- `toast` (`src/hooks/useToast.js`): notificações de resultado ao final da operação

## Modelos de Dados

### `pending_actions/` — Registro existente, payload ampliado

```js
{
  id:              "pa9x2k7",
  coordinatorId:   "lv9k2a7",
  coordinatorName: "Maria Coord",
  action:          "removeClassFromGradeCascade",
  payload: {
    segId:     "seg-fund",
    gradeName: "6º Ano",
    letter:    "C"
  },
  summary: "Remover turma 6º Ano C (cascade: 5 aulas, 3 faltas futuras)",
  createdAt:       Timestamp,
  status:          "pending",
  reviewedBy:      null,
  reviewedAt:      null,
  rejectionReason: null
}
```

### `admin_actions/` — Coleção nova para auditoria

Document ID gerado via `uid()`.

```js
{
  id:                    "aa3m1k9",
  type:                  "removeClassFromGrade",
  removedClass:          "6º Ano C",           // label completo da turma removida
  segId:                 "seg-fund",
  gradeName:             "6º Ano",
  letter:                "C",
  removedAt:             "2026-04-23",          // ISO date (today no momento da execução)
  executedBy:            "admin@escola.sp.gov.br",  // email de quem executou
  schedulesDeletedCount: 5,                     // total de schedules deletados
  absencesAffectedCount: 2,                     // total de absences que tiveram slots deletados
  futureSlotsDeleted:    3,                     // total de slots de ausência deletados
  pastSlotsKept:         7,                     // total de slots preservados (auditoria)
  createdAt:             Timestamp              // serverTimestamp()
}
```

### `schedules/` — Sem alteração de schema

Schedules da turma removida são deletados integralmente (são recorrentes, não têm `date`). A identificação é feita pelo campo `turma` comparado ao label completo da turma (ex: `"6º Ano C"`).

### `absences/` — Sem alteração de schema

Slots com `turma === fullLabel AND date >= today` são deletados. Se uma absence ficar sem slots após a limpeza, o documento inteiro é deletado. Slots com `date < today` são preservados.

## Regras de Negócio

1. **Label de identificação da turma:** o campo `turma` nos schedules e nos slots de absences armazena o label completo no formato `"[gradeName] [letter]"` (ex: `"6º Ano C"`). A correspondência deve ser exata (case-sensitive) para evitar deleção acidental de turmas com nomes similares.

2. **Schedules são sempre deletados integralmente:** schedules não têm campo `date` (são recorrentes semanais). Não existe cutoff para schedules — todos os schedules onde `turma === fullLabel` são removidos.

3. **Absences respeitam cutoff temporal:** apenas slots com `date >= formatISO(new Date())` (today, calculado no momento da execução) são deletados. Slots com `date < today` são imutáveis para fins de histórico.

4. **Absence sem slots é deletada:** após remover os slots futuros, se uma absence ficar com `slots.length === 0`, o documento inteiro da absence deve ser deletado do Firestore e removido do store.

5. **History é imutável:** a coleção `history/` nunca é tocada por este fluxo, em nenhuma circunstância.

6. **Permissões RBAC:**
   - Admin (`role === 'admin'`): executa o cascade imediatamente via `store.removeClassFromGradeCascade`.
   - Coordenador (`role === 'coordinator'` ou `'teacher-coordinator'`): a action é interceptada por `_isCoordinator()` e enviada para `pending_actions/` via `_submitApproval`. O cascade só é executado quando o admin aprova.

7. **Auditoria obrigatória:** toda execução direta (admin) deve gravar um documento em `admin_actions/` antes de finalizar. Execuções aprovadas de coordenadores também devem gravar (com `executedBy` do admin aprovador).

8. **Atomicidade das deleções Firestore:** usar `writeBatch` do Firestore para deletar todos os schedules e slots afetados em uma única operação atômica. Limite do Firestore: 500 operações por batch. Se a escola tiver mais que 500 documentos afetados, dividir em múltiplos batches sequenciais.

9. **Atualização do store após cascade:** após o batch commit, atualizar o estado Zustand de forma imutável: remover os schedules deletados de `state.schedules` e atualizar as absences afetadas em `state.absences`.

10. **Cálculo de impacto é baseado no store local:** o sumário exibido no modal é calculado a partir dos dados em memória (Zustand), não via consulta Firestore, para evitar latência na abertura do modal. O cálculo usa `state.schedules` e `state.absences` já carregados.

## Fora do Escopo (v1)

- Remoção em cascade ao deletar uma série (`removeGrade`) ou segmento inteiro (`removeSegment`) — apenas `removeClassFromGrade` recebe cascade nesta versão
- Notificação por e-mail ou WhatsApp aos professores afetados pelo cascade
- Desfazer (undo) da operação após confirmação
- Interface de consulta à coleção `admin_actions/` para visualizar histórico de remoções
- Cascade delete de absences cujos slots estão em outras turmas além da removida (somente a turma específica é afetada)
- Validação de conflitos em pending_actions (ex: duas solicitações de remoção da mesma turma em paralelo)
