// Bill History — view and reprint past customer invoices (safe recovery).
// Uses the existing POS receipt modal + PDF generator so old bills can be
// re-printed or saved as PDF even if printing failed the first time.
const BillHistory = {
    sales: [],
    page: 0,
    pageSize: 50,
    totalPages: 1,
    totalElements: 0,
    supplierPaymentsLoaded: false,
    _loadingPromise: null,
    _loadRequestId: 0,
    _supplierPaymentsPromise: null,
    searchRows: null,
    _filterTimer: null,
    _searchRequestId: 0,

    async load(options = {}) {
        if (options.page !== undefined) {
            this.page = Math.max(0, options.page);
        } else if (options.resetPage !== false) {
            this.page = 0;
            this.searchRows = null;
            clearTimeout(this._filterTimer);
            this._searchRequestId += 1;
        }
        if (this._loadingPromise) return this._loadingPromise;

        const tbody = document.getElementById('history-table-body');
        if (!tbody) return false;
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:30px;">Loading bill history…</td></tr>';
        const requestId = ++this._loadRequestId;
        const refreshSupplier = options.refreshSupplier !== false;
        const supplierPromise = refreshSupplier || !this.supplierPaymentsLoaded
            ? this.loadSupplierPayments(true)
            : Promise.resolve(true);
        const promise = (async () => {
            try {
                const data = await API.get(`/sales?page=${this.page}&size=${this.pageSize}`);
                if (requestId !== this._loadRequestId) return false;
                const list = Array.isArray(data) ? data : (data.content || []);
                this.sales = list.slice(0, this.pageSize);
                this.totalPages = Array.isArray(data) ? 1 : (Number(data.totalPages) || 1);
                this.totalElements = Array.isArray(data) ? this.sales.length : (Number(data.totalElements) || 0);
                this.page = Math.min(this.page, Math.max(0, this.totalPages - 1));
                await this.render(this.sales);
                await supplierPromise;
                return true;
            } catch (e) {
                if (requestId === this._loadRequestId) {
                     tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--accent-red);padding:30px;">Failed to load bill history: ${SafeHtml.escapeHtml(e.message)}</td></tr>`;
                }
                return false;
            }
        })();
        this._loadingPromise = promise;
        promise.finally(() => {
            if (this._loadingPromise === promise) this._loadingPromise = null;
        }).catch(() => {});
        return promise;
    },

    async render(rows, options = {}) {
        const showPagination = options.hidePagination !== true;
        if (!showPagination) {
            const existing = document.getElementById('history-pagination');
            if (existing) existing.remove();
        }
        const tbody = document.getElementById('history-table-body');
        if (!tbody) return;
        if (!rows.length) {
            await App.renderRows(tbody, [], () => null, {
                emptyHtml: '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:30px;">No bills found.</td></tr>'
            });
            if (showPagination) this.renderPagination();
            return;
        }
        await App.renderRows(tbody, rows, s => {
            const dateStr = App.formatLocalDateTime(s.saleDateTime);
            const total = App.formatCurrency(s.totalAmount);
             const status = String(s.status || 'COMPLETED').toUpperCase();
             const statusText = SafeHtml.escapeHtml(status);
             const statusBadge = status === 'REFUNDED' || status === 'CANCELLED'
                 ? '<span class="badge badge-red">' + statusText + '</span>'
                 : '<span class="badge badge-green">' + statusText + '</span>';
             const reBillButton = `<button class="btn btn-secondary btn-sm" onclick="BillHistory.rebillSale(${SafeHtml.inlineArgument(s.saleId)})">Re-bill</button>`;
             const tr = document.createElement('tr');
             tr.innerHTML = `
                 <td><span style="font-family:var(--font-mono);font-weight:700;">${SafeHtml.escapeHtml(s.billNumber || '—')}</span></td>
                 <td>${SafeHtml.escapeHtml(dateStr)}</td>
                 <td>${SafeHtml.escapeHtml(s.patientName || 'Walk-in Customer')}</td>
                 <td>${SafeHtml.escapeHtml(s.soldByName || '—')}</td>
                 <td>${SafeHtml.escapeHtml(String(s.paymentMethod || '—').replace(/_/g,' '))}</td>
                 <td>${statusBadge}</td>
                 <td style="text-align:right;font-family:var(--font-mono);font-weight:700;">${SafeHtml.escapeHtml(total)}</td>
                 <td>
                     <button class="btn btn-primary btn-sm" onclick="BillHistory.viewBill(${SafeHtml.inlineArgument(s.saleId)})">View / Reprint</button>
                     ${reBillButton}
                 </td>`;
            return tr;
        });
        if (showPagination) this.renderPagination();
    },

    renderPagination() {
        const table = document.getElementById('history-table-body')?.closest('.table-container');
        if (!table?.parentNode) return;
        let controls = document.getElementById('history-pagination');
        if (this.totalPages <= 1) {
            if (controls) controls.remove();
            return;
        }
        if (!controls) {
            controls = document.createElement('div');
            controls.id = 'history-pagination';
            controls.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 0;font-size:13px;';
            table.parentNode.appendChild(controls);
        }
        const previous = document.createElement('button');
        previous.className = 'btn btn-secondary btn-sm';
        previous.textContent = '← Previous';
        previous.disabled = this.page === 0;
        previous.onclick = () => this.load({ page: this.page - 1, resetPage: false, refreshSupplier: false });
        const info = document.createElement('span');
        info.style.cssText = 'color:var(--text-secondary);font-weight:600;';
        info.textContent = `Page ${this.page + 1} of ${this.totalPages} (${this.totalElements} bills)`;
        const next = document.createElement('button');
        next.className = 'btn btn-secondary btn-sm';
        next.textContent = 'Next →';
        next.disabled = this.page >= this.totalPages - 1;
        next.onclick = () => this.load({ page: this.page + 1, resetPage: false, refreshSupplier: false });
        controls.replaceChildren(previous, info, next);
    },

    applyFilter() {
        const input = document.getElementById('history-search');
        const q = (input?.value || '').toLowerCase().trim();
        clearTimeout(this._filterTimer);
        this._filterTimer = setTimeout(async () => {
            if (!q) {
                this._searchRequestId += 1;
                this.searchRows = null;
                await this.render(this.sales);
                return;
            }
            const requestId = ++this._searchRequestId;
            try {
                if (!this.searchRows) {
                    const data = await API.get('/sales?size=500');
                    const list = Array.isArray(data) ? data : (data.content || []);
                    if (requestId !== this._searchRequestId) return;
                    this.searchRows = list.slice(0, 500);
                }
                if (requestId !== this._searchRequestId) return;
                const filtered = this.searchRows.filter(s =>
                    String(s.billNumber || '').toLowerCase().includes(q) ||
                    String(s.patientName || '').toLowerCase().includes(q) ||
                    String(s.soldByName || '').toLowerCase().includes(q)
                );
                await this.render(filtered.slice(0, this.pageSize), { hidePagination: true });
            } catch (e) {
                if (requestId === this._searchRequestId) {
                    App.toast('Failed to search bill history: ' + e.message, 'error');
                }
            }
        }, 150);
    },

    async viewBill(saleId) {
        try {
            const sale = await API.get('/sales/' + saleId);
            if (typeof POS !== 'undefined' && typeof POS.showReceipt === 'function') {
                POS.showReceipt(sale);
            } else {
                App.toast('Receipt view unavailable', 'error');
            }
        } catch (e) {
            App.toast('Failed to load bill: ' + e.message, 'error');
        }
    },

    async rebillSale(saleId) {
        try {
            const sale = await API.get('/sales/' + saleId);
            if (typeof POS !== 'undefined' && typeof POS.load === 'function') {
                if (typeof App !== 'undefined' && App.loadTabContents) {
                    await App.loadTabContents('pos');
                } else {
                    await POS.load({ resetCart: false });
                }
                POS.cart = sale.items.map(item => ({
                    drugId: item.drugId,
                    drugName: item.drugName,
                    mrp: item.unitPrice,
                    gstPercent: item.gstPercent || 12.00,
                    quantity: item.quantity
                }));
                const discount = document.getElementById('pos-discount');
                const amountPaid = document.getElementById('pos-amount-paid');
                if (discount) discount.value = 0;
                if (amountPaid) amountPaid.value = '';
                POS.updateCartUI();
                POS.recalculateCartValues();
                App.toast('Bill items added to POS cart', 'success');
                if (typeof App !== 'undefined' && App.switchTab) {
                    App.switchTab('pos');
                }
            } else {
                App.toast('POS not available for re-billing', 'error');
            }
        } catch (e) {
            App.toast('Failed to re-bill: ' + e.message, 'error');
        }
    },

    async loadSupplierPayments(force = true) {
        if (this._supplierPaymentsPromise) return this._supplierPaymentsPromise;
        if (this.supplierPaymentsLoaded && !force) return true;
        const tbody = document.getElementById('supplier-payments-table-body');
        if (!tbody) return false;
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">Loading supplier accounts…</td></tr>';

        const promise = (async () => {
            try {
                const data = await API.get('/purchase-orders?size=500&sort=supplierName,asc');
                const pos = Array.isArray(data) ? data : (data.content || []);
                const fmt = (v) => App.formatCurrency(parseFloat(v) || 0);
                const supplierMap = new Map();
                pos.slice(0, 500).forEach(p => {
                    const name = p.supplierName || 'Unknown';
                    if (!supplierMap.has(name)) {
                        supplierMap.set(name, { totalOrdered: 0, totalPaid: 0, poCount: 0 });
                    }
                    const supplier = supplierMap.get(name);
                    supplier.totalOrdered += parseFloat(p.totalAmount) || 0;
                    supplier.totalPaid += parseFloat(p.paidAmount) || 0;
                    supplier.poCount++;
                });

                const suppliers = [...supplierMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
                if (suppliers.length === 0) {
                    await App.renderRows(tbody, [], () => null, {
                        emptyHtml: '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">No purchase orders found.</td></tr>'
                    });
                    this.supplierPaymentsLoaded = true;
                    return true;
                }

                await App.renderRows(tbody, suppliers, ([name, supplier]) => {
                    const outstanding = supplier.totalOrdered - supplier.totalPaid;
                    const statusClass = outstanding > 0.01 ? 'badge-orange' : 'badge-green';
                    const statusText = outstanding > 0.01 ? 'UNPAID' : 'PAID';
                    const tr = document.createElement('tr');
                     tr.innerHTML = `
                         <td style="font-weight:600;">${SafeHtml.escapeHtml(name)}</td>
                         <td style="text-align:right;font-family:var(--font-mono);">${SafeHtml.escapeHtml(fmt(supplier.totalOrdered))}</td>
                         <td style="text-align:right;font-family:var(--font-mono);">${SafeHtml.escapeHtml(fmt(supplier.totalPaid))}</td>
                         <td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:${outstanding > 0.01 ? 'var(--accent-red)' : 'var(--accent-green)'};">${SafeHtml.escapeHtml(fmt(outstanding))}</td>
                         <td style="text-align:center;">${SafeHtml.escapeHtml(supplier.poCount)}</td>
                         <td style="font-size:12px;color:var(--text-muted);">—</td>
                         <td><span class="badge ${statusClass}">${SafeHtml.escapeHtml(statusText)}</span></td>
                     `;
                    return tr;
                });
                this.supplierPaymentsLoaded = true;
                return true;
            } catch (e) {
                 tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--accent-red);padding:20px;">Failed to load: ${SafeHtml.escapeHtml(e.message)}</td></tr>`;
                return false;
            }
        })();
        this._supplierPaymentsPromise = promise;
        promise.finally(() => {
            if (this._supplierPaymentsPromise === promise) this._supplierPaymentsPromise = null;
        }).catch(() => {});
        return promise;
    }
};
