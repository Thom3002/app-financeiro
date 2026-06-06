# 💰 App Financeiro

Aplicativo para gestão de gastos pessoais e importação de extratos bancários. Desenvolvido com **NestJS** (backend), **React** (frontend) e **Electron** (desktop).

---

## 🚀 Como Rodar a Aplicação

### Opção 1: Via Docker Compose (Web — Windows, Linux, macOS)
*Ideal para rodar a versão web de forma rápida e sem instalar dependências locais.*

1. Inicie o **Docker Desktop**.
2. Na raiz do projeto, execute:
   ```bash
   docker compose up --build
   ```
3. Acesse: [http://localhost:5173](http://localhost:5173)

---

### Opção 2: Roda Nativa (Desktop / Electron — Windows, Linux, macOS)
*Ideal para testar o aplicativo desktop e ter atualização em tempo real (Hot Reload).*

1. **Iniciar o Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. **Iniciar o Backend & Electron (em outro terminal):**
   ```bash
   cd backend
   npm install
   npm run start:electron
   ```

---

### Opção 3: Launcher macOS (Exclusivo macOS)
*Interface gráfica nativa para controlar os containers do Docker.*

1. Compile e execute o launcher:
   ```bash
   cd launcher && ./build.sh && open build/AppFinanceiro.app
   ```

---

## 📦 Gerar Instalador de Produção
Para gerar o instalador desktop (`.dmg` no macOS ou `.exe` no Windows):
```bash
cd backend
npm run dist
```
Os arquivos gerados ficarão disponíveis na pasta `backend/release/`.
