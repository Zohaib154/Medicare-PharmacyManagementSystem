const Inventory = {
    batches: [],
    drugs: [],
    suppliers: [],
    currentPage: 0,
    totalPages: 1,
    _loadPromise: null,

    async load() {
        if (typeof App !== 'undefined' && App.activeTab === 'backup' && App.invalidateTabs) App.invalidateTabs('dashboard', 'pos');
        return this.fetchInventory();
    },

    async fetchInventory() {
        if (this._loadPromise) return this._loadPromise;
        const promise = (async () => {
            try {
                const data = await API.get(`/inventory?page=${this.currentPage}&size=10`);
                this.batches = Array.isArray(data) ? data : (data.content || []);
                this.totalPages = data.totalPages || 1;
                await this.renderList();
                return true;
            } catch (e) {
                App.toast('Failed to load inventory batches.', 'error');
                return false;
            }
        })();
        this._loadPromise = promise;
        promise.finally(() => {
            if (this._loadPromise === promise) this._loadPromise = null;
        }).catch(() => {});
        return promise;
    },

    async renderList() {
        const tbody = document.getElementById('inv-table-body');
        if (!tbody) return;
        if (this.batches.length === 0) {
            await App.renderRows(tbody, [], () => null, {
                emptyHtml: `
                    <tr>
                        <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">
                            No stock batches found in inventory.
                        </td>
                    </tr>
                `
            });
            this.renderPagination();
            return;
        }

        const fmt = (val) => App.formatCurrency(val);
        await App.renderRows(tbody, this.batches, b => {
            const tr = document.createElement('tr');
            let statusBadge = 'badge-green';
            if (b.stockStatus === 'EXPIRED') statusBadge = 'badge-red';
            if (b.stockStatus === 'OUT_OF_STOCK') statusBadge = 'badge-red';
            if (b.stockStatus === 'LOW_STOCK') statusBadge = 'badge-orange';
            if (b.stockStatus === 'RECALLED') statusBadge = 'badge-muted';
            const expDate = new Date(b.expiryDate).toLocaleDateString();
            const showReorder = b.stockStatus === 'LOW_STOCK' || b.stockStatus === 'OUT_OF_STOCK';
            const reorderBtn = showReorder ? `
                <button class="btn btn-sm btn-secondary" title="Create purchase order" onclick="Inventory.quickReorder(${SafeHtml.inlineArgument(b.drugId)}, ${SafeHtml.inlineArgument(b.drugName)})">
                    Reorder
                </button>
            ` : '<span style="font-size:11px;color:var(--text-muted);">—</span>';
            const actionBtns = `
                <div style="display:flex; gap:6px; align-items:center;">
                    ${reorderBtn}
                    <button class="btn btn-sm btn-secondary" title="Edit batch" onclick="Inventory.openEditModal(${SafeHtml.inlineArgument(b.inventoryId)})">
                        <svg style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    ${b.quantityInStock > 0
                        ? `<button class="btn btn-sm btn-danger" title="Mark as lost/damaged" onclick="Inventory.openDamagedModal(${SafeHtml.inlineArgument(b.inventoryId)}, ${SafeHtml.inlineArgument(b.batchNumber)}, ${SafeHtml.inlineArgument(b.quantityInStock)})">
                            <svg style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                           </button>`
                        : `<button class="btn btn-sm btn-secondary" title="Archive empty batch" onclick="Inventory.archiveBatch(${SafeHtml.inlineArgument(b.inventoryId)}, ${SafeHtml.inlineArgument(b.batchNumber)})">
                            Archive
                           </button>`
                    }
                </div>`;
            tr.innerHTML = `
                <td style="font-weight: 600;">${SafeHtml.escapeHtml(b.drugName)}</td>
                <td style="font-family: var(--font-mono); font-weight: 600;">${SafeHtml.escapeHtml(b.batchNumber)}</td>
                <td style="font-weight: 600;">${SafeHtml.escapeHtml(b.quantityInStock)} units</td>
                <td style="font-family: var(--font-mono);">${SafeHtml.escapeHtml(expDate)}</td>
                <td style="font-family: var(--font-mono); color: var(--text-secondary);">${SafeHtml.escapeHtml(fmt(b.purchasePrice))}</td>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-blue);">${SafeHtml.escapeHtml(fmt(b.sellingPrice))}</td>
                <td><span class="badge badge-muted">${SafeHtml.escapeHtml(b.storageLocation || 'Aisle 1')}</span></td>
                <td><span class="badge ${statusBadge}">${SafeHtml.escapeHtml(b.stockStatus)}</span></td>
                <td style="text-align: center;">${actionBtns}</td>
            `;
            return tr;
        });
        this.renderPagination();
    },

    renderPagination() {
        const table = document.querySelector('#inv-table-body')?.closest('.table-container');
        if (!table) return;
        let controls = document.getElementById('inv-pagination');
        if (controls) controls.remove();
        if (this.totalPages <= 1) return;
        controls = document.createElement('div');
        controls.id = 'inv-pagination';
        controls.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:12px;padding:12px 0;';
        controls.innerHTML = `
            <button class="btn btn-secondary btn-sm" ${this.currentPage === 0 ? 'disabled' : ''}>Previous</button>
            <span style="font-size:13px;color:var(--text-secondary);">Page ${SafeHtml.escapeHtml(this.currentPage + 1)} of ${SafeHtml.escapeHtml(this.totalPages)}</span>
            <button class="btn btn-secondary btn-sm" ${this.currentPage + 1 >= this.totalPages ? 'disabled' : ''}>Next</button>`;
        controls.children[0].onclick = () => { this.currentPage--; this.fetchInventory(); };
        controls.children[2].onclick = () => { this.currentPage++; this.fetchInventory(); };
        table.parentNode.appendChild(controls);
    },

    async quickReorder(drugId, drugName) {
        try {
            // Get drug details for default reorder quantity
            const drug = await API.get('/drugs/' + drugId);
            // Switch to purchase orders tab and pre-fill the PO with this drug
            if (typeof App !== 'undefined' && App.switchTab) {
                App.switchTab('suppliers');
            }
            // Open PO modal with the drug pre-selected
            setTimeout(() => {
                if (typeof Suppliers !== 'undefined' && typeof Suppliers.openPOModal === 'function') {
                    Suppliers.openPOModal(drug.drugId, drug.drugName, drug.mrp || 100);
                } else {
                    App.toast('Please use the Purchase Orders tab to create an order for ' + drugName, 'info');
                }
            }, 300);
        } catch (e) {
            App.toast('Failed to load drug: ' + e.message, 'error');
        }
    },

    async openEditModal(inventoryId) {
        try {
            const batch = this.batches.find(b => b.inventoryId === inventoryId);
            if (!batch) {
                App.toast('Batch not found', 'error');
                return;
            }

            // Ensure drugs and suppliers are loaded
            if (!this.drugs || this.drugs.length === 0) {
                const drugsData = await API.get('/drugs?size=100');
                this.drugs = Array.isArray(drugsData) ? drugsData : (drugsData.content || []);
            }
            if (!this.suppliers || this.suppliers.length === 0) {
                const suppliersData = await API.get('/suppliers?size=100');
                this.suppliers = Array.isArray(suppliersData) ? suppliersData : (suppliersData.content || []);
            }

             let drugOptions = '';
             this.drugs.forEach(d => {
                 const selected = d.drugId === batch.drugId ? 'selected' : '';
                 drugOptions += `<option value="${SafeHtml.escapeAttribute(d.drugId)}" ${selected}>${SafeHtml.escapeHtml(d.drugName)}</option>`;
             });

             let supplierOptions = '<option value="">No Supplier</option>';
             this.suppliers.forEach(s => {
                 const selected = s.supplierId === batch.supplierId ? 'selected' : '';
                 supplierOptions += `<option value="${SafeHtml.escapeAttribute(s.supplierId)}" ${selected}>${SafeHtml.escapeHtml(s.supplierName)}</option>`;
             });

            const html = `
                <form id="inv-edit-form" style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Medication / Drug</label>
                            <select id="edit-inv-drug-id" class="form-control" required>
                                ${drugOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Batch Number</label>
                             <input type="text" id="edit-inv-batch-no" class="form-control" required value="${SafeHtml.escapeAttribute(batch.batchNumber)}">

                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Quantity In Stock</label>
                             <input type="number" id="edit-inv-quantity" class="form-control" min="0" value="${SafeHtml.escapeAttribute(batch.quantityInStock)}" required>

                        </div>
                        <div class="form-group">
                            <label>Reorder Level</label>
                             <input type="number" id="edit-inv-reorder" class="form-control" min="0" value="${SafeHtml.escapeAttribute(batch.reorderLevel || 20)}" required>

                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Manufacturing Date</label>
                             <input type="date" id="edit-inv-mfg-date" class="form-control" value="${SafeHtml.escapeAttribute(batch.manufacturingDate || '')}">

                        </div>
                        <div class="form-group">
                            <label>Expiry Date</label>
                             <input type="date" id="edit-inv-expiry-date" class="form-control" required value="${SafeHtml.escapeAttribute(batch.expiryDate)}">

                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Purchase Price</label>
                             <input type="number" step="0.01" id="edit-inv-purchase-price" class="form-control" value="${SafeHtml.escapeAttribute(batch.purchasePrice || 0)}" required>

                        </div>
                        <div class="form-group">
                            <label>Selling Price (MRP)</label>
                             <input type="number" step="0.01" id="edit-inv-selling-price" class="form-control" value="${SafeHtml.escapeAttribute(batch.sellingPrice || 0)}" required>

                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Shelf / Storage</label>
                             <input type="text" id="edit-inv-location" class="form-control" value="${SafeHtml.escapeAttribute(batch.storageLocation || '')}">

                        </div>
                        <div class="form-group">
                            <label>Supplier</label>
                            <select id="edit-inv-supplier-id" class="form-control">
                                ${supplierOptions}
                            </select>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 12px; border-top:1px solid var(--border-color); padding-top:15px;">
                        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">SAVE CHANGES</button>
                    </div>
                </form>
            `;
            App.openModal('Edit Inventory Batch - ' + batch.batchNumber, html);
            document.getElementById('inv-edit-form').addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitEditBatch(inventoryId);
            });
        } catch (e) {
            App.toast('Failed to load batch: ' + e.message, 'error');
        }
    },

    async submitEditBatch(inventoryId) {
        const payload = {
            drugId: parseInt(document.getElementById('edit-inv-drug-id').value),
            supplierId: document.getElementById('edit-inv-supplier-id').value ? parseInt(document.getElementById('edit-inv-supplier-id').value) : null,
            batchNumber: document.getElementById('edit-inv-batch-no').value,
            quantityInStock: parseInt(document.getElementById('edit-inv-quantity').value),
            reorderLevel: parseInt(document.getElementById('edit-inv-reorder').value),
            manufacturingDate: document.getElementById('edit-inv-mfg-date').value,
            expiryDate: document.getElementById('edit-inv-expiry-date').value,
            purchasePrice: parseFloat(document.getElementById('edit-inv-purchase-price').value),
            sellingPrice: parseFloat(document.getElementById('edit-inv-selling-price').value),
            storageLocation: document.getElementById('edit-inv-location').value
        };
        try {
            await API.put('/inventory/' + inventoryId, payload);
            App.toast('Inventory batch updated', 'success');
            App.closeModal();
            if (typeof App !== 'undefined' && App.invalidateTabs) {
                App.invalidateTabs('pos');
            }
            await this.load();
            Dashboard.load();
        } catch (e) {
            App.toast('Update failed: ' + e.message, 'error');
        }
    },

    async openDamagedModal(inventoryId, batchNumber, currentQty) {
        const html = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <p style="margin:0; color:var(--text-secondary);">
                    Remove stock from batch <strong style="font-family:var(--font-mono);">${SafeHtml.escapeHtml(batchNumber)}</strong>.
                    Current stock: <strong>${SafeHtml.escapeHtml(currentQty)} units</strong>.
                </p>
                <div class="form-group">
                    <label>Reason for removal *</label>
                    <select id="damaged-reason" class="form-control">
                        <option value="DAMAGED">Damaged</option>
                        <option value="EXPIRED">Expired</option>
                        <option value="LOST">Lost / Stolen</option>
                        <option value="RECALLED">Manufacturer Recall</option>
                        <option value="OTHER">Other (specify below)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Quantity to remove *</label>
                    <input type="number" id="damaged-qty" class="form-control" min="1" max="${SafeHtml.escapeAttribute(currentQty)}" value="${SafeHtml.escapeAttribute(currentQty)}" required>
                </div>
                <div class="form-group">
                    <label>Notes (optional)</label>
                    <textarea id="damaged-notes" class="form-control" rows="2" placeholder="Add details about this removal..."></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 12px; border-top:1px solid var(--border-color); padding-top:15px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                     <button type="button" class="btn btn-danger" onclick="Inventory.submitDamaged(${SafeHtml.inlineArgument(inventoryId)}, ${SafeHtml.inlineArgument(currentQty)})">REMOVE STOCK</button>
                </div>
            </div>
        `;
        App.openModal('Stock Write-off - ' + batchNumber, html);
    },

    async submitDamaged(inventoryId, currentQty) {
        const qtyEl = document.getElementById('damaged-qty');
        const reasonEl = document.getElementById('damaged-reason');
        const notesEl = document.getElementById('damaged-notes');
        if (!qtyEl || !reasonEl) {
            App.toast('Form error — please reopen the dialog', 'error');
            return;
        }
        const qty = parseInt(qtyEl.value);
        const reason = reasonEl.value;
        const notes = notesEl ? notesEl.value : '';
        if (!qty || qty <= 0) {
            App.toast('Quantity must be at least 1', 'error');
            return;
        }
        if (qty > currentQty) {
            App.toast('Cannot remove more than available stock (' + currentQty + ')', 'error');
            return;
        }
        const reasonLabel = reasonEl.options[reasonEl.selectedIndex].text;
        const html = `
            <div style="display:flex;flex-direction:column;gap:14px;">
                <p style="margin:0;color:var(--text-secondary);">
                    Remove <strong>${SafeHtml.escapeHtml(qty)}</strong> unit(s) as <strong>${SafeHtml.escapeHtml(reasonLabel)}</strong>?
                </p>
                <p style="margin:0;color:var(--text-muted);font-size:13px;">This action is logged in the audit trail and cannot be undone.</p>
                <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:14px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button type="button" class="btn btn-danger" id="confirm-writeoff-btn">Confirm Removal</button>
                </div>
            </div>
        `;
        App.openModal('Confirm Stock Write-off', html);
        document.getElementById('confirm-writeoff-btn').onclick = async () => {
            App.closeModal();
            try {
                const result = await API.post('/inventory/' + inventoryId + '/writeoff', {
                    quantity: qty,
                    reason: reason,
                    notes: notes
                });
                App.toast(`${qty} unit(s) removed as ${reason}`, 'success');
                if (typeof App !== 'undefined' && App.addNotification) {
                    App.addNotification({
                        title: 'Stock Removed',
                        message: `${qty} unit(s) written off as ${reason}`,
                        type: 'warning'
                    });
                }
                if (typeof App !== 'undefined' && App.invalidateTabs) {
                    App.invalidateTabs('pos');
                }
                await this.load();
                if (typeof Dashboard !== 'undefined') Dashboard.load();
            } catch (e) {
                App.toast('Write-off failed: ' + (e.message || e), 'error');
            }
        };
    },

    async archiveBatch(inventoryId, batchNumber) {
        const html = `
            <div style="display:flex;flex-direction:column;gap:14px;">
                <p style="margin:0;color:var(--text-secondary);">
                    Archive empty batch <strong style="font-family:var(--font-mono);">${SafeHtml.escapeHtml(batchNumber)}</strong>?
                    <br>This will remove it from the active inventory list.
                </p>
                <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:14px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" id="confirm-archive-btn">Archive</button>
                </div>
            </div>
        `;
        App.openModal('Archive Empty Batch', html);
        document.getElementById('confirm-archive-btn').onclick = async () => {
            App.closeModal();
            try {
                await API.post('/inventory/' + inventoryId + '/archive');
                App.toast('Batch archived successfully', 'success');
                if (typeof App !== 'undefined' && App.invalidateTabs) {
                    App.invalidateTabs('pos');
                }
                await this.load();
                if (typeof Dashboard !== 'undefined') Dashboard.load();
            } catch (e) {
                App.toast('Archive failed: ' + (e.message || e), 'error');
            }
        };
    },

    async openAddModal() {
        try {
            // Fetch dependencies
            const drugsData = await API.get('/drugs?size=100');
            this.drugs = Array.isArray(drugsData) ? drugsData : (drugsData.content || []);

            const suppliersData = await API.get('/suppliers?size=100');
            this.suppliers = Array.isArray(suppliersData) ? suppliersData : (suppliersData.content || []);

            let drugOptions = '';
            this.drugs.forEach(d => {
                if (d.isActive) {
                     drugOptions += `<option value="${SafeHtml.escapeAttribute(d.drugId)}">${SafeHtml.escapeHtml(d.drugName)} (MRP: ${SafeHtml.escapeHtml(App.formatCurrency(d.mrp))})</option>`;
                }
            });

            let supplierOptions = '<option value="">No Supplier</option>';
            this.suppliers.forEach(s => {
                 supplierOptions += `<option value="${SafeHtml.escapeAttribute(s.supplierId)}">${SafeHtml.escapeHtml(s.supplierName)}</option>`;
            });

            const html = `
                <form id="inv-create-form" style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Medication / Drug</label>
                            <select id="inv-drug-id" class="form-control" required>
                                ${drugOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Batch Number</label>
                            <input type="text" id="inv-batch-no" class="form-control" placeholder="e.g. BATCH-2026-X" required>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label>Quantity In Stock</label>
                            <input type="number" id="inv-quantity" class="form-control" min="1" value="100" required>
                        </div>
                        <div class="form-group">
                            <label>Reorder Level (Alert Limit)</label>
                            <input type="number" id="inv-reorder" class="form-control" min="1" value="20" required>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label>Manufacturing Date</label>
                            <input type="date" id="inv-mfg-date" class="form-control" required value="${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label>Expiry Date</label>
                            <input type="date" id="inv-expiry-date" class="form-control" required value="${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}">
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label>Purchase Price (Buying rate)</label>
                            <input type="number" step="0.01" id="inv-purchase-price" class="form-control" placeholder="0.00" required>
                        </div>
                        <div class="form-group">
                            <label>Selling Price (Selling rate / MRP)</label>
                            <input type="number" step="0.01" id="inv-selling-price" class="form-control" placeholder="0.00" required>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label>Shelf / Storage Location</label>
                            <input type="text" id="inv-location" class="form-control" placeholder="e.g. Shelf A-4" value="Shelf A-1">
                        </div>
                        <div class="form-group">
                            <label>Supplier / Vendor</label>
                            <select id="inv-supplier-id" class="form-control">
                                ${supplierOptions}
                            </select>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 12px; border-top:1px solid var(--border-color); padding-top:15px;">
                        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">ADD STOCK BATCH</button>
                    </div>
                </form>
            `;

            App.openModal('Add New Inventory Stock Batch', html);

            // Populate default pricing based on selected drug
            const drugSelect = document.getElementById('inv-drug-id');
            const updatePricing = () => {
                const selectedDrugId = parseInt(drugSelect.value);
                const drugObj = this.drugs.find(d => d.drugId === selectedDrugId);
                if (drugObj) {
                    // Set default selling price to drug's MRP
                    document.getElementById('inv-selling-price').value = drugObj.mrp.toFixed(2);
                    // Default buying price to 70% of MRP
                    document.getElementById('inv-purchase-price').value = (drugObj.mrp * 0.7).toFixed(2);
                }
            };
            
            drugSelect.addEventListener('change', updatePricing);
            updatePricing(); // Run once initially

            // Form submit binder
            document.getElementById('inv-create-form').addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitNewStock();
            });

        } catch (e) {
            App.toast('Failed to load stock entry form.', 'error');
        }
    },

    async submitNewStock() {
        const drugId = document.getElementById('inv-drug-id').value;
        const supplierId = document.getElementById('inv-supplier-id').value;
        const batchNumber = document.getElementById('inv-batch-no').value;
        const quantityInStock = document.getElementById('inv-quantity').value;
        const reorderLevel = document.getElementById('inv-reorder').value;
        const manufacturingDate = document.getElementById('inv-mfg-date').value;
        const expiryDate = document.getElementById('inv-expiry-date').value;
        const purchasePrice = document.getElementById('inv-purchase-price').value;
        const sellingPrice = document.getElementById('inv-selling-price').value;
        const storageLocation = document.getElementById('inv-location').value;

        const payload = {
            drugId: parseInt(drugId),
            supplierId: supplierId ? parseInt(supplierId) : null,
            batchNumber,
            quantityInStock: parseInt(quantityInStock),
            reorderLevel: parseInt(reorderLevel),
            manufacturingDate,
            expiryDate,
            purchasePrice: parseFloat(purchasePrice),
            sellingPrice: parseFloat(sellingPrice),
            storageLocation
        };

        try {
            await API.post('/inventory', payload);
            App.toast(`Stock batch ${batchNumber} added to inventory.`, 'success');
            App.closeModal();
            if (typeof App !== 'undefined' && App.invalidateTabs) {
                App.invalidateTabs('pos');
            }
            await this.load();
            Dashboard.load();
        } catch (e) {
            App.toast(`Adding stock failed: ${e.message}`, 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Bind search bar filter
    const search = document.getElementById('inv-search');
    if (search) {
        search.addEventListener('input', App.debounce((e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('#inv-table-body tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
            });
        }));
    }
});

const StockArchive = {
    records: [],

    async load() {
        try {
            const data = await API.get('/stock-archive?size=100');
            this.records = data.content || [];
            this.renderModal();
        } catch (e) {
            App.toast('Failed to load stock archive', 'error');
        }
    },

    renderModal() {
        let rows = '';
        if (this.records.length === 0) {
            rows = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px;">No archived records found</td></tr>`;
        } else {
            this.records.forEach(r => {
                const date = r.removalDate ? new Date(r.removalDate).toLocaleDateString() : 'N/A';
                rows += `
                    <tr>
                        <td style="font-weight:600;">${SafeHtml.escapeHtml(r.drugName || 'N/A')}</td>
                        <td style="font-family:var(--font-mono);">${SafeHtml.escapeHtml(r.batchNumber)}</td>
                        <td style="font-weight:600;">${SafeHtml.escapeHtml(r.quantityRemoved)} units</td>
                        <td style="color:var(--text-secondary);">${SafeHtml.escapeHtml(r.quantityBeforeRemoval)} → ${SafeHtml.escapeHtml(r.quantityAfterRemoval)}</td>
                        <td><span class="badge badge-muted">${SafeHtml.escapeHtml(r.reason)}</span></td>
                        <td style="font-family:var(--font-mono);">${SafeHtml.escapeHtml(App.formatCurrency(r.lossValue || 0))}</td>
                        <td style="font-size:12px;color:var(--text-muted);">${SafeHtml.escapeHtml(date)}</td>
                    </tr>
                `;
            });
        }

        const html = `
            <div style="max-height:60vh;overflow-y:auto;">
                <table class="premium-table" style="width:100%;">
                    <thead>
                        <tr>
                            <th>Drug Name</th>
                            <th>Batch</th>
                            <th>Qty Removed</th>
                            <th>Before → After</th>
                            <th>Reason</th>
                            <th>Loss Value</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        App.openModal('Stock Archive - Removed Inventory', html);
    }
};
