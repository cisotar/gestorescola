# Spec: Pedidos de Aprovação na Aba Professores

## Contexto

Hoje, pedidos de acesso de novos professores só podem ser aprovados/recusados
na aba **Aprovação**. O usuário quer poder fazer isso diretamente na aba
**Professores**, tanto nos cards quanto na tabela — sem trocar de aba.

Outros problemas a corrigir nesta mesma implementação:

1. **Pendentes não aparecem na tabela** — professores pendentes (`pending_teachers`)
   são de uma coleção separada e não estão no `store.teachers`; por isso somem
   completamente na visão de tabela.

2. **Professores sem segmento não aparecem na tabela** — o frame "⚠ Sem segmento
   definido" existe apenas na visão de cards. Na tabela, professores de
   `store.teachers` sem matéria associada aparecem, mas sem a sinalização de "sem
   segmento". Confirmar e garantir que aparecem com a coluna Segmento mostrando `—`.

3. **Cor e tamanho das fontes de dados secundários** — e-mail, telefone e matérias
   nos cards usam `text-[11px] text-t3`, ficando ilegíveis. Corrigir para
   `text-xs text-t1` (preto) na maior delas. Aplicar a mesma correção em todos
   os outros lugares onde `text-t3` aparece em dados de professor (não em
   placeholders ou hints de sistema).

---

## Arquivo: `src/pages/SettingsPage.jsx`

### 1. Carregar professores pendentes em `TabTeachers`

Adicionar estado para professores pendentes junto aos estados existentes:

```js
const [pending,     setPending]     = useState([])
const [pendLoaded,  setPendLoaded]  = useState(false)
```

Carregar ao montar (junto ao `useEffect` dos admins):

```js
useEffect(() => {
  listAdmins().then(list => setAdmins(list.map(a => a.email.toLowerCase())))
  listPendingTeachers().then(list => { setPending(list); setPendLoaded(true) })
}, [])
```

Helpers de ação sobre pendentes:

```js
const handleApprove = async (p) => {
  await approveTeacher(p.id, store, store.hydrate)
  setPending(prev => prev.filter(x => x.id !== p.id))
  toast(`${p.name} aprovado`, 'ok')
}

const handleReject = async (p) => {
  if (!confirm(`Recusar acesso de ${p.name}?`)) return
  await rejectTeacher(p.id)
  setPending(prev => prev.filter(x => x.id !== p.id))
  toast(`${p.name} recusado`, 'warn')
}
```

---

### 2. Visão Cards — mostrar pendentes no frame "Sem segmento"

O frame "⚠ Sem segmento definido" já existe e lista `store.teachers` sem matéria.
Expandir para incluir também os professores de `pending`.

Cada professor pendente no frame mostra:
- Avatar: inicial do nome com fundo `bg-amber-100 text-amber-700`
- Nome + e-mail em `text-xs text-t1`
- Badge `Pendente` em `badge bg-warn/10 text-warn border border-warn/30`
- Celular se informado
- Botões: `Aprovar` (`btn btn-dark btn-xs`) e `Recusar` (`btn btn-ghost btn-xs text-err`)
- **Sem** botão ✏️ (professor ainda não tem perfil completo)

Lógica combinada no frame:

```jsx
{(() => {
  const unassigned = store.teachers.filter(t =>
    teacherSegmentIds(t, store.subjects, store.areas).length === 0
  ).sort((a, b) => a.name.localeCompare(b.name))

  const hasPending = pending.length > 0
  const hasUnassigned = unassigned.length > 0
  if (!hasPending && !hasUnassigned) return null

  const total = pending.length + unassigned.length

  return (
    <div className="card border-dashed border-warn/50 bg-amber-50/30">
      <div className="font-bold text-sm mb-3 pb-2 border-b border-bdr text-amber-700">
        ⚠ Sem segmento definido
        <span className="text-xs font-normal text-t3 ml-1">{total} prof.</span>
      </div>
      <div className="space-y-2">

        {/* Pendentes */}
        {pending.map(p => (
          <div key={p.id} className="flex items-start gap-2 p-2 rounded-xl border border-warn/30 bg-amber-50/60">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 bg-amber-100 text-amber-700">
              {p.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{p.name}</div>
              <span className="badge bg-warn/10 text-warn border border-warn/30 text-[10px] mb-1">Pendente</span>
              <div className="text-xs text-t1 truncate">✉ {p.email}</div>
              {p.celular && <div className="text-xs text-t1 truncate">📱 {p.celular}</div>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button className="btn btn-dark btn-xs" onClick={() => handleApprove(p)}>Aprovar</button>
              <button className="btn btn-ghost btn-xs text-err" onClick={() => handleReject(p)}>Recusar</button>
            </div>
          </div>
        ))}

        {/* Sem segmento (já existia) */}
        {unassigned.map(t => {
          const ct = store.schedules.filter(s => s.teacherId === t.id).length
          return (
            <div key={t.id} className="flex items-start gap-2 p-2 rounded-xl border border-bdr hover:border-t3 transition-colors bg-surf">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 bg-amber-100 text-amber-700">
                {t.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{t.name}</div>
                <div className="text-xs text-amber-600 truncate">Sem matéria — configure via ✏️</div>
                {t.email   && <div className="text-xs text-t1 truncate">✉ {t.email}</div>}
                {t.celular && <div className="text-xs text-t1 truncate">📱 {t.celular}</div>}
                <div className="mt-1.5"><StatusSelect t={t} /></div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-xs text-t2">{ct} aulas</span>
                <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>
                <button className="btn btn-ghost btn-xs text-err" onClick={() => {
                  if (confirm(`Remover ${t.name}?`)) { store.removeTeacher(t.id); toast('Professor removido', 'ok') }
                }}>✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})()}
```

---

### 3. Visão Tabela — incluir pendentes e corrigir cores

Substituir `allTeachersSorted` por `allRows` que combina professores aprovados + pendentes:

```js
// Professores aprovados (store.teachers)
const approvedRows = [...store.teachers].sort((a, b) => a.name.localeCompare(b.name))

// Pendentes com flag para diferenciar na linha
const pendingRows = [...pending].sort((a, b) => a.name.localeCompare(b.name))
  .map(p => ({ ...p, _isPending: true }))

const allRows = [...approvedRows, ...pendingRows]
```

Na tabela, renderizar `allRows.map(t => ...)` com lógica condicional por linha:

```jsx
{allRows.map(t => (
  <tr key={t.id} className={`border-b border-bdr/50 hover:bg-surf2/50 ${t._isPending ? 'bg-amber-50/40' : ''}`}>
    <td className="px-3 py-2.5 font-semibold text-sm">{t.name}</td>
    <td className="px-3 py-2.5 text-xs text-t1">{t.email || '—'}</td>
    <td className="px-3 py-2.5 text-xs text-t1">{t.celular || '—'}</td>
    <td className="px-3 py-2.5 text-xs text-t1">
      {t._isPending ? <span className="text-warn">—</span> : (teacherSegmentNames(t) || '—')}
    </td>
    <td className="px-3 py-2.5 text-xs text-t1 max-w-[160px] truncate">
      {t._isPending ? <span className="text-warn">—</span> : (teacherSubjectNames(t, store.subjects) || '—')}
    </td>
    <td className="px-3 py-2.5">
      {t._isPending
        ? <span className="badge bg-warn/10 text-warn border border-warn/30">Pendente</span>
        : <StatusSelect t={t} />
      }
    </td>
    <td className="px-3 py-2.5">
      {t._isPending ? (
        <div className="flex gap-1">
          <button className="btn btn-dark btn-xs" onClick={() => handleApprove(t)}>Aprovar</button>
          <button className="btn btn-ghost btn-xs text-err" onClick={() => handleReject(t)}>✕</button>
        </div>
      ) : (
        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>
      )}
    </td>
  </tr>
))}
{allRows.length === 0 && (
  <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-t3">Nenhum professor cadastrado.</td></tr>
)}
```

---

### 4. Corrigir cor e tamanho das fontes de dados nos cards de professores

**Nos cards dos segmentos** (professores normais):

```jsx
// antes
<div className="text-[11px] text-t3 truncate">{teacherSubjectNames(...)}</div>
{t.email   && <div className="text-[11px] text-t3 truncate">✉ {t.email}</div>}
{t.celular && <div className="text-[11px] text-t3 truncate">📱 {t.celular}</div>}

// depois
<div className="text-xs text-t1 truncate">{teacherSubjectNames(...)}</div>
{t.email   && <div className="text-xs text-t1 truncate">✉ {t.email}</div>}
{t.celular && <div className="text-xs text-t1 truncate">📱 {t.celular}</div>}
```

Aplicar a mesma troca (`text-[11px] text-t3` → `text-xs text-t1`) em todos os
outros cards de professor no arquivo onde os dados de contato/matéria aparecem
como informação principal (não como hint ou placeholder de sistema).

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/SettingsPage.jsx` | `TabTeachers`: carrega pendentes, exibe no frame sem segmento e na tabela, botões Aprovar/Recusar, correção de cores |

Nenhuma alteração em `db.js`, `useAppStore` ou outros arquivos —
`listPendingTeachers`, `approveTeacher` e `rejectTeacher` já existem.

---

## Verificação manual

- [ ] Cards: professores pendentes aparecem no frame "Sem segmento" com badge "Pendente"
- [ ] Cards: botões Aprovar/Recusar funcionam; professor some do frame após ação
- [ ] Cards: ao aprovar, professor aparece no frame do segmento correto (se tiver matéria)
- [ ] Tabela: professores pendentes aparecem com fundo âmbar e badge "Pendente"
- [ ] Tabela: botão Aprovar funciona; linha some após confirmação
- [ ] Tabela: professores sem segmento aparecem normalmente com `—` na coluna Segmento
- [ ] Cards e Tabela: e-mail, telefone e matérias em `text-xs text-t1` (preto, legível)
- [ ] Aba Aprovação continua funcionando normalmente (sem remoção)
