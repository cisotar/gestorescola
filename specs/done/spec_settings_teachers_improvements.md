# Spec: Melhorias em Settings — Aba Professores e Navegação

---

## 1. Renomear aba "Administração" → "Aprovação"

### Arquivo: `src/pages/SettingsPage.jsx`

```js
// antes
{ id: 'admin', label: '🔐 Administração' }

// depois
{ id: 'admin', label: '✅ Aprovação' }
```

---

## 2. Card "Ver Professores" abre aba `teachers`

### Problema

`/settings` sempre inicializa na aba `segments` (linha 26 de SettingsPage):
```js
const [tab, setTab] = useState(isAdmin ? 'segments' : 'profile')
```

Clicar em "Ver Professores" no `HomePage` navega para `/settings` sem indicar qual aba abrir.

### Solução

Passar `?tab=teachers` via query string. `SettingsPage` lê o param na inicialização.

#### `src/pages/HomePage.jsx` — ActionCard "Ver Professores"

```jsx
// antes
<ActionCard icon="👩‍🏫" label="Ver Professores" ... to="/settings" />

// depois
<ActionCard icon="👩‍🏫" label="Ver Professores" ... to="/settings?tab=teachers" />
```

#### `src/pages/SettingsPage.jsx` — leitura do param

```js
import { useLocation } from 'react-router-dom'

// dentro do componente SettingsPage:
const location = useLocation()
const initialTab = new URLSearchParams(location.search).get('tab')
const [tab, setTab] = useState(
  isAdmin
    ? (ADMIN_TABS.some(t => t.id === initialTab) ? initialTab : 'segments')
    : 'profile'
)
```

---

## 3. Visualização em tabela em `TabTeachers`

### Contexto do modelo de dados

O status de um usuário é determinado por **duas coleções separadas** no Firestore:

| Coleção | Significa |
|---|---|
| `teachers` | Usuário aprovado (`status: 'approved'`) |
| `admins` | Usuário é administrador |
| `pending_teachers` | Usuário aguardando aprovação |

Os professores no store (`useAppStore().teachers`) já são todos aprovados. Para saber quem também é admin, é preciso carregar a lista de `admins` (já usada em `TabAdmin`).

Professores pendentes **não aparecem** na lista de teachers — eles vivem em `pending_teachers`. A tabela exibirá apenas os approved, com distinção professor / admin.

### Toggle de visualização

Adicionar dois botões de toggle ao topo de `TabTeachers`:

```jsx
const [view, setView] = useState('cards') // 'cards' | 'table'

<div className="flex gap-2 mb-5">
  <button className="btn btn-dark" onClick={openAdd}>+ Novo Professor</button>
  <div className="flex rounded-lg border border-bdr overflow-hidden ml-auto">
    <button onClick={() => setView('cards')} className={view === 'cards' ? 'btn btn-dark btn-sm' : 'btn btn-ghost btn-sm'}>⊞ Cards</button>
    <button onClick={() => setView('table')} className={view === 'table' ? 'btn btn-dark btn-sm' : 'btn btn-ghost btn-sm'}>☰ Tabela</button>
  </div>
</div>
```

### Carregamento dos admins em `TabTeachers`

```js
const [admins, setAdmins] = useState([])
useEffect(() => {
  listAdmins().then(list => setAdmins(list.map(a => a.email.toLowerCase())))
}, [])

const isTeacherAdmin = (t) => admins.includes((t.email ?? '').toLowerCase())

const statusLabel = (t) => isTeacherAdmin(t) ? 'Admin' : 'Professor'
const statusColor = (t) => isTeacherAdmin(t) ? 'text-accent font-bold' : 'text-t2'
```

### Mudar status (promoção / rebaixamento)

- **Professor → Admin**: chamar `addAdmin(t.email, t.name)` e atualizar estado local
- **Admin → Professor**: chamar `removeAdmin(t.email)` e atualizar estado local

O select de status na tabela e nos cards:

```jsx
<select
  value={isTeacherAdmin(t) ? 'admin' : 'teacher'}
  onChange={async e => {
    if (e.target.value === 'admin') {
      await addAdmin(t.email, t.name)
      setAdmins(a => [...a, t.email.toLowerCase()])
      toast(`${t.name} agora é Admin`, 'ok')
    } else {
      await removeAdmin(t.email)
      setAdmins(a => a.filter(x => x !== t.email.toLowerCase()))
      toast(`${t.name} agora é Professor`, 'ok')
    }
  }}
  className="inp !py-0.5 !px-1.5 text-xs !w-auto"
>
  <option value="teacher">Professor</option>
  <option value="admin">Admin</option>
</select>
```

> Nota: a mudança de role só tem efeito no próximo login do usuário afetado (o role é determinado na inicialização do `useAuthStore`). Não há impacto imediato na sessão ativa do professor.

### Visualização em tabela

```jsx
{view === 'table' && (
  <div className="card p-0 overflow-hidden overflow-x-auto">
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-surf2 border-b border-bdr">
          <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Nome</th>
          <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">E-mail</th>
          <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Telefone</th>
          <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Segmento</th>
          <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Matérias</th>
          <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Status</th>
          <th className="px-3 py-2.5 w-[60px]"></th>
        </tr>
      </thead>
      <tbody>
        {allTeachersSorted.map(t => (
          <tr key={t.id} className="border-b border-bdr/50 hover:bg-surf2/50">
            <td className="px-3 py-2.5 font-semibold">{t.name}</td>
            <td className="px-3 py-2.5 text-xs text-t2">{t.email || '—'}</td>
            <td className="px-3 py-2.5 text-xs text-t2">{t.celular || '—'}</td>
            <td className="px-3 py-2.5 text-xs">{teacherSegmentNames(t, store)}</td>
            <td className="px-3 py-2.5 text-xs text-t2 max-w-[160px] truncate">{teacherSubjectNames(t, store.subjects) || '—'}</td>
            <td className="px-3 py-2.5">{/* select de status */}</td>
            <td className="px-3 py-2.5">
              <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

**Helper `teacherSegmentNames`** (local em TabTeachers):
```js
const teacherSegmentNames = (t) =>
  store.segments
    .filter(seg => teacherBelongsToSegment(t, seg.id, store.subjects, store.areas))
    .map(seg => seg.name)
    .join(', ') || '—'
```

---

## 4. Email, telefone e status nos cards existentes

Adicionar abaixo do nome e matérias em cada card da visualização `cards`:

```jsx
<div className="flex-1 min-w-0">
  <div className="font-semibold text-sm truncate">{t.name}</div>
  <div className="text-[11px] text-t3 truncate">{teacherSubjectNames(t, store.subjects) || '—'}</div>
  {/* campos adicionais */}
  {t.email  && <div className="text-[11px] text-t3 truncate">✉ {t.email}</div>}
  {t.celular && <div className="text-[11px] text-t3 truncate">📱 {t.celular}</div>}
  <div className="mt-1">{/* select de status — mesmo componente da tabela */}</div>
</div>
```

---

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/SettingsPage.jsx` | Renomear aba, ler `?tab=`, toggle cards/tabela, email/tel/status nos cards, visualização tabela |
| `src/pages/HomePage.jsx` | `to="/settings?tab=teachers"` no ActionCard "Ver Professores" |

---

## Verificação Manual

- [ ] Card "Ver Professores" no HomePage abre `/settings` já na aba Professores
- [ ] Aba "Administração" exibe "Aprovação"
- [ ] Toggle Cards ↔ Tabela funciona
- [ ] Tabela exibe nome, email, telefone, segmento, matérias e status
- [ ] Select de status na tabela promove professor → admin e rebaixa admin → professor
- [ ] Cards da visualização atual exibem email, telefone e select de status
- [ ] Mudança de status persiste no Firestore (`admins` collection)
