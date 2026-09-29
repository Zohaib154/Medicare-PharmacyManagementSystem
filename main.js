const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const expressApp = require('./server');
const db = require('./backend/db');

let mainWindow = null;
let serverInstance = null;
let serverPort = 3000;

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer(expressApp);
        // Try port 3000, fallback to random available port if 3000 is occupied
        server.listen(3000, '127.0.0.1', () => {
            serverPort = server.address().port;
            console.log(`MediCare backend server running on http://127.0.0.1:${serverPort}`);
            serverInstance = server;
            resolve(serverPort);
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log('Port 3000 in use, using dynamic port...');
                const dynServer = http.createServer(expressApp);
                dynServer.listen(0, '127.0.0.1', () => {
                    serverPort = dynServer.address().port;
                    console.log(`MediCare backend server running on http://127.0.0.1:${serverPort}`);
                    serverInstance = dynServer;
                    resolve(serverPort);
                });
            } else {
                reject(err);
            }
        });
    });
}

function createWindow() {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 820,
        minWidth: 1024,
        minHeight: 700,
        title: 'MediCare Pharmacy System',
        icon: iconPath,
        backgroundColor: '#f4f8f4',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
        show: false
    });

    mainWindow.loadURL(`http://127.0.0.1:${serverPort}/index.html`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Open external links in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ==========================================
// Async IPC Handlers (Promise-based for modern API)
// ==========================================
ipcMain.handle('app:print', async () => {
    if (!mainWindow) return 'ERROR';
    try {
        return new Promise((resolve) => {
            mainWindow.webContents.print({
                silent: false,
                printBackground: true,
                deviceName: ''
            }, (success, failureReason) => {
                if (success) {
                    resolve('PRINTED');
                } else if (failureReason === 'cancelled') {
                    resolve('CANCELLED');
                } else {
                    resolve(failureReason || 'CANCELLED');
                }
            });
        });
    } catch (e) {
        console.error('Print failed:', e);
        return 'ERROR';
    }
});

ipcMain.handle('app:savePdf', async (_event, { base64Data, filename }) => {
    if (!mainWindow) return 'ERROR';
    try {
        const defaultName = filename || `Receipt_${Date.now()}.pdf`;
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save PDF Document',
            defaultPath: defaultName,
            filters: [
                { name: 'PDF Document (*.pdf)', extensions: ['pdf'] },
                { name: 'All Files (*.*)', extensions: ['*'] }
            ]
        });

        if (canceled || !filePath) return 'CANCELLED';

        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        return 'SAVED';
    } catch (e) {
        console.error('Save PDF failed:', e);
        return 'ERROR';
    }
});

ipcMain.handle('app:saveBackupDirect', async (_event, { token, filename }) => {
    if (!mainWindow) return 'ERROR';
    try {
        const dateStr = new Date().toISOString().slice(0, 10);
        const defaultName = filename || `medicare_db_backup_${dateStr}.mbak`;

        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save MediCare Database Backup',
            defaultPath: defaultName,
            filters: [
                { name: 'MediCare Backup (*.mbak)', extensions: ['mbak'] },
                { name: 'All Files (*.*)', extensions: ['*'] }
            ]
        });

        if (canceled || !filePath) return 'CANCELLED';

        const payload = {
            format: 'MEDICARE_MBAK_V1',
            exportDate: new Date().toISOString(),
            version: '1.0.0',
            data: db.data
        };
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
        db.logAudit('BACKUP_SAVE_DIRECT', 'Backup', `Saved backup to ${filePath}`);
        return 'SAVED';
    } catch (e) {
        console.error('Save backup failed:', e);
        return 'ERROR';
    }
});

ipcMain.handle('app:restoreBackupDirect', async () => {
    if (!mainWindow) return 'ERROR';
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Select MediCare Backup to Restore',
            filters: [
                { name: 'MediCare Backup (*.mbak)', extensions: ['mbak', 'json'] },
                { name: 'All Files (*.*)', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (canceled || !filePaths || !filePaths.length) return 'CANCELLED';

        const filePath = filePaths[0];
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const incoming = parsed.data || parsed;

        if (!incoming.users && !incoming.drugs && !incoming.inventory) {
            return 'ERROR: Invalid backup file structure';
        }

        db.data = { ...db.getDefaultState(), ...incoming };
        db.save();
        db.logAudit('BACKUP_RESTORE_DIRECT', 'Backup', `Restored database from ${filePath}`);

        return 'SUCCESS';
    } catch (e) {
        console.error('Restore backup failed:', e);
        return 'ERROR: ' + e.message;
    }
});

// ==========================================
// Synchronous IPC Handlers (For backward-compatible javaBridge)
// ==========================================
ipcMain.on('app:savePdfSync', (event, { base64Data, filename }) => {
    if (!mainWindow) {
        event.returnValue = 'ERROR';
        return;
    }
    try {
        const defaultName = filename || `Receipt_${Date.now()}.pdf`;
        const filePath = dialog.showSaveDialogSync(mainWindow, {
            title: 'Save PDF Document',
            defaultPath: defaultName,
            filters: [
                { name: 'PDF Document (*.pdf)', extensions: ['pdf'] },
                { name: 'All Files (*.*)', extensions: ['*'] }
            ]
        });

        if (!filePath) {
            event.returnValue = 'CANCELLED';
            return;
        }

        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        event.returnValue = 'SAVED';
    } catch (e) {
        console.error('Save PDF failed:', e);
        event.returnValue = 'ERROR';
    }
});

ipcMain.on('app:saveBackupDirectSync', (event, { token, filename }) => {
    if (!mainWindow) {
        event.returnValue = 'ERROR';
        return;
    }
    try {
        const dateStr = new Date().toISOString().slice(0, 10);
        const defaultName = filename || `medicare_db_backup_${dateStr}.mbak`;

        const filePath = dialog.showSaveDialogSync(mainWindow, {
            title: 'Save MediCare Database Backup',
            defaultPath: defaultName,
            filters: [
                { name: 'MediCare Backup (*.mbak)', extensions: ['mbak'] },
                { name: 'All Files (*.*)', extensions: ['*'] }
            ]
        });

        if (!filePath) {
            event.returnValue = 'CANCELLED';
            return;
        }

        const payload = {
            format: 'MEDICARE_MBAK_V1',
            exportDate: new Date().toISOString(),
            version: '1.0.0',
            data: db.data
        };
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
        db.logAudit('BACKUP_SAVE_DIRECT', 'Backup', `Saved backup to ${filePath}`);
        event.returnValue = 'SAVED';
    } catch (e) {
        console.error('Save backup failed:', e);
        event.returnValue = 'ERROR';
    }
});

ipcMain.on('app:restoreBackupDirectSync', (event) => {
    if (!mainWindow) {
        event.returnValue = 'ERROR';
        return;
    }
    try {
        const filePaths = dialog.showOpenDialogSync(mainWindow, {
            title: 'Select MediCare Backup to Restore',
            filters: [
                { name: 'MediCare Backup (*.mbak)', extensions: ['mbak', 'json'] },
                { name: 'All Files (*.*)', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (!filePaths || !filePaths.length) {
            event.returnValue = 'CANCELLED';
            return;
        }

        const filePath = filePaths[0];
        const raw = fs.readFileSync(filePath, 'utf8');
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (pe) {
            event.returnValue = 'ERROR: Invalid backup format. Must be a valid .mbak file.';
            return;
        }

        const incoming = parsed.data || parsed;
        if (!incoming.users && !incoming.drugs && !incoming.inventory) {
            event.returnValue = 'ERROR: Invalid backup file structure';
            return;
        }

        db.data = { ...db.getDefaultState(), ...incoming };
        db.save();
        db.logAudit('BACKUP_RESTORE_DIRECT', 'Backup', `Restored database from ${filePath}`);

        event.returnValue = 'SUCCESS';
    } catch (e) {
        console.error('Restore backup failed:', e);
        event.returnValue = 'ERROR: ' + e.message;
    }
});

ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    }
});

ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
});

// App Lifecycle
app.whenReady().then(async () => {
    await startServer();
    createWindow();
});

app.on('window-all-closed', () => {
    if (serverInstance) serverInstance.close();
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
