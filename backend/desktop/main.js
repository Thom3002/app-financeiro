const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

async function startNestApp() {
    // Definir o caminho do banco de dados na pasta do usuário ANTES de carregar o Nest
    const userDataPath = app.getPath('userData');

    // Assegura que a pasta existe
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }

    const dbPath = path.join(userDataPath, 'financeiro.db');
    process.env.DATABASE_PATH = dbPath;

    console.log(`[Electron] Banco SQLite configurado em: ${dbPath}`);

    // Inicia o NestJS requerendo o arquivo compilado
    require('../dist/main.js');
}

function createWindow(url) {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'App Financeiro',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // O Frontend e o Backend rodam na mesma porta, e o Nest serve o index.html na raiz
    mainWindow.loadURL(url).catch(err => {
        console.error('Falha ao carregar a URL:', err);
    });

    // Abre o console de desenvolvedor para vermos eventuais erros no frontend
    mainWindow.webContents.openDevTools();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.whenReady().then(async () => {
        // Sinaliza para o NestJS onde está a raiz do ASAR e que estamos empacotados em produção
        if (app.isPackaged) {
            process.env.NODE_ENV = 'production';
            process.env.APP_PATH = app.getAppPath();
        }

        // Inicia o backend
        await startNestApp();

        const port = process.env.PORT || 8000;
        const url = `http://localhost:${port}`;

        // Função para esperar o backend estar pronto (Health Check)
        const http = require('http');
        const waitForBackend = (url, retries = 20) => {
            return new Promise((resolve) => {
                const check = (attempt) => {
                    http.get(url, (res) => {
                        console.log(`[Electron] Backend pronto (Status: ${res.statusCode})`);
                        resolve();
                    }).on('error', () => {
                        if (attempt < retries) {
                            console.log(`[Electron] Aguardando backend... (tentativa ${attempt}/${retries})`);
                            setTimeout(() => check(attempt + 1), 500);
                        } else {
                            console.error('[Electron] Backend não respondeu a tempo.');
                            resolve(); // Abre de qualquer forma, o erro aparecerá na tela
                        }
                    });
                };
                check(1);
            });
        };

        await waitForBackend(url);
        createWindow(url);

        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
        });
    });

    app.on('window-all-closed', function () {
        if (process.platform !== 'darwin') app.quit();
    });
}
