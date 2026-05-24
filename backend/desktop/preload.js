const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Versão
    getVersion: () => ipcRenderer.invoke('get-version'),

    // Canal de atualização: false = prod, true = prerelease/dev
    getAllowPrerelease: () => ipcRenderer.invoke('get-allow-prerelease'),
    setAllowPrerelease: (value) => ipcRenderer.invoke('set-allow-prerelease', value),

    // Updater
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),

    // Listener de eventos do updater
    onUpdateEvent: (callback) => {
        const subscription = (_event, value) => callback(value);
        ipcRenderer.on('update-event', subscription);
        return () => ipcRenderer.removeListener('update-event', subscription);
    },
});
