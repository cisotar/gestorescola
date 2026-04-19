# Spec: Correção do TabApprovals — Erro Silencioso e Índice Composto no Firestore

## Visão Geral

O botão "Aprovações" na página de configurações exibe badge com contador (ex: `(1)`), mas ao clicar na aba o conteúdo mostra "Erro ao carregar aprovações pendentes". O erro não aparece no console porque o `catch` no método `load()` do componente `TabApprovals` absorve a exceção silenciosamente.

A causa raiz é uma query composta no Firestore (`where` + `orderBy` em campos distintos) na coleção `pending_actions` que exige um índice composto inexistente. A ausência do índice faz o Firestore retornar erro, que é engolido sem log.

O objetivo desta spec é corrigir o diagnóstico (adicionar log no catch) e criar o índice composto necessário para a query funcionar.

---

## Stack

- React (frontend, SPA)
- Firebase Firestore (banco de dados)
- Firebase CLI (`firebase deploy --only firestore:indexes`)
- Arquivo principal: `src/pages/SettingsPage.jsx`
- Arquivo de índices: `firestore.indexes.json` (raiz do projeto)

---

## Páginas / Rotas

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/settings` | `SettingsPage` | Página de configurações; contém o componente `TabApprovals` |

Nenhuma nova rota é necessária.

---

## Behaviors

### B1 — Log de erro no catch do `TabApprovals.load()`

**Atual:** O método `load()` (~linha 2397 de `src/pages/SettingsPage.jsx`) possui um bloco `catch {}` vazio que absorve exceções sem registrá-las.

**Esperado:** O catch deve chamar `console.error` com a exceção capturada, permitindo diagnóstico imediato em ambiente de desenvolvimento e produção.

```js
// antes
} catch (e) {
  setError('Erro ao carregar aprovações pendentes');
}

// depois
} catch (e) {
  console.error('[TabApprovals] Erro ao carregar aprovações pendentes:', e);
  setError('Erro ao carregar aprovações pendentes');
}
```

### B2 — Query composta na coleção `pending_actions`

**Atual:** `getPendingActions()` executa query com `where('status', '==', 'pending')` combinada com `orderBy('createdAt', 'asc')`. Sem índice composto, o Firestore rejeita a query.

**Esperado:** Após criar o índice composto e fazer deploy, a query deve retornar os documentos corretamente e a aba "Aprovações" deve exibir o conteúdo.

### B3 — Badge de contagem deve permanecer funcional

O badge no botão "Aprovações" deve continuar exibindo a contagem correta após a correção. Nenhuma mudança na lógica de contagem é necessária — o badge já busca dados de forma independente ou será corrigido como efeito colateral do índice.

---

## Modelos de Dados

### Coleção `pending_actions`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `status` | `string` | Estado da ação; valor `"pending"` para itens aguardando aprovação |
| `createdAt` | `timestamp` | Data/hora de criação do registro |
| (demais campos) | — | Não alterados por esta spec |

### Índice composto necessário (`firestore.indexes.json`)

```json
{
  "indexes": [
    {
      "collectionGroup": "pending_actions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status",    "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Se o arquivo `firestore.indexes.json` já existir com outros índices, o novo objeto deve ser adicionado ao array `indexes` sem remover os existentes.

---

## Regras de Negócio

1. O índice composto deve ser implantado via `firebase deploy --only firestore:indexes` antes de considerar a correção concluída em produção.
2. O `console.error` deve ser adicionado em **todos** os blocos `catch` do fluxo de carregamento do `TabApprovals` que atualmente suprimem erros — não apenas no `load()` principal.
3. A mensagem de erro exibida ao usuário ("Erro ao carregar aprovações pendentes") deve ser mantida; apenas o log interno é adicionado.
4. Não alterar a estrutura dos documentos em `pending_actions` nem as regras de segurança do Firestore.
5. O deploy do índice pode levar alguns minutos para ser construído pelo Firestore; durante esse período a query pode continuar falhando — isso é comportamento esperado e não requer rollback.

---

## Fora do Escopo

- Refatoração geral do componente `TabApprovals` ou de `SettingsPage.jsx`.
- Alteração na lógica de exibição do badge (contagem de aprovações pendentes).
- Mudanças nas regras de segurança (`firestore.rules`).
- Criação de novos índices além do descrito nesta spec.
- Tratamento de erros em outras abas da página de configurações.
- Testes automatizados (não há suite de testes configurada para este módulo).
