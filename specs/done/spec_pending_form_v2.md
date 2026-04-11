# Spec: PendingPage — Reformulação Visual do Step "form"

## Visão Geral

Refinar o layout do step `form` da `PendingPage` (pré-cadastro do professor no primeiro login):
- Remover o painel informativo à direita ("Próximo passo: sua grade horária")
- Manter o grid `lg:grid-cols-2` apenas para os blocos de segmento (EF e EM lado a lado)
- Manter o fluxo `form → schedule → waiting` intacto

## Stack Tecnológica
- Frontend: React 18 + Vite + Tailwind CSS (tema customizado: `bg-surf`, `border-bdr`, `btn`, `inp`, `lbl`, `text-t1/t2/t3`, `text-err`, `text-navy`)
- State: `useAuthStore` (user, logout), `useAppStore` (segments, areas, subjects, schedules)
- Firebase: Firestore `pending_teachers`

## Páginas e Rotas

### PendingPage — `/` (rota autenticada, role = pending)

**Descrição:** Exibida no primeiro login do professor para que preencha telefone e matérias. Após enviar, avança para preencher a grade horária antes de aguardar aprovação.

**Fluxo de steps:**
- `form` → professor preenche telefone + matérias
- `schedule` → professor preenche a grade horária (ScheduleGrid) — sem alterações nesta spec
- `waiting` → aguarda aprovação do admin — sem alterações nesta spec

**Componentes do step `form`:**
- `NomeEmailReadonly` — campos somente-leitura derivados de `user.displayName` e `user.email` (grade `sm:grid-cols-2`)
- `TelefoneInput` — campo controlado com validação PHONE_REGEX
- `MateriasSelector` — seletor de matérias por segmento × área × matérias (ver comportamento B2)
- `AcoesForm` — botão "Enviar cadastro" + "Sair da conta"

---

## Behaviors

### step `form`

- [x] **B0 — Estrutura geral (sem alterações):** container `max-w-2xl`, card `bg-surf border border-bdr rounded-2xl`, cabeçalho com emoji + título + subtítulo.

- [ ] **B1 — Remover painel informativo lateral:**
  Remover o elemento:
  ```html
  <div class="hidden lg:flex flex-col items-center justify-center text-center p-6 rounded-xl bg-surf2 border border-bdr border-dashed">
    <div class="text-4xl mb-4">🗓️</div>
    <div class="font-bold text-sm text-t1 mb-2">Próximo passo: sua grade horária</div>
    <p class="text-xs text-t3 leading-relaxed">…</p>
  </div>
  ```
  O grid `lg:grid-cols-2` que envolvia o formulário + o painel deve ser removido.
  O formulário volta a ocupar a largura total do card.

- [ ] **B2 — Blocos de segmento lado a lado:**
  Os blocos de segmento (Ensino Fundamental, Ensino Médio) que estão em `space-y-3` devem ser reposicionados em grid:
  ```jsx
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
    {segGroups.map(({ seg, areaGroups }) => (
      <div key={seg.id} className="border border-bdr rounded-xl p-4">
        <div className="text-xs font-extrabold text-navy uppercase tracking-widest mb-3">{seg.name}</div>
        <div className="space-y-3">
          {areaGroups.map(({ area, subjs }) => (
            <div key={area.id}>
              <div className="text-[11px] font-bold text-t3 uppercase tracking-wide mb-1.5">{area.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {subjs.map(s => (
                  <button
                    key={s.id}
                    type="button"
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
  Em mobile (`grid-cols-1`) os blocos empilham normalmente.
  Em desktop (`lg:grid-cols-2`) ficam lado a lado.

- [x] **B3 — Lógica e fluxo inalterados:** `handleSubmit` continua avançando para `schedule`. Validações, re-entry (useEffect), `syntheticTeacher`, `ScheduleGrid` — sem tocar.

### step `schedule` e step `waiting`
Sem alterações nesta spec.

---

## Modelos de Dados
Sem alterações. `pending_teachers` já existe.

## Regras de Negócio
- `segGroups` é derivado de `store.segments × store.areas × store.subjects` — lógica inalterada.
- A posição do `subjError` continua logo abaixo do grid de segmentos.

## Fora do Escopo (v1)
- Alterações no step `schedule` ou `waiting`
- Qualquer mudança no Firestore ou nas stores
- Validações adicionais ou campos novos
