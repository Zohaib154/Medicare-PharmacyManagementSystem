const Suppliers = {
    suppliers: [],
    pos: [],
    drugs: [],
    selectedPOItems: [],
    poPage: 0,
    poPageSize: 10,
    poTotalPages: 0,
    poTotalElements: 0,
    _loadPromise: null,
    _poLoadPromise: null,

    async load() {
        if (typeof App !== 'undefined' && App.activeTab === 'backup' && App.invalidateTab) App.invalidateTab('dashboard');
        return this.fetchSuppliers();
    },

    // ─────────────────────────────────────────────
    // SUPPLIERS
    // ─────────────────────────────────────────────

    async fetchSuppliers() {
        if (this._loadPromise) return this._loadPromise;
        const promise = (async () => {
            try {
                const data = await API.get('/suppliers/all?size=200');
                const all = Array.isArray(data) ? data : (data.content || []);
                this.suppliers = all.slice(0, 200).sort((a, b) => {
                    const aActive = a.isActive !== false;
                    const bActive = b.isActive !== false;
                    if (aActive !== bActive) return aActive ? -1 : 1;
                    return (b.supplierId || 0) - (a.supplierId || 0);
                });
                await this.renderList();
                return true;
            } catch (e) {
                try {
                    const data2 = await API.get('/suppliers?size=200');
                    this.suppliers = (Array.isArray(data2) ? data2 : (data2.content || [])).slice(0, 200).sort((a, b) => (b.supplierId || 0) - (a.supplierId || 0));
                    await this.renderList();
                    return true;
                } catch (e2) {
                    App.toast('Failed to load supplier directories.', 'error');
                    return false;
                }
            }
        })();
        this._loadPromise = promise;
        promise.finally(() => {
            if (this._loadPromise === promise) this._loadPromise = null;
        }).catch(() => {});
        return promise;
    },

    async renderList() {
        const tbody = document.getElementById('suppliers-table-body');
        if (!tbody) return;
        if (this.suppliers.length === 0) {
            await App.renderRows(tbody, [], () => null, {
                emptyHtml: `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:30px;">No suppliers registered in directory.</td></tr>`
            });
            return;
        }

        const fmt = (val) => App.formatCurrency(val);
        await App.renderRows(tbody, this.suppliers, s => {
            const tr = document.createElement('tr');
            const inactive = s.isActive === false;
            if (inactive) tr.style.opacity = '0.55';
             tr.innerHTML = `
                 <td>
                     <div style="font-weight:600;">${SafeHtml.escapeHtml(s.supplierName)}</div>
                     ${inactive ? '<span class="badge badge-red" style="font-size:10px;margin-top:2px;">INACTIVE</span>' : ''}
                 </td>
                 <td>${SafeHtml.escapeHtml(s.contactPerson || 'N/A')}</td>
                 <td style="font-family:var(--font-mono);">${SafeHtml.escapeHtml(s.contactNumber || 'N/A')}</td>
                 <td><span style="font-size:13px;color:var(--text-secondary);">${SafeHtml.escapeHtml(s.email || 'N/A')}</span></td>
                 <td><span class="badge badge-muted">${SafeHtml.escapeHtml(s.city || 'N/A')}</span></td>
                 <td style="font-family:var(--font-mono);font-weight:600;color:var(--accent-red);">${SafeHtml.escapeHtml(fmt(s.outstandingBalance))}</td>
                 <td><span class="badge badge-blue">${SafeHtml.escapeHtml(s.paymentTerms || 'COD')}</span></td>
                 <td><span class="badge ${inactive ? 'badge-red' : 'badge-green'}">${inactive ? 'Inactive' : 'Active'}</span></td>
                 <td>
                     <button class="btn btn-secondary btn-sm" onclick="Suppliers.openEditModal(${SafeHtml.inlineArgument(s.supplierId)})">Edit</button>
                 </td>
             `;
            return tr;
        });
    },

    openAddModal() {
        this.openSupplierFormModal();
    },

    openSupplierFormModal(sup = null) {
        const isEdit = sup !== null;
        const title  = isEdit ? 'Edit Supplier Record' : 'Register New Supplier';

        const html = `
            <form id="supplier-form" style="display:flex;flex-direction:column;gap:20px;">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Supplier / Vendor Name</label>
                         <input type="text" id="sup-name" class="form-control" placeholder="e.g. Acme Pharma" value="${SafeHtml.escapeAttribute(sup ? sup.supplierName : '')}" required>
                    </div>
                    <div class="form-group">
                        <label>Contact Person</label>
                         <input type="text" id="sup-contact" class="form-control" placeholder="e.g. Jane Doe" value="${SafeHtml.escapeAttribute(sup ? sup.contactPerson || '' : '')}" required>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Contact Phone</label>
                         <input type="text" id="sup-phone" class="form-control" placeholder="+1 555 123 456" value="${SafeHtml.escapeAttribute(sup ? sup.contactNumber || '' : '')}" required>
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                         <input type="email" id="sup-email" class="form-control" placeholder="sales@vendor.com" value="${SafeHtml.escapeAttribute(sup ? sup.email || '' : '')}">

                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>City / Location</label>
                         <input type="text" id="sup-city" class="form-control" placeholder="e.g. New York" value="${SafeHtml.escapeAttribute(sup ? sup.city || '' : '')}" required>
                    </div>
                    <div class="form-group">
                        <label>Payment Terms</label>
                        <select id="sup-terms" class="form-control">
                            <option value="NET_30" ${sup && sup.paymentTerms === 'NET_30' ? 'selected' : ''}>Net 30 days</option>
                            <option value="NET_15" ${sup && sup.paymentTerms === 'NET_15' ? 'selected' : ''}>Net 15 days</option>
                            <option value="COD"    ${sup && sup.paymentTerms === 'COD'    ? 'selected' : ''}>Cash on Delivery</option>
                            <option value="ADVANCE"${sup && sup.paymentTerms === 'ADVANCE'? 'selected' : ''}>Advance Payment</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Vendor Address</label>
                     <textarea id="sup-address" class="form-control" rows="2" placeholder="Complete warehouse / office location...">${SafeHtml.escapeHtml(sup ? sup.address || '' : '')}</textarea>
                </div>
                ${isEdit ? `
                <div class="form-group">
                    <label>Status</label>
                    <select id="sup-status" class="form-control">
                        <option value="true"  ${sup.isActive !== false ? 'selected' : ''}>Active</option>
                        <option value="false" ${sup.isActive === false  ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>` : ''}
                <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:15px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">${isEdit ? 'UPDATE SUPPLIER' : 'REGISTER SUPPLIER'}</button>
                </div>
            </form>
        `;

        App.openModal(title, html);
        document.getElementById('supplier-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitSupplier(isEdit ? sup.supplierId : null);
        });
    },

    async openEditModal(supplierId) {
        const sup = this.suppliers.find(s => s.supplierId === supplierId);
        if (sup) this.openSupplierFormModal(sup);
    },

    async submitSupplier(supplierId) {
        const supplierName  = document.getElementById('sup-name').value;
        const contactPerson = document.getElementById('sup-contact').value;
        const contactNumber = document.getElementById('sup-phone').value;
        const email         = document.getElementById('sup-email').value;
        const city          = document.getElementById('sup-city').value;
        const paymentTerms  = document.getElementById('sup-terms').value;
        const address       = document.getElementById('sup-address').value;
        const statusEl      = document.getElementById('sup-status');
        const isActive      = statusEl ? statusEl.value === 'true' : true;

        const payload = { supplierName, contactPerson, contactNumber, email, city, paymentTerms, address, isActive, outstandingBalance: 0.0 };

        try {
            if (supplierId) {
                const original = this.suppliers.find(s => s.supplierId === supplierId);
                await API.put(`/suppliers/${supplierId}`, payload);
                if (original && original.isActive !== false && !isActive) {
                    App.toast(`Supplier "${supplierName}" marked as Inactive.`, 'warning');
                } else {
                    App.toast(`Supplier ${supplierName} updated successfully.`, 'success');
                }
            } else {
                await API.post('/suppliers', payload);
                App.toast(`Supplier ${supplierName} registered.`, 'success');
            }
            App.closeModal();
            await this.load();
        } catch (e) {
            App.toast(`Saving supplier failed: ${e.message}`, 'error');
        }
    },

    // ─────────────────────────────────────────────
    // PURCHASE ORDERS
    // ─────────────────────────────────────────────

    async loadPOs(page) {
        if (page !== undefined) this.poPage = Math.max(0, page);
        if (this._poLoadPromise) return this._poLoadPromise;
        const requestedPage = this.poPage;
        const promise = (async () => {
            try {
                const data = await API.get(`/purchase-orders?page=${requestedPage}&size=${this.poPageSize}`);
                if (requestedPage !== this.poPage) return false;
                this.pos = Array.isArray(data) ? data : (data.content || []);
                this.poTotalPages = data.totalPages || 0;
                this.poTotalElements = data.totalElements || 0;
                this.renderPOList();
                return true;
            } catch (e) {
                App.toast('Failed to load purchase orders.', 'error');
                return false;
            }
        })();
        this._poLoadPromise = promise;
        promise.finally(() => {
            if (this._poLoadPromise === promise) this._poLoadPromise = null;
        }).catch(() => {});
        return promise;
    },

    PO_STATUSES: ['PENDING', 'CONFIRMED', 'SHIPPED', 'CANCELLED'],

    poStatusBadge(status) {
        const s = (status || '').toUpperCase();
        if (s === 'CANCELLED')           return 'badge-red';
        if (s === 'DELIVERED')           return 'badge-green';
        return 'badge-orange';
    },

    fmtDate(val) {
        if (!val) return 'N/A';
        if (Array.isArray(val)) return new Date(val[0], val[1] - 1, val[2]).toLocaleDateString();
        return new Date(val).toLocaleDateString();
    },

    renderPOList() {
        const tbody = document.getElementById('po-table-body');
        tbody.innerHTML = '';

        if (this.pos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px;">No Purchase Orders dispatched yet.</td></tr>`;
            this.renderPOPagination();
            return;
        }

        const fmt = (val) => App.formatCurrency(parseFloat(val) || 0);
        const fragment = document.createDocumentFragment();

        this.pos.forEach(p => {
            const statusBadge = this.poStatusBadge(p.status);

            // Lock dropdown for DELIVERED and CANCELLED orders
            const isLocked = p.status === 'DELIVERED' || p.status === 'CANCELLED';
            const lockReason = p.status === 'DELIVERED' ? 'title="Order is delivered and locked"' : 'title="Order is cancelled and locked"';
            const disabledAttr = isLocked ? 'disabled' : '';
            const opacity = isLocked ? '0.5' : '1';
            const cursor = isLocked ? 'not-allowed' : 'pointer';

            // Build status toggle buttons (switch-style)
            const statusLabels = {
                'PENDING': 'Pending',
                'CONFIRMED': 'Confirmed',
                'SHIPPED': 'Shipped',
                'DELIVERED': 'Delivered',
                'CANCELLED': 'Cancelled'
            };
            const nextStatuses = {
                'PENDING': 'CONFIRMED',
                'CONFIRMED': 'SHIPPED',
                'SHIPPED': 'DELIVERED'
            };
             const currentStatus = String(p.status || 'PENDING');
            const nextStatus = nextStatuses[currentStatus];
            const canAdvance = nextStatus && !isLocked;
            const advanceLabel = nextStatus ? `→ ${statusLabels[nextStatus]}` : '';

            // Summary row
            const tr = document.createElement('tr');
            tr.id = `po-row-${p.orderId}`;
             tr.innerHTML = `
                 <td style="font-family:var(--font-mono);font-weight:700;color:var(--accent-blue);">${SafeHtml.escapeHtml(p.poNumber)}</td>
                 <td style="font-weight:600;" title="${SafeHtml.escapeAttribute(p.supplierName || 'N/A')}">${SafeHtml.escapeHtml(p.supplierName || 'N/A')}</td>
                 <td style="font-family:var(--font-mono);white-space:nowrap;">${SafeHtml.escapeHtml(this.fmtDate(p.orderDate))}</td>
                 <td>
                     <div style="display:flex;align-items:center;gap:8px;">
                         <span class="badge ${statusBadge}" style="font-size:11px;padding:3px 8px;">${SafeHtml.escapeHtml(currentStatus.replace('_', ' '))}</span>
                         ${canAdvance ? `
                             <button class="btn btn-sm" onclick="Suppliers.advancePoStatus(${SafeHtml.inlineArgument(p.orderId)}, ${SafeHtml.inlineArgument(currentStatus)}, ${SafeHtml.inlineArgument(nextStatus)})"
                                 style="background:var(--accent-green);color:white;font-size:11px;padding:3px 8px;border-radius:4px;border:none;cursor:pointer;white-space:nowrap;">
                                 ${SafeHtml.escapeHtml(advanceLabel)}
                             </button>
                         ` : ''}
                     </div>
                 </td>
                 <td style="font-family:var(--font-mono);font-weight:700;white-space:nowrap;">${SafeHtml.escapeHtml(fmt(p.totalAmount))}</td>
                 <td style="white-space:nowrap;">
                     <button class="btn btn-secondary btn-sm" onclick="Suppliers.togglePODetails(${SafeHtml.inlineArgument(p.orderId)}, this)" data-open="false">Inspect</button>
                 </td>
             `;
            fragment.appendChild(tr);

            // Collapsible detail row
            const detailTr = document.createElement('tr');
            detailTr.id = `po-detail-${p.orderId}`;
            detailTr.style.display = 'none';
            detailTr.innerHTML = `
                <td colspan="6" style="padding:0;background:rgba(0,0,0,0.12);">
                     <div id="po-detail-content-${SafeHtml.escapeAttribute(p.orderId)}" style="padding:16px 24px;">
                        <span style="color:var(--text-muted);font-size:13px;">Loading…</span>
                    </div>
                </td>
            `;
            fragment.appendChild(detailTr);
        });
        tbody.appendChild(fragment);

        this.renderPOPagination();
    },

    renderPOPagination() {
        const existing = document.getElementById('po-pagination');
        if (existing) existing.remove();

        if (this.poTotalPages <= 1) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'po-pagination';
        wrapper.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 0;font-size:13px;';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary btn-sm';
        prevBtn.textContent = '← Previous';
        prevBtn.disabled = this.poPage === 0;
        prevBtn.onclick = () => this.loadPOs(this.poPage - 1);

        const info = document.createElement('span');
        info.style.cssText = 'color:var(--text-secondary);font-weight:600;';
        info.textContent = `Page ${this.poPage + 1} of ${this.poTotalPages}  (${this.poTotalElements} total)`;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary btn-sm';
        nextBtn.textContent = 'Next →';
        nextBtn.disabled = this.poPage >= this.poTotalPages - 1;
        nextBtn.onclick = () => this.loadPOs(this.poPage + 1);

        wrapper.appendChild(prevBtn);
        wrapper.appendChild(info);
        wrapper.appendChild(nextBtn);

        const tableContainer = document.querySelector('#sheet-suppliers .table-container') || document.querySelector('.glass-card .table-container');
        if (tableContainer) tableContainer.parentNode.appendChild(wrapper);
    },

    async advancePoStatus(poId, oldStatus, newStatus) {
        const statusLabels = {
            'PENDING': 'Pending',
            'CONFIRMED': 'Confirmed',
            'SHIPPED': 'Shipped',
            'DELIVERED': 'Delivered (Locked)',
            'CANCELLED': 'Cancelled'
        };

        const oldLabel = statusLabels[oldStatus] || oldStatus;
        const newLabel = statusLabels[newStatus] || newStatus;

        if (newStatus === 'DELIVERED') {
            const html = `
                <div style="display:flex;flex-direction:column;gap:14px;">
                    <p style="margin:0;color:var(--text-secondary);">
                        Mark this order as <strong>DELIVERED</strong>?<br><br>
                        This will:<br>
                        • Create inventory batches for all items<br>
                        • Lock the order (no further status changes)
                    </p>
                    <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:14px;">
                        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                        <button type="button" class="btn btn-primary" id="po-confirm-advance-btn">Confirm Delivery</button>
                    </div>
                </div>
            `;
            App.openModal('Receive Order', html);
            document.getElementById('po-confirm-advance-btn').onclick = async () => {
                App.closeModal();
                await this._executeAdvancePoStatus(poId, newStatus, newLabel);
            };
        } else if (newStatus === 'CANCELLED') {
            const html = `
                <div style="display:flex;flex-direction:column;gap:14px;">
                    <p style="margin:0;color:var(--text-secondary);">
                        <strong>Cancel</strong> this order?<br><br>
                        This action will lock the order. You will need to create a new order if you change your mind.
                    </p>
                    <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:14px;">
                        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Keep Order</button>
                        <button type="button" class="btn btn-danger" id="po-confirm-cancel-btn">Confirm Cancellation</button>
                    </div>
                </div>
            `;
            App.openModal('Cancel Order', html);
            document.getElementById('po-confirm-cancel-btn').onclick = async () => {
                App.closeModal();
                await this._executeAdvancePoStatus(poId, newStatus, newLabel);
            };
        } else {
            await this._executeAdvancePoStatus(poId, newStatus, newLabel);
        }
    },

    async _executeAdvancePoStatus(poId, newStatus, newLabel) {
        try {
            let result;
            if (newStatus === 'DELIVERED') {
                result = await API.put(`/purchase-orders/${poId}/receive`);
            } else {
                result = await API.put(`/purchase-orders/${poId}/status?status=${encodeURIComponent(newStatus)}`);
            }
            App.toast(`Status updated to ${newLabel}.`, 'success');

            if (typeof App !== 'undefined' && App.addNotification) {
                const notifMsg = newStatus === 'DELIVERED'
                    ? `${result.poNumber || 'PO'}: Received and inventory updated`
                    : `${result.poNumber || 'PO'}: Status changed to ${newLabel}`;
                App.addNotification({
                    title: newStatus === 'DELIVERED' ? 'Stock Received' : 'PO Status Updated',
                    message: notifMsg,
                    type: newStatus === 'DELIVERED' ? 'success' : 'info',
                    action: { label: 'View Inventory', tab: 'inventory' }
                });
            }

            const contentDiv = document.getElementById(`po-detail-content-${poId}`);
            if (contentDiv) contentDiv.dataset.loaded = 'false';
            if (typeof App !== 'undefined' && App.invalidateTabs) {
                App.invalidateTabs('inventory', 'pos');
            }
            await this.loadPOs();
            if (typeof Dashboard !== 'undefined') Dashboard.load();
        } catch (e) {
            App.toast(`Failed to update status: ${e.message}`, 'error');
        }
    },

    async togglePODetails(poId, btn) {
        const detailRow = document.getElementById(`po-detail-${poId}`);
        const isOpen    = btn.getAttribute('data-open') === 'true';

        if (isOpen) {
            detailRow.style.display = 'none';
            btn.setAttribute('data-open', 'false');
            btn.textContent = '▶ Inspect';
            return;
        }

        detailRow.style.display = 'table-row';
        btn.setAttribute('data-open', 'true');
        btn.textContent = '▼ Collapse';

        const contentDiv = document.getElementById(`po-detail-content-${poId}`);
        if (contentDiv.dataset.loaded === 'true') return;

        try {
            const po  = await API.get(`/purchase-orders/${poId}`);
            const fmt = (val) => App.formatCurrency(parseFloat(val) || 0);
            const statusBadge = this.poStatusBadge(po.status);

            // Fetch payment history for this PO
            let payments = [];
            let paidTotal = parseFloat(po.paidAmount) || 0;
            try {
                payments = await API.get(`/supplier-payments/purchase-order/${po.orderId}`);
                if (paidTotal === 0 && payments.length > 0) {
                    paidTotal = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
                }
            } catch (e) {
                // payments endpoint may not be available
            }

            let itemRows = '';
            (po.items || []).forEach(item => {
                const up  = parseFloat(item.unitPrice !== undefined ? item.unitPrice : item.unitCost) || 0;
                const qty = parseInt(item.orderedQuantity !== undefined ? item.orderedQuantity : item.quantity) || 0;
                 itemRows += `
                     <tr>
                         <td style="font-weight:600;padding:6px 10px;">${SafeHtml.escapeHtml(item.drugName)}</td>
                         <td style="padding:6px 10px;">${SafeHtml.escapeHtml(qty)} units</td>
                         <td style="font-family:var(--font-mono);padding:6px 10px;">${SafeHtml.escapeHtml(fmt(up))}</td>
                         <td style="font-family:var(--font-mono);font-weight:700;padding:6px 10px;">${SafeHtml.escapeHtml(fmt(qty * up))}</td>
                     </tr>
                 `;
            });

            const total = parseFloat(po.totalAmount) || 0;
            const balance = total - paidTotal;
            const canMarkDelivered = po.status !== 'DELIVERED' && po.status !== 'CANCELLED';
            const canRecordPayment = po.status === 'DELIVERED' && balance > 0.01;

            let paymentRows = '';
            if (payments.length > 0) {
                 paymentRows = payments.map(p => `
                     <tr>
                         <td style="padding:5px 8px;">${SafeHtml.escapeHtml(this.fmtDate(p.paymentDate))}</td>
                         <td style="padding:5px 8px;">${SafeHtml.escapeHtml(p.paymentMethod || 'CASH')}</td>
                         <td style="padding:5px 8px;font-family:var(--font-mono);text-align:right;">${SafeHtml.escapeHtml(fmt(p.amount))}</td>
                         <td style="padding:5px 8px;">${SafeHtml.escapeHtml(p.referenceNumber || '—')}</td>
                         <td style="padding:5px 8px;">${SafeHtml.escapeHtml(p.recordedByName || '—')}</td>
                     </tr>
                 `).join('');
            }

            contentDiv.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:13px;margin-bottom:14px;">
                     <div><span style="color:var(--text-secondary);">PO Number:</span> <strong style="color:var(--accent-blue);">${SafeHtml.escapeHtml(po.poNumber)}</strong></div>
                     <div><span style="color:var(--text-secondary);">Supplier:</span> <strong>${SafeHtml.escapeHtml(po.supplierName || 'N/A')}</strong></div>
                     <div><span style="color:var(--text-secondary);">Status:</span> <span class="badge ${statusBadge}">${SafeHtml.escapeHtml(po.status)}</span></div>
                     <div><span style="color:var(--text-secondary);">Order Date:</span> ${SafeHtml.escapeHtml(this.fmtDate(po.orderDate))}</div>
                     <div><span style="color:var(--text-secondary);">Expected Delivery:</span> ${SafeHtml.escapeHtml(this.fmtDate(po.expectedDeliveryDate))}</div>
                     <div><span style="color:var(--text-secondary);">Ordered By:</span> ${SafeHtml.escapeHtml(po.orderedByName || 'System')}</div>
                     <div><span style="color:var(--text-secondary);">Total:</span> <strong style="color:var(--accent-green);">${SafeHtml.escapeHtml(fmt(total))}</strong></div>
                     <div><span style="color:var(--text-secondary);">Paid:</span> <strong style="color:var(--accent-blue);">${SafeHtml.escapeHtml(fmt(paidTotal))}</strong></div>
                     <div><span style="color:var(--text-secondary);">Balance:</span> <strong style="color:${balance > 0.01 ? 'var(--accent-red)' : 'var(--accent-green)'};">${SafeHtml.escapeHtml(fmt(balance))}</strong></div>
                     ${po.actualDeliveryDate ? `<div><span style="color:var(--text-secondary);">Delivered On:</span> ${SafeHtml.escapeHtml(this.fmtDate(po.actualDeliveryDate))}</div>` : ''}
                     ${po.notes ? `<div style="grid-column:span 3;"><span style="color:var(--text-secondary);">Notes:</span> ${SafeHtml.escapeHtml(po.notes)}</div>` : ''}
                </div>
                <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:14px;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border-color);">
                            <th style="text-align:left;padding:6px 10px;color:var(--text-secondary);font-weight:600;">Medication</th>
                            <th style="text-align:left;padding:6px 10px;color:var(--text-secondary);font-weight:600;">Qty</th>
                            <th style="text-align:left;padding:6px 10px;color:var(--text-secondary);font-weight:600;">Unit Cost</th>
                            <th style="text-align:left;padding:6px 10px;color:var(--text-secondary);font-weight:600;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows || '<tr><td colspan="4" style="padding:10px;color:var(--text-muted);">No items found.</td></tr>'}</tbody>
                </table>

                <div style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:12px;">
                    <div style="font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                        <span>Supplier Payments</span>
                         ${canRecordPayment ? `<button class="btn btn-primary btn-sm" onclick="Suppliers.openRecordPaymentModal(${SafeHtml.inlineArgument(po.orderId)}, ${SafeHtml.inlineArgument(po.supplierId)}, ${SafeHtml.inlineArgument(balance)})">Record Payment</button>` : ''}
                    </div>
                    ${payments.length === 0 ? '<div style="color:var(--text-muted);font-size:12px;padding:6px 0;">No payments recorded yet.</div>' : `
                        <table style="width:100%;font-size:12px;border-collapse:collapse;">
                            <thead>
                                <tr style="border-bottom:1px solid var(--border-color);">
                                    <th style="text-align:left;padding:5px 8px;color:var(--text-secondary);">Date</th>
                                    <th style="text-align:left;padding:5px 8px;color:var(--text-secondary);">Method</th>
                                    <th style="text-align:right;padding:5px 8px;color:var(--text-secondary);">Amount</th>
                                    <th style="text-align:left;padding:5px 8px;color:var(--text-secondary);">Reference</th>
                                    <th style="text-align:left;padding:5px 8px;color:var(--text-secondary);">By</th>
                                </tr>
                            </thead>
                            <tbody>${paymentRows}</tbody>
                        </table>
                    `}
                </div>

                <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
                     ${canMarkDelivered ? `<button class="btn btn-primary btn-sm" onclick="Suppliers.markDeliveredFromInspect(${SafeHtml.inlineArgument(po.orderId)})">Mark as Delivered</button>` : ''}
                     ${canMarkDelivered ? `<button class="btn btn-secondary btn-sm" onclick="Suppliers.markPOAction(${SafeHtml.inlineArgument(po.orderId)}, 'DAMAGED')">Damaged</button>` : ''}
                     ${canMarkDelivered ? `<button class="btn btn-secondary btn-sm" onclick="Suppliers.markPOAction(${SafeHtml.inlineArgument(po.orderId)}, 'LOST')">Lost</button>` : ''}
                     ${canMarkDelivered ? `<button class="btn btn-secondary btn-sm" onclick="Suppliers.markPOAction(${SafeHtml.inlineArgument(po.orderId)}, 'RETURNED')">Return to Supplier</button>` : ''}
                     <button class="btn btn-secondary btn-sm" onclick="Suppliers.printPO(${SafeHtml.inlineArgument(po.orderId)})">Print</button>
                     <button class="btn btn-secondary btn-sm" onclick="Suppliers.savePODoc(${SafeHtml.inlineArgument(po.orderId)})">Save PDF</button>
                </div>
            `;
            contentDiv.dataset.loaded = 'true';
        } catch (e) {
             contentDiv.innerHTML = `<span style="color:var(--accent-red);">Failed to load details: ${SafeHtml.escapeHtml(e.message)}</span>`;
        }
    },

    async markDeliveredFromInspect(poId) {
        const html = `
            <div style="display:flex;flex-direction:column;gap:14px;">
                <p style="margin:0;color:var(--text-secondary);">
                    Mark this purchase order as <strong>DELIVERED</strong>?<br><br>
                    This will:<br>
                    • Create inventory batches for all items<br>
                    • Lock the order (no further status changes)
                </p>
                <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:14px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" id="inspect-confirm-deliver-btn">Confirm Delivery</button>
                </div>
            </div>
        `;
        App.openModal('Receive Order', html);
        document.getElementById('inspect-confirm-deliver-btn').onclick = async () => {
            App.closeModal();
            try {
                const result = await API.put(`/purchase-orders/${poId}/receive`);
                App.toast('Order received. Inventory batches created. Order is now LOCKED.', 'success');
                if (typeof App !== 'undefined' && App.addNotification) {
                    const itemCount = (result.items || []).length;
                    App.addNotification({
                        title: 'Stock Received',
                        message: `${result.poNumber || 'PO'}: ${itemCount} item(s) added to inventory`,
                        type: 'success',
                         action: { label: 'View Inventory', tab: 'inventory' }
                     });
                 }
                 const contentDiv = document.getElementById(`po-detail-content-${poId}`);
                 if (contentDiv) contentDiv.dataset.loaded = 'false';
                 if (typeof App !== 'undefined' && App.invalidateTabs) {
                     App.invalidateTabs('inventory', 'pos');
                 }
                 await this.loadPOs();
                 if (typeof Dashboard !== 'undefined') Dashboard.load();
            } catch (e) {
                App.toast('Failed: ' + (e.message || e), 'error');
            }
        };
    },

    async markPOAction(poId, actionType) {
        const labels = {
            'DAMAGED': 'Damaged',
            'LOST': 'Lost',
            'RETURNED': 'Return to Supplier'
        };
        const label = labels[actionType] || actionType;

        const html = `
            <div style="display:flex;flex-direction:column;gap:14px;">
                <p style="margin:0;color:var(--text-secondary);">
                     Mark this purchase order as <strong>${SafeHtml.escapeHtml(label)}</strong>. This will cancel the order.
                </p>
                <div class="form-group">
                    <label>Reason / Notes (optional)</label>
                     <textarea id="po-action-reason" class="form-control" rows="3" placeholder="Enter reason for ${SafeHtml.escapeAttribute(label.toLowerCase())}..."></textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:14px;">
                    <button type="button" class="btn btn-secondary" id="po-action-cancel">Cancel</button>
                     <button type="button" class="btn btn-danger" id="po-action-confirm">Confirm ${SafeHtml.escapeHtml(label)}</button>
                </div>
            </div>
        `;
        App.openModal(`Mark Order as ${label}`, html);

        document.getElementById('po-action-cancel').onclick = () => App.closeModal();
        document.getElementById('po-action-confirm').onclick = async () => {
            const reason = document.getElementById('po-action-reason').value.trim();
            App.closeModal();
            try {
                await API.put(`/purchase-orders/${poId}/status?status=CANCELLED`);
                App.toast(`Order marked as ${label}. Status set to CANCELLED.`, 'success');
                if (typeof App !== 'undefined' && App.addNotification) {
                    App.addNotification({
                        title: `PO ${label}`,
                        message: `Order action: ${label}${reason ? ' — ' + reason : ''}`,
                         type: 'warning'
                     });
                 }
                 const contentDiv = document.getElementById(`po-detail-content-${poId}`);
                 if (contentDiv) contentDiv.dataset.loaded = 'false';
                 if (typeof App !== 'undefined' && App.invalidateTabs) {
                     App.invalidateTabs('inventory', 'pos');
                 }
                 await this.loadPOs();
                 if (typeof Dashboard !== 'undefined') Dashboard.load();
            } catch (e) {
                App.toast('Failed: ' + (e.message || e), 'error');
            }
        };
    },

    openRecordPaymentModal(poId, supplierId, balance) {
        const html = `
            <div style="display:flex; flex-direction: column; gap: 14px;">
                <p style="margin:0; color:var(--text-secondary);">
                     Record a payment made to the supplier. Balance: <strong style="color:var(--accent-red);">${SafeHtml.escapeHtml(App.formatCurrency(balance))}</strong>
                </p>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Payment Date *</label>
                        <input type="date" id="pay-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required>
                    </div>
                    <div class="form-group">
                        <label>Amount *</label>
                         <input type="number" step="0.01" id="pay-amount" class="form-control" min="0.01" max="${SafeHtml.escapeAttribute(balance)}" value="${SafeHtml.escapeAttribute(balance.toFixed(2))}" required>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Payment Method</label>
                        <select id="pay-method" class="form-control">
                            <option value="CASH">Cash</option>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                            <option value="CHEQUE">Cheque</option>
                            <option value="CARD">Card</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Reference / Cheque #</label>
                        <input type="text" id="pay-ref" class="form-control" placeholder="e.g. CHQ-12345, TXN-...">
                    </div>
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea id="pay-notes" class="form-control" rows="2" placeholder="Optional notes"></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 12px; border-top:1px solid var(--border-color); padding-top:14px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                     <button type="button" class="btn btn-primary" onclick="Suppliers.submitPayment(${SafeHtml.inlineArgument(poId)}, ${SafeHtml.inlineArgument(supplierId)})">RECORD PAYMENT</button>
                </div>
            </div>
        `;
        App.openModal('Record Supplier Payment', html);
    },

    async submitPayment(poId, supplierId) {
        const payload = {
            purchaseOrderId: poId,
            supplierId: supplierId,
            paymentDate: document.getElementById('pay-date').value,
            amount: parseFloat(document.getElementById('pay-amount').value),
            paymentMethod: document.getElementById('pay-method').value,
            referenceNumber: document.getElementById('pay-ref').value.trim(),
            notes: document.getElementById('pay-notes').value.trim()
        };
        if (!payload.amount || payload.amount <= 0) {
            App.toast('Invalid amount', 'error');
            return;
        }
        try {
            await API.post('/supplier-payments', payload);
            App.toast('Payment recorded', 'success');
            App.closeModal();
             // Reload PO details
             const contentDiv = document.getElementById(`po-detail-content-${poId}`);
             if (contentDiv) {
                 contentDiv.dataset.loaded = 'false';
             }
             if (typeof App !== 'undefined' && App.invalidateTabs) {
                 App.invalidateTabs('history', 'inventory', 'pos');
             }
             await this.loadPOs();
             if (typeof Dashboard !== 'undefined') Dashboard.load();
        } catch (e) {
            App.toast('Failed to record payment: ' + e.message, 'error');
        }
    },

    // Print a purchase order document (safe to reprint anytime from history).
    async printPO(orderId) {
        try {
            const po = await API.get(`/purchase-orders/${orderId}`);
            const fmt = (val) => App.formatCurrency(parseFloat(val) || 0);
            const dateFn = (v) => this.fmtDate(v);
            const settings = (typeof AppSettings !== 'undefined') ? AppSettings.load() : {};
            const hospitalName = settings.hospitalName || 'MediCare Pharmacy';

            let itemRows = '';
            (po.items || []).forEach(item => {
                const up = parseFloat(item.unitPrice) || 0;
                const qty = parseInt(item.orderedQuantity) || 0;
                itemRows += `<tr>
                         <td style="padding:6px 8px;border:1px solid #ccc;">${SafeHtml.escapeHtml(item.drugName)}</td>
                         <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${SafeHtml.escapeHtml(qty)}</td>
                         <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;">${SafeHtml.escapeHtml(fmt(up))}</td>
                         <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;">${SafeHtml.escapeHtml(fmt(up * qty))}</td>
                    </tr>`;
            });

            const html = `
                <div style="max-width:640px;margin:0 auto;">
                    <div class="receipt-wrapper print-area" style="padding:28px;font-family:'Segoe UI',sans-serif;">
                        <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px;">
                             <h2 style="margin:0;font-size:20px;">${SafeHtml.escapeHtml(hospitalName)}</h2>
                             <div style="font-size:12px;margin-top:4px;">PURCHASE ORDER</div>
                             <div style="font-size:11px;color:var(--text-secondary);">${SafeHtml.escapeHtml(settings.address || '')} ${settings.phone ? '• Tel: ' + SafeHtml.escapeHtml(settings.phone) : ''}</div>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:12px;">
                            <div>
                                 <div><strong>PO Number:</strong> ${SafeHtml.escapeHtml(po.poNumber)}</div>
                                 <div><strong>Supplier:</strong> ${SafeHtml.escapeHtml(po.supplierName || 'N/A')}</div>
                                 <div><strong>Ordered By:</strong> ${SafeHtml.escapeHtml(po.orderedByName || 'System')}</div>
                            </div>
                            <div style="text-align:right;">
                                 <div><strong>Date:</strong> ${SafeHtml.escapeHtml(dateFn(po.orderDate))}</div>
                                 <div><strong>Expected Delivery:</strong> ${SafeHtml.escapeHtml(dateFn(po.expectedDeliveryDate))}</div>
                                 <div><strong>Status:</strong> ${SafeHtml.escapeHtml(String(po.status || 'PENDING').replace('_',' '))}</div>
                            </div>
                        </div>
                        <table style="width:100%;border-collapse:collapse;font-size:12px;">
                            <thead>
                                <tr style="background:#eee;font-weight:700;">
                                    <th style="padding:6px 8px;border:1px solid #ccc;text-align:left;">Medication</th>
                                    <th style="padding:6px 8px;border:1px solid #ccc;">Qty</th>
                                    <th style="padding:6px 8px;border:1px solid #ccc;text-align:right;">Unit Cost</th>
                                    <th style="padding:6px 8px;border:1px solid #ccc;text-align:right;">Total</th>
                                </tr>
                            </thead>
                            <tbody>${itemRows || '<tr><td colspan="4" style="padding:8px;border:1px solid #ccc;">No items</td></tr>'}</tbody>
                        </table>
                        <div style="text-align:right;font-size:14px;font-weight:700;margin-top:10px;">
                             PO TOTAL: ${SafeHtml.escapeHtml(fmt(po.totalAmount))}
                         </div>
                         ${po.notes ? `<div style="font-size:11px;margin-top:10px;"><strong>Notes:</strong> ${SafeHtml.escapeHtml(po.notes)}</div>` : ''}
                         <div style="font-size:10px;color:var(--text-muted);margin-top:14px;text-align:center;">PO Ref: ${SafeHtml.escapeHtml(po.poNumber)}-${SafeHtml.escapeHtml(po.orderId)}</div>
                    </div>
                     <div class="no-print" style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px;">
                         <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
                         <button class="btn btn-secondary" onclick="Suppliers.savePODoc(${SafeHtml.inlineArgument(po.orderId)})">Save PDF</button>
                     </div>
                </div>
            `;

            App.openModal(`${po.poNumber} — Purchase Order`, html);
            return this.printPODoc(orderId, po);
        } catch (e) {
            App.toast('Failed to load purchase order: ' + e.message, 'error');
        }
    },

    async savePODoc(orderId) {
        try {
            const po = await API.get(`/purchase-orders/${orderId}`);
            const lines = PO_PDF.build(po);
            const pdfString = PO_PDF.generatePdfBytes(lines);
            return PrintHelper.savePdf(PO_PDF.toBase64(pdfString), `PurchaseOrder-${po.poNumber}.pdf`);
        } catch (e) {
            App.toast('PDF generation failed: ' + (e && e.message ? e.message : String(e)), 'error');
            return 'ERROR';
        }
    },

    async printPODoc(orderId, existingPo) {
        try {
            const po = existingPo || await API.get(`/purchase-orders/${orderId}`);
            const lines = PO_PDF.build(po);
            const pdfString = PO_PDF.generatePdfBytes(lines);
            return PrintHelper.printDocument(
                PO_PDF.toBase64(pdfString),
                `PurchaseOrder-${po.poNumber}.pdf`,
                lines.join('\n')
            );
        } catch (e) {
            App.toast('Print failed: ' + (e && e.message ? e.message : String(e)), 'error');
            return 'ERROR';
        }
    },

    async openPOModal(prefillDrugId, prefillDrugName, prefillPrice) {
        try {
            const sData = await API.get('/suppliers?size=100');
            const suppliersList = (Array.isArray(sData) ? sData : (sData.content || [])).filter(s => s.isActive !== false);

            const dData = await API.get('/drugs?size=100');
            this.drugs = Array.isArray(dData) ? dData : (dData.content || []);

            if (suppliersList.length === 0) {
                App.toast('Please register at least one active supplier before creating a PO.', 'warning');
                return;
            }

             let supplierOptions = suppliersList.map(s => `<option value="${SafeHtml.escapeAttribute(s.supplierId)}">${SafeHtml.escapeHtml(s.supplierName)}</option>`).join('');
            this.selectedPOItems = [];

            // If a drug is pre-filled, add it as a line item
            if (prefillDrugId && prefillPrice) {
                this.selectedPOItems = [{
                    drugId: prefillDrugId,
                    drugName: prefillDrugName,
                    quantity: 50,
                    unitPrice: prefillPrice
                }];
            }

            const html = `
                <div style="display:flex;flex-direction:column;gap:20px;">
                    <form id="po-create-form" style="display:flex;flex-direction:column;gap:15px;">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Target Supplier</label>
                                <select id="po-supplier-id" class="form-control" required>${supplierOptions}</select>
                            </div>
                            <div class="form-group">
                                <label>Estimated Delivery Date</label>
                                <input type="date" id="po-delivery-date" class="form-control" required value="${new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Notes / Instructions</label>
                            <input type="text" id="po-notes" class="form-control" placeholder="Shipping terms, urgent requirements...">
                        </div>
                    </form>

                    <div style="border-top:1px solid var(--border-color);padding-top:15px;">
                        <h4 style="color:var(--accent-purple);margin-bottom:10px;">Add Medications</h4>
                        <div class="form-grid" style="align-items:flex-end;gap:10px;">
                            <div class="form-group" style="flex:2;">
                                <label>Drug</label>
                                <select id="po-add-drug-id" class="form-control"></select>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label>Quantity</label>
                                <input type="number" id="po-add-qty" class="form-control" min="1" value="100">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label>Unit Price ($)</label>
                                <input type="number" step="0.01" id="po-add-price" class="form-control" placeholder="0.00">
                            </div>
                            <button type="button" class="btn btn-primary" onclick="Suppliers.addPOItemRow()" style="height:42px;">Add</button>
                        </div>
                        <div class="table-container" style="margin-top:15px;max-height:180px;overflow-y:auto;">
                            <table class="premium-table" style="font-size:13px;">
                                <thead><tr><th>Medication</th><th>Qty</th><th>Unit Cost</th><th>Total</th><th>Remove</th></tr></thead>
                                <tbody id="po-builder-rows">
                                    <tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No items added yet.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:15px;">
                        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="Suppliers.submitPO()">DISPATCH PURCHASE ORDER</button>
                    </div>
                </div>
            `;

            App.openModal('Dispatch New Purchase Order', html);

            const drugSelect = document.getElementById('po-add-drug-id');
             drugSelect.innerHTML = this.drugs.filter(d => d.isActive).map(d => `<option value="${SafeHtml.escapeAttribute(d.drugId)}">${SafeHtml.escapeHtml(d.drugName)}</option>`).join('');

            const updatePrice = () => {
                const d = this.drugs.find(d => d.drugId === parseInt(drugSelect.value));
                if (d && d.mrp) document.getElementById('po-add-price').value = (d.mrp * 0.7).toFixed(2);
            };
            drugSelect.addEventListener('change', updatePrice);
            updatePrice();
        } catch (e) {
            App.toast('Failed to launch PO creator: ' + e.message, 'error');
        }
    },

    addPOItemRow() {
        const drugId    = parseInt(document.getElementById('po-add-drug-id').value);
        const qty       = parseInt(document.getElementById('po-add-qty').value);
        const unitPrice = parseFloat(document.getElementById('po-add-price').value);

        if (isNaN(qty) || qty <= 0)       { App.toast('Enter a valid quantity.', 'warning');   return; }
        if (isNaN(unitPrice) || unitPrice <= 0) { App.toast('Enter a valid price.', 'warning'); return; }

        const drug = this.drugs.find(d => d.drugId === drugId);
        if (!drug) return;

        const existing = this.selectedPOItems.find(i => i.drugId === drugId);
        if (existing) {
            existing.orderedQuantity += qty;
            existing.totalPrice = existing.orderedQuantity * existing.unitPrice;
        } else {
            this.selectedPOItems.push({ drugId, drugName: drug.drugName, orderedQuantity: qty, unitPrice, totalPrice: qty * unitPrice });
        }
        this.renderPOBuilderRows();
    },

    removePOItemRow(index) {
        this.selectedPOItems.splice(index, 1);
        this.renderPOBuilderRows();
    },

    renderPOBuilderRows() {
        const tbody = document.getElementById('po-builder-rows');
        tbody.innerHTML = '';
        if (this.selectedPOItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No items added yet.</td></tr>`;
            return;
        }
        this.selectedPOItems.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                 <td style="font-weight:600;">${SafeHtml.escapeHtml(item.drugName)}</td>
                 <td>${SafeHtml.escapeHtml(item.orderedQuantity)} units</td>
                 <td style="font-family:var(--font-mono);">$${SafeHtml.escapeHtml(item.unitPrice.toFixed(2))}</td>
                 <td style="font-family:var(--font-mono);font-weight:700;color:var(--accent-green);">$${SafeHtml.escapeHtml(item.totalPrice.toFixed(2))}</td>
                 <td><button class="btn btn-danger btn-sm" onclick="Suppliers.removePOItemRow(${SafeHtml.inlineArgument(i)})">Remove</button></td>
            `;
            tbody.appendChild(tr);
        });
    },

    async submitPO() {
        if (this.selectedPOItems.length === 0) { App.toast('Add at least one medication.', 'warning'); return; }

        // Robust guard against double-submit — use a module-level flag
        if (this._submittingPO) return;
        this._submittingPO = true;

        const dispatchBtn = document.querySelector('[onclick="Suppliers.submitPO()"]');
        if (dispatchBtn) {
            dispatchBtn.disabled = true;
            dispatchBtn.textContent = 'Dispatching…';
        }

        const supplierId           = document.getElementById('po-supplier-id').value;
        const expectedDeliveryDate = document.getElementById('po-delivery-date').value;
        const notes                = document.getElementById('po-notes').value;
        const userInfo             = API.getUserInfo();

        const payload = {
            supplierId:   parseInt(supplierId),
            orderedById:  userInfo?.userId || 1,
            orderDate:    new Date().toISOString().split('T')[0],
            expectedDeliveryDate,
            notes,
            status: 'PENDING',
            items: this.selectedPOItems
        };

        try {
            await API.post('/purchase-orders', payload);
            App.toast('Purchase Order dispatched successfully.', 'success');
            this._submittingPO = false;
            App.closeModal();
            await this.loadPOs();
        } catch (e) {
            App.toast(`Dispatch failed: ${e.message}`, 'error');
            this._submittingPO = false;
            if (dispatchBtn) {
                dispatchBtn.disabled = false;
                dispatchBtn.textContent = 'DISPATCH PURCHASE ORDER';
            }
        }
    }
};

// ─────────────────────────────────────────────
// APPLICATION SETTINGS
// ─────────────────────────────────────────────
const AppSettings = {
    // In-memory cache — loaded once at startup from the backend
    _cache: null,

    _defaults() {
        return {
            hospitalName:   'MediCare Pharmacy',
            ownerName:      '',
            address:        '',
            phone:          '',
            email:          '',
            invoiceFooter:  'Thank you for choosing us. Get well soon!',
            currencySymbol: '$',
            taxLabel:       'GST',
            licenseNumber:  '',
        };
    },

    /** Load settings from backend (persisted in ~/.medicare/app-settings.json) */
    async fetchFromServer() {
        try {
            const data = await API.get('/settings');
            this._cache = { ...this._defaults(), ...data };
        } catch (e) {
            console.error('Could not load app settings from server, using defaults:', e.message);
            this._cache = this._defaults();
        }
        return this._cache;
    },

    /**
     * Synchronous read from in-memory cache.
     * Falls back to defaults if cache is not yet populated.
     * Always call fetchFromServer() first (done at login time).
     */
    load() {
        return this._cache ? { ...this._cache } : this._defaults();
    },

    get(key) {
        const s = this.load();
        return s[key] ?? this._defaults()[key];
    },

    /** Save settings to backend and update in-memory cache */
    async saveToServer(settings) {
        const merged = { ...this._defaults(), ...settings };
        try {
            const saved = await API.post('/settings', merged);
            this._cache = { ...this._defaults(), ...saved };
            return true;
        } catch (e) {
            console.error('Failed to save app settings:', e.message);
            throw e;
        }
    },

    openModal() {
        const s = this.load();
        const html = `
            <div style="display:flex;flex-direction:column;gap:18px;">
                <div style="display:flex;justify-content:flex-start;gap:8px;font-size:13px;color:var(--text-muted);border-bottom:1px solid var(--border-color);padding-bottom:12px;">
                    <span>Build By <strong style="color:var(--text-primary);">Zohaib Asghar</strong></span>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Hospital / Pharmacy Name</label>
                         <input type="text" id="set-hospital-name" class="form-control" value="${SafeHtml.escapeAttribute(s.hospitalName)}" placeholder="e.g. MediCare Pharmacy">
                    </div>
                    <div class="form-group">
                        <label>Owner / Proprietor Name</label>
                         <input type="text" id="set-owner-name" class="form-control" value="${SafeHtml.escapeAttribute(s.ownerName || '')}" placeholder="e.g. Dr. John Smith">
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>License / Registration Number</label>
                         <input type="text" id="set-license" class="form-control" value="${SafeHtml.escapeAttribute(s.licenseNumber)}" placeholder="e.g. PH-2024-00142">
                    </div>
                    <div class="form-group">
                        <label>Address</label>
                         <input type="text" id="set-address" class="form-control" value="${SafeHtml.escapeAttribute(s.address)}" placeholder="Full pharmacy address">
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Phone Number</label>
                         <input type="text" id="set-phone" class="form-control" value="${SafeHtml.escapeAttribute(s.phone)}" placeholder="+1 555 000 0000">
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                         <input type="email" id="set-email" class="form-control" value="${SafeHtml.escapeAttribute(s.email)}" placeholder="info@pharmacy.com">
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Currency Symbol</label>
                        <select id="set-currency" class="form-control">
                            <option value="$" ${s.currencySymbol === '$' ? 'selected' : ''}>$ — US Dollar — United States</option>
                            <option value="€" ${s.currencySymbol === '€' ? 'selected' : ''}>€ — Euro — European Union</option>
                            <option value="£" ${s.currencySymbol === '£' ? 'selected' : ''}>£ — British Pound — United Kingdom</option>
                            <option value="PKR" ${s.currencySymbol === 'PKR' ? 'selected' : ''}>PKR — Pakistani Rupee — Pakistan</option>
                            <option value="INR" ${s.currencySymbol === 'INR' ? 'selected' : ''}>INR — Indian Rupee — India</option>
                            <option value="AED" ${s.currencySymbol === 'AED' ? 'selected' : ''}>AED — UAE Dirham — UAE</option>
                            <option value="SAR" ${s.currencySymbol === 'SAR' ? 'selected' : ''}>SAR — Saudi Riyal — Saudi Arabia</option>
                            <option value="CAD" ${s.currencySymbol === 'CAD' ? 'selected' : ''}>CAD — Canadian Dollar — Canada</option>
                            <option value="AUD" ${s.currencySymbol === 'AUD' ? 'selected' : ''}>AUD — Australian Dollar — Australia</option>
                            <option value="JPY" ${s.currencySymbol === 'JPY' ? 'selected' : ''}>JPY — Japanese Yen — Japan</option>
                            <option value="CNY" ${s.currencySymbol === 'CNY' ? 'selected' : ''}>CNY — Chinese Yuan — China</option>
                            <option value="TRY" ${s.currencySymbol === 'TRY' ? 'selected' : ''}>TRY — Turkish Lira — Turkey</option>
                            <option value="NGN" ${s.currencySymbol === 'NGN' ? 'selected' : ''}>NGN — Nigerian Naira — Nigeria</option>
                            <option value="BRL" ${s.currencySymbol === 'BRL' ? 'selected' : ''}>BRL — Brazilian Real — Brazil</option>
                            <option value="ZAR" ${s.currencySymbol === 'ZAR' ? 'selected' : ''}>ZAR — South African Rand — South Africa</option>
                             <option value="${SafeHtml.escapeAttribute(s.currencySymbol)}" ${!['$','€','£','PKR','INR','AED','SAR','CAD','AUD','JPY','CNY','TRY','NGN','BRL','ZAR'].includes(s.currencySymbol) ? 'selected' : ''}>${SafeHtml.escapeHtml(s.currencySymbol)} — Custom</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Tax Label (on invoices)</label>
                         <input type="text" id="set-tax-label" class="form-control" value="${SafeHtml.escapeAttribute(s.taxLabel)}" placeholder="GST / VAT / Tax">
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Default GST Rate (%)</label>
                         <input type="number" step="0.1" min="0" max="100" id="set-default-gst" class="form-control" value="${SafeHtml.escapeAttribute(s.defaultGstRate || 12)}" placeholder="12.0">
                    </div>
                    <div class="form-group">
                        <label>Invoice Footer Message</label>
                         <input type="text" id="set-invoice-footer" class="form-control" value="${SafeHtml.escapeAttribute(s.invoiceFooter)}" placeholder="Thank you message shown on receipts">
                    </div>
                </div>

                <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:15px;margin-top:10px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" id="settings-save-btn" onclick="AppSettings.saveFromForm()">SAVE SETTINGS</button>
                </div>
            </div>
        `;
        App.openModal('Application Settings', html);
    },

    async saveFromForm() {
        const btn = document.getElementById('settings-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

        const updated = {
            hospitalName:   document.getElementById('set-hospital-name').value.trim(),
            ownerName:      document.getElementById('set-owner-name').value.trim(),
            licenseNumber:  document.getElementById('set-license').value.trim(),
            address:        document.getElementById('set-address').value.trim(),
            phone:          document.getElementById('set-phone').value.trim(),
            email:          document.getElementById('set-email').value.trim(),
            currencySymbol: document.getElementById('set-currency').value.trim() || '$',
            taxLabel:       document.getElementById('set-tax-label').value.trim() || 'GST',
            invoiceFooter:  document.getElementById('set-invoice-footer').value.trim(),
            defaultGstRate: parseFloat(document.getElementById('set-default-gst').value) || 12.0
        };

        try {
            await this.saveToServer(updated);
            App.closeModal();
            App.toast('Settings saved successfully.', 'success');
            if (typeof App !== 'undefined' && App.activeTab) {
                App.loadTabContents(App.activeTab, { force: true });
            }
        } catch (e) {
            App.toast('Failed to save settings: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'SAVE SETTINGS'; }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const search = document.getElementById('suppliers-search');
    if (search) {
        search.addEventListener('input', App.debounce((e) => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('#suppliers-table-body tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        }));
    }
});
