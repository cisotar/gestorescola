# GestãoEscolar

Sistema de gestão escolar para coordenação de grade horária, ausências e substituições de professores.

**Produção:** https://gestordesubstituicoes-react.web.app

---

## Stack

- **React 18** + Vite + React Router 6
- **Firebase** — Firestore, Authentication (Google OAuth), Hosting
- **Zustand** — estado global
- **Tailwind CSS** — design system com tokens customizados

## Instalação

```bash
npm install
```

Configure o Firebase criando `src/lib/firebase.js` com as credenciais do projeto `gestordesubstituicoes`.

## Scripts

```bash
npm run dev      # dev server (http://localhost:5173)
npm run build    # build de produção → dist/
npm run preview  # preview local do build
firebase deploy  # deploy para Firebase Hosting
```

## Estrutura

```
src/
├── pages/       # uma página por rota
├── components/  # layout/ e ui/ reutilizáveis
├── store/       # useAppStore (dados) + useAuthStore (auth/role)
├── lib/         # lógica pura: db.js, absences.js, reports.js, periods.js
└── hooks/       # useToast.js
```

## Documentação técnica

- [Arquitetura do sistema](references/architecture.md) — modelo de dados, RBAC, fluxos críticos, convenções
- [Design system](references/design-system.md) — tokens, componentes, padrões de UI
