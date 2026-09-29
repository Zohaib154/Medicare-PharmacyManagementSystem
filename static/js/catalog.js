const Catalog = {
    drugs: [],
    currentPage: 0,
    totalPages: 1,
    _loadPromise: null,

    async load() {
        if (typeof App !== 'undefined' && App.activeTab === 'backup' && App.invalidateTabs) App.invalidateTabs('dashboard', 'pos');
        return this.fetchDrugs();
    },

    async fetchDrugs() {
        if (this._loadPromise) return this._loadPromise;
        const promise = (async () => {
            try {
                const data = await API.get(`/drugs/all?page=${this.currentPage}&size=10&sortBy=drugName`);
                this.drugs = Array.isArray(data) ? data : (data.content || []);
                this.totalPages = data.totalPages || 1;
                await this.renderList();
                return true;
            } catch (e) {
                try {
                    const data2 = await API.get(`/drugs?page=${this.currentPage}&size=10&sortBy=drugName`);
                    this.drugs = Array.isArray(data2) ? data2 : (data2.content || []);
                    this.totalPages = data2.totalPages || 1;
                    await this.renderList();
                    return true;
                } catch (e2) {
                    const tbody = document.getElementById('drugs-table-body');
                    if (tbody) {
                         tbody.innerHTML = `<tr><td colspan="9" class="catalogue-error">Unable to load the catalogue. ${SafeHtml.escapeHtml(e2.message || 'Please try again.')}<button class="btn btn-secondary btn-sm" onclick="Catalog.fetchDrugs()">Retry</button></td></tr>`;
                    }
                    App.toast(`Catalogue unavailable: ${e2.message || 'Please try again.'}`, 'error');
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
        const tbody = document.getElementById('drugs-table-body');
        if (!tbody) return;
        if (this.drugs.length === 0) {
            await App.renderRows(tbody, [], () => null, {
                emptyHtml: `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:30px;">No medications registered in the catalog.</td></tr>`
            });
            this.renderPagination();
            return;
        }

        const fmt = (val) => App.formatCurrency(val);
        await App.renderRows(tbody, this.drugs, d => {
            const tr = document.createElement('tr');
            const inactive = d.isActive === false;
            if (inactive) tr.style.opacity = '0.55';
            tr.innerHTML = `
                <td>
                    <div style="font-weight:600;">${SafeHtml.escapeHtml(d.drugName)}</div>
                    ${inactive ? '<span class="badge badge-red" style="font-size:10px;margin-top:2px;">INACTIVE</span>' : ''}
                </td>
                <td><span style="font-size:13px;color:var(--text-secondary);">${SafeHtml.escapeHtml(d.genericName || 'N/A')}</span></td>
                <td><span class="badge badge-blue">${SafeHtml.escapeHtml(d.category || 'General')}</span></td>
                <td><span class="badge badge-muted">${SafeHtml.escapeHtml(d.dosageForm || 'Tablet')}</span> <span style="font-size:12px;color:var(--text-secondary);">${SafeHtml.escapeHtml(d.strength || '')}</span></td>
                <td style="font-family:var(--font-mono);font-weight:700;">${SafeHtml.escapeHtml(fmt(d.mrp))}</td>
                <td style="font-family:var(--font-mono);">${SafeHtml.escapeHtml(d.gstPercent || '12')}%</td>
                <td><span class="badge badge-orange">${SafeHtml.escapeHtml(d.scheduleType || 'NONE')}</span></td>
                <td><span class="badge ${inactive ? 'badge-red' : 'badge-green'}">${inactive ? 'Inactive' : 'Active'}</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="Catalog.openEditModal(${SafeHtml.inlineArgument(d.drugId)})">Edit</button>
                </td>
            `;
            return tr;
        });
        this.renderPagination();
    },

    renderPagination() {
        const table = document.querySelector('#drugs-table-body')?.closest('.table-container');
        if (!table) return;
        let controls = document.getElementById('drugs-pagination');
        if (controls) controls.remove();
        if (this.totalPages <= 1) return;
        controls = document.createElement('div');
        controls.id = 'drugs-pagination';
        controls.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:12px;padding:12px 0;';
        controls.innerHTML = `<button class="btn btn-secondary btn-sm" ${this.currentPage === 0 ? 'disabled' : ''}>Previous</button><span style="font-size:13px;color:var(--text-secondary);">Page ${SafeHtml.escapeHtml(this.currentPage + 1)} of ${SafeHtml.escapeHtml(this.totalPages)}</span><button class="btn btn-secondary btn-sm" ${this.currentPage + 1 >= this.totalPages ? 'disabled' : ''}>Next</button>`;
        controls.children[0].onclick = () => { this.currentPage--; this.fetchDrugs(); };
        controls.children[2].onclick = () => { this.currentPage++; this.fetchDrugs(); };
        table.parentNode.appendChild(controls);
    },

    openAddModal() {
        this.openDrugFormModal(null);
    },

    async openEditModal(drugId) {
        const drug = this.drugs.find(d => d.drugId === drugId);
        if (drug) this.openDrugFormModal(drug);
    },

    openDrugFormModal(d = null) {
        const isEdit = d !== null;
        const title  = isEdit ? 'Edit Medication' : 'Add New Medication to Catalog';

        const html = `
            <form id="drug-form" style="display:flex;flex-direction:column;gap:18px;">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Medication Name</label>
                         <input type="text" id="drug-name" class="form-control" placeholder="e.g. Paracetamol 500mg" value="${SafeHtml.escapeAttribute(d ? d.drugName : '')}" required>
                    </div>
                    <div class="form-group">
                        <label>Generic Chemical Name</label>
                         <input type="text" id="drug-generic" class="form-control" placeholder="e.g. Acetaminophen" value="${SafeHtml.escapeAttribute(d ? d.genericName || '' : '')}" required>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Category</label>
                         <input type="text" id="drug-category" class="form-control" placeholder="e.g. Analgesics" value="${SafeHtml.escapeAttribute(d ? d.category || '' : '')}" required>
                    </div>
                    <div class="form-group">
                        <label>Dosage Form</label>
                        <select id="drug-dosage-form" class="form-control" required>
                            <option value="TABLET"   ${d && d.dosageForm === 'TABLET'    ? 'selected' : ''}>Tablet</option>
                            <option value="CAPSULE"  ${d && d.dosageForm === 'CAPSULE'   ? 'selected' : ''}>Capsule</option>
                            <option value="LIQUID"   ${d && d.dosageForm === 'LIQUID'    ? 'selected' : ''}>Liquid Suspension</option>
                            <option value="INJECTION"${d && d.dosageForm === 'INJECTION' ? 'selected' : ''}>Injection</option>
                            <option value="CREAM"    ${d && d.dosageForm === 'CREAM'     ? 'selected' : ''}>Ointment / Cream</option>
                            <option value="INHALER"  ${d && d.dosageForm === 'INHALER'   ? 'selected' : ''}>Inhaler / Spray</option>
                        </select>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Strength / Spec</label>
                         <input type="text" id="drug-strength" class="form-control" placeholder="e.g. 500 mg" value="${SafeHtml.escapeAttribute(d ? d.strength || '' : '')}" required>
                    </div>
                    <div class="form-group">
                        <label>Selling Price (MRP)</label>
                         <input type="number" step="0.01" id="drug-mrp" class="form-control" placeholder="0.00" value="${SafeHtml.escapeAttribute(d ? d.mrp || '' : '')}" required>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>GST Tax %</label>
                         <input type="number" step="0.1" id="drug-gst" class="form-control" value="${SafeHtml.escapeAttribute(d ? d.gstPercent || 12 : 12)}" required>
                    </div>
                    <div class="form-group">
                        <label>Schedule / Prescription Category</label>
                        <select id="drug-schedule" class="form-control">
                            <option value="NONE"        ${d && d.scheduleType === 'NONE'         ? 'selected' : ''}>Over the Counter (None)</option>
                            <option value="SCHEDULE_H"  ${d && d.scheduleType === 'SCHEDULE_H'   ? 'selected' : ''}>Schedule H (Rx Required)</option>
                            <option value="SCHEDULE_H1" ${d && d.scheduleType === 'SCHEDULE_H1'  ? 'selected' : ''}>Schedule H1 (Narcotic/Restricted)</option>
                            <option value="SCHEDULE_G"  ${d && d.scheduleType === 'SCHEDULE_G'   ? 'selected' : ''}>Schedule G (Medical Supervised)</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Brief Description</label>
                     <textarea id="drug-desc" class="form-control" placeholder="Chemical description and indications..." rows="2">${SafeHtml.escapeHtml(d ? d.description || '' : '')}</textarea>
                </div>
                ${isEdit ? `
                <div class="form-group">
                    <label>Status</label>
                    <select id="drug-status" class="form-control">
                        <option value="true"  ${d.isActive !== false ? 'selected' : ''}>Active</option>
                        <option value="false" ${d.isActive === false  ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>` : ''}
                <div style="display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--border-color);padding-top:15px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">${isEdit ? 'SAVE CHANGES' : 'ADD TO CATALOG'}</button>
                </div>
            </form>
        `;

        App.openModal(title, html);
        document.getElementById('drug-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitDrug(isEdit ? d.drugId : null, d);
        });
    },

    async submitDrug(drugId, original) {
        const drugName    = document.getElementById('drug-name').value;
        const genericName = document.getElementById('drug-generic').value;
        const category    = document.getElementById('drug-category').value;
        const dosageForm  = (document.getElementById('drug-dosage-form')?.value || 'TABLET').toUpperCase();
        const strength    = document.getElementById('drug-strength').value;
        const mrp         = parseFloat(document.getElementById('drug-mrp').value);
        const gstPercent  = parseFloat(document.getElementById('drug-gst').value);
        const scheduleType= document.getElementById('drug-schedule').value;
        const description = document.getElementById('drug-desc').value;
        const statusEl    = document.getElementById('drug-status');
        const isActive    = statusEl ? statusEl.value === 'true' : true;

        const payload = { drugName, genericName, category, dosageForm, strength, mrp, gstPercent, scheduleType, description, isActive };

        try {
            if (drugId) {
                await API.put(`/drugs/${drugId}`, payload);
                if (original && original.isActive !== false && !isActive) {
                    App.toast(`"${drugName}" marked as Inactive and hidden from POS/orders.`, 'warning');
                } else {
                    App.toast(`Medication ${drugName} updated.`, 'success');
                }
            } else {
                await API.post('/drugs', payload);
                App.toast(`Medication ${drugName} added successfully.`, 'success');
            }
            App.closeModal();
            if (typeof App !== 'undefined' && App.invalidateTabs) {
                App.invalidateTabs('pos');
            }
            await this.load();
        } catch (e) {
            App.toast(`Failed to save: ${e.message}`, 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const search = document.getElementById('drugs-search');
    if (search) {
        search.addEventListener('input', App.debounce((e) => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('#drugs-table-body tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        }));
    }
});
