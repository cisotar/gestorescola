# Plano Técnico — #83 Scaffold SubstitutionsPage

### Análise do Codebase

- `src/pages/SubstitutionsPage.jsx` — stub vazio (criado no #82). Será reescrito completamente.
- `src/pages/AbsencesPage.jsx` — padrão a seguir: tab pills com `mode` state, cada view como função interna separada, `allSlots` derivado via `useMemo` sobre `store.absences`.
- `src/lib/helpers.js:25` — `allTurmaObjects(segments)` → `[{ label, segmentId, ... }]`
- `src/lib/helpers.js:40` — `findTurma(label, segments)` → objeto de turma pelo label (usado na filtragem por segmento)
- `src/lib/helpers.js` — `parseDate(s)` → converte ISO string para Date
- `src/store/useAuthStore.js:11` — `teacher` (objeto completo) disponível quando `role === 'teacher'`, com `teacher.id`
- `store.absences[].slots[]` — cada slot tem `substituteId` e `date` (ISO "YYYY-MM-DD")
- `store.segments` — `[{ id, name, grades: [{ name, classes: [{ letter }] }] }]`

### Cenários

**Caminho Feliz — Admin:**
1. Admin acessa `/substitutions` — renderiza título, 5 abas, toolbar completa
2. Seleciona segmento → dropdown de turma aparece
3. Troca de aba → filtros globais mantidos

**Caminho Feliz — Teacher:**
1. Professor acessa `/substitutions`
2. `selSubstitute` já inicializado com `teacher.id`; dropdown de substituto oculto
3. Demais filtros e abas funcionam normalmente

**Casos de Borda:**
- `store.absences` vazio → `allSubSlots = []`, views mostram estado vazio
- Segmento sem turmas → dropdown aparece mas fica vazio
- `teacher?.id` nulo → `selSubstitute` fica `null` (fallback seguro)

**Tratamento de Erros:**
- Sem chamadas async — sem risco de erro de rede

### Schema de Banco de Dados
N/A

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar
- `src/pages/SubstitutionsPage.jsx` — reescrever completamente (stub → scaffold funcional)

### Arquivos que NÃO devem ser tocados
- `src/App.jsx`, `src/components/layout/Navbar.jsx`, `src/pages/AbsencesPage.jsx`

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. Reescrever `src/pages/SubstitutionsPage.jsx` com scaffold completo + stubs das 5 views
2. `npm run build` — verificar zero erros
