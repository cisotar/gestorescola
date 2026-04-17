# Spec: Horários Especiais e Intervalos Especiais

## Visão Geral

Administradores precisam inserir blocos de tempo fora da grade regular em dias específicos (ex: apresentações, ensaios, provas, eventos) sem alterar a configuração permanente de períodos. A feature adiciona duas novas seções na aba "Períodos" de `SettingsPage`: **Horários Especiais** (equivalentes a aulas extraordinárias com hora de início e duração livres) e **Intervalos Especiais** (pausas posicionadas relativamente a um horário especial, análogos aos intervalos regulares). Ambos os tipos suportam múltiplas entradas por segmento/turno e são persistidos dentro do mesmo objeto `periodConfigs` em `meta/config`.

---

## Stack Tecnológica

- **Frontend:** React 18 + JSX, co-localizado em `SettingsPage.jsx` (componentes de uso único acima do `export default`)
- **Estado global:** Zustand — `useAppStore` via action `savePeriodCfg`
- **Persistência:** Firestore `meta/config` via `saveConfig(get())` (atômico)
- **Estilo:** Tailwind CSS com tokens customizados do projeto (`card`, `inp`, `btn`, `btn-ghost`, `btn-xs`, `lbl`, `surf2`, `bdr`, `t2`, `t3`, etc.)
- **Lógica de períodos:** `src/lib/periods.js` — `gerarPeriodos`, `toMin`, `fromMin`
- **Banco de dados:** Firebase Firestore

---

## Páginas e Rotas

### Configurações — `/settings` (aba "Períodos")

**Descrição:** A aba Períodos já exibe um card por segmento com campos de início, duração e quantidade de aulas, além de intervalos regulares editáveis e um preview em tempo real. Esta feature acrescenta, abaixo dos intervalos regulares e antes do preview, duas novas seções: "Horários Especiais" e "Intervalos Especiais", respeitando o mesmo padrão visual e de interação já existente.

**Componentes (todos de uso único — definidos no mesmo arquivo acima do `export default`):**

- `TabPeriods` (existente — modificado): recebe as duas novas seções dentro do map de segmentos
- `HorariosEspeciaisSection`: renderiza a lista de horários especiais + botão "Adicionar", dentro de cada card de segmento
- `IntervalosEspeciaisSection`: renderiza a lista de intervalos especiais + botão "Adicionar", dentro de cada card de segmento
- `PreviewPeriodos` (pode ser extraído do inline existente): inclui os itens especiais na sequência cronológica do preview

**Behaviors:**

- [ ] B1 — Adicionar horário especial: ao clicar em "+ Adicionar horário especial", inserir um novo item em `cfg.horariosEspeciais` com valores padrão `{ id: uid(), inicio: '07:00', duracao: 50 }` e salvar via `savePeriodCfg`.
- [ ] B2 — Editar hora de início do horário especial: ao alterar o campo `time` de um item, atualizar `horariosEspeciais[idx].inicio` e salvar via `savePeriodCfg`.
- [ ] B3 — Editar duração do horário especial: ao alterar o campo numérico de duração de um item, atualizar `horariosEspeciais[idx].duracao` e salvar via `savePeriodCfg`.
- [ ] B4 — Remover horário especial: ao clicar no botão "✕" de um item, filtrar o array excluindo aquele `idx` e salvar via `savePeriodCfg`. Qualquer intervalo especial que referenciasse aquele item (via `aposEspecial`) deve ser mantido no array mas ter `aposEspecial` ajustado para o item imediatamente anterior disponível, ou `null` caso não exista.
- [ ] B5 — Adicionar intervalo especial: ao clicar em "+ Adicionar intervalo especial", inserir um novo item em `cfg.intervalosEspeciais` com valores padrão `{ id: uid(), aposEspecial: <id do último horário especial ou null>, duracao: 20 }` e salvar.
- [ ] B6 — Editar "após qual horário especial" do intervalo especial: ao alterar o select, atualizar `intervalosEspeciais[idx].aposEspecial` com o id selecionado e salvar. O select deve listar todos os horários especiais do mesmo segmento/turno pelo rótulo "Horário especial N (HH:mm)".
- [ ] B7 — Editar duração do intervalo especial: ao alterar o campo numérico, atualizar `intervalosEspeciais[idx].duracao` e salvar.
- [ ] B8 — Remover intervalo especial: ao clicar em "✕", filtrar o array excluindo o item e salvar.
- [ ] B9 — Preview em tempo real: após qualquer alteração em horários especiais ou intervalos especiais, o bloco "Preview" do card deve atualizar imediatamente exibindo os itens especiais intercalados na ordem correta (ver Regras de Negócio RN3).
- [ ] B10 — Persistência imediata: cada alteração chama `store.savePeriodCfg(seg.id, turno, novosCfg)` que grava em `meta/config` via `saveConfig`. Não há botão "Salvar" separado — o padrão é idêntico ao existente nos intervalos regulares.
- [ ] B11 — Estado vazio de horários especiais: quando `cfg.horariosEspeciais` é vazio ou ausente, exibir texto "Nenhum horário especial configurado." (idêntico ao padrão de intervalos regulares).
- [ ] B12 — Estado vazio de intervalos especiais: quando `cfg.intervalosEspeciais` é vazio ou ausente, exibir texto "Nenhum intervalo especial configurado.".
- [ ] B13 — Select desabilitado sem horários especiais: o select de "após qual horário especial" de cada intervalo especial deve ser desabilitado e exibir "— Nenhum horário especial —" enquanto `cfg.horariosEspeciais` estiver vazio.
- [ ] B14 — Rótulo ordinal no preview dos horários especiais: cada horário especial deve ser exibido no preview com rótulo "Horário especial N" onde N é 1-indexed na ordem do array.
- [ ] B15 — Rótulo ordinal no preview dos intervalos especiais: cada intervalo especial deve ser exibido no preview com rótulo "Intervalo especial" com horário calculado a partir do fim do horário especial referenciado.

---

## Componentes Compartilhados

Nenhum componente novo precisa ir para `src/components/`. Todos são de uso único dentro de `TabPeriods` em `SettingsPage.jsx`.

---

## Modelos de Dados

### Extensão de `periodConfigs` em `meta/config`

O objeto `periodConfigs[segmentId][turno]` existente é estendido com dois arrays opcionais:

```js
{
  // campos existentes:
  inicio:     "07:00",
  duracao:    50,
  qtd:        7,
  intervalos: [ { apos: 2, duracao: 10 } ],

  // campos novos:
  horariosEspeciais: [
    {
      id:      "he-uid-abc1",   // uid() gerado na criação — imutável
      inicio:  "12:00",        // HH:mm — hora de início absoluta
      duracao: 60              // minutos de duração
    }
    // ...pode haver N itens
  ],

  intervalosEspeciais: [
    {
      id:            "ie-uid-xyz9",   // uid() gerado na criação — imutável
      aposEspecial:  "he-uid-abc1",  // id do horário especial após o qual este intervalo começa
      duracao:       15              // minutos de duração
    }
    // ...pode haver N itens
  ]
}
```

**Derivações em tempo de execução (sem persistir):**

- `inicio` de um intervalo especial = `toMin(horarioEspecial.inicio) + horarioEspecial.duracao` → `fromMin(resultado)`
- `fim` de um horário especial = `toMin(h.inicio) + h.duracao` → `fromMin(resultado)`
- `fim` de um intervalo especial = `inicio_calculado + iv.duracao` → `fromMin(resultado)`

### Nenhuma entidade nova

Não são criadas coleções novas no Firestore. Tudo permanece dentro de `meta/config`, persistido atomicamente via `saveConfig(get())`.

---

## Regras de Negócio

**RN1 — Múltiplos horários especiais:** O array `horariosEspeciais` pode conter zero ou mais itens. Cada item é independente; a ordem no array define o rótulo ordinal ("Horário especial 1", "Horário especial 2"…).

**RN2 — Múltiplos intervalos especiais:** O array `intervalosEspeciais` pode conter zero ou mais itens. Cada item referencia exatamente um horário especial via `aposEspecial`. Um mesmo horário especial pode ser referenciado por mais de um intervalo especial (dois intervalos podem começar "após o horário especial 1").

**RN3 — Ordem no preview:** O bloco de preview do card deve exibir os itens na seguinte sequência:
1. Aulas regulares e intervalos regulares (lógica atual de `gerarPeriodos`).
2. Horários especiais, ordenados pelo `inicio` (HH:mm) em ordem crescente.
3. Após cada horário especial na lista ordenada, exibir imediatamente os intervalos especiais que têm `aposEspecial === horarioEspecial.id`, na ordem em que aparecem no array.

**RN4 — Início absoluto:** Ao contrário dos intervalos regulares (que usam `apos: N` — número ordinal de aula), os horários especiais têm `inicio` absoluto (HH:mm definido pelo admin). O admin é responsável por não criar sobreposições com a grade regular; o sistema exibe os itens na ordem cronológica sem validação de conflito nesta v1.

**RN5 — Campos opcionais com retrocompatibilidade:** `horariosEspeciais` e `intervalosEspeciais` são opcionais. Quando ausentes (configs antigas), o comportamento é idêntico ao atual — `cfg.horariosEspeciais ?? []` e `cfg.intervalosEspeciais ?? []` com fallback vazio.

**RN6 — IDs são imutáveis:** O campo `id` de cada horário especial e intervalo especial é gerado com `uid()` na criação e nunca alterado. Isso permite que intervalos especiais continuem referenciando o horário correto mesmo se a ordem do array mudar.

**RN7 — Exclusão de horário especial referenciado:** Ao remover um horário especial que possui intervalos especiais dependentes, o sistema deve: (a) remover o horário especial do array, (b) nos intervalos especiais cujo `aposEspecial` é o id removido, ajustar `aposEspecial` para o id do horário especial imediatamente anterior na lista ordenada por `inicio`, ou `null` se não houver anterior. Esta remoção em cascata lógica é feita no handler de remoção antes de chamar `savePeriodCfg`.

**RN8 — Visibilidade restrita a admin:** A feature de horários especiais só é renderizada para o role `admin`. Coordenadores e professores não visualizam nem editam esta seção (comportamento herdado da aba Períodos que já é admin-only).

---

## Fora do Escopo (v1)

- Detecção ou alerta de sobreposição entre horários especiais e aulas regulares.
- Vinculação de horários especiais a datas específicas (eles ficam como configuração permanente do segmento/turno, análogos aos períodos regulares).
- Reflexo dos horários especiais na grade horária (`SchedulePage` / `SchoolSchedulePage`) como slots selecionáveis para aulas de professores.
- Reflexo dos horários especiais na lógica de ausências (`absences.js`) ou no ranking de substitutos.
- Exportação dos horários especiais em PDFs de relatório.
- Reordenação manual dos itens via drag-and-drop.
- Validação de horário mínimo/máximo por turno (ex: não deixar criar horário especial às 03:00 em turno matutino).
