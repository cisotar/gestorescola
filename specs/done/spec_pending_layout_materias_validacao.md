# Spec: Melhorias no Formulário de Pré-cadastro (Layout, Matérias e Validação)

## Visão Geral

O formulário de pré-cadastro da `PendingPage` precisa de três melhorias: (1) reorganizar a seleção de matérias por segmento → área → matéria, com layout lado a lado em desktop; (2) tornar a seleção de matérias obrigatória; (3) adicionar validação de formato no campo telefone com hint de WhatsApp.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Estado:** Zustand (`useAppStore` — `subjects`, `areas`, `segments`)
- **Sem alteração de backend/DB**

---

## Páginas e Rotas

### PendingPage (modificada) — renderizada quando `role === 'pending'`

**Componentes afetados:**
- Bloco de seleção de matérias — reorganização visual e agrupamento por área
- Campo telefone — hint + validação inline

**Behaviors:**

**Seleção de matérias:**
- [ ] Ver matérias organizadas: segmento → área do conhecimento → pills de matérias
- [ ] Ver bloco EF e bloco EM empilhados em mobile (padrão, `flex-col`)
- [ ] Ver bloco EF e bloco EM lado a lado em desktop (`lg:grid-cols-2`)
- [ ] Dentro de cada bloco de segmento, ver matérias agrupadas por área do conhecimento (título da área + pills das matérias dessa área)
- [ ] Selecionar e desselecionar matérias individualmente (toggle)
- [ ] Ver mensagem de erro de validação ao tentar submeter sem nenhuma matéria selecionada (`"Selecione ao menos uma matéria"`)

**Campo telefone:**
- [ ] Ver hint abaixo do campo: `"Use seu número de WhatsApp. Formato: DDD + número (ex: 11987654321)"` — texto permanente, visível antes de qualquer interação
- [ ] Ver mensagem de erro inline ao submeter com telefone inválido
- [ ] Formato aceito: 10 ou 11 dígitos numéricos, sendo que o 3º dígito obrigatoriamente deve ser `9` (celular)
- [ ] Formato rejeitado: menos de 10 dígitos, começando com `0`, 3º dígito diferente de `9`
- [ ] Ao corrigir o telefone, o erro desaparece na próxima tentativa de submit (não limpar em tempo real — validar apenas no submit)

---

## Componentes Compartilhados

Nenhum novo componente compartilhado — tudo interno à `PendingPage.jsx`.

---

## Modelos de Dados

Sem alteração. Dados de agrupamento derivados do store:

```js
// Estrutura de agrupamento para renderização:
// segments → { seg, areaGroups: [{ area, subjs }] }

const segGroups = store.segments.map(seg => {
  const areasInSeg = store.areas.filter(a => (a.segmentIds ?? []).includes(seg.id))
  const areaGroups = areasInSeg
    .map(area => ({
      area,
      subjs: store.subjects.filter(s => s.areaId === area.id),
    }))
    .filter(g => g.subjs.length > 0)
  return { seg, areaGroups }
}).filter(g => g.areaGroups.length > 0)
```

---

## Regras de Negócio

### Validação de telefone

```
Regex: /^[1-9][0-9]9[0-9]{7,8}$/
```

Decomposto:
- `[1-9]` — primeiro dígito do DDD (não começa com 0)
- `[0-9]` — segundo dígito do DDD
- `9` — terceiro dígito obrigatório (celular)
- `[0-9]{7,8}` — 7 ou 8 dígitos restantes (total: 10 ou 11 dígitos)

Antes de validar, remover todos os não-dígitos (`phone.replace(/\D/g, '')`).

Mensagem de erro: `"Número inválido. Use DDD + número começando com 9 (ex: 11987654321)"`

### Validação de matérias

- Ao submeter com `selectedSubjs.length === 0`: bloquear submit e exibir mensagem `"Selecione ao menos uma matéria"`
- Mensagem posicionada logo abaixo da seção de matérias

### Ordem de validação no submit

1. Telefone vazio → `"Informe o telefone"`
2. Telefone inválido → `"Número inválido. Use DDD + número começando com 9 (ex: 11987654321)"`
3. Nenhuma matéria → `"Selecione ao menos uma matéria"`
4. Tudo válido → salvar

---

## Layout de Matérias

### Mobile (padrão — empilhado)
```
┌─────────────────────────────────┐
│ ENSINO FUNDAMENTAL              │
│  Linguagens                     │
│  [Português] [Inglês] [Ed. Fís.]│
│  Ciências da Natureza           │
│  [Ciências]                     │
│  ...                            │
├─────────────────────────────────┤
│ ENSINO MÉDIO                    │
│  Linguagens                     │
│  [Português] [Inglês] [Arte]    │
│  ...                            │
└─────────────────────────────────┘
```

### Desktop (`lg:` — lado a lado)
```
┌──────────────────┬──────────────────┐
│ ENSINO           │ ENSINO           │
│ FUNDAMENTAL      │ MÉDIO            │
│                  │                  │
│ Linguagens       │ Linguagens       │
│ [Port.][Ingl.]   │ [Port.][Arte]    │
│                  │                  │
│ Ciências         │ Matemática       │
│ [Ciências]       │ [Matemática]     │
└──────────────────┴──────────────────┘
```

Implementação Tailwind:
```jsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  {segGroups.map(({ seg, areaGroups }) => (
    <div key={seg.id} className="border border-bdr rounded-xl p-4">
      <div className="text-xs font-extrabold text-navy uppercase tracking-widest mb-3">{seg.name}</div>
      <div className="space-y-3">
        {areaGroups.map(({ area, subjs }) => (
          <div key={area.id}>
            <div className="text-[11px] font-bold text-t3 uppercase tracking-wide mb-1.5">{area.name}</div>
            <div className="flex flex-wrap gap-1.5">
              {subjs.map(s => (
                <button key={s.id} type="button"
                  className={selectedSubjs.includes(s.id) ? 'btn btn-xs btn-dark' : 'btn btn-xs btn-ghost'}
                  onClick={() => toggleSubj(s.id)}
                >{s.name}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  ))}
</div>
```

---

## Fora do Escopo (v1)

- Máscara de formatação em tempo real no campo telefone (ex: `(11) 9 8765-4321`)
- Validação de telefone via SMS/OTP
- Ordenação alfabética de áreas ou matérias (mantém a ordem do store)
- Alteração de `db.js`, `useAuthStore`, `App.jsx` ou qualquer outro arquivo além de `PendingPage.jsx`
