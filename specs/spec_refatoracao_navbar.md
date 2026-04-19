# Spec: Refatoração da Navbar — Todos os Perfis

## Visão Geral

A Navbar atual (`src/components/layout/Navbar.jsx`) mistura navegação de conteúdo (links para páginas internas como Ausências, Substituições, Calendário etc.) com identidade do usuário e configurações. O objetivo desta refatoração é simplificar radicalmente a barra de navegação, removendo todos os links de conteúdo e mantendo apenas elementos essenciais de identidade, acesso rápido ao início e saída segura. A mudança afeta todos os perfis: `admin`, `teacher`, `teacher-coordinator` e `coordinator`.

## Stack Tecnológica

- Frontend: React 18 + React Router 6 + Tailwind CSS 3
- Estado: Zustand (`useAuthStore`) — sem alterações de store
- Backend/Auth: Firebase Auth — sem alterações
- Banco de dados: Firestore — sem alterações

## Páginas e Rotas

### Navbar (componente de layout global) — todas as rotas autenticadas

**Descrição:** Barra fixa no topo presente em todas as páginas acessíveis após login. Após a refatoração, exibe apenas: título da aplicação, botão Início, botão Configurações (link externo), informações do usuário logado (foto, nome completo, tipo de perfil) e botão Sair. Não há mais links de navegação para páginas internas.

**Componentes internos ao arquivo:**

- `Navbar` (componente principal exportado): estrutura desktop e mobile unificada na mesma barra
- `MobileMenuLink`: componente auxiliar para itens do menu mobile — será removido, pois o menu mobile deixa de existir como painel expansível

**Layout desktop (md: e acima):**

```
[ GestãoEscolar ]  [ Início ]  [ Configurações ]  ···  [ foto | Nome Completo | Tipo Perfil ]  [ Sair ]
```

**Layout mobile (abaixo de md:):**

```
[ GestãoEscolar ]  [ Início ]  [ Configurações ]  [ foto | Nome | Tipo ]  [ Sair ]
```

No mobile a barra exibe todos os elementos em linha, sem menu hamburger. Elementos com texto podem ser truncados. O botão Sair pode exibir apenas o ícone SVG existente para economizar espaço.

**Behaviors:**

- [ ] Exibir título: renderizar o texto "GestãoEscolar" (com span accent em "Gestão") como `NavLink` apontando para a rota de início correta por role (`/dashboard` para admin/coordinator/teacher-coordinator, `/home` para teacher)
- [ ] Botão Início: renderizar como `NavLink` textual (sem ícone) com label "Início", apontando para a mesma rota de início do título, aplicando estilo ativo quando a rota estiver ativa
- [ ] Botão Configurações: renderizar como elemento `<a>` com `href="https://gestordesubstituicoes-react.web.app/settings"`, `target="_blank"` e `rel="noopener noreferrer"`, com label textual "Configurações" e sem ícone; NÃO usar `NavLink` nem `to` de React Router pois é URL externa
- [ ] Remover badge de pendingCt: o badge de contagem de ações pendentes sobre o botão Configurações deve ser removido junto com o link interno de settings
- [ ] Exibir foto do usuário: renderizar `<img>` com `user.photoURL` quando disponível; fallback para `<div>` com inicial do nome quando photoURL for nulo ou vazio; tamanho `w-8 h-8 rounded-full`
- [ ] Exibir nome completo: renderizar `user.displayName` completo (não apenas primeiro nome como hoje), com `truncate` e `max-w-[160px]` para evitar overflow
- [ ] Exibir tipo de perfil: renderizar badge textual com label mapeado a partir do `role` do `useAuthStore`, seguindo mapeamento: `admin` → "Admin", `coordinator` → "Coordenador", `teacher-coordinator` → "Prof. Coordenador", `teacher` → "Professor"; badge deve usar estilo `text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white/90 uppercase tracking-wide`
- [ ] Botão Sair: manter comportamento atual — chama `logout()` do `useAuthStore`; renderizar como botão com ícone SVG de logout e label "Sair" visível em desktop; somente ícone em mobile
- [ ] Remover menu hamburger mobile: eliminar o estado `menuOpen`, o botão hamburger, o overlay e o painel deslizante inteiro (bloco `{menuOpen && (...)}` com comentário `MOBILE-HAMBURGER`)
- [ ] Remover helper `MobileMenuLink`: o componente local deixa de existir pois não há mais menu mobile expansível
- [ ] Remover todos os links de navegação de conteúdo: eliminar os `NavLink` para `/absences`, `/substitutions`, `/calendar`, `/workload`, `/school-schedule` e `/schedule` tanto do layout desktop quanto do mobile
- [ ] Responsividade: em mobile, a navbar permanece como barra única em linha; foto + nome + tipo de perfil devem ser empacotados em bloco `flex items-center gap-2`; o nome pode ser ocultado em telas muito pequenas (`hidden sm:block`) se necessário para não quebrar layout
- [ ] Manter sticky top-0 z-50: a navbar continua fixa no topo com `sticky top-0 z-50 shadow-sm` e fundo `bg-navy`

---

## Componentes Compartilhados

- `Navbar` (`src/components/layout/Navbar.jsx`): único componente afetado. Importado por `Layout.jsx` — nenhuma alteração em `Layout.jsx` é necessária.

## Modelos de Dados

Nenhuma alteração de modelo de dados. O componente consome apenas:

| Campo | Origem | Uso |
|---|---|---|
| `user.displayName` | `useAuthStore` | Nome completo exibido na navbar |
| `user.photoURL` | `useAuthStore` | Foto de perfil Google |
| `role` | `useAuthStore` | Determina label do tipo de perfil e rota de início |
| `logout` | `useAuthStore` | Função chamada pelo botão Sair |
| `isCoordinator()` | `useAuthStore` | Determina rota de início (coordinator vai para /dashboard) |

O campo `pendingCt` e o helper `isAdmin` continuam importados do store mas o `pendingCt` deixa de ser renderizado. Se não houver outro uso interno, a desestruturação de `pendingCt` pode ser removida do componente.

## Regras de Negócio

- **Rota de início por role:** admin, coordinator e teacher-coordinator redirecionam para `/dashboard`; teacher redireciona para `/home`. Lógica existente via `canAccessAdmin = isAdmin || isCoordinator()` deve ser mantida.
- **Configurações como link externo:** o botão Configurações abre `https://gestordesubstituicoes-react.web.app/settings` em nova aba, sem usar o roteador interno. Isso é intencional e definitivo para esta versão.
- **Label de perfil:** o mapeamento de `role` para label legível é responsabilidade exclusiva do componente Navbar; não criar helper global para isso.
- **Nome completo:** exibir `user.displayName` inteiro, não apenas o primeiro nome (`split(' ')[0]`) como na versão atual.
- **Sem ícones nos botões de texto:** os botões "Início" e "Configurações" não devem ter ícones (emoji ou SVG) — apenas label textual.

## Fora do Escopo (v1)

- Alterações em `Layout.jsx`
- Alterações em qualquer página ou rota
- Alterações nas regras Firestore ou nas stores Zustand
- Adição de novos links de navegação à navbar
- Personalização de navbar por role (todos os perfis veem a mesma estrutura)
- Badge de pendingCt em qualquer elemento da navbar
- Menu hamburger ou drawer lateral para mobile
- Animações de entrada/saída de elementos
- Testes automatizados
