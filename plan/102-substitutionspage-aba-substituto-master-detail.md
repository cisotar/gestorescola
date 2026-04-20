# Plano Técnico — #102 Aba "Por Substituto" master-detail

### Análise do Codebase

- **Referência:** AbsencesPage `ViewByTeacher` (L256–463) — grid `280px_1fr`, sidebar com cards scrolláveis, painel com cabeçalho colorido + filtros temporais (all/day/week/month) + lista por data.
- **Estado atual:** `ViewBySubstitute` (L417–461) é grid de cards empilhados sem sidebar. `TeacherSubCard` (L322–413) é card colapsável com PDFs no header.
- **SubSlotRow** (L269–318) já redesenhado na #101 — reutilizar como está.
- **Imports faltando:** `Modal` de `'../components/ui/Modal'` (para WhatsAppButton).
- **WhatsApp:** `buildWhatsAppMessage` de `reports.js` pode não suportar substituições. Decisão: mensagem simplificada inline nesta issue; extensão completa na #107.
- **`computeAbsenceSlots`** (~L17) — helper existente, usado para Extrato de Saldo.

### Decisões-Chave

1. **`TeacherSubCard` é removido** — substituído pelo painel central de ViewBySubstitute (cabeçalho + filtros + lista).
2. **WhatsApp** com mensagem simples inline (sem estender reports.js).
3. **`selTeacher` local** em ViewBySubstitute — quando `selSubstitute` global está setado, pré-seleciona.
4. **Filtros temporais** copiam o padrão de `ViewByTeacher`: `buildFilter()` → tipo + parâmetros → filtra slots.

### Cenários

**Feliz:** sidebar com N professores → clicar → painel carrega com cabeçalho + filtros + lista agrupada por data. Botões PDF e WhatsApp funcionam.
**Teacher:** sidebar com 1 card (próprio), auto-selecionado.
**Bordas:** nenhum substituto → estado vazio; filtro temporal sem resultados → "Nenhuma substituição no período".

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**`src/pages/SubstitutionsPage.jsx`:**
1. Import: `Modal` de `'../components/ui/Modal'`
2. Adicionar `WhatsAppButton` simplificado (antes de ViewBySubstitute)
3. Remover `TeacherSubCard` (L320–413)
4. Reescrever `ViewBySubstitute` (L415–461) → layout `grid-cols-[280px_1fr]`, sidebar + painel com filtros temporais + lista
5. Manter invocação no pai (~L248) — props atuais suficientes

### Arquivos que NÃO devem ser tocados
- AbsencesPage.jsx, reports.js, helpers.js, absences.js, store
- SubSlotRow, ViewByDay, ViewByWeek, ViewByMonth, ViewRanking

### Ordem de Implementação
1. Import Modal
2. Criar WhatsAppButton simplificado
3. Remover TeacherSubCard
4. Reescrever ViewBySubstitute com master-detail
5. `npm run build`
6. Validar: sidebar + seleção + filtros + PDFs + WhatsApp + mobile
