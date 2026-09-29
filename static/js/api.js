const SafeHtml = {
    escapeHtml(value) {
        const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
    },

    escapeAttribute(value) {
        return this.escapeHtml(value);
    },

    jsValue(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
        if (typeof value === 'boolean') return String(value);
        return JSON.stringify(String(value ?? ''))
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    },

    inlineArgument(value) {
        return this.escapeAttribute(this.jsValue(value));
    }
};

if (typeof window !== 'undefined') window.SafeHtml = SafeHtml;

const API = {
    baseUrl: '/api',
    inFlightGets: new Map(),
    sessionVersion: 0,

    getHeaders() {
        const token = sessionStorage.getItem('access_token');
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },

    request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const method = (options.method || 'GET').toUpperCase();
        if (method !== 'GET' || options.signal) {
            return this._request(endpoint, options);
        }
        const key = `${this.sessionVersion}|${url}`;
        const existing = this.inFlightGets.get(key);
        if (existing) return existing;
        const promise = this._request(endpoint, options);
        this.inFlightGets.set(key, promise);
        promise.then(
            () => {
                if (this.inFlightGets.get(key) === promise) this.inFlightGets.delete(key);
            },
            () => {
                if (this.inFlightGets.get(key) === promise) this.inFlightGets.delete(key);
            }
        );
        return promise;
    },

    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const isLoginRequest = endpoint.includes('/auth/login');
        const requestVersion = this.sessionVersion;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
        let response;
        try {
            response = await fetch(url, {
                ...options,
                signal: options.signal || controller.signal,
                headers: {
                    ...this.getHeaders(),
                    ...options.headers
                }
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('The request timed out. Please try again.');
            }
            throw new Error('Unable to reach the pharmacy service. Please check the connection.');
        } finally {
            clearTimeout(timeoutId);
        }

        if (requestVersion !== this.sessionVersion) {
            throw new Error('Authentication session changed');
        }

        if (response.status === 401 && !isLoginRequest) {
            window.dispatchEvent(new CustomEvent('auth-required'));
            throw new Error('Authentication required');
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            const failure = new Error(error.message || 'API request failed');
            failure.status = response.status;
            failure.payload = error;
            throw failure;
        }

        if (response.status === 204) return null;

        const text = await response.text();
        if (requestVersion !== this.sessionVersion) {
            throw new Error('Authentication session changed');
        }
        if (!text) return null;
        return JSON.parse(text);
    },

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async put(endpoint, data) {
        const options = { method: 'PUT' };
        if (data !== undefined) {
            options.body = JSON.stringify(data);
        }
        return this.request(endpoint, options);
    },

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },

    async upload(endpoint, formData) {
        const token = localStorage.getItem('access_token');
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: headers,
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || 'Upload failed');
        }

        return response.json();
    },

    saveTokens(access, refresh) {
        this.sessionVersion += 1;
        this.inFlightGets.clear();
        sessionStorage.setItem('access_token', access);
        sessionStorage.setItem('refresh_token', refresh);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    },

    getTokens() {
        return {
            accessToken: sessionStorage.getItem('access_token'),
            refreshToken: sessionStorage.getItem('refresh_token')
        };
    },

    clearTokens() {
        this.sessionVersion += 1;
        this.inFlightGets.clear();
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('refresh_token');
        sessionStorage.removeItem('user_info');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_info');
    },

    saveUserInfo(info) {
        sessionStorage.setItem('user_info', JSON.stringify(info));
        localStorage.removeItem('user_info');
    },

    getUserInfo() {
        const info = sessionStorage.getItem('user_info');
        return info ? JSON.parse(info) : null;
    }
};
