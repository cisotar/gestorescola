# Spec: Refatoração do Modal "Adicionar Aula"

## Contexto

O modal `AddScheduleModal` em `src/pages/SettingsPage.jsx` (linha 879) é acessado por dois caminhos:

- **Caminho A** — Perfil do Professor → "Minha Grade" → clique em horário vazio
- **Caminho B** — Configurações → Horários → Professor → clique em horário vazio

Ambos os caminhos compartilham o mesmo componente. A refatoração se aplica a um único lugar.

---

## Problemas Atuais

1. **Ordem dos campos errada**: A sequência atual é Matéria → Ano/Série → Turma.
2. **Dropdowns** (`<select>`) são lentos para opções curtas e visualmente inconsistentes com o restante do sistema.
3. **Turmas ocupadas** são exibidas como `<option disabled>`, sem destaque visual claro.

---

## Mudanças Especificadas

### 1. Nova ordem dos campos

```
Ano / Série  →  Turma  →  Matéria
```

A seleção é encadeada: Turma só exibe após Ano/Série ser escolhido; Matéria está sempre visível mas é opcional.

### 2. Substituição de `<select>` por Balloon Pills

Cada campo deixa de usar `<select className="inp">` e passa a exibir os itens como botões pill clicáveis.

**Estado inativo:**
```
bg-surf2  border border-bdr  text-t2  rounded-full  px-3 py-1  text-sm
```

**Estado selecionado:**
```
bg-navy  text-white  border-transparent  shadow-sm  rounded-full  px-3 py-1  text-sm  font-semibold
```

**Estado ocupado (turmas):**
```
bg-surf2  border border-bdr  text-t3  rounded-full  px-3 py-1  text-sm  opacity-50  cursor-not-allowed
```
Exibir ícone 🔒 ao lado do label da turma ocupada.

**Layout:** `flex flex-wrap gap-2` para cada grupo de pills.

### 3. Botão de confirmação

Mantém o estilo atual: `btn btn-dark`. Fica **desabilitado** enquanto `grade` ou `turma` não estiverem selecionados.

```jsx
<button
  className="btn btn-dark flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
  onClick={save}
  disabled={!grade || !turma}
>
  Adicionar
</button>
```

---

## Arquivo Alvo

| Arquivo | Ação |
|---|---|
| `src/pages/SettingsPage.jsx` | Modificar apenas a função `AddScheduleModal` (linha 879–957) |

Nenhum novo arquivo precisa ser criado.

---

## Estado Local (sem alteração de assinatura)

```js
const [subjId, setSubjId] = useState(mySubjs[0]?.id ?? '')
const [grade,  setGrade]  = useState('')
const [turma,  setTurma]  = useState('')
```

A lógica de `save()` e validação de conflitos permanece idêntica.

---

## Verificação Manual

- [ ] Clicar num horário vazio pelo **Caminho A** e confirmar a nova ordem: Ano/Série → Turma → Matéria
- [ ] Clicar num horário vazio pelo **Caminho B** e confirmar o mesmo layout
- [ ] Verificar que turmas ocupadas aparecem com 🔒 e não são clicáveis
- [ ] Confirmar que o botão "Adicionar" fica desabilitado sem Ano/Série ou Turma selecionados
- [ ] Salvar uma aula e confirmar que o schedule é persistido corretamente no Firestore
