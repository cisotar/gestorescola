# Spec: Células em 2 linhas + Campo Apelido nas Grades Horárias

## Visão Geral

Duas iniciativas combinadas:

1. **Correção visual**: garantir que *todas* as grades horárias (app e PDF) exibam as células em dois blocos empilhados — Linha 1: nome/turma em destaque; Linha 2: matéria em cinza.
2. **Apelido**: professores podem cadastrar um apelido curto para si mesmos. Em qualquer grade horária, quando há pelo menos um professor com apelido, aparece um toggle "Nome / Apelido" que alterna o que é exibido nas células. PDFs também podem ser gerados com nome ou apelido.

## Stack Tecnológica
- Frontend: React 18 + Vite + Tailwind CSS (tema: `bg-surf`, `bg-surf2`, `border-bdr`, `btn`, `inp`, `lbl`, `text-t1/t2/t3`, `text-navy`, `text-err`)
- State: Zustand — `useAppStore` (`teachers`, `schedules`, `subjects`, `segments`, `areas`, `periodConfigs`), `useAuthStore` (`user`, `role`, `teacher`)
- Firebase: Firestore — coleções `teachers`, `pending_teachers`
- Persistência de mudanças: `store.updateTeacherProfile(id, changes)` (patchTeacherSelf) e `store.updateTeacher(id, changes)` (admin)

---

## Páginas e Rotas

### ScheduleGrid — `SettingsPage.jsx` (componente exportado, reutilizado em múltiplas páginas)

**Descrição:** Grade horária do professor (visão professor → turma + matéria por slot). Usado em `SchedulePage`, `AbsencesPage`, `PendingPage`, `SettingsPage` (TabProfile → modal).

**Behaviors:**

- [ ] **C1 — Estilo de célula padronizado:** cada entrada de horário mostra:
  - Linha 1: `s.turma` — `font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide truncate`
  - Linha 2: `subj?.name` — `text-[#4a4740] text-[10px] truncate`
  - Container: manter card `bg-surf2 border border-bdr rounded-lg p-1.5 text-[11px]` (não remover)
  - Remover quaisquer classes `text-t3` ou `font-bold` genéricas das duas linhas de conteúdo — usar as cores explícitas acima

---

### SchoolSchedulePage — `/school-schedule`

**Descrição:** Grade da escola inteira, filtrada por professor/segmento/turma.

**Behaviors:**

- [x] **C2 — Células em 2 linhas (já implementado):** `showTeacher=true` → nome professor + matéria; `showTeacher=false` → turma + matéria.
- [ ] **C3 — Toggle Nome / Apelido:** quando `anyHasApelido` (`store.teachers.some(t => t.apelido)`) é verdadeiro, exibir acima da grade (lado direito do cabeçalho) um par de botões tipo pill:
  ```jsx
  {anyHasApelido && (
    <div className="flex items-center gap-1 rounded-lg border border-bdr bg-surf2 p-0.5 text-xs">
      <button
        className={useApelido ? 'px-2 py-0.5 rounded text-t2' : 'px-2 py-0.5 rounded bg-surf border border-bdr font-semibold text-t1'}
        onClick={() => setUseApelido(false)}
      >Nome</button>
      <button
        className={useApelido ? 'px-2 py-0.5 rounded bg-surf border border-bdr font-semibold text-t1' : 'px-2 py-0.5 rounded text-t2'}
        onClick={() => setUseApelido(true)}
      >Apelido</button>
    </div>
  )}
  ```
- [ ] **C4 — Célula usa apelido quando toggle ativo:** passar `useApelido` para `SchoolGrid`. Na célula com `showTeacher=true`:
  ```jsx
  const label = useApelido ? (teacher?.apelido || teacher?.name) : teacher?.name
  ```
  Fallback para `name` quando apelido não preenchido.
- [ ] **C5 — PDF respeita toggle:** botão "Exportar PDF" passa `useApelido` para `generateSchoolScheduleHTML`:
  ```js
  openPDF(generateSchoolScheduleHTML({ ..., useApelido }, store))
  ```

---

### SchedulePage — `/schedule`

**Descrição:** Grade horária de um professor específico.

**Behaviors:**

- [x] C1 (herdado via ScheduleGrid)
- [ ] **C6 — Toggle Nome / Apelido no PDF:** botão "Exportar PDF" passa `useApelido` para `generateTeacherScheduleHTML`. Toggle visível no cabeçalho (mesmo padrão do C3), pois a grade do professor por si só não mostra outros professores — o toggle afeta apenas o PDF.

---

### SettingsPage — `/settings` (TabProfile — professor)

**Descrição:** Perfil do professor logado.

**Behaviors:**

- [ ] **A1 — Campo apelido no perfil:** adicionar campo opcional "Como prefere ser chamado?" logo após o campo Celular:
  ```jsx
  <div>
    <label className="lbl">Como prefere ser chamado? <span className="text-t3 normal-case font-normal">(opcional)</span></label>
    <input className="inp" type="text" placeholder="Ex: Prof. João, Joãozinho..."
      maxLength={30} value={apelido} onChange={e => setApelido(e.target.value)} />
    <p className="text-xs text-t3 mt-1">Apelido exibido nas grades horárias quando o toggle "Apelido" estiver ativo.</p>
  </div>
  ```
- [ ] **A2 — Salvar apelido:** incluir `apelido` no objeto passado para `store.updateTeacherProfile(t.id, { celular, apelido, subjectIds: selSubjs })`.
- [ ] **A3 — Estado inicial apelido:** `const [apelido, setApelido] = useState(t?.apelido ?? '')`.

---

### SettingsPage — TabTeachers (admin)

**Descrição:** Lista de professores com edição pelo admin.

**Behaviors:**

- [ ] **A4 — Exibir apelido na listagem:** no card de cada professor, abaixo do e-mail, mostrar apelido quando preenchido:
  ```jsx
  {t.apelido && <div className="text-xs text-t3 italic">"{t.apelido}"</div>}
  ```
- [ ] **A5 — Editar apelido no modal de edição do professor:** no `AddTeacherModal` / modal de edição existente, adicionar campo "Apelido" (mesma estrutura do A1). Salvar via `store.updateTeacher(id, { apelido })`.

---

### PendingPage — step `form`

**Descrição:** Pré-cadastro do professor no primeiro login.

**Behaviors:**

- [ ] **A6 — Campo apelido no cadastro:** adicionar campo opcional "Como prefere ser chamado?" logo após o campo Telefone (mesmo layout do A1). Incluir `apelido` no payload de `updatePendingData`.
- [ ] **A7 — Propagar ao aprovado:** `updatePendingData` já persiste em `pending_teachers`; o admin ao aprovar copia os campos incluindo `apelido` para `teachers`. Verificar se `approveTeacher` em `db.js` copia todos os campos de `pending_teachers` — se copia com spread, nenhuma alteração adicional é necessária.

---

## Componentes Compartilhados

- `ScheduleGrid` (`SettingsPage.jsx`) — grade do professor; precisa de C1 (unificação visual das células)
- `SchoolGrid` (`SchoolSchedulePage.jsx`) — grade da escola; precisa de C3+C4
- `_scheduleGrid` (`reports.js`) — gerador HTML de grade para PDF; precisa receber `useApelido`

---

## Modelos de Dados

### `teachers` (Firestore)
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | string | ✓ | uid Firebase |
| name | string | ✓ | Nome completo |
| **apelido** | string | ✗ | **NOVO** — apelido curto (max 30 chars) |
| email | string | ✓ | |
| celular | string | ✗ | |
| subjectIds | string[] | ✓ | |
| color | string | ✗ | |

### `pending_teachers` (Firestore)
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| **apelido** | string | ✗ | **NOVO** — copiado para `teachers` ao aprovar |

---

## Regras de Negócio

- `apelido` é sempre opcional; fallback para `name` onde quer que seja exibido
- Toggle "Nome / Apelido" só aparece quando `store.teachers.some(t => t.apelido)` — se nenhum professor preencheu, o toggle não é renderizado
- PDFs usam `teacher.apelido ?? teacher.name` quando `useApelido=true`
- `_scheduleGrid` recebe novo parâmetro `useApelido=false`; quando `true` e `showTeacher=true`, usa `teacher.apelido ?? teacher.name`

---

## Fora do Escopo (v1)
- Apelido em notificações, e-mails ou WhatsApp
- Histórico de apelidos
- Validação de unicidade de apelido
- Apelido visível para alunos ou responsáveis
- Toggle persistido no localStorage entre sessões (stateless na página)
