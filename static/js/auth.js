const Auth = {
    _lockoutTimer: null,

    async init() {
        const form = document.getElementById('login-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('login-username').value;
                const password = document.getElementById('login-password').value;
                await this.login(username, password);
            });
        }

        // Check persistent lockout status on application start / refresh
        await this.checkLockStatus();
    },

    async checkLockStatus() {
        const attemptsMsg = document.getElementById('login-attempts-msg');
        try {
            const res = await fetch(`${API.baseUrl}/auth/lock-status`);
            if (res.ok) {
                const data = await res.json();
                if (data.locked && data.remainingSeconds > 0) {
                    this.startLockoutTimer(data.remainingSeconds);
                } else if (data.attemptsRemaining !== undefined && data.attemptsRemaining < 5) {
                    if (attemptsMsg) {
                        attemptsMsg.style.display = 'block';
                        attemptsMsg.textContent = `${data.attemptsRemaining} attempt${data.attemptsRemaining === 1 ? '' : 's'} remaining before lockout.`;
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to query lock status', e);
        }
    },

    async login(username, password) {
        const lockoutMsg = document.getElementById('login-lockout-msg');
        const attemptsMsg = document.getElementById('login-attempts-msg');
        const submitBtn = document.getElementById('login-submit-btn');

        try {
            const res = await fetch(`${API.baseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json().catch(() => ({}));

            if (res.status === 429 || data.locked) {
                const secs = Number(data.remainingSeconds || data.retryAfterSeconds || 60);
                this.startLockoutTimer(secs);
                App.toast(data.message || 'Account temporarily locked. Please wait.', 'error');
                return;
            }

            if (!res.ok) {
                if (attemptsMsg) {
                    attemptsMsg.style.display = 'block';
                    attemptsMsg.textContent = data.message || 'Invalid username or password';
                }
                App.toast(data.message || 'Authentication failed. Please check credentials.', 'error');
                return;
            }

            // Authentication succeeded
            API.saveTokens(data.accessToken, data.refreshToken);
            API.saveUserInfo({
                userId: data.userId,
                username: data.username,
                fullName: data.fullName,
                roles: data.roles
            });

            if (attemptsMsg) { attemptsMsg.style.display = 'none'; attemptsMsg.textContent = ''; }
            if (lockoutMsg) { lockoutMsg.style.display = 'none'; lockoutMsg.textContent = ''; }
            if (this._lockoutTimer) { clearInterval(this._lockoutTimer); this._lockoutTimer = null; }

            App.toast(`Authenticated as ${data.fullName}!`, 'success');
            App.showMainApp(data);
        } catch (e) {
            console.error('Login error:', e);
            App.toast(e.message || 'Authentication failed. Please try again.', 'error');
        }
    },

    startLockoutTimer(seconds) {
        const lockoutMsg = document.getElementById('login-lockout-msg');
        const attemptsMsg = document.getElementById('login-attempts-msg');
        const submitBtn = document.getElementById('login-submit-btn');
        const usernameEl = document.getElementById('login-username');
        const passwordEl = document.getElementById('login-password');

        if (submitBtn) submitBtn.disabled = true;
        if (usernameEl) usernameEl.disabled = true;
        if (passwordEl) passwordEl.disabled = true;
        if (attemptsMsg) { attemptsMsg.style.display = 'none'; attemptsMsg.textContent = ''; }

        let remaining = Math.max(1, Math.round(seconds));
        if (lockoutMsg) {
            lockoutMsg.style.display = 'block';
            lockoutMsg.textContent = `Too many failed attempts. Locked out for ${remaining}s.`;
        }

        if (this._lockoutTimer) clearInterval(this._lockoutTimer);
        this._lockoutTimer = setInterval(() => {
            remaining--;
            if (lockoutMsg) {
                lockoutMsg.textContent = `Too many failed attempts. Locked out for ${remaining}s.`;
            }
            if (remaining <= 0) {
                clearInterval(this._lockoutTimer);
                this._lockoutTimer = null;
                if (lockoutMsg) {
                    lockoutMsg.style.display = 'none';
                    lockoutMsg.textContent = '';
                }
                if (submitBtn) submitBtn.disabled = false;
                if (usernameEl) usernameEl.disabled = false;
                if (passwordEl) passwordEl.disabled = false;
                if (attemptsMsg) {
                    attemptsMsg.style.display = 'block';
                    attemptsMsg.textContent = 'Lockout expired. You can try again.';
                }
                App.toast('Lockout timer expired. You can try logging in now.', 'info');
            }
        }, 1000);
    },

    async logout() {
        const userInfo = API.getUserInfo();
        if (userInfo?.username) {
            try {
                await fetch(`${API.baseUrl}/auth/logout?username=${encodeURIComponent(userInfo.username)}`, {
                    method: 'POST',
                    headers: API.getHeaders()
                });
            } catch (e) {
                console.error('Sign-out invalidate request failed', e);
            }
        }

        API.clearTokens();

        const form = document.getElementById('login-form');
        if (form) form.reset();

        const attemptsMsg = document.getElementById('login-attempts-msg');
        const lockoutMsg = document.getElementById('login-lockout-msg');
        const submitBtn = document.getElementById('login-submit-btn');
        const usernameEl = document.getElementById('login-username');
        const passwordEl = document.getElementById('login-password');
        if (attemptsMsg) { attemptsMsg.style.display = 'none'; attemptsMsg.textContent = ''; }
        if (lockoutMsg) { lockoutMsg.style.display = 'none'; lockoutMsg.textContent = ''; }
        if (submitBtn) submitBtn.disabled = false;
        if (usernameEl) usernameEl.disabled = false;
        if (passwordEl) passwordEl.disabled = false;
        if (this._lockoutTimer) { clearInterval(this._lockoutTimer); this._lockoutTimer = null; }

        App.toast('Logged out successfully.', 'warning');
        App.showLoginOverlay();
        // Check lock status in case lockout was triggered
        this.checkLockStatus();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});
