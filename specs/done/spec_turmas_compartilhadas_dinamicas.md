# Spec: Turmas Compartilhadas Dinâmicas

## Visão Geral

Hoje o sistema tem a turma "FORMAÇÃO" e suas atividades (ATPCG, ATPCA, etc.) escritas diretamente no código. Isso significa que para adicionar uma nova atividade de formação — ou criar um outro tipo de turma que vários professores podem usar ao mesmo tempo — seria necessário mexer no código e fazer um novo deploy.

Esta spec elimina esse problema: o administrador passa a gerenciar essas turmas especiais diretamente nas configurações do sistema, sem precisar de intervenção técnica.

A lógica é simples: uma **turma compartilhada** é uma turma que aceita vários professores registrados ao mesmo tempo no mesmo horário (sem gerar conflito). Cada turma compartilhada tem um nome e uma lista de **atividades** — que são o que diferencia os registros dos professores dentro dela.

**Exemplo atual (hardcoded):**
- Turma compartilhada: `FORMAÇÃO`
- Atividades: `ATPCG`, `ATPCA`, `Multiplica`, `PDA`, `Alinhamento`

**Com esta spec:** o admin cria e edita isso pelas configurações, e o sistema funciona da mesma forma para qualquer turma compartilhada que ele criar.

---

## Stack Tecnológica
- Frontend: React 18 + Tailwind CSS
- Estado: Zustand (useAppStore)
- Banco de dados: Firestore — coleção `meta/config` (mesmo padrão das áreas e matérias)
- Build/Deploy: Vite + Firebase Hosting

---

## Páginas e Rotas

### Configurações — `/settings` (aba Admin → sub-aba "Turmas Compartilhadas")

**Descrição:** Nova sub-aba dentro da aba "Turmas" (ou nova aba própria) na área de configurações do administrador. Permite criar, editar e excluir turmas compartilhadas e suas atividades.

**Componentes:**
- `TabSharedSeries`: lista todas as turmas compartilhadas cadastradas
- `SharedSeriesCard`: exibe nome da turma + lista de atividades + botões de ação
- `SharedSeriesModal`: modal para criar ou editar uma turma compartilhada
- `ActivityItem`: item de atividade dentro do modal, com campo de nome e tipo (fixo/variável)

**Behaviors:**
- [ ] Criar turma compartilhada: admin clica em "Nova turma compartilhada", informa o nome (ex: "FORMAÇÃO", "REUNIÃO PEDAGÓGICA") e salva
- [ ] Editar nome de uma turma compartilhada existente
- [ ] Excluir turma compartilhada: só permitido se não houver horários registrados usando ela; caso contrário, exibe aviso
- [ ] Adicionar atividade a uma turma: dentro do modal de edição, admin clica em "Adicionar atividade", informa o nome e o tipo (Fixo ou Variável)
- [ ] Editar nome e tipo de uma atividade existente
- [ ] Remover atividade: só permitido se não houver horários registrados com ela; caso contrário, exibe aviso
- [ ] Reordenar atividades dentro de uma turma (arraste ou botões ↑↓)

---

### Grade Horária do Professor — `ScheduleGrid` (dentro de `/settings`)

**Descrição:** Ao adicionar um horário, a seção "Formação" atual é substituída por uma seção dinâmica "Turmas Compartilhadas", que lista todas as turmas cadastradas pelo admin.

**Behaviors:**
- [ ] Exibir todas as turmas compartilhadas cadastradas como opções de seleção (em vez da lista hardcoded)
- [ ] Ao selecionar uma turma compartilhada, exibir o seletor de atividade com as opções cadastradas para aquela turma
- [ ] Ao salvar, registrar `turma = nome da turma compartilhada` e `subjectId = id da atividade`
- [ ] Múltiplos professores podem registrar a mesma turma compartilhada no mesmo horário sem conflito
- [ ] Célula da grade exibe: linha 1 = nome da turma, badge Fixo/Variável (se a atividade tiver tipo), linha 2 = nome da atividade

---

### Grade Escolar — `SchoolSchedulePage` — `/school-schedule` (se existir)

**Behaviors:**
- [ ] Células de turma compartilhada exibem `"[Nome da Turma] · [Nome da Atividade]"` (ex: `"Formação · ATPCG"`)
- [ ] Fallback `"[Nome da Turma] · ?"` se a atividade não for encontrada

---

## Modelos de Dados

### Turma Compartilhada (`sharedSeries`)

Armazenada dentro de `meta/config`, no campo `sharedSeries` (array), seguindo o mesmo padrão de `areas` e `subjects`.

```js
{
  id: uid(),              // ID estável gerado por uid()
  name: 'FORMAÇÃO',       // Nome exibido como turma no horário
  activities: [
    {
      id: uid(),          // ID estável da atividade
      name: 'ATPCG',      // Nome exibido no seletor e na grade
      tipo: 'fixo',       // 'fixo' | 'variavel' | null (opcional)
      order: 0,           // Ordem de exibição
    },
    ...
  ]
}
```

**Relação com `schedules`:**
- `schedule.turma` = `sharedSeries.name` (string — mantém compatibilidade com o campo atual)
- `schedule.subjectId` = `activity.id` (ID estável da atividade)

---

## Regras de Negócio

1. **Sem conflito de turma:** qualquer turma presente em `sharedSeries` é automaticamente excluída da verificação de bloqueio de turma — qualquer número de professores pode registrá-la no mesmo horário.

2. **Atividade obrigatória:** ao salvar um horário em uma turma compartilhada, o sistema bloqueia o save se nenhuma atividade for selecionada.

3. **Exclusão protegida:** não é possível excluir uma turma compartilhada ou uma atividade que ainda tenha horários registrados no sistema. O admin vê uma mensagem informando quantos horários seriam afetados.

4. **Nome único:** não podem existir duas turmas compartilhadas com o mesmo nome (comparação sem distinção de maiúsculas/minúsculas).

5. **Migração automática:** os horários existentes que usam `turma = 'FORMAÇÃO'` e `subjectId = 'formation-atpcg'` (IDs hardcoded) precisam ser migrados para os novos IDs gerados dinamicamente. Isso requer uma função de migração one-shot semelhante à `migrateFormationSchedules`.

6. **Compatibilidade futura:** a lógica de detecção de turma compartilhada (`isSharedSeries`) passa a consultar o store em vez de constantes hardcoded.

---

## Fora do Escopo (v1)

- Permissão por turma (restringir quais professores podem usar cada turma compartilhada)
- Histórico de alterações nas turmas compartilhadas
- Importação/exportação de turmas compartilhadas via CSV
- Relatórios específicos por atividade de turma compartilhada
- Cores customizadas por turma compartilhada
