# Plano Técnico — #82 Rota /substitutions + Navbar

### Análise do Codebase

- `src/App.jsx` (linhas 1–98) — todas as rotas vivem dentro de `<Route element={<Layout />}>` sem guards individuais por role. A rota `/absences` é acessível para ambos os roles (admin e teacher) sem nenhuma proteção extra na JSX — o padrão do projeto é tratar acesso por role apenas no nível de conteúdo da página, não na rota. A nova rota segue o mesmo padrão.
- `src/components/layout/Navbar.jsx` (linhas 50–53) — tabs desktop: dois `<NavLink>` para "Início" e "Relatório de Ausências". O novo link vai imediatamente após o de absências.
- `src/components/layout/Navbar.jsx` (linhas 143–145) — menu mobile: mesmos dois links via `<MobileMenuLink>`. Idem para o mobile.
- `src/pages/SubstitutionsPage.jsx` — **ainda não existe**; será criado no issue #83. Para este issue, basta um stub mínimo para que o import não quebre.

### Cenários

**Caminho Feliz:**
1. Usuário (admin ou teacher) clica em "📋 Substituições" na Navbar
2. React Router navega para `/substitutions`
3. `SubstitutionsPage` é renderizada dentro do `<Layout>`

**Casos de Borda:**
- `SubstitutionsPage.jsx` ainda não existe → criar stub mínimo no mesmo commit
- Role `pending` não tem acesso ao `<Layout>` (filtrado antes das rotas em App.jsx) → sem ação necessária

**Tratamento de Erros:**
- Sem risco de erro em runtime: é apenas registro de rota e link de navegação

### Schema de Banco de Dados
N/A

### Arquivos a Criar
- `src/pages/SubstitutionsPage.jsx` — stub mínimo: `export default function SubstitutionsPage() { return <div className="p-6"><h1 className="text-xl font-extrabold">Relatório de Substituições</h1></div> }`

### Arquivos a Modificar

- `src/App.jsx`
  - Após linha 15 (import de `AbsencesPage`): adicionar `import SubstitutionsPage from './pages/SubstitutionsPage'`
  - Após linha 87 (`<Route path="/absences" ...>`): adicionar `<Route path="/substitutions" element={<SubstitutionsPage />} />`

- `src/components/layout/Navbar.jsx`
  - Após linha 53 (NavLink de `/absences`, bloco desktop): `<NavLink to="/substitutions" className={linkClass}>📋 Substituições</NavLink>`
  - Após linha 145 (MobileMenuLink de `/absences`, bloco mobile): `<MobileMenuLink to="/substitutions" onClick={closeMenu}>📋 Substituições</MobileMenuLink>`

### Arquivos que NÃO devem ser tocados
- `src/components/layout/Layout.jsx`
- Qualquer outro arquivo de página existente

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. Criar `src/pages/SubstitutionsPage.jsx` com stub mínimo
2. Modificar `src/App.jsx` — import + rota
3. Modificar `src/components/layout/Navbar.jsx` — NavLink desktop + MobileMenuLink mobile
