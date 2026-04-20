# Plano Técnico — #105 Ranking como seção da aba "Por Mês"

### Análise do Codebase

**Estado atual:**
- `ViewRanking` (L1005–1112): componente standalone, recebe `filterMonth`/`filterYear` do pai. Calcula `scheduled` (aulas agendadas via schedules) e `substitutions` (coberturas realizadas). Ordena por `total` ou `substitutions`.
- Tabs (L212–218): 5 abas incluindo `ranking`.
- Pai (L264): `{mode === 'ranking' && <ViewRanking ...>}`
- `generateSubstitutionRankingHTML` em reports.js (L657–691): tabela com colunas #, Professor, Próprias, Substituições, Total.

**Mudança de conceito:** o ranking muda de "carga real" (aulas + substituições) para "assiduidade" (aulas próprias vs ausências). Isso muda completamente as colunas e o cálculo.

**Dados disponíveis:**
- `store.schedules` → aulas agendadas por professor/dia
- `store.absences` → ausências registradas (cada absence tem `slots[]` com `teacherId`, `date`)
- `businessDaysBetween` + `dateToDayLabel` → para contar aulas agendadas no mês
- O cálculo de ausências é diferente do de substituições: conta slots de ausência do professor (não slots onde ele substituiu)

### Decisões-Chave

1. **Ranking vira toggle dentro de ViewByMonth** — botão "Ranking" alterna entre a vista de substituições e a tabela de assiduidade.
2. **Novo cálculo:** `aulasProprías` = total agendadas no mês (schedules × dias úteis), `ausências` = slots de ausência registrados para o professor, `% assiduidade` = `(aulas - ausências) / aulas * 100`.
3. **Faixas de cor:** verde (>90%), amarelo (70-90%), vermelho (<70%).
4. **Ordenação:** padrão `attendance` (% assiduidade desc), alternáveis para `scheduled` ou `absences`.
5. **`generateSubstitutionRankingHTML`** reescrito para novo formato (Aulas Próprias | Ausências | % Assiduidade).
6. **Contagem de ausências:** conta slots em `store.absences` onde `teacherId` é o professor e `date` está no mês — cada slot = 1 aula perdida. Não filtra por `substituteId`.

### Cenários

**Feliz:** Admin na aba Mês → clica "Ranking" → tabela aparece com todos os professores ordenados por % assiduidade. Verde/amarelo/vermelho. PDF gera relatório.
**Bordas:** Professor sem aulas agendadas → % = "—" (evitar divisão por zero). Mês sem ausências → todos 100% verde.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**`src/pages/SubstitutionsPage.jsx`:**
1. Remover `{ id: 'ranking', label: '🏆 Ranking' }` do array de tabs (L217)
2. Remover invocação `{mode === 'ranking' && <ViewRanking ...>}` do pai (L264)
3. Remover `ViewRanking` inteiro (L1000–1112)
4. Adicionar estado `showRanking` + lógica de ranking dentro de `ViewByMonth`:
   - Botão toggle "🏆 Ranking" na toolbar
   - Quando ativo: tabela com #, Professor, Aulas Próprias, Ausências, % Assiduidade
   - Ordenação alternável + PDF
5. Remover import de `generateSubstitutionRankingHTML` (será substituído pela versão atualizada)

**`src/lib/reports.js`:**
1. Reescrever `generateSubstitutionRankingHTML` com novo formato: #, Professor, Aulas Próprias, Ausências, % Assiduidade, com faixas de cor.

### Arquivos que NÃO devem ser tocados
- AbsencesPage, helpers.js, periods.js, absences.js
- SubSlotRow, WhatsAppButton, ViewBySubstitute, ViewByDay, ViewByWeek

### Ordem de Implementação
1. Atualizar `generateSubstitutionRankingHTML` em reports.js
2. Remover aba Ranking dos tabs e do pai
3. Remover `ViewRanking` componente
4. Integrar ranking como toggle dentro de ViewByMonth
5. `npm run build`
6. Validar: 4 abas, toggle ranking, tabela, ordenação, faixas de cor, PDF
