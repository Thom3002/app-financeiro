# Changelog

All notable changes to this project will be documented in this file.

## [1.1.12] - 2026-08-10

### Fixed
- **Empacotamento Electron e Tratamento de Startup**:
  - Adicionado `asarUnpack` para `better-sqlite3` e removido `extraResources` redundante em `package.json`, corrigindo crash do banco SQLite no .exe de produção.
  - Adicionada captura de exceções (`try/catch`) e tela visual de erro (`loadErrorFallbackScreen`) no `main.js` para inicialização resiliente.
  - Aprimorada a busca de caminhos estáticos do frontend em `app.module.ts`.

## [1.1.11] - 2026-08-09

### Fixed
- **Integridade de Transações e Preservação de Classificação Manual**:
  - Garantida a preservação estrita da flag `is_manual: true` em reclassificações globais e reprocessamento de regras.
  - Reset automático de `is_manual` para `false` ao desfazer ou marcar categoria como `"Não classificado"`.
  - Corrigido o envio da propriedade `createRulePattern` e a contagem de transações reclassificadas no modal de edição rápida do frontend.
  - Propagação automática das flags `is_custo_fixo` e `ignorar_dashboard` nas importações CSV e no Open Finance (Pluggy).
- **Validação de Regras e Sincronização entre Abas**:
  - Bloqueio de regexes duplicados e categorias inválidas no método de importação em lote (`importRules`).
  - Sincronização reativa em tempo real entre as abas *Dashboard*, *Transações* e *Classificar* via escuta do evento `unclassified-count-changed`.
- **Testes Automatizados**:
  - Adicionada nova suíte de testes `features-verification.spec.ts` cobrindo regras de classificação manual, validação de regexes e integridade de transações (68/68 testes aprovados).

## [1.1.10] - 2026-08-09

### Fixed
- **Fluxo de Importação CSV e Seleção de Arquivo**:
  - Adicionada exibição fixa dos bancos padrão (`C6 Bank`, `Bradesco`) com avanço automático para o passo de upload ao clicar.
  - Adicionado botão proeminente **`📁 Selecionar Arquivo CSV`** e suporte expandido a extensões (`.csv`, `.txt`, `.ofx`).
  - Análise e pré-visualização automática ao escolher o arquivo no explorador de arquivos.
  - Suporte a codificação `windows-1252`/`latin1` e quebras de linha `\r` (Mac CR) em extratos do Bradesco.
- **Infraestrutura e Ajuste de Proxy**:
  - Alvo do proxy no `vite.config.js` corrigido de `http://backend:8000` para `http://localhost:8000`, eliminando erros `ENOTFOUND backend` (500).
  - Isolamento do `ClassifierModule` no NestJS, resolvendo estouro de pilha por dependência circular.
  - Recompilação do binário nativo do `better-sqlite3` para a versão ABI do Electron.

## [1.1.9] - 2026-08-09

### Added
- **Minha Carteira e Exportação Excel (.xlsx)**:
  - Adicionada aba **Receitas por categoria** com gráfico Donut de entradas e tabela proporcional em R$ e %.
  - Botão de exportação dos dados do Dashboard para arquivo Excel (`.xlsx`) com duas abas separadas (**Receitas** e **Despesas**).
  - Filtro multi-seleção de categorias no Dashboard com busca rápida por texto.
- **Opção de Reset do Aplicativo**:
  - Painel de Zona de Perigo em Configurações com modal de confirmação para reset de transações/extratos ou reset completo do app.

### Fixed
- **Validação de Regras e Sugestões**:
  - Rejeição estrita e mensagem de erro ao tentar criar regras com a categoria `"Não classificado"` ou vazia.
  - Validação de unicidade e bloqueio com erro de conflito para regexes duplicados em regras.
  - Otimização do processo de importação CSV em lotes de 100 registros (`orIgnore()`), resolvendo travamentos.
  - Recarregamento automático da aba de Sugestões ao excluir/alterar regras e preservação do cursor (`scroll`) nas ações de classificação.
  - Ordenação alfabética (A-Z) de categorias em todos os seletores e filtros.

## [1.1.8] - 2026-08-01

### Added
- **Integração Pluggy v2 e Extração Inteligente de Banco**:
  - Migração completa para os endpoints da Pluggy API v2 (`GET /v2/transactions`), removendo parâmetros legados e descontinuados (`from` e `pageSize`).
  - Extração inteligente e limpa de nome da instituição para o conector `MeuPluggy`, nomeando a conexão como `C6 BANK (via MeuPluggy)`.
  - Normalização automática em tempo real e na inicialização (`OnModuleInit`) dos valores das compras de cartão de crédito salvas do Pluggy (convertidas para valores negativos/despesas).
- **Aprimoramentos de Classificação e Usabilidade**:
  - Botão de Ação Dinâmico e Unificado nas tabelas de transações (`🏷️ Classificar` se não tiver categoria, `✏️ Editar` se já tiver).
  - Modal Unificado de Classificação com **Banner Inteligente de Fatura de Cartão** (`⚡ Ignorar Fatura`), botão de toggle **`📌 Custo Fixo`**, botão de toggle **`🙈 Ignorar do Dashboard`** e campo de Categoria editável com `datalist` (permitindo digitar qualquer nova categoria ou escolher da lista).
  - Painel de Resolução de Conflitos (`ConflictPanel`) aprimorado com explicações visuais e selo **`1º 👑`** indicando a prioridade máxima da regra do topo.
  - Filtro por período dinâmico na aba de Classificação (`Este Mês`, `Último Mês`, `Últimos 3 Meses`, etc.) e atalhos ajustados na Carteira (`Últimos 30 Dias` por padrão, `Mês Atual`, `Mês Anterior`, `Últimos 3 Meses`, etc.).
  - Filtro interativo ao clicar nas fatias do gráfico Donut e nas barras do gráfico de Acompanhamento Mensal (`BarChart`).
  - Posicionado o campo **🔍 Buscar** no início da barra de filtros à esquerda.
  - A aplicação Electron agora abre maximizada por padrão.

## [1.1.7] - 2026-07-30

### Added
- **Dashboard "Minha Carteira"**:
  - Renomeado menu e cabeçalho para "Minha Carteira".
  - Adicionadas abas "Despesas por categoria" (Donut Chart) e "Acompanhamento mensal" (Gráfico de barras dos últimos 12 meses fixo).
  - Adicionada tabela de transações paginada (10, 25, 50, 100 por página) com busca e filtro por fatia de categoria.
  - Adicionada opção `ignorar_dashboard` no CRUD de Categorias para ocultar investimentos/transferências nos gráficos de receitas e despesas.

### Fixed
- **Motor de Classificação e Sugestões**:
  - Sanitização de ruídos operacionais de bancos (`DEBITO DE CARTAO`, `TRANSF ENVIADA PIX`, etc.) em qualquer posição.
  - Flexibilização de palavras-chave (`.*`) para aceitar códigos intermediários (ex: `C6`) entre termos bancários.
  - Reutilização automática e prevenção de duplicação de regras com a mesma expressão regular (`regex`).
  - Reclassificação automática e filtragem estrita na aba "Classificar", ocultando grupos cujas transações pertençam a alguma regra ativa.
- **Sincronização do CRUD de Categorias**:
  - Atualizado `getDistinctCategories` para combinar categorias do banco de dados com as das transações, refletindo alterações do CRUD em todas as telas.
- **Acessibilidade e Modo Escuro**:
  - Estilização global dos elementos `select`, `option` e `datalist` garantindo fundo escuro (`#111827`) e alto contraste (`#f1f5f9`).

## [1.1.6] - 2026-07-24

### Fixed
- **Comunicação IPC e Detecção de Ambiente Electron**:
  - Ajustada a ordem de inicialização no Electron (`main.js`) executando `setupIpcHandlers()` antes de `createWindow()`, garantindo que os receptores IPC existam antes do carregamento do frontend.
  - Resolvida race condition no check automático de atualizações adicionando cache `pendingUpdateEvent` e método `getPendingUpdate()` para resgatar resultados disparados antes da montagem dos componentes no React.
  - Adicionada captura de erro e exposição de `window.__preloadError` para diagnóstico imediato na UI caso ocorra falha no script de preload.

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
