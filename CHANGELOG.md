# Changelog

All notable changes to this project will be documented in this file.

## [1.1.5] - 2026-07-21

### Added
- **Novo Sistema Nativo de Atualização (Substituição do `electron-updater`)**:
  - `version-checker.ts` estendido para selecionar o asset exato (`.exe` ou `.dmg`) da Release API do GitHub, capturando a URL de download direto e o tamanho em bytes.
  - Criado downloader nativo no processo Electron (`main.js`) usando o módulo HTTPS do Node com suporte a redirecionamento (CDN do GitHub) e relatórios de progresso em tempo real via IPC.
  - Implementado instalador automatizado via flag NSIS (`--updated`), permitindo que a aplicação reinstale silenciosamente a nova versão sem perder dados nem exigir desinstalação prévia.
  - Adicionada suíte de testes unitários para a função `findDownloadAsset` e testes de integração validando os downloads reais dos assets da API do GitHub.

### Fixed
- **Divergência de nomes nos arquivos YML / 404 no Download**:
  - Resolvido problema do `electron-updater` que buscava o arquivo com hífens (`App-Financeiro-Setup...exe`) enquanto o asset gerado possuía pontos (`App.Financeiro.Setup...exe`), causando erro 404 no download.
- **Verificação em Ambiente Local / Desenvolvimento**:
  - Removido o bloqueio `!app.isPackaged` no `main.js`, permitindo testar a consulta e o fluxo de atualizações localmente (`npm run start:electron`).
- **Resiliência do Preload**:
  - `preload.js` envolvido em bloco `try/catch` com exposição da flag síncrona `isElectron: true`, impedindo falhas silenciosas de tornarem a `window.electronAPI` indisponível no React.

### Changed
- **UX da Página de Configurações**:
  - Fluxo de atualização dividido em etapas claras: "Verificar Atualizações" → "📥 Baixar Atualização" → Progresso em Tempo Real → "🔄 Reiniciar e Instalar".
  - Removido o step desnecessário "Prepare Update Channel Metadata" do CI (`build.yml`) e a dependência do pacote `electron-updater`.

## [1.1.4] - 2026-07-20

### Added
- **Sistema de Atualização Robusto**:
  - Criado serviço isolado e testável `version-checker.ts` que consulta a GitHub Releases API diretamente, com suporte a canais (`latest`, `beta`, `dev`), comparação semver com build numbers (`beta.50 > beta.42`), e tratamento de todos os erros de rede com mensagens amigáveis em português.
  - Adicionada bateria de **35 testes automatizados** (`updater.spec.ts`) cobrindo: detecção de canal, comparação de versões semver, erros HTTP (403, 404, 500), erros de rede (timeout, ENOTFOUND, JSON inválido), e testes de **integração real** que chamam a GitHub API sem mock e verificam os dados retornados.

### Fixed
- **Auto-Updater: Loop infinito de verificação**:
  - Adicionado timeout de segurança de 20s na UI: se o `electron-updater` não responder (comum em ambiente de desenvolvimento), o estado reseta automaticamente para erro com mensagem acionável em vez de ficar preso em "Verificando...".
- **Auto-Updater: Canal detectado automaticamente**:
  - O `autoUpdater.channel` agora é detectado automaticamente pela versão instalada (`-beta.N` → canal `beta`, `-dev.N` → canal `dev`, versão limpa → `latest`), eliminando o canal fixo em `latest` que causava falhas em builds pré-lançamento.
- **Auto-Updater: `allowPrerelease` automático para canais pré-release**:
  - Builds beta e dev ativam `allowPrerelease` automaticamente, independente da configuração do usuário.
- **Preload: Referências quebradas removidas**:
  - Removidos `downloadUpdate`, `startGitHubAuth` e `onGitHubAuthEvent` do `preload.js`, que não tinham handlers correspondentes no `main.js`, eliminando referências silenciosamente quebradas.
- **Feedback de erro do updater**:
  - Erros técnicos (`ENOTFOUND`, `ETIMEDOUT`, `ECONNREFUSED`, `net::ERR_*`, 403, 404) são traduzidos para mensagens amigáveis em português no handler `error` do `electron-updater`.

### Changed
- **UI de Configurações — Painel de Atualização completamente redesenhado**:
  - Botão manual "🔍 Verificar Atualizações" sempre visível (antes só havia verificação automática silenciosa).
  - Estados visuais distintos: spinner animado (verificando), barra de progresso (baixando), verde (atualizado / pronto), vermelho (erro) com botão "↻ Tentar novamente".
  - Versão atual e nova versão exibidas lado a lado quando há update disponível.
  - Toggle de versões Beta movido para dentro do painel de atualização (contexto correto).
  - Estado `not-available` (versão mais recente) agora é exibido visualmente em vez de ser ocultado.

## [1.1.3] - 2026-07-15

### Fixed
- **Auto-Updater: Channel Mismatch in `dev.yml`**:
  - Fixed `No published versions on GitHub` error caused by `dev.yml` containing `version: 1.1.2-beta.25` (channel `beta`) while the installed app runs on the `dev` channel. `electron-updater` rejects updates whose channel does not match the currently installed app's channel.
  - The CI workflow now uses `sed` to replace the `-beta.` suffix with `-dev.` inside `dev.yml` and `dev-mac.yml`, ensuring the file content matches the channel expected by the installed app.

## [1.1.2] - 2026-07-15

### Fixed
- **Auto-Updater Channel Mismatch**:
  - Fixed client auto-update search error (`No published versions on GitHub`) by duplicating release update metadata to all supported channels (`dev.yml`, `beta.yml`, `latest.yml`).
  - Configured client `autoUpdater` instance to always query the `latest` channel as a fallback.

## [1.1.1] - 2026-07-15

### Added
- **Date Sorting for Transactions**:
  - Added the ability to sort transactions by date in ascending or descending order by clicking the "Data" table header, with a visual sorting direction indicator (arrow).
- **Category Autocomplete in Classification**:
  - Implemented category and subcategory autocomplete dropdown menus in the "Classificar" screen (both for keyword rules and frequency suggestion forms), enabling quick selection of existing database categories.
- **Category Color Presets**:
  - Replaced the free color picker in the category creation/editing modal with a preset palette of 11 premium colors (displayed as clickable swatches), allowing consistent and repeatable color coordination across categories.
- **Import History Deletion**:
  - Implemented the ability to delete imported statements from the history list, automatically reversing the import by deleting all transactions associated with that specific upload.

### Fixed
- **Category Visibility in Inline Editing**:
  - Fixed new categories (e.g. without any transactions linked to them yet) not showing up in the transactions list inline editor autocomplete by switching from transaction-based distinct categories to the actual database-backed categories list. Added subcategory autocomplete inside the inline editor.
- **Sidebar Navigation**:
  - Fixed the stale unclassified badge count in the sidebar by refactoring it to re-fetch the count dynamically upon route transitions (using `useLocation`) and instantly when children pages dispatch a custom `unclassified-count-changed` event (e.g. after CSV imports, manual edits, or classification rule applications).
- **Dashboard**:
  - Fixed the readability of category labels in the "Gastos por Categoria" pie chart by overriding Recharts label text styling to use the light primary text color in dark mode (making them visible on the dark background).
- **Bradesco Statement Parser**:
  - Added support for 4-digit years (`YYYY`) in checking account date parsing, in addition to 2-digit years (`YY`).
  - Improved bank type detection (`isChecking` / `isCreditCard`) by using accent-insensitive and case-insensitive normalization on CSV content. This prevents mismatches from encoding errors or encoding transformations in the browser/frontend.
- **Import Encoding Handling**:
  - Implemented dynamic encoding detection in the upload controller. The backend now decodes uploaded CSV buffers by trying `UTF-8` first (with strict validation and BOM stripping) and falling back to `Windows-1252` (ISO-8859-1) if invalid byte sequences are encountered. This natively prevents character corruption in files exported directly from Brazilian banks.
- **Tests**:
  - Added unit test cases for Bradesco checking account statements containing 4-digit years.
