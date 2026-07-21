const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Informações de versão
    getVersion: () => ipcRenderer.invoke('get-version'),

    // Controle de atualizações
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),

    // Configurações de desenvolvedor / canal
    getDevSettings: () => ipcRenderer.invoke('get-dev-settings'),
    saveDevSettings: (settings) => ipcRenderer.invoke('save-dev-settings', settings),
    setAllowPrerelease: (value) => ipcRenderer.invoke('set-allow-prerelease', value),

    // Listener de eventos de atualização
    // Retorna função de cleanup para remover o listener
    onUpdateEvent: (callback) => {
        const subscription = (event, value) => callback(value);
        ipcRenderer.on('update-event', subscription);
        return () => ipcRenderer.removeListener('update-event', subscription);
    },
});
