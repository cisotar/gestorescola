# Workflow Atualizado com Agent de Verificação

Copie e cole este conteúdo na configuração do skill `/workflow` em Claude Code → Settings → Skills → Workflow.

---

## Descrição do Projeto

HORÁRIOS ESPECIAIS são os tempos e intervalos especiais.
exemplo:
para o período da manhã, começam no final da útlima aula (começam depois das 16 h)
para o período da tarde, acabam antes do início da primeira aula (começam 14:30)

os traços duplos devem separar os horários iniciais dos horários regulares.

---

## Etapa 1 — Especificar

Use o agente `especificar` passando a descrição do projeto acima.

Aguarde o arquivo `specs/spec_nome_do_projeto.md` ser gerado antes de continuar.

---

## Etapa 2 — Quebrar em Issues

Use o agente `quebrar` passando o caminho do spec gerado na etapa anterior.

Não peça confirmação da lista de issues — gere, salve em `tasks/` e crie no GitHub diretamente.

Registre o diagrama de dependências retornado para definir a ordem da próxima etapa.

---

## Etapa 3 — Ciclo Planejar → Executar

Para cada issue gerada, na ordem do diagrama de dependências (`setup → model → prototype → backend → integration → feature`):

1. Use o agente `planejar` passando o caminho da issue (`tasks/NNN-*.md`)
2. Imediatamente após, use o agente `executar` passando o mesmo caminho
3. Se o agente `executar` reportar problema bloqueante, reexecute `planejar` na mesma issue antes de continuar
4. Avance para a próxima issue sem parar

Repita até a última issue do diagrama estar com todos os critérios marcados como `[x]`.

---

## Etapa 4 — Verificação Final (NOVO)

Quando todas as issues tiverem critérios `[x]`, use o agente `Explore` para fazer audit final:

```
Audit final do workflow:
1. Verificar que todos os arquivos em tasks/ têm todos os critérios marcados [x]
2. Confirmar que nenhuma issue do diagrama de dependências ficou pendente
3. Rodar `npm run build` — deve passar sem erros
4. Confirmar deploy bem-sucedido (Firebase ou sua plataforma)
5. Listar todos os commits criados durante este workflow
6. Gerar relatório: total de issues, arquivos criados/modificados, desvios registrados
```

---

## Critério de Conclusão

O workflow termina quando:
- Todas as issues em `tasks/` têm todos os critérios de aceite marcados `[x]`
- Nenhuma issue do diagrama de dependências ficou pendente
- Build passa sem erros
- Deploy bem-sucedido
- Audit final reporta tudo OK

Ao concluir, exiba um resumo com:
- Total de issues executadas
- Arquivos criados/modificados
- Eventuais desvios registrados
- Link para commits no GitHub
