# Plano Técnico — #101 Redesenhar SubSlotRow com inversão lógica

### Análise do Codebase

- **SubSlotRow atual** (`SubstitutionsPage.jsx` L269–285): layout inline compacto, só `slotLabel`, sem data, sem checkbox, sem botão excluir.
- **SlotRow referência** (`AbsencesPage.jsx` L109–153): multi-coluna (checkbox + horário via `getAulas` + turma/matéria + status substituto + botão ✕). Props: `isAdmin`, `selectionMode`, `isSelected`, `onToggle`.
- **Imports atuais** de SubstitutionsPage: falta `getAulas` de `'../lib/periods'` e `toast` de `'../hooks/useToast'`.
- **Consumidores** (3 pontos: L373, L693, L735): passam apenas `sl` e `store`. Defaults seguros (`isAdmin=false`, `selectionMode=false`) garantem zero regressão.

### Cenários

**Feliz:** data + horário completo + turma/matéria + professor ausente em destaque. Admin vê ✕ para excluir.
**Seleção:** checkbox quando `selectionMode=true`, fundo `bg-accent-l`, ✕ desaparece.
**Exclusão:** `deleteAbsenceSlot(absenceId, slotId)` + `toast('Substituição removida', 'ok')`.
**Bordas:** teacher/subject não encontrado → `'—'`, timeSlot inválido → fallback `slotLabel`, date nulo → `'—'`.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**`src/pages/SubstitutionsPage.jsx`:**

1. **L5:** `import { slotLabel }` → `import { slotLabel, getAulas }`
2. **Adicionar:** `import { toast } from '../hooks/useToast'`
3. **L267–285:** substituir SubSlotRow inteiro pela nova versão:
   - Props: `{ sl, store, isAdmin = false, selectionMode = false, isSelected = false, onToggle }`
   - `useAppStore()` para `deleteAbsenceSlot`
   - `getAulas` para horário completo (label + inicio–fim)
   - Coluna de data (`formatBR(sl.date)`)
   - Inversão: coluna direita mostra **professor ausente** (não substituto)
   - Checkbox + botão ✕ condicionais
4. **Consumidores (L373, L693, L735):** NÃO alterar — defaults protegem

### Arquivos que NÃO devem ser tocados
- `AbsencesPage.jsx`, demais componentes do arquivo, `periods.js`, `helpers.js`, `reports.js`, store

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. Adicionar imports (`getAulas`, `toast`)
2. Substituir SubSlotRow (L267–285)
3. `npm run build` → zero erros
4. Validação visual: aba Substituto (expandir card), Semana, Mês — layout com data + horário completo + professor ausente
5. Marcar acceptance criteria
