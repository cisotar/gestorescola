# GestãoEscolar

Sistema de gestão escolar para coordenação de grade horária, ausências e substituições de professores. Plataforma inteligente que otimiza o gerenciamento de recursos humanos em escolas.

**Produção:** https://gestordesubstituicoes-react.web.app

---

## 📋 Visão Geral

GestãoEscolar é uma plataforma SaaS que centraliza três operações críticas em instituições educacionais:

1. **Gestão de Horários** — criação e visualização de grades horárias com períodos de entrada/saída
2. **Registro de Ausências** — controle de faltas de professores com geração de relatórios
3. **Coordenação de Substituições** — alocação inteligente de professores substitutos com ranking de disponibilidade

O sistema é baseado em **escolas** como unidade organizacional, preparado para evolução em uma plataforma SaaS multi-escolas.

---

## 🔄 Fluxos Principais

### 1. Fluxo de Gestão de Horários

```
Coordenador/Admin
    ↓
Criar Escola → Definir Períodos (entrada/saída) → Cadastrar Professores
    ↓
Criar Grade Horária (por turma/matéria/professor)
    ↓
Visualizar Grade (coordenador, professor, diretor)
```

**Componentes-chave:**
- [GradesPage](src/pages/GradesPage.tsx) — interface para criar/editar grades
- [SchoolSchedulePage](src/pages/SchoolSchedulePage.tsx) — configuração de períodos
- `db.addScheduleSlot()` — salva slots de aula no Firestore

**Dados armazenados:**
- `school_schedules` — períodos de entrada/saída por escola
- `schedules` — slots de aula (professor, turma, horário, matéria)

---

### 2. Fluxo de Ausências

```
Professor (app) ou Coordenador (admin)
    ↓
Registrar Ausência (data, professor, motivo opcional)
    ↓
Sistema marca slot como "não disponível"
    ↓
Disparadores de Substituição (automático ou manual)
    ↓
Relatório de Ausências (por professor, por período)
```

**Componentes-chave:**
- [AbsencesPage](src/pages/AbsencesPage.tsx) — listagem e filtros de ausências
- `db.recordAbsence()` — registra ausência no Firestore
- `lib/absences.js` — lógica de validação e cálculo de impacto
- `lib/reports.js` — geração de PDFs com relatórios de faltas

**Dados armazenados:**
- `absences` — registro de faltas (professor, data, tipo)
- Relacionado a `schedules` via professor + data

---

### 3. Fluxo de Substituições

```
Coordenador ou Sistema
    ↓
Criar Substituição (quando slot fica sem professor)
    ↓
Sistema calcula Ranking de Substitutos
    ├─ Professores com formação na matéria
    ├─ Professores disponíveis no horário
    ├─ Histórico de aceitação/rejeição
    └─ Proximidade às datas recentes de substituição
    ↓
Notificar Professor Substituto
    ├─ Opção 1: Aceitar
    ├─ Opção 2: Rejeitar
    └─ Opção 3: Nenhuma ação (timeout)
    ↓
Confirmar ou Liberar Slot (se rejeitado)
```

**Componentes-chave:**
- [SubstitutionsPage](src/pages/SubstitutionsPage.tsx) — visão completa de substituições
  - **Aba Substituto** — detalhes por professor substituto
  - **Aba Dia** — slots não preenchidos agrupados por dia
  - **Aba Semana** — visão agregada da semana
  - **Aba Mês** — ranking de professores substitutos
- `lib/substitutions.js` — algoritmo de ranking e cálculo de pontuação
- `lib/reports.js` — geração de PDFs de substituições

**Dados armazenados:**
- `substitutions` — registros de substituição (slot, professor, status, aceito em)
- `substitution_history` — histórico de aceitações/rejeições

---

## 🏗️ Stack Técnico

- **Frontend:** React 18 + Vite + React Router 6
- **Estado:** Zustand (dados globais + autenticação)
- **Banco de Dados:** Firebase Firestore (NoSQL)
- **Autenticação:** Google OAuth (Firebase Auth)
- **Design:** Tailwind CSS com tokens customizados
- **Relatórios:** jsPDF + html2canvas (geração de PDFs)
- **Deploy:** Firebase Hosting

---

## 📦 Estrutura do Projeto

```
src/
├── pages/              # Uma página por rota principal
│   ├── GradesPage.tsx              # Gestão de horários
│   ├── AbsencesPage.tsx            # Registro de ausências
│   ├── SubstitutionsPage.tsx       # Coordenação de substituições
│   ├── SchoolSchedulePage.tsx      # Configuração de períodos
│   ├── DashboardPage.tsx           # Overview e estatísticas
│   ├── PendingPage.tsx             # Aprovação de cadastros
│   ├── SettingsPage.tsx            # Configurações de escola
│   └── ...
├── components/
│   ├── layout/         # Header, Navbar, Layout wrapper
│   ├── ui/            # Botões, inputs, cards reutilizáveis
│   ├── grades/        # Componentes específicos de grades
│   ├── absences/      # Componentes específicos de ausências
│   └── substitutions/ # Componentes específicos de substituições
├── store/
│   ├── useAppStore.ts      # Estado global de dados (escolas, professores, grades)
│   ├── useAuthStore.ts     # Estado de autenticação (usuário, role)
│   └── useToastStore.ts    # Notificações toast
├── lib/
│   ├── firebase.js         # Configuração Firebase
│   ├── db.js              # Operações CRUD no Firestore
│   ├── absences.js        # Lógica de validação de ausências
│   ├── substitutions.js   # Algoritmo de ranking de substitutos
│   ├── reports.js         # Geração de PDFs
│   ├── periods.js         # Cálculo de períodos e horários
│   └── constants.js       # Constantes do sistema
├── hooks/
│   └── useToast.js        # Hook para exibir notificações
└── types/
    └── index.ts           # Tipos TypeScript compartilhados
```

---

## 🔐 Modelo de Acesso (RBAC)

O sistema implementa controle de acesso baseado em papéis:

| Papel | Grades | Ausências | Substituições | Configuração |
|-------|--------|-----------|---------------|--------------|
| **Admin** | R/W | R/W | R/W | R/W |
| **Coordenador** | R/W | R/W | R/W | R |
| **Professor** | R | R (próprio) | R (propostas) | - |
| **Diretor** | R | R | R | R |

---

## 🚀 Instalação e Desenvolvimento

### Pré-requisitos

- Node.js 18+
- npm ou yarn

### Setup

```bash
# Clonar e instalar
git clone <repo>
cd gestorescola
npm install

# Configurar Firebase
# 1. Criar arquivo src/lib/firebase.js com credenciais do projeto Firebase
# 2. Exportar configuração para o app
```

### Executar

```bash
npm run dev      # Dev server (http://localhost:5173)
npm run build    # Build de produção → dist/
npm run preview  # Preview local do build
firebase deploy  # Deploy para Firebase Hosting
```

---

## 📚 Documentação Técnica

- [Arquitetura do sistema](references/architecture.md) — modelo de dados, RBAC, fluxos críticos, convenções
- [Design system](references/design-system.md) — tokens, componentes, padrões de UI

---

## 🔮 Visão SaaS Multi-Escolas

GestãoEscolar está sendo preparado para evoluir de um sistema mono-escola para uma plataforma SaaS robusta, escalável e multi-tenant:

### Pilares da Transformação

#### 1. **Isolamento de Dados por Escola**
- Cada escola é uma unidade isolada com seus próprios:
  - Professores
  - Turmas
  - Grades horárias
  - Registro de ausências e substituições
- Firestore organizado com `school_id` como raiz de coleções
- Regras de segurança garantem isolamento total

#### 2. **Gestão de Contas Multi-Escola**
- Um coordenador/admin pode gerenciar múltiplas escolas
- Dashboard centralizado com visão consolidada
- Switching rápido entre escolas (sem re-login)
- Controle granular de permissões por escola

#### 3. **Arquitetura de Negócio**
```
Plano Gratuito (MVP)
  └─ 1 escola | 50 professores | funcionalidades básicas

Plano Pro
  └─ Até 5 escolas | 500 professores | relatórios avançados

Plano Enterprise
  └─ Escolas ilimitadas | usuários ilimitados | suporte dedicado | integrações customizadas
```

#### 4. **Funcionalidades SaaS Planejadas**
- Faturamento mensal por escola/plano
- Painel de administração SaaS (gestão de usuários, faturamento, analytics)
- SSO para múltiplas escolas (single sign-on)
- API para integrações terceirizadas
- Automações avançadas (notificações, workflow, webhooks)
- Analytics e KPIs (taxa de substituição, custos, eficiência)

#### 5. **Próximas Etapas**
- [ ] Migração completa de dados para modelo multi-tenant
- [ ] Painel de onboarding e setup para novas escolas
- [ ] Sistema de faturamento integrado (Stripe/PagSeguro)
- [ ] Dashboard de analytics e relatórios executivos
- [ ] API RESTful para integrações
- [ ] Automações de notificações (email, SMS, push)

---

## 📞 Suporte

Para dúvidas, bugs ou sugestões, abra uma issue no repositório ou entre em contato: contato.tarciso+claudeai@gmail.com
