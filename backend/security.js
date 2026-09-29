const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const APP_DATA_DIR = path.join(os.homedir(), '.medicare');
if (!fs.existsSync(APP_DATA_DIR)) {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}
const SECURITY_FILE = path.join(APP_DATA_DIR, 'login_security.json');

const Security = {
    // -------------------------------------------------------------
    // Brute Force Login Protection (Persistent across restarts)
    // -------------------------------------------------------------
    getState() {
        try {
            if (fs.existsSync(SECURITY_FILE)) {
                const parsed = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf8'));
                return {
                    failedAttempts: Number(parsed.failedAttempts) || 0,
                    lockoutUntil: Number(parsed.lockoutUntil) || 0,
                    lastAttemptTime: Number(parsed.lastAttemptTime) || 0
                };
            }
        } catch (e) {
            console.error('Error reading security file:', e);
        }
        return { failedAttempts: 0, lockoutUntil: 0, lastAttemptTime: 0 };
    },

    saveState(state) {
        try {
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(state, null, 2), 'utf8');
        } catch (e) {
            console.error('Error writing security file:', e);
        }
    },

    getLockStatus() {
        const state = this.getState();
        const now = Date.now();
        const isLocked = Boolean(state.lockoutUntil && now < state.lockoutUntil);
        const remainingSeconds = isLocked ? Math.ceil((state.lockoutUntil - now) / 1000) : 0;

        // Auto-clear expired lockout
        if (!isLocked && state.lockoutUntil && now >= state.lockoutUntil) {
            state.lockoutUntil = 0;
            state.failedAttempts = 0;
            this.saveState(state);
        }

        return {
            locked: isLocked,
            remainingSeconds,
            attemptsRemaining: Math.max(0, 5 - (state.failedAttempts || 0))
        };
    },

    recordFailedAttempt() {
        const state = this.getState();
        const now = Date.now();

        // If previous lockout expired, reset
        if (state.lockoutUntil && now >= state.lockoutUntil) {
            state.failedAttempts = 0;
            state.lockoutUntil = 0;
        }

        state.failedAttempts = (state.failedAttempts || 0) + 1;
        state.lastAttemptTime = now;

        if (state.failedAttempts >= 5) {
            state.lockoutUntil = now + (60 * 1000); // 60 seconds lockout
            this.saveState(state);
            return {
                locked: true,
                remainingSeconds: 60,
                attemptsRemaining: 0,
                message: 'Account locked due to 5 consecutive failed attempts. Please wait 60 seconds.'
            };
        }

        this.saveState(state);
        const remaining = 5 - state.failedAttempts;
        return {
            locked: false,
            remainingSeconds: 0,
            attemptsRemaining: remaining,
            message: `Invalid username or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        };
    },

    recordSuccessfulLogin() {
        const state = this.getState();
        state.failedAttempts = 0;
        state.lockoutUntil = 0;
        this.saveState(state);
    },

    // -------------------------------------------------------------
    // Decrypt Backup (AES-256-GCM-PBKDF2 & PBKDF2_XOR)
    // -------------------------------------------------------------
    decryptBackup(encryptedText, password) {
        if (!encryptedText || typeof encryptedText !== 'string') return encryptedText;
        const text = encryptedText.trim();

        if (text.startsWith('ENCRYPTED|AES-256-GCM-PBKDF2|')) {
            if (!password) throw new Error('Password required to decrypt AES-256 backup');
            const b64 = text.substring('ENCRYPTED|AES-256-GCM-PBKDF2|'.length).trim();
            const raw = Buffer.from(b64, 'base64');
            const salt = raw.subarray(0, 16);
            const iv = raw.subarray(16, 28);
            const cipherAndTag = raw.subarray(28);
            const tag = cipherAndTag.subarray(cipherAndTag.length - 16);
            const ciphertext = cipherAndTag.subarray(0, cipherAndTag.length - 16);

            const key = crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256');
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            return decrypted.toString('utf8');
        }

        if (text.startsWith('ENCRYPTED|PBKDF2_XOR|')) {
            if (!password) throw new Error('Password required to decrypt PBKDF2_XOR backup');
            const b64Content = text.substring('ENCRYPTED|PBKDF2_XOR|'.length).trim();
            const binaryStr = Buffer.from(b64Content, 'base64').toString('binary');
            let salted;
            try { salted = decodeURIComponent(escape(binaryStr)); } catch { salted = binaryStr; }
            let key = 0;
            for (let i = 0; i < password.length; i++) {
                key = ((key << 5) - key + password.charCodeAt(i)) | 0;
            }
            let result = '';
            for (let i = 0; i < salted.length; i++) {
                result += String.fromCharCode(salted.charCodeAt(i) ^ (key & 0xFF) ^ ((i * 7) & 0xFF));
            }
            if (result.startsWith('MEDICARE_BACKUP_v1')) {
                return result.substring('MEDICARE_BACKUP_v1'.length);
            }
            throw new Error('Incorrect password');
        }

        return text;
    }
};

module.exports = Security;
