# Spec: Implementação de Progressive Web App (PWA) Autônomo

## Visão Geral
Transformar o sistema GestãoEscolar em um Progressive Web App (PWA) instalável, permitindo que administradores e professores adicionem o app à tela inicial de seus dispositivos (Android, iOS, Desktop) sem passar por lojas de aplicativos. O app oferece uma experiência visual de "app nativo", abrindo em modo tela cheia (standalone) com splash screen durante carregamento.

## Stack Tecnológica
- **Frontend:** Vite + React
- **Service Worker:** JavaScript vanilla (`sw.js`)
- **Manifest:** JSON (`manifest.json`)
- **Ícones:** SVG com emojis de sistema (gerados autonomamente)
- **Hospedagem:** Firebase Hosting (HTTPS)
- **Design System:** Tokens CSS (navy: #1A1814, bg: #F7F6F2)

## Páginas e Rotas

### Configuração de Instalação — [Raiz do Projeto]
**Descrição:** Infraestrutura técnica necessária para habilitar o recurso de PWA em todo o site. Não é uma página visível ao usuário, mas uma série de arquivos e modificações que permitem a instalação do app e seu funcionamento autônomo.

**Componentes:**
- `public/manifest.json`: Arquivo de configuração que descreve o app para o dispositivo
- `public/sw.js`: Service Worker que roda em segundo plano para gerenciar cache e interceptar requisições
- `public/icon.svg`: Ícone SVG com emoji centralizado, escalável (múltiplos tamanhos via viewBox)
- `src/main.jsx`: Ponto de entrada onde o Service Worker é registrado
- `index.html`: Ponto de entrada onde o manifesto é linkado

**Behaviors:**
- [ ] **Geração de Ícones SVG:** Criar arquivo `public/icon.svg` contendo um emoji (ex: 🏫) centralizado e escalável contra fundo com cor do token navy (#1A1814) ou bg (#F7F6F2). O SVG deve ser criado programmaticamente pela IA, respeitando boas práticas de contraste e visibilidade.
- [ ] **Criação do Manifest:** Criar arquivo `public/manifest.json` com metadados do app:
  - `name`: "GestãoEscolar"
  - `short_name`: "GestãoEscolar"
  - `start_url`: "/"
  - `display`: "standalone"
  - `background_color`: "#F7F6F2"
  - `theme_color`: "#1A1814"
  - `icons`: Array apontando para `icon.svg` com tipo MIME `image/svg+xml`
  - Campos opcionais: `description`, `categories`, `screenshots` (para splash screen)
- [ ] **Criação do Service Worker:** Criar arquivo `public/sw.js` que:
  - Escuta evento `install`: cache de ativos principais (HTML, CSS, JS)
  - Escuta evento `fetch`: estratégia de cache-first com fallback para rede
  - Escuta evento `activate`: limpeza de cache obsoletos
  - Garante que o navegador considere o app "instalável"
- [ ] **Registro do Service Worker:** Modificar `src/main.jsx` para registrar o Service Worker via `navigator.serviceWorker.register()`, capturando erros graciosamente
- [ ] **Link do Manifesto:** Modificar `index.html` para adicionar tag `<link rel="manifest" href="/manifest.json">` no `<head>`
- [ ] **Metadados de Tema:** Adicionar tags no `index.html`:
  - `<meta name="theme-color" content="#1A1814">`
  - `<meta name="mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  - `<meta name="apple-mobile-web-app-title" content="GestãoEscolar">`
- [ ] **Verificação de Instalação:** Após deploy em produção (Firebase Hosting), validar que o usuário consegue clicar em "Instalar" ou "Adicionar à tela inicial" no menu do navegador (Chrome 67+, Safari 15+, Edge)
- [ ] **Modo Standalone:** Validar que ao abrir o app pelo ícone gerado, ele ocupa a tela inteira sem exibir barra de endereços do navegador e com tema visual consistente

---

## Componentes Compartilhados

### PWAHandler
**Localização:** `src/main.jsx`  
**Responsabilidade:** Lógica de registro do Service Worker e captura de eventos de instalação.

**Funcionalidades:**
- Registra o Service Worker de forma segura (com fallback para navegadores sem suporte)
- Escuta evento `beforeinstallprompt` (Chrome/Edge) para futuras otimizações de UX
- Lida com erro de registro graciosamente, permitindo que o app funcione mesmo sem Service Worker
- Exibe status no console para debug (opcional, apenas em desenvolvimento)

---

## Modelos de Dados

### Web App Manifest (`public/manifest.json`)
```json
{
  "name": "GestãoEscolar",
  "short_name": "GestãoEscolar",
  "description": "Sistema de gestão escolar para administradores e professores",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#F7F6F2",
  "theme_color": "#1A1814",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    },
    {
      "src": "/icon.svg",
      "sizes": "192x192",
      "type": "image/svg+xml",
      "purpose": "any"
    },
    {
      "src": "/icon.svg",
      "sizes": "512x512",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ],
  "categories": ["education", "productivity"],
  "screenshots": [
    {
      "src": "/icon.svg",
      "sizes": "540x720",
      "type": "image/svg+xml",
      "form_factor": "narrow"
    }
  ]
}
```

### Service Worker (`public/sw.js`)
**Estratégia de Cache:** Cache-first com fallback para rede.
- Arquivos estáticos (JS, CSS, SVG) são cacheados no `install`
- Requisições de fetch verificam cache primeiro, depois rede
- Cache obsoletos são removidos no `activate`
- Erros de rede fallback para página offline (se implementada)

---

## Regras de Negócio

1. **Autonomia Visual:** A IA é totalmente responsável por escolher um emoji apropriado (ex: 🏫, 📚, 👨‍🎓) e criar o arquivo SVG do ícone. O emoji deve ter boa visibilidade contra cores de fundo navy (#1A1814) e bg (#F7F6F2), respeitando contraste WCAG AA mínimo de 4.5:1.

2. **Segurança:** O PWA requer HTTPS para funcionar corretamente. Firebase Hosting já fornece HTTPS por padrão, garantindo que o Service Worker seja registrado com sucesso.

3. **Compatibilidade:** O manifest e o Service Worker devem seguir especificações W3C atuais (PWA Manifest v1, Service Workers Level 1). Navegadores com suporte mínimo:
   - Chrome/Edge 67+
   - Firefox 44+
   - Safari 15+

4. **Performance:** Arquivos estáticos devem ser cacheados para permitir carregamento mais rápido em acessos subsequentes, melhorando UX no modo offline parcial.

5. **Standalone Display:** O app deve ser exibido sem UI do navegador quando aberto a partir do ícone instalado. Título e tema visual devem ser mantidos consistentes.

---

## Fora do Escopo (v1)

- **Notificações Push:** Sistema de notificações server-to-device via Web Push API
- **Suporte Offline Completo:** Leitura/escrita de dados sincronizados quando offline (requer Firestore offline persistence e estratégia de sincronização)
- **Banner de Instalação Customizado:** UI customizada dentro do app para sugerir instalação (ex: modal ou toast)
- **Splash Screens Customizadas:** Telas de abertura específicas por dispositivo/resolução
- **Atualização Automática de Service Worker:** Sistema de versionamento e update de SW sem recarregar a página
- **Ícones Específicos por Plataforma:** PNGs otimizados para iOS/Android (mantém SVG único)

---

## Resumo Executivo
- **Total de arquivos a criar:** 3 (manifest.json, sw.js, icon.svg)
- **Total de arquivos a modificar:** 2 (main.jsx, index.html)
- **Total de behaviors identificados:** 8
- **Estimativa de impacto:** Mínimo (infraestrutura pura, sem alterações no core do app)
- **Próximos passos:** Executar `/quebrar` para gerar issues acionáveis
