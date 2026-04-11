# Reformulação da Página Inicial do Professor

O objetivo dessa implementação é criar uma nova página inicial (`HomePage`) mais limpa e direcionada para o professor, movendo a visão detalhada de Dashboard (tabelas e informações adicionais) para uma rota separada (`/dashboard`), mantendo o acesso a ela através de um cartão de atalho.

## User Review Required

> [!IMPORTANT]
> Verifique se as rotas de redirecionamento propostas (`/home` como landing do professor e `/dashboard` permanecendo como landing do admin) atendem 100% a sua visão de arquitetura do sistema antes de começarmos.

## Proposed Changes

### 1. Rotas e Fluxo de Navegação (`src/App.jsx` e `src/components/layout/Navbar.jsx`)
- **Novo redirecionamento padrão**: Atualizaremos o `App.jsx` para que a tela inicial redirecione o professor para `/home`, enquanto o administrador continuará sendo enviado direto para o `/dashboard`.
- **Navegação no Navbar**: Os botões de voltar ao Início e o logo do sistema na barra de navegação passarão a enviar professores para `/home` e administradores para `/dashboard`.

---

### 2. Nova Página do Professor (`src/pages/HomePage.jsx`)

#### [NEW] `HomePage.jsx`
Essa página consolidará a visão primária para o perfil de professor:
1. **Saudação**: Exibirá a mensagem de "Olá, {Nome} 👋" juntamente com um subtítulo descritivo.
2. **Estatísticas rápidas**: Consumiremos o componente independente `TeacherStats` já formatado em `DashboardPage.jsx` ou copiaremos a sua essência.
3. **Cartões de Ação Rápida**: Criaremos três `ActionCard` abaixo das métricas:
   - **Meu Perfil**: redireciona para `/settings` (que já abre a aba `profile` para professores).
   - **Relatórios**: redireciona para `/absences`.
   - **Dashboard**: redireciona para `/dashboard`, caso o professor queira ver os indicadores agregados do antigo layout.

---

### 3. Melhoria no Dashboard Atual (`src/pages/DashboardPage.jsx`)

#### [MODIFY] `DashboardPage.jsx`
- O componente continuará funcionando intacto, mas passará a atuar como uma rota secundária (`/dashboard`) para os professores.
- Para administradores, essa continuará sendo a visualização e rota inicial da aplicação, mantendo total estabilidade de uso.

## Open Questions

> [!TIP]
> 1. Na nova `HomePage`, eu devo exportar e separar o pequeno componente de cartões (`ActionCard`) num arquivo reutilizável na UI do projeto, ou posso copiá-lo estrategicamente para a Home apenas?
> 2. Posso proceder com a implementação deste plano nos arquivos indicados?

## Verification Plan
### Manual Verification
- Fazer login com uma conta de professor e validar a renderização da Nova `HomePage`, o comportamento independente do componente de métricas, bem como se os três ActionCards estão linkando corretamente as páginas descritas.
- Fazer login com uma conta de administrador e garantir que a página "Início" e a barra de navegação continuem direcionando com êxito para o antigo "Dashboard".
