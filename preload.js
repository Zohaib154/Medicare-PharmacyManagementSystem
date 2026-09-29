const { contextBridge, ipcRenderer } = require('electron');

// Native Modern Electron API (Promise-based)
contextBridge.exposeInMainWorld('electronAPI', {
    print: () => {
        try {
            window.print();
            return Promise.resolve('PRINTED');
        } catch (e) {
            return Promise.reject(e);
        }
    },
    savePdf: (base64Data, filename) => ipcRenderer.invoke('app:savePdf', { base64Data, filename }),
    saveBackupDirect: (token, filename) => ipcRenderer.invoke('app:saveBackupDirect', { token, filename }),
    restoreBackupDirect: (token) => ipcRenderer.invoke('app:restoreBackupDirect', { token }),
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
});

// Backward-compatible bridge matching original synchronous JavaFX WebEngine bridge
contextBridge.exposeInMainWorld('javaBridge', {
    printReceipt: () => {
        try {
            window.print();
            return 'PRINTED';
        } catch (e) {
            console.error('printReceipt error:', e);
            return 'ERROR';
        }
    },
    savePdf: (base64Data, filename) => {
        try {
            return ipcRenderer.sendSync('app:savePdfSync', { base64Data, filename });
        } catch (e) {
            console.error('savePdf error:', e);
            return 'ERROR';
        }
    },
    saveBackupDirect: (token, filename) => {
        try {
            return ipcRenderer.sendSync('app:saveBackupDirectSync', { token, filename });
        } catch (e) {
            console.error('saveBackupDirect error:', e);
            return 'ERROR: ' + e.message;
        }
    },
    restoreBackupDirect: (token) => {
        try {
            return ipcRenderer.sendSync('app:restoreBackupDirectSync', { token });
        } catch (e) {
            console.error('restoreBackupDirect error:', e);
            return 'ERROR: ' + e.message;
        }
    },
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    log: (msg) => console.log(msg),
    error: (msg) => console.error(msg),
    diag: (msg) => console.log(msg)
});
