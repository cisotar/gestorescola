# Plano de Testes — Permissões Granulares em Grades Horárias (#273)

Documento de checklist para validação manual de permissões em `/grades`.

## Preparação do Ambiente

### Pré-requisitos
- Banco de dados limpo ou com dados de teste controlados
- Deploy da branch com issues #269-#272 implementadas
- Chrome/Firefox com DevTools acessível (F12)

### Dados de Teste Necessários

#### Usuários
- [ ] **Professor A** (email: prof_a@escola.com, status: 'approved', role: 'teacher')
- [ ] **Professor B** (email: prof_b@escola.com, status: 'approved', role: 'teacher')
- [ ] **Admin** (email: admin@escola.com, role: 'admin')
- [ ] **Coordenador** (email: coord@escola.com, status: 'approved', role: 'coordinator')

#### Estrutura Escolar
- [ ] **Segmento:** "Ensino Fundamental"
- [ ] **Turno:** Manhã (horário: 07:00–11:40), Tarde (horário: 13:00–17:00)
- [ ] **Turmas:** 
  - 6º Ano A (Manhã)
  - 6º Ano B (Tarde)
  - 7º Ano A (Manhã)

#### Matérias e Áreas
- [ ] Matéria "Português" (Area: "Linguagens", não compartilhada)
- [ ] Matéria "Matemática" (Area: "Exatas", não compartilhada)
- [ ] Professor A associado a "Português"
- [ ] Professor B associado a "Matemática"

#### Horários (Schedules) Iniciais
- [ ] Professor A: 
  - 2ª Manhã, 3ª Manhã — 6º Ano A, Português
- [ ] Professor B:
  - 4ª Tarde — 6º Ano B, Matemática
- [ ] Admin/Coordenador: sem horários iniciais

---

## Teste 1: Professor Vendo Sua Grade

**Objetivo:** Validar que um professor vê botões ± e pode editar sua própria grade.

### Steps
1. [ ] Fazer login como **Professor A** (prof_a@escola.com)
2. [ ] Navegar a `/grades`
3. [ ] Verificar que aba "Por Professor" está pré-selecionada
4. [ ] Verificar que dropdown mostra "Você" ou nome do Professor A
5. [ ] Grade renderiza mostrando horários do Professor A (2ª e 3ª Manhã)
6. [ ] **VALIDAR:** Botões **"+"** (adicionar) estão visíveis em células vazias
7. [ ] **VALIDAR:** Botões **"✕"** (remover) aparecem ao passar hover sobre aulas existentes
8. [ ] **VALIDAR:** Nenhum ícone 🔒 aparece em ScheduleGrid
9. [ ] Clicar em **"+"** em uma célula vazia → modal abre com turmas livres
10. [ ] Modal exibe turmas (6º Ano A, 6º Ano B, 7º Ano A)
11. [ ] **VALIDAR:** Nenhum ícone 🔒 nas turmas do modal
12. [ ] Selecionar série "6º Ano" → turmas aparecem
13. [ ] Clicar em turma bloqueada (ocupada por Prof B) → turma cinzenta/desabilitada
14. [ ] **VALIDAR:** Tooltip mostra "Ocupado por B" (ou similar)
15. [ ] Fechar modal
16. [ ] Clicar em **"✕"** em uma aula existente → aula é removida
17. [ ] Grade atualiza imediatamente

**Resultado esperado:** ✅ Todos os passos executados sem erros

---

## Teste 2: Professor Vendo Grade de Colega

**Objetivo:** Validar que um professor NÃO pode editar grade de outro (botões desaparecem, readOnly=true).

### Steps
1. [ ] **Manter login** como Professor A
2. [ ] Na aba "Por Professor", mudar dropdown para **Professor B**
3. [ ] Grade renderiza mostrando horários do Professor B (4ª Tarde, 6º Ano B)
4. [ ] **VALIDAR:** Botões **"+"** estão INVISÍVEIS (readOnly ativado)
5. [ ] **VALIDAR:** Botões **"✕"** estão INVISÍVEIS (readOnly ativado)
6. [ ] **VALIDAR:** Aulas de B aparecem como cartões estáticos (sem ✕)
7. [ ] **VALIDAR:** Nenhum ícone 🔒 aparece em ScheduleGrid
8. [ ] Tentar clicar em uma célula vazia onde "+" deveria estar → nada acontece
9. [ ] Tentar clicar em uma aula existente → nada acontece (sem ✕ visível)
10. [ ] Mudar dropdown de volta para Professor A → botões reaparecem

**Resultado esperado:** ✅ Todos os passos executados, botões desaparecem quando readOnly=true

---

## Teste 3: Admin/Coordenador Vendo Qualquer Grade

**Objetivo:** Validar que admin/coordenador pode editar qualquer professor e acessar aba "Por Turma".

### Subtest 3a: Login como Admin

1. [ ] Fazer login como **Admin** (admin@escola.com)
2. [ ] Navegar a `/grades`
3. [ ] Verificar que aba "Por Professor" está selecionada
4. [ ] Verificar que aba **"Por Turma"** está VISÍVEL (não bloqueada para admin)
5. [ ] Dropdown de professor não tem pré-seleção (permite selecionar qualquer um)
6. [ ] Selecionar **Professor A** no dropdown
7. [ ] Grade de A renderiza com seus horários
8. [ ] **VALIDAR:** Botões **"+"** estão visíveis
9. [ ] **VALIDAR:** Botões **"✕"** aparecem ao hover
10. [ ] **VALIDAR:** Nenhum ícone 🔒 em ScheduleGrid
11. [ ] Clicar em **"+"** em célula vazia → modal abre
12. [ ] **VALIDAR:** Nenhum ícone 🔒 nas turmas do modal (apenas desabilitadas se ocupadas)
13. [ ] Fechar modal
14. [ ] Selecionar **Professor B** → grade muda, botões ainda visíveis
15. [ ] Clicar em aba **"Por Turma"** → aba funciona normalmente

### Subtest 3b: Login como Coordenador

1. [ ] Fazer logout e login como **Coordenador** (coord@escola.com)
2. [ ] Navegar a `/grades`
3. [ ] Repetir steps 3-14 acima (mesmo comportamento para coordenador)

**Resultado esperado:** ✅ Admin e coordenador editam qualquer professor, aba "Por Turma" acessível

---

## Teste 4: AddScheduleModal sem Ícones 🔒

**Objetivo:** Validar que turmas bloqueadas estão desabilitadas visualmente sem exibir 🔒.

### Steps
1. [ ] Fazer login como **Professor A** (ou admin se preferir)
2. [ ] Navegar a `/grades` → Professor A selecionado
3. [ ] Clicar em **"+"** em uma célula onde Professor B já tem aula (ex: 4ª Tarde, 6º Ano B)
4. [ ] Modal abre com seções:
   - Ano / Série
   - Turma
   - Turmas Compartilhadas (se houver)
   - Matéria
5. [ ] Selecionar série **"6º Ano"** → turmas aparecem
6. [ ] Visualizar turmas no modal:
   - [ ] "6º Ano A" — clicável (normal, pillOff)
   - [ ] "6º Ano B" — cinzenta/desabilitada (occupado por Prof B)
   - [ ] "7º Ano A" — clicável (normal, pillOff)
7. [ ] **VALIDAR:** Turma "6º Ano B" NÃO exibe ícone 🔒
8. [ ] **VALIDAR:** Turma "6º Ano B" exibe tooltip "Ocupado por B" ao hover
9. [ ] **VALIDAR:** Turma "6º Ano B" cursor é `cursor-not-allowed`
10. [ ] **VALIDAR:** Turma "6º Ano B" não é clicável (disabled=true)
11. [ ] Tentar clicar em "6º Ano B" → nada acontece
12. [ ] Clicar em "6º Ano A" → turma é selecionada
13. [ ] Clicar em "Adicionar" → aula é adicionada

**Resultado esperado:** ✅ Turmas bloqueadas são visualmente distintas (cinzentas), desabilitadas, sem ícone 🔒

---

## Teste 5: Nenhum Ícone 🔒 em Nenhuma Situação

**Objetivo:** Meta global — validar que ícone 🔒 NUNCA aparece durante os testes.

### Steps
1. [ ] Executar todos os testes 1-4 acima
2. [ ] Abrir DevTools (F12) → Console
3. [ ] Procurar por erros em vermelho → **0 erros esperados**
4. [ ] Procurar por warnings → nenhum warning esperado relacionado a permissões
5. [ ] Executar: `document.body.innerText.includes('🔒')` no console
   - Resultado esperado: `false` (nenhum 🔒 encontrado no DOM)
6. [ ] Repetir em 3 resoluções: 375px (mobile), 768px (tablet), 1024px+ (desktop)

**Resultado esperado:** ✅ Ícone 🔒 nunca aparece, console limpo

---

## Teste 6: Responsividade (Mobile, Tablet, Desktop)

**Objetivo:** Validar que permissões funcionam em diferentes tamanhos de tela.

### Resoluções de Teste
- [ ] **Mobile:** 375px (iPhone SE / 8)
- [ ] **Tablet:** 768px (iPad)
- [ ] **Desktop:** 1024px+ (full-width)

### Steps para cada resolução
1. [ ] Abrir Chrome DevTools → Device Toolbar → Selecionar resolução
2. [ ] Fazer login como Professor A
3. [ ] Navegar a `/grades` → visualizar grade própria
4. [ ] **VALIDAR:** Botões ± visíveis e funcionais
5. [ ] Mudar para Professor B
6. [ ] **VALIDAR:** Botões ± desaparecem
7. [ ] Clicar em "+" → modal abre
8. [ ] **VALIDAR:** Modal não transborda, é responsivo
9. [ ] Fechar modal
10. [ ] **Repetir para cada resolução**

**Resultado esperado:** ✅ Layout responsivo, permissões funcionam em todas as resoluções

---

## Teste 7: Verificação de Console (Erros e Warnings)

**Objetivo:** Garantir que não há erros JavaScript durante os testes.

### Steps
1. [ ] Abrir Chrome DevTools (F12) → Console
2. [ ] Executar todos os testes 1-6
3. [ ] Procurar por **linhas em vermelho** (erros)
4. [ ] Procurar por **linhas em amarelo** (warnings)
5. [ ] Documentar qualquer erro/warning encontrado
6. [ ] Esperado: **0 erros, 0 warnings** relacionados a permissões

**Documentar:**
- [ ] Erros encontrados: _______________________________
- [ ] Warnings encontrados: ____________________________

---

## Teste 8: Edge Cases

### Edge Case A: Professor tenta adicionar aula em turma ocupada
1. [ ] Login como Professor A
2. [ ] Selecionar Professor A → grade renderiza
3. [ ] Clicar "+" em 4ª Tarde, 6º Ano B (ocupada por Prof B)
4. [ ] Modal abre → selecionar série "6º Ano"
5. [ ] Turma "6º Ano B" aparece desabilitada
6. [ ] Tentar clicar em "6º Ano B" → nada acontece (disabled)
7. [ ] **VALIDAR:** Não há erro ou comportamento inesperado

### Edge Case B: Professor tenta adicionar aula em horário onde já tem aula
1. [ ] Login como Professor A
2. [ ] Clicar "+" em 2ª Manhã (onde Prof A já tem aula)
3. [ ] Modal abre
4. [ ] Selecionar série, turma, matéria
5. [ ] Clicar "Adicionar"
6. [ ] **VALIDAR:** Alert exibe "Conflito: professor já tem aula neste horário"
7. [ ] Clicar OK → modal fecha sem salvar

### Edge Case C: Professor alternando entre sua grade e de outros
1. [ ] Login como Professor A
2. [ ] Dropdown = Professor A → botões visíveis
3. [ ] Dropdown = Professor B → botões desaparecem
4. [ ] Dropdown = Professor A → botões reaparecem
5. [ ] Dropdown = Professor B → botões desaparecem novamente
6. [ ] **VALIDAR:** Transição é suave, sem blink ou erro

---

## Bugs Encontrados

Se encontrar comportamentos inesperados, criar issues separadas com:
- [ ] Título conciso (ex: "🔒 ícone aparece em ScheduleGrid")
- [ ] Passos para reproduzir
- [ ] Comportamento esperado vs observado
- [ ] Screenshots/vídeo se possível
- [ ] Navegador e resolução

Exemplos de bugs críticos:
- [ ] 🔒 aparece em ScheduleGrid durante teste 1-4
- [ ] 🔒 aparece em AddScheduleModal durante teste 4
- [ ] Botões ± não desaparecem quando readOnly=true
- [ ] Permissões não são respeitadas (ex: teacher pode editar outro professor)
- [ ] Erros JavaScript no console durante testes
- [ ] Modal não bloqueia turmas ocupadas

---

## Conclusão e Assinatura

Tester: _______________________________

Data: ________________________________

Resultado Final: [ ] ✅ PASSOU | [ ] ❌ FALHOU

Observações: __________________________

________________________________________

### Próximas Ações
- [ ] Se PASSOU: marcar critérios de aceite em #273
- [ ] Se FALHOU: criar issues de bug, replanear testes após fix
