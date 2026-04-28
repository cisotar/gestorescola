# Spec: Perfil de Usuário no Cadastro — Visibilidade Condicional de Matérias

## Visão Geral

Refatoração do formulário de cadastro de novos usuários (`PendingPage`, step `form`) para introduzir um campo de seleção de perfil: professor, professor coordenador ou coordenador geral. Com base nessa escolha, o sistema exibe ou oculta a lista de matérias e aplica validações condicionais tanto no frontend quanto na Cloud Function `approveTeacher`.

O problema que resolve: hoje todos os usuários em cadastro são tratados como professores e são obrigados a selecionar matérias — mesmo que sejam coordenadores gerais que não ministram aulas. A ausência de distinção de perfil no onboarding força o admin a corrigir o perfil manualmente após a aprovação.

## Stack Tecnológica

- Frontend: React 18, Zustand, Tailwind CSS — `src/pages/PendingPage.jsx`
- Estado local: `useState` — sem Zustand neste formulário
- Backend: Firebase Cloud Functions v1 (TypeScript) — `functions/src/index.ts`
- Banco de dados: Firestore — coleção `schools/{schoolId}/pending_teachers/{uid}`
- Persistência: `updatePendingData()` em `src/lib/db`

---

## Páginas e Rotas

### PendingPage — renderizada por `App.jsx` quando `role === 'pending'`

**Descrição:** Tela de onboarding do usuário recém-cadastrado. Dividida em três steps sequenciais: `form` (dados pessoais + perfil + matérias condicionais + horários), `schedule` (grade horária de aulas) e `waiting` (confirmação de envio). Esta spec modifica exclusivamente o step `form` e a validação no backend.

**Componentes internos co-localizados (mesmo arquivo, sem `export`):**
- `HorarioDiaSemana`: par de inputs entrada/saída por dia da semana com validação inline
- `ModalErroValidacao`: modal de lista de erros de validação ao tentar enviar
- `ModalCopiaHorario`: modal de confirmação para copiar horário do primeiro dia para toda a semana
- `validatePhone`: função pura — retorna string de erro ou `null`

**Novo estado local:**
- `profile` (`useState<'teacher' | 'teacher-coordinator' | 'coordinator'>`) — perfil selecionado pelo usuário; default `'teacher'`

**Derivados calculados (sem mudança nos existentes):**
- `isTeachingProfile`: `profile === 'teacher' || profile === 'teacher-coordinator'` — controla exibição e obrigatoriedade das matérias

**Behaviors:**

- [ ] Exibir campo de seleção de perfil: adicionar ao step `form` um campo `<select>` (ou grupo de botões) com três opções — "Professor", "Professor Coordenador" e "Coordenador Geral". O campo deve ser posicionado após o apelido e antes da seção de matérias. Label: "Qual é o seu perfil?". Obrigatório; default `'teacher'`.

- [ ] Exibir seção de matérias somente para perfis docentes: quando `isTeachingProfile === true`, exibir normalmente a seção "Matérias que leciona" com o asterisco de obrigatório. Quando `isTeachingProfile === false` (coordenador geral), ocultar completamente a seção — nem o label nem a lista de botões de matéria devem ser renderizados.

- [ ] Obrigar seleção de matéria apenas para perfis docentes: em `handleSubmit`, verificar `selectedSubjs.length === 0` somente quando `isTeachingProfile === true`. Para coordenador geral, pular essa validação inteiramente.

- [ ] Limpar matérias selecionadas ao trocar para coordenador geral: quando o usuário muda `profile` para `'coordinator'`, chamar `setSelSubjs([])` para descartar qualquer seleção anterior e evitar enviar matérias associadas a um perfil que não leciona.

- [ ] Enviar `profile` junto com os dados de cadastro: em `handleSubmit`, incluir `profile` no payload de `updatePendingData(currentSchoolId, user.uid, { ..., profile })` para que o documento `pending_teachers/{uid}` carregue o perfil declarado pelo próprio usuário.

- [ ] Enviar `subjectIds: []` para coordenador geral: independentemente do que está em `selectedSubjs` no momento do envio, o payload deve enviar `subjectIds: selectedSubjs` para perfis docentes e `subjectIds: []` para coordenador geral — garantindo que nenhuma matéria seja associada mesmo se o estado local não foi limpo a tempo.

- [ ] Exibir resumo do perfil no step `schedule` e `waiting`: nos blocos "Dados enviados" dos steps seguintes, adicionar uma linha "Perfil:" com o label legível correspondente ao valor de `profile` (ex: "Professor Coordenador").

- [ ] Re-entry: ao restaurar dados de `pending_teachers/{uid}` em `useEffect` de re-entrada, ler e aplicar `snap.data().profile` ao estado `profile` para que o formulário seja restaurado corretamente.

---

## Cloud Function `approveTeacher` — Validações Backend

**Arquivo:** `functions/src/index.ts`

A função já recebe `profile` via `data.profile` e o aplica ao documento `teachers/`. Esta spec adiciona validações de consistência entre `profile` e `subjectIds` para garantir que a regra de negócio seja cumprida mesmo que o cliente envie dados inconsistentes.

**Behaviors:**

- [ ] Rejeitar aprovação de professor ou professor coordenador sem matérias: após resolver `teacherData` (novo ou existente), verificar se `profile` é `'teacher'` ou `'teacher-coordinator'` e se `subjectIds` (vindos de `pendingData.subjectIds`) é um array vazio ou ausente. Nesse caso, lançar `HttpsError('failed-precondition', 'Professor deve ter ao menos uma matéria selecionada')`.

- [ ] Ignorar matérias para coordenador geral: quando `profile === 'coordinator'`, forçar `subjectIds: []` no `teacherData` antes de gravar — descartando qualquer `subjectIds` que possa ter vindo no documento pendente, seja por bug no cliente ou tentativa de manipulação.

- [ ] Preservar subjectIds existentes para aprovação de re-ingresso: quando `!existingSnap.empty` (professor existente sendo reaprovado), manter a lógica atual de fallback `pendingData.subjectIds ?? existingSnap.docs[0].data().subjectIds ?? []`, mas aplicar sobre ela a validação de perfil descrita acima.

---

## Componentes Compartilhados

Nenhum componente externo de `src/components/` é afetado. Toda a mudança de UI está em `PendingPage.jsx` e toda a mudança de backend está em `functions/src/index.ts`.

---

## Modelos de Dados

### `pending_teachers/{uid}` — Novo campo

```js
{
  // campos existentes...
  profile: "teacher" | "teacher-coordinator" | "coordinator",  // NOVO
  subjectIds: ["subj-bio", "subj-cien"],  // array vazio [] para coordinator
}
```

`profile` é gravado por `updatePendingData()` durante o onboarding e lido pela Cloud Function `approveTeacher` para construir o `teacherData`.

### `teachers/{teacherId}` — Sem mudança de schema

O campo `profile` já existe no modelo (valores: `"teacher"`, `"teacher-coordinator"`, `"coordinator"`). A Cloud Function já o aplica na aprovação. Nenhum campo novo é necessário.

---

## Regras de Negócio

1. **Perfil docente obriga matérias:** usuários com `profile === 'teacher'` ou `profile === 'teacher-coordinator'` devem selecionar ao menos uma matéria. A regra é validada tanto no `handleSubmit` do frontend quanto na Cloud Function `approveTeacher`.

2. **Coordenador geral não associa matérias:** usuários com `profile === 'coordinator'` não devem ter `subjectIds` preenchidos. O frontend oculta o seletor de matérias e o backend zera qualquer valor recebido.

3. **O perfil declarado pelo usuário é uma sugestão, não uma autoridade:** o admin ainda escolhe o perfil final no painel de aprovação (`data.profile` enviado pelo admin ao chamar `approveTeacher`). O `profile` gravado em `pending_teachers` serve apenas para pré-popular a sugestão na UI de aprovação — não substitui a decisão do admin.

4. **Re-entry preserva perfil:** ao recarregar a página com cadastro parcial, o perfil deve ser restaurado a partir do documento `pending_teachers/{uid}`. Se o campo não existir (cadastros antigos), o default `'teacher'` é aplicado.

5. **Limpeza de matérias ao trocar perfil:** trocar o perfil para coordenador geral limpa `selectedSubjs` imediatamente no estado local para evitar inconsistência visual e facilitar re-troca posterior para perfil docente começando com seleção limpa.

6. **Validação de horários é independente do perfil:** todos os perfis continuam obrigados a preencher ao menos um dia de horário de presença (`temAoMenosUmDiaCompleto`). O coordenador geral também precisa informar quando estará na escola.

7. **Step `schedule` permanece condicional ao perfil:** a grade de aulas no step `schedule` só faz sentido para perfis docentes. Para coordenador geral, o passo pode ser pulado ou simplificado (fora do escopo desta v1 — ver seção abaixo).

---

## Fora do Escopo (v1)

- Pular ou adaptar o step `schedule` para coordenadores gerais — nesta versão o step é exibido para todos os perfis; o botão "Concluir" já funciona sem aulas cadastradas para o caso do coordenador
- Pré-popular o seletor de perfil na UI de aprovação do admin com base no `profile` declarado pelo usuário em `pending_teachers`
- Alteração na UI de aprovação do admin (aba Professores > Solicitações em `SettingsPage`) para exibir o perfil declarado
- Validação em Firestore Security Rules — a proteção é feita pela Cloud Function, não pelas Rules
- Validação de horários condicionada ao perfil (ex: coordenador sem horário)
- Internacionalização dos labels de perfil
