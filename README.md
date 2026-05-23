# 💰 App Financeiro

Aplicativo desktop e web para gestão de gastos pessoais e importação automatizada de extratos bancários. Desenvolvido com **NestJS** (backend), **React/Vite** (frontend) e empacotado como aplicativo desktop híbrido via **Electron**.

---

## 🛠️ Requisitos Prévios

* **Node.js** (Versão 22.x recomendada)
* **Docker & Docker Desktop** (Opcional, para execução via containers)
* **Git**

---

## 🚀 Como Rodar a Aplicação

Existem três formas de rodar a aplicação em ambiente de desenvolvimento, escolha a mais adequada para o seu cenário:

### Opção 1: Via Docker Compose (Recomendado para Dev Web)

Esta opção inicializa o backend e o frontend em containers Docker.

1. Certifique-se de que o **Docker Desktop** está aberto e rodando.
2. Na raiz do projeto, execute o comando:
   ```bash
   docker compose up --build
   ```
3. Acesse a aplicação no seu navegador em: **`http://localhost:5173`**
4. Para parar os containers:
   ```bash
   docker compose down
   ```

*(Se estiver no macOS, você também pode usar o aplicativo do diretório `launcher/` para iniciar/parar o Docker com interface visual).*

---

### Opção 2: Standalone Local (Sem Docker)

Esta opção roda a aplicação nativamente no seu sistema operacional, ideal para desenvolvimento ativo do Electron.

1. **Instalar dependências e compilar o Frontend:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```
   *(Para desenvolvimento com hot-reload das telas, você pode rodar `npm run dev` na porta `5173` e deixar executando).*

2. **Instalar dependências e iniciar o Electron (com Backend):**
   ```bash
   cd ../backend
   npm install
   npm run start:electron
   ```
   Isso compilará o NestJS automaticamente, inicializará a base de dados SQLite local em modo dev e abrirá a janela do Electron carregando a aplicação.

---

### Opção 3: Usando o Launcher macOS (SwiftUI)

Se você estiver em um Mac e quiser rodar o ambiente de desenvolvimento local usando o Launcher nativo fornecido no repositório:

1. Compile o launcher SPM na primeira vez:
   ```bash
   cd launcher
   ./build.sh
   ```
2. Abra o executável gerado:
   ```bash
   open build/AppFinanceiro.app
   ```
3. Use os botões **Iniciar** e **Parar** da interface gráfica para gerenciar os containers Docker locais e abrir o app no navegador.

---

## 📦 Geração de Builds para Produção (Instaladores)

Para compilar e gerar os arquivos instaladores desktop oficiais (`.dmg` no macOS ou `.exe` no Windows):

1. Acesse o diretório do backend:
   ```bash
   cd backend
   ```
2. Execute o comando de distribuição:
   ```bash
   npm run dist
   ```
3. O instalador compilado estará disponível na pasta: **`backend/release/`**

---

## 🔄 Fluxo de Atualização e Modo Desenvolvedor

A aplicação instalada conta com fluxo de atualização automática integrado e desvio para código local (Modo Dev).

### Atualizações Automáticas (Produção)
* O aplicativo instalado busca por atualizações no repositório GitHub (`Thom3002/app-financeiro`) de forma silenciosa na inicialização.
* Se houver atualizações, um banner flutuante notificará o usuário. Ele poderá acessar **Configurações** na barra lateral para baixar e reiniciar/instalar.

### Modo Desenvolvedor (Dev Mode)
Para desenvolvedores testarem modificações locais em tempo real direto do software oficial instalado na máquina:
1. Vá em **Configurações &gt; Modo Desenvolvedor**.
2. Insira o seu **GitHub Client ID** (Crie um aplicativo OAuth em *GitHub &gt; Settings &gt; Developer Settings &gt; OAuth Apps* com Homepage/Callback URL apontando para `http://localhost`).
3. Clique em **Autenticar com GitHub** e conclua o login inserindo o código de 8 dígitos no seu navegador.
4. Forneça o **Caminho absoluto do seu repositório local** (ex: `/Users/username/Desktop/Projetos-Pessoais/app-financeiro`).
5. Ative a chave e clique em **Salvar e Reiniciar**.
6. O aplicativo instalado passará a carregar o código da sua pasta local (utilizando o servidor Vite local na porta `5173` ou compilando a partir do seu diretório dev) com hot reload ativo.
