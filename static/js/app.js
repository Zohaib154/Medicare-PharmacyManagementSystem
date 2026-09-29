const App = {
    activeTab: 'dashboard',
    _loadedTabs: new Set(),
    _tabPromises: new Map(),
    _tabEpochs: new Map(),
    _tabSession: 0,
    _renderGeneration: 0,

    debounce(func, wait = 250) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },

    normalizeTabId(tabId) {
        return tabId === 'medicines' ? 'drugs' : tabId;
    },

    resetTabState() {
        this._tabSession += 1;
        this._renderGeneration += 1;
        this._loadedTabs.clear();
        this._tabPromises.clear();
        this._tabEpochs.clear();
        this.activeTab = null;
        if (typeof Dashboard !== 'undefined' && Dashboard) Dashboard._loadPromise = null;
        if (typeof POS !== 'undefined' && POS) {
            POS._loadPromise = null;
            POS._drugRequestId += 1;
            POS._patientRequestId += 1;
            POS.cart = [];
            POS.currentReceipt = null;
            POS.catalogPage = 0;
            POS.catalogQuery = '';
        }
        if (typeof Catalog !== 'undefined' && Catalog) Catalog._loadPromise = null;
        if (typeof Inventory !== 'undefined' && Inventory) Inventory._loadPromise = null;
        if (typeof Patients !== 'undefined' && Patients) Patients._loadPromise = null;
        if (typeof Prescriptions !== 'undefined' && Prescriptions) Prescriptions._loadPromise = null;
        if (typeof Suppliers !== 'undefined' && Suppliers) {
            Suppliers._loadPromise = null;
            Suppliers._poLoadPromise = null;
        }
        if (typeof BillHistory !== 'undefined' && BillHistory) {
            BillHistory._loadingPromise = null;
            BillHistory._supplierPaymentsPromise = null;
            BillHistory._loadRequestId += 1;
            BillHistory._searchRequestId += 1;
            clearTimeout(BillHistory._filterTimer);
            BillHistory.searchRows = null;
            BillHistory.sales = [];
            BillHistory.supplierPaymentsLoaded = false;
        }
    },

    invalidateTab(tabId) {
        tabId = this.normalizeTabId(tabId);
        if (!tabId) return;
        this._loadedTabs.delete(tabId);
        this._tabPromises.delete(tabId);
        this._tabEpochs.set(tabId, (this._tabEpochs.get(tabId) || 0) + 1);
        if (tabId === 'pos' && typeof POS !== 'undefined' && POS) {
            POS._drugRequestId += 1;
            POS._patientRequestId += 1;
        }
        if (tabId === 'history' && typeof BillHistory !== 'undefined' && BillHistory) {
            clearTimeout(BillHistory._filterTimer);
            BillHistory._searchRequestId += 1;
            BillHistory.searchRows = null;
        }
    },

    invalidateTabs(...tabIds) {
        tabIds.forEach(tabId => this.invalidateTab(tabId));
    },

    renderRows(container, items, createRow, { emptyHtml = '', chunkSize = 50 } = {}) {
        if (!container) return Promise.resolve();
        const rows = Array.isArray(items) ? items : [];
        const token = { generation: this._renderGeneration };
        container._renderToken = token;
        if (rows.length === 0) {
            container.innerHTML = emptyHtml;
            return Promise.resolve();
        }
        container.replaceChildren();
        return new Promise((resolve, reject) => {
            let index = 0;
            const appendChunk = () => {
                if (container._renderToken !== token || this._renderGeneration !== token.generation) {
                    resolve();
                    return;
                }
                const fragment = document.createDocumentFragment();
                const end = Math.min(index + Math.max(1, chunkSize), rows.length);
                try {
                    for (; index < end; index++) {
                        const row = createRow(rows[index], index);
                        if (row) fragment.appendChild(row);
                    }
                    container.appendChild(fragment);
                } catch (error) {
                    container._renderToken = null;
                    reject(error);
                    return;
                }
                if (index < rows.length) {
                    setTimeout(appendChunk, 0);
                } else {
                    resolve();
                }
            };
            setTimeout(appendChunk, 0);
        });
    },

    parseLocalDateTime(value) {
        if (!value) return null;
        if (Array.isArray(value)) {
            const [y, m, d, h = 0, min = 0, s = 0] = value;
            return new Date(y, m - 1, d, h, min, s);
        }
        if (typeof value === 'string') {
            const normalized = value.includes('T') ? value : value.replace(' ', 'T');
            const parts = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
            if (parts) {
                return new Date(+parts[1], +parts[2] - 1, +parts[3], +parts[4], +parts[5], +(parts[6] || 0));
            }
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    },

    formatLocalDateTime(value) {
        const date = this.parseLocalDateTime(value);
        if (!date) return '—';
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    },

    formatCurrency(value, decimals = 2) {
        const num = parseFloat(value);
        if (Number.isNaN(num)) return '—';
        const settings = (typeof AppSettings !== 'undefined') ? AppSettings.load() : {};
        const symbol = settings.currencySymbol || '$';
        return `${symbol}${num.toFixed(decimals)}`;
    },

    init() {
        this.initTheme();
        this.loadNotifications();
        this.bindEvents();
        this.bindSelectionGuard();
        this.startClock();
        // Ensure application always requires fresh login on launch
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_info');
        this.checkAuth();
    },

    initTheme() {
        const saved = localStorage.getItem('medicare_theme');
        if (saved) {
            this.applyTheme(saved);
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            this.applyTheme('dark');
        } else {
            this.applyTheme('light');
        }
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!localStorage.getItem('medicare_theme')) {
                    this.applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    },

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const lightIcon = document.getElementById('theme-icon-light');
        const darkIcon = document.getElementById('theme-icon-dark');
        if (lightIcon && darkIcon) {
            if (theme === 'dark') {
                lightIcon.style.display = 'none';
                darkIcon.style.display = 'block';
            } else {
                lightIcon.style.display = 'block';
                darkIcon.style.display = 'none';
            }
        }
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('medicare_theme', next);
        this.applyTheme(next);
    },

    bindSelectionGuard() {
        document.addEventListener('dblclick', (e) => {
            if (!e.target.closest('input, textarea, select, button, .selectable, .copyable, .receipt-wrapper, .modal-container, .dbb-editable')) {
                e.preventDefault();
                window.getSelection()?.removeAllRanges();
            }
        });
    },

    bindEvents() {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const tab = item.getAttribute('data-tab');
                this.switchTab(tab);
            });
        });

        ['logout-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => Auth.logout());
            }
        });

        window.addEventListener('auth-required', () => {
            this.showLoginOverlay();
        });

        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('notif-dropdown');
            const bell = document.getElementById('notif-bell');
            if (dropdown && dropdown.classList.contains('open') && !dropdown.contains(e.target) && !bell.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });
    },

    startClock() {
        const clockEl = document.getElementById('clock');
        if (!clockEl) return;

        const updateTime = () => {
            clockEl.textContent = new Date().toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        };

        updateTime();
        const now = new Date();
        const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        setTimeout(() => {
            updateTime();
            setInterval(updateTime, 60000);
        }, msToNextMinute);
    },

    checkAuth() {
        const userInfo = API.getUserInfo();
        const tokens = API.getTokens();
        if (tokens.accessToken && userInfo) {
            this.showMainApp(userInfo);
        } else {
            this.showLoginOverlay();
        }
    },

    async showMainApp(user) {
        this.resetTabState();
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        // Update user display details
        document.getElementById('user-fullname').textContent = user.fullName || user.username;
        document.getElementById('user-role').textContent = user.roles ? user.roles[0].replace('ROLE_', '') : 'USER';
        document.getElementById('user-avatar').textContent = (user.fullName || user.username).substring(0, 2).toUpperCase();

        // Check user roles and show/hide tabs accordingly
        const roles = user.roles || [];
        const isAdmin = roles.includes('ROLE_ADMIN');
        const isManager = roles.includes('ROLE_STORE_MANAGER');
        const isPharmacist = roles.includes('ROLE_PHARMACIST');
        const isCashier = roles.includes('ROLE_CASHIER');

        // Apply RBAC filters to sidebar tabs
        document.getElementById('nav-pos').style.display = (isAdmin || isPharmacist || isCashier) ? 'flex' : 'none';
        document.getElementById('nav-inventory').style.display = (isAdmin || isManager || isPharmacist) ? 'flex' : 'none';
        document.getElementById('nav-drugs').style.display = 'flex'; // Visible to all, read-only inside service
        document.getElementById('nav-patients').style.display = 'flex';
        document.getElementById('nav-suppliers').style.display = (isAdmin || isManager) ? 'flex' : 'none';
        document.getElementById('nav-purchase-orders').style.display = (isAdmin || isManager) ? 'flex' : 'none';
        document.getElementById('nav-history').style.display = (isAdmin || isPharmacist || isCashier) ? 'flex' : 'none';

        const navMedicines = document.getElementById('nav-medicines');
        if (navMedicines) navMedicines.style.display = 'none';

        // Staff Management - only for Admin
        const navStaff = document.getElementById('nav-staff');
        if (navStaff) navStaff.style.display = isAdmin ? 'flex' : 'none';

        // Backup Database - only for Admin
        const navBackup = document.getElementById('nav-backup');
        if (navBackup) navBackup.style.display = isAdmin ? 'flex' : 'none';

        // Load app settings from server (persisted across restarts)
        if (typeof AppSettings !== 'undefined') {
            try {
                await AppSettings.fetchFromServer();
            } catch (e) {
                console.error('Could not load app settings from server:', e);
            }
        }
        this.switchTab('dashboard');

        // Automatically scan system inventory and prescriptions for operational alerts
        this.checkSystemAlerts({ isStartup: true });
        if (this._alertScanTimer) clearInterval(this._alertScanTimer);
        this._alertScanTimer = setInterval(() => this.checkSystemAlerts(), 60000);
    },

    showLoginOverlay() {
        this.resetTabState();
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('login-overlay').style.display = 'flex';
    },

    switchTab(tabId, options = {}) {
        tabId = this.normalizeTabId(tabId);
        if (!tabId) return Promise.resolve();
        const sameTab = this.activeTab === tabId;
        this.activeTab = tabId;

        // Update sidebar item states
        document.querySelectorAll('.menu-item').forEach(item => {
            if (item.getAttribute('data-tab') === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update active sheet
        document.querySelectorAll('.viewport-sheet').forEach(sheet => {
            if (sheet.id === `sheet-${tabId}`) {
                sheet.classList.add('active');
            } else {
                sheet.classList.remove('active');
            }
        });

        // Update header title
        const formattedTitle = tabId.charAt(0).toUpperCase() + tabId.slice(1).replace('-', ' ');
        document.getElementById('viewport-title').textContent = formattedTitle;

        if (sameTab && !options.force) return Promise.resolve();
        return this.loadTabContents(tabId, options);
    },

    loadTabContents(tabId, options = {}) {
        tabId = this.normalizeTabId(tabId);
        if (!tabId) return Promise.resolve();
        const existing = this._tabPromises.get(tabId);
        if (existing) return existing;
        if (!options.force && this._loadedTabs.has(tabId)) return Promise.resolve();

        const session = this._tabSession;
        const epoch = this._tabEpochs.get(tabId) || 0;
        let result;
        try {
            switch(tabId) {
                case 'dashboard':
                    result = Dashboard.load();
                    break;
                case 'pos':
                    result = POS.load(options.force ? { resetCart: false } : undefined);
                    break;
                case 'prescriptions':
                    result = Prescriptions.load();
                    break;
                case 'inventory':
                    result = Inventory.load();
                    break;
                case 'drugs':
                    result = Catalog.load();
                    break;
                case 'patients':
                    result = Patients.load();
                    break;
                case 'suppliers':
                    result = Suppliers.load();
                    break;
                case 'purchase-orders':
                    result = Suppliers.loadPOs();
                    break;
                case 'history':
                    result = typeof BillHistory !== 'undefined' ? BillHistory.load() : undefined;
                    break;
                case 'staff':
                    result = typeof Staff !== 'undefined' ? Staff.load() : undefined;
                    break;
                case 'backup':
                    if (typeof DBBrowser !== 'undefined') {
                        result = DBBrowser.currentTable ? DBBrowser.refresh() : DBBrowser.loadTable('drugs');
                    }
                    break;
                default:
                    break;
            }
        } catch (error) {
            result = Promise.reject(error);
        }
        const promise = Promise.resolve(result).then(result => {
            if (session === this._tabSession && epoch === (this._tabEpochs.get(tabId) || 0) && result !== false) {
                this._loadedTabs.add(tabId);
            }
            return result;
        }).catch(error => {
            if (session === this._tabSession && epoch === (this._tabEpochs.get(tabId) || 0)) {
                this._loadedTabs.delete(tabId);
            }
            this.toast(error.message || String(error), 'error');
            return false;
        }).finally(() => {
            if (this._tabPromises.get(tabId) === promise) {
                this._tabPromises.delete(tabId);
            }
        });
        this._tabPromises.set(tabId, promise);
        return promise;
    },

    // Global Notification Toasts
    toast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        const safeType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
        toast.className = `toast toast-${safeType}`;

        let icon = '<svg style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
        if (safeType === 'success') {
            icon = '<svg style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else if (safeType === 'error') {
            icon = '<svg style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
        }

        toast.innerHTML = `${icon}<span style="font-size:14px; font-weight:600;">${SafeHtml.escapeHtml(message == null ? '' : String(message))}</span>`;
        container.appendChild(toast);

        setTimeout(() => toast.remove(), duration);
    },

    // Modal Control
    openModal(title, htmlContent) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-content').innerHTML = htmlContent;
        document.getElementById('generic-modal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('generic-modal').style.display = 'none';
        document.getElementById('modal-content').innerHTML = '';
    },

    // WebView-safe confirm dialog (replaces native confirm() which is broken in JavaFX WebView)
    confirm(message, { title = 'Confirm', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
        return new Promise(resolve => {
            const btnClass = danger ? 'btn-danger' : 'btn-primary';
            const html = `
                <div style="display:flex;flex-direction:column;gap:14px;">
                    <p style="margin:0;color:var(--text-secondary);white-space:pre-line;">${SafeHtml.escapeHtml(message)}</p>
                    <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:14px;">
                        <button type="button" class="btn btn-secondary" id="app-confirm-cancel">${SafeHtml.escapeHtml(cancelLabel)}</button>
                        <button type="button" class="btn ${btnClass}" id="app-confirm-ok">${SafeHtml.escapeHtml(confirmLabel)}</button>
                    </div>
                </div>
            `;
            this.openModal(title, html);
            document.getElementById('app-confirm-cancel').onclick = () => { this.closeModal(); resolve(false); };
            document.getElementById('app-confirm-ok').onclick = () => { this.closeModal(); resolve(true); };
        });
    },

    // Notification System
    _notifications: [],
    _notifMax: 50,
    _alertScanTimer: null,

    loadNotifications() {
        try {
            const saved = localStorage.getItem('medicare_notifications');
            this._notifications = saved ? JSON.parse(saved) : [];
        } catch (e) {
            this._notifications = [];
        }
        this.updateNotifBadge();
        this.renderNotifications();
    },

    saveNotifications() {
        localStorage.setItem('medicare_notifications', JSON.stringify(this._notifications));
        this.updateNotifBadge();
    },

    addNotification({ title, message, type = 'info', action = null }) {
        const notif = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            title,
            message,
            type,
            action,
            read: false,
            timestamp: new Date().toISOString()
        };
        this._notifications.unshift(notif);
        if (this._notifications.length > this._notifMax) {
            this._notifications = this._notifications.slice(0, this._notifMax);
        }
        this.saveNotifications();
        this.renderNotifications();
        this.toast(message, type);
    },

    addSystemNotification({ alertId, title, message, type = 'info', action = null, isStartup = false }) {
        const existingIdx = this._notifications.findIndex(n => n.alertId === alertId);
        if (existingIdx !== -1) {
            this._notifications[existingIdx].title = title;
            this._notifications[existingIdx].message = message;
            this._notifications[existingIdx].type = type;
            this._notifications[existingIdx].action = action;
            this._notifications[existingIdx].timestamp = new Date().toISOString();
            if (isStartup) {
                // On restart / app open, keep active critical alerts marked unread
                this._notifications[existingIdx].read = false;
            }
        } else {
            const notif = {
                id: alertId || (Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
                alertId,
                title,
                message,
                type,
                action,
                read: false,
                timestamp: new Date().toISOString()
            };
            this._notifications.unshift(notif);
            if (this._notifications.length > this._notifMax) {
                this._notifications = this._notifications.slice(0, this._notifMax);
            }
        }
        this.saveNotifications();
        this.renderNotifications();
    },

    async checkSystemAlerts(options = {}) {
        const isStartup = Boolean(options && options.isStartup);
        if (!API.getToken()) return;
        try {
            const inventory = await API.get('/inventory').catch(() => []);
            if (Array.isArray(inventory)) {
                const now = new Date();
                const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
                const todayStr = now.toISOString().slice(0, 10);

                const outOfStockItems = [];
                const lowStockItems = [];
                const expiredItems = [];
                const expiringSoonItems = [];

                inventory.forEach(item => {
                    const qty = Number(item.quantityInStock) || 0;
                    const reorder = Number(item.reorderLevel) || 10;
                    const drugName = item.drugName || 'Medication';
                    const batch = item.batchNumber || '';

                    // 1. Out of stock alert
                    if (qty <= 0) {
                        outOfStockItems.push(item);
                        const alertId = `out_stock_${item.inventoryId}`;
                        this.addSystemNotification({
                            alertId,
                            title: 'Out of Stock',
                            message: `${drugName} (Batch: ${batch || 'N/A'}) is completely OUT OF STOCK!`,
                            type: 'error',
                            action: { label: 'View Inventory', tab: 'inventory' },
                            isStartup
                        });
                    } else if (qty <= reorder) {
                        // 2. Low stock alert
                        lowStockItems.push(item);
                        const alertId = `low_stock_${item.inventoryId}`;
                        this.addSystemNotification({
                            alertId,
                            title: 'Low Stock Warning',
                            message: `${drugName} has only ${qty} units remaining (Reorder level: ${reorder}).`,
                            type: 'warning',
                            action: { label: 'Reorder / PO', tab: 'suppliers' },
                            isStartup
                        });
                    }

                    // 3. Expiry alerts
                    if (item.expiryDate && qty > 0) {
                        if (item.expiryDate < todayStr) {
                            expiredItems.push(item);
                            const alertId = `expired_${item.inventoryId}`;
                            this.addSystemNotification({
                                alertId,
                                title: 'Expired Stock',
                                message: `${drugName} (Batch: ${batch || 'N/A'}) EXPIRED on ${item.expiryDate}! Remove immediately.`,
                                type: 'error',
                                action: { label: 'Write Off / Remove', tab: 'inventory' },
                                isStartup
                            });
                        } else if (item.expiryDate <= in30Days) {
                            expiringSoonItems.push(item);
                            const alertId = `expiring_${item.inventoryId}`;
                            this.addSystemNotification({
                                alertId,
                                title: 'Expiring Soon',
                                message: `${drugName} (Batch: ${batch || 'N/A'}) expires on ${item.expiryDate} (within 30 days).`,
                                type: 'warning',
                                action: { label: 'Inspect Batch', tab: 'inventory' },
                                isStartup
                            });
                        }
                    }
                });

                // On startup / restart: trigger visible screen notification toasts
                if (isStartup) {
                    if (outOfStockItems.length === 1) {
                        this.toast(`Out of Stock Alert: ${outOfStockItems[0].drugName} is completely out of stock (0 units)!`, 'error', 7000);
                    } else if (outOfStockItems.length > 1) {
                        this.toast(`Critical Alert: ${outOfStockItems.length} items are OUT OF STOCK (${outOfStockItems.map(i => i.drugName).slice(0, 2).join(', ')}${outOfStockItems.length > 2 ? '...' : ''})!`, 'error', 7000);
                    }

                    if (expiredItems.length > 0) {
                        setTimeout(() => {
                            this.toast(`Expired Medication Alert: ${expiredItems.length} batch(es) have expired!`, 'error', 6000);
                        }, 300);
                    } else if (lowStockItems.length > 0) {
                        setTimeout(() => {
                            this.toast(`Low Stock: ${lowStockItems.length} item(s) are below reorder level (${lowStockItems[0].drugName}).`, 'warning', 5000);
                        }, 400);
                    }
                }
            }

            // Check pending prescriptions
            const rxs = await API.get('/prescriptions').catch(() => []);
            if (Array.isArray(rxs)) {
                const pending = rxs.filter(r => r.status === 'PENDING');
                if (pending.length > 0) {
                    const alertId = `pending_rxs_${pending.length}`;
                    this.addSystemNotification({
                        alertId,
                        title: 'Pending Prescriptions',
                        message: `You have ${pending.length} prescription${pending.length === 1 ? '' : 's'} waiting to be dispensed.`,
                        type: 'info',
                        action: { label: 'View Prescriptions', tab: 'prescriptions' },
                        isStartup
                    });
                }
            }
        } catch (e) {
            console.warn('System alert check failed:', e);
        }
    },

    markRead(id) {
        const n = this._notifications.find(x => x.id === id);
        if (n) { n.read = true; this.saveNotifications(); this.renderNotifications(); }
    },

    markAllRead() {
        this._notifications.forEach(n => n.read = true);
        this.saveNotifications();
        this.renderNotifications();
    },

    clearNotifications() {
        this._notifications = [];
        this.saveNotifications();
        this.renderNotifications();
    },

    getUnreadCount() {
        return this._notifications.filter(n => !n.read).length;
    },

    updateNotifBadge() {
        const badge = document.getElementById('notif-badge');
        if (!badge) return;
        const count = this.getUnreadCount();
        if (count > 0) {
            badge.style.display = 'flex';
            badge.textContent = count > 99 ? '99+' : count;
        } else {
            badge.style.display = 'none';
        }
    },

    toggleNotificationPanel() {
        const dropdown = document.getElementById('notif-dropdown');
        if (!dropdown) return;
        const isOpen = dropdown.classList.contains('open');
        if (isOpen) {
            dropdown.classList.remove('open');
        } else {
            this.renderNotifications();
            dropdown.classList.add('open');
        }
    },

    renderNotifications() {
        const list = document.getElementById('notif-list');
        if (!list) return;

        if (this._notifications.length === 0) {
            list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
            return;
        }

        const iconMap = {
            success: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };

        list.innerHTML = this._notifications.slice(0, 30).map(n => {
            const timeAgo = this._timeAgo(n.timestamp);
            const idArgument = SafeHtml.inlineArgument(n.id);
            const actionTabArgument = SafeHtml.inlineArgument(n.action?.tab || '');
            const notificationType = ['success', 'error', 'warning', 'info'].includes(n.type) ? n.type : 'info';
            const icon = iconMap[notificationType];
            const actionHtml = n.action
                ? `<div class="notif-action" onclick="App.handleNotifAction(${idArgument}, ${actionTabArgument})">${SafeHtml.escapeHtml(n.action.label)}</div>`
                : '';
            return `
                <div class="notif-item ${n.read ? '' : 'unread'}" onclick="App.markRead(${idArgument})">
                    <div class="notif-icon notif-icon-${notificationType}">${icon}</div>
                    <div class="notif-body">
                        <div class="notif-title">${SafeHtml.escapeHtml(n.title)}</div>
                        <div class="notif-message">${SafeHtml.escapeHtml(n.message)}</div>
                        <div class="notif-time">${SafeHtml.escapeHtml(timeAgo)}</div>
                        ${actionHtml}
                    </div>
                </div>
            `;
        }).join('');
    },

    handleNotifAction(id, tab) {
        this.markRead(id);
        if (tab) {
            document.getElementById('notif-dropdown').classList.remove('open');
            this.switchTab(tab);
        }
    },

    _timeAgo(timestamp) {
        const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        const days = Math.floor(hours / 24);
        return days + 'd ago';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();

    // Diagnostic: report the native bridge state to ~/.medicare/bridge-diag.log
    // shortly after load so we can inspect it from the filesystem. The bridge is
    // injected by the desktop WebView on page-load success, so we sample a few
    // times to catch both the pre- and post-injection state.
    setTimeout(() => {
        if (window.javaBridge && typeof window.javaBridge.diag === 'function') {
            window.javaBridge.diag('APP LOADED -> bridge=' + (typeof window.javaBridge) +
                ' saveFile=' + typeof window.javaBridge.saveFile +
                ' printText=' + typeof window.javaBridge.printText +
                ' openFile=' + typeof window.javaBridge.openFile +
                ' diag=' + typeof window.javaBridge.diag +
                ' log=' + typeof window.javaBridge.log);
        } else {
            // Bridge not injected (or missing diag); write via a plain fetch-free
            // best effort is not possible here, so rely on the Java-side log.
        }
    }, 2500);
});

// Global JS error trap -> forward to the native diag log so any error thrown
// anywhere (modal render, missing symbol, etc.) is visible from the filesystem.
if (window.addEventListener) {
    window.addEventListener('error', (ev) => {
        if (window.javaBridge && typeof window.javaBridge.diag === 'function') {
            const msg = (ev && ev.message) ? ev.message : String(ev);
            const src = (ev && ev.filename) ? ' @' + ev.filename + (ev.lineno ? ':' + ev.lineno : '') : '';
            window.javaBridge.diag('WINDOW.ERROR -> ' + msg + src);
        }
    });
}
