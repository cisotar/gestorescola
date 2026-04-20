# Plano Técnico — #88 ViewRanking com carga real e alternância de ordenação

### Análise do Codebase

- **`src/pages/SubstitutionsPage.jsx`** (scaffold do #83): stub `ViewRanking` já recebe `store`, `filterMonth`, `filterYear` como props. `filteredSlots` é passado mas **não deve ser usado** (já filtrado por substituto/segmento/turma, o que quebra o ranking global).
- **`src/lib/absences.js` → `monthlyLoad`**: `(teacherId, referenceDate, schedules, absences)`. **Não** é reusada diretamente porque: (a) só soma até `referenceDate`, não o mês inteiro; (b) retorna apenas o total combinado — precisamos de `scheduled` e `substitutions` separados. A **lógica de contagem é replicada** (com comentário indicando que espelha `monthlyLoad`).
- **`src/lib/helpers.js`**: `colorOfTeacher`, `businessDaysBetween`, `dateToDayLabel`, `formatISO`.
- **`store.schedules`**: `[{ teacherId, day, ... }]`. `day` é label em português, casa com `dateToDayLabel`.
- **`store.absences[].slots[]`**: cada slot tem `date` (ISO), `substituteId`.

### Decisões-Chave

1. **Não reusar `monthlyLoad` — replicar lógica**. Motivos: mês inteiro (não só até hoje) e retorno separado (`scheduled`, `substitutions`). Risco: divergência futura. Mitigação: comentário explícito na origem.
2. **Ignorar `filteredSlots`** — ranking é sempre global. Ler `store.absences` e `store.schedules` diretamente.
3. **Performance**: pré-agregar em `Map`s (schedules por `teacherId||day`, subs por `teacherId`) numa única varredura → evita O(N*M). Dois `useMemo` separados: cálculo pesado + ordenação barata.
4. **Professores zerados** não são omitidos — caem no fim.

### Cenários

**Caminho Feliz:**
1. Usuário abre aba "Ranking". `filterMonth`/`filterYear` default do mês atual.
2. `useMemo` calcula `{ teacher, scheduled, substitutions, total }` para cada professor.
3. Lista ordenada DESC por `total`. Desempate alfabético.
4. Botão alterna `sortBy` entre `'total'` e `'substitutions'`; segundo `useMemo` reordena.
5. Trocar mês/ano → recálculo automático.

**Casos de Borda:**
- Professor sem aulas/subs → `total = 0`, fim da lista.
- Mês vazio → todos com 0; ordenação alfabética.
- Nenhum professor cadastrado → mensagem `"Nenhum professor cadastrado."`.
- Professor excluído → não aparece (iteramos `store.teachers`).
- `store.schedules`/`store.absences` undefined → `?? []` defensivo.

**Erros:** sem calls async, sem try/catch.

### Schema de Banco de Dados
N/A.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

- **`src/pages/SubstitutionsPage.jsx`**:
  - Adicionar imports: `colorOfTeacher`, `businessDaysBetween`, `dateToDayLabel`, `formatISO` de `../lib/helpers`.
  - Substituir stub `ViewRanking` pela implementação completa:
    - `useState('total')` para `sortBy`
    - `useMemo` com deps `[store.teachers, store.schedules, store.absences, filterMonth, filterYear]` que calcula os rows usando `Map`s pré-agregados
    - Segundo `useMemo` com deps `[rows, sortBy]` para ordenação
    - Botão `btn btn-ghost btn-sm` com label dinâmico
    - Lista em `card p-0` com `<ul>` dividido por `divide-y divide-bdr/60`, cada linha: `#idx + avatar colorido + nome + sub-legenda "X próprias | Y substituições" + valor principal (`text-2xl font-extrabold`)`
    - **Não usar `filteredSlots`**

### Arquivos que NÃO devem ser tocados
- `src/lib/absences.js`, `src/lib/helpers.js`, `src/store/useAppStore.js`
- `src/App.jsx`, `src/components/layout/Navbar.jsx`
- Stubs das outras views

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. Adicionar imports extras em `SubstitutionsPage.jsx`.
2. Substituir stub `ViewRanking` pela implementação completa.
3. Testar no browser: ordenação default, alternância, troca de mês/ano, avatares, sub-legendas.
4. `npm run build` — validar compilação.
