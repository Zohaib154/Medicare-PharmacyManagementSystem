// ─────────────────────────────────────────────────────────────────────────────
//  DBBrowser — Live database browser with inline editing
//  All data is read from the REST API and is always in sync with the app.
//  Double-click any editable cell to change a value — saved immediately.
// ─────────────────────────────────────────────────────────────────────────────
const DBBrowser = {
    currentTable: null,
    rows: [],
    editMode: false,

    tables: {
        'drugs': {
            title:    'Drug Catalogue',
            subtitle: 'Manage the complete medication database with dosage, GST, and pricing information.',
            endpoint: '/drugs/all?sortBy=drugName',
            idField:  'drugId',
            saveUrl:  (id) => `/drugs/${id}`,
            cols: [
                { key: 'drugId',       label: 'ID',       editable: false },
                { key: 'drugName',     label: 'Name',     editable: true  },
                { key: 'genericName',  label: 'Generic',  editable: true  },
                { key: 'category',     label: 'Category', editable: true  },
                { key: 'dosageForm',   label: 'Form',     editable: true  },
                { key: 'strength',     label: 'Strength', editable: true  },
                { key: 'mrp',          label: 'MRP ($)',  editable: true,  type: 'number' },
                { key: 'gstPercent',   label: 'GST %',    editable: true,  type: 'number' },
                { key: 'scheduleType', label: 'Schedule', editable: true  },
                { key: 'isActive',     label: 'Active',   editable: true,  type: 'bool'   },
            ]
        },
        'suppliers': {
            title:    'Supplier Directory',
            subtitle: 'Track supplier contact details, payment terms, and outstanding balances.',
            endpoint: '/suppliers/all',
            idField:  'supplierId',
            saveUrl:  (id) => `/suppliers/${id}`,
            cols: [
                { key: 'supplierId',       label: 'ID',         editable: false },
                { key: 'supplierName',     label: 'Name',       editable: true  },
                { key: 'contactPerson',    label: 'Contact',    editable: true  },
                { key: 'contactNumber',    label: 'Phone',      editable: true  },
                { key: 'email',            label: 'Email',      editable: true  },
                { key: 'city',             label: 'City',       editable: true  },
                { key: 'paymentTerms',     label: 'Terms',      editable: true  },
                { key: 'outstandingBalance', label: 'Balance ($)', editable: true, type: 'number' },
                { key: 'isActive',         label: 'Active',     editable: true,  type: 'bool'   },
            ]
        },
        'patients': {
            title:    'Patient Registry',
            subtitle: 'Manage patient records including demographics, contact info, and medical history.',
            endpoint: '/patients',
            idField:  'patientId',
            saveUrl:  (id) => `/patients/${id}`,
            cols: [
                { key: 'patientId',     label: 'ID',       editable: false },
                { key: 'fullName',      label: 'Name',     editable: true  },
                { key: 'dateOfBirth',   label: 'DOB',      editable: true  },
                { key: 'gender',        label: 'Gender',   editable: true  },
                { key: 'contactNumber', label: 'Phone',    editable: true  },
                { key: 'email',         label: 'Email',    editable: true  },
                { key: 'bloodGroup',    label: 'Blood',    editable: true  },
                { key: 'allergies',     label: 'Allergies',editable: true  },
                { key: 'isActive',      label: 'Active',   editable: true,  type: 'bool' },
            ]
        },
        'inventory': {
            title:    'Inventory Batches',
            subtitle: 'View and edit stock batches, expiry dates, and pricing information.',
            endpoint: '/inventory',
            idField:  'inventoryId',
            saveUrl:  (id) => `/inventory/${id}`,
            cols: [
                { key: 'inventoryId',     label: 'ID',       editable: false },
                { key: 'drugName',        label: 'Drug',     editable: false },
                { key: 'batchNumber',     label: 'Batch',    editable: true  },
                { key: 'quantityInStock', label: 'Qty',      editable: true,  type: 'number' },
                { key: 'reorderLevel',    label: 'Reorder',  editable: true,  type: 'number' },
                { key: 'expiryDate',      label: 'Expiry',   editable: true  },
                { key: 'purchasePrice',   label: 'Buy ($)',  editable: true,  type: 'number' },
                { key: 'sellingPrice',    label: 'Sell ($)', editable: true,  type: 'number' },
                { key: 'stockStatus',     label: 'Status',   editable: false },
            ]
        },
        'purchase-orders': {
            title:    'Purchase Orders',
            subtitle: 'Track all purchase orders with suppliers including status, dates, and totals.',
            endpoint: '/purchase-orders',
            idField:  'orderId',
            saveUrl:  null,
            cols: [
                { key: 'orderId',              label: 'ID',       editable: false },
                { key: 'poNumber',             label: 'PO #',     editable: false },
                { key: 'supplierName',         label: 'Supplier', editable: false },
                { key: 'orderDate',            label: 'Date',     editable: false },
                { key: 'status',               label: 'Status',   editable: false },
                { key: 'expectedDeliveryDate', label: 'Delivery', editable: false },
                { key: 'totalAmount',          label: 'Total ($)',editable: false },
                { key: 'orderedByName',        label: 'By',       editable: false },
                { key: 'notes',                label: 'Notes',    editable: false },
            ]
        },
        'users': {
            title:    'Staff Members',
            subtitle: 'Manage staff accounts, contact details, and active status.',
            endpoint: '/users',
            idField:  'userId',
            saveUrl:  (id) => `/users/${id}`,
            cols: [
                { key: 'userId',        label: 'ID',      editable: false },
                { key: 'username',      label: 'Username',editable: false },
                { key: 'fullName',      label: 'Name',    editable: true  },
                { key: 'email',         label: 'Email',   editable: true  },
                { key: 'contactNumber', label: 'Phone',   editable: true  },
                { key: 'isActive',      label: 'Active',  editable: true,  type: 'bool' },
            ]
        },
        'logs': {
            title:    'Application Activity Log',
            subtitle: 'Audit trail of all user actions and system events. Read-only.',
            endpoint: '/audit-logs?size=200',
            idField:  'logId',
            saveUrl:  null,
            cols: [
                { key: 'logId',     label: 'ID',       editable: false },
                { key: 'timestamp', label: 'Time',     editable: false, type: 'datetime' },
                { key: 'username',  label: 'User',     editable: false },
                { key: 'action',    label: 'Action',   editable: false },
                { key: 'entity',    label: 'Module',   editable: false },
                { key: 'entityRef', label: 'Reference',editable: false },
                { key: 'details',   label: 'Details',  editable: false },
            ]
        }
    },

  // ── Load a table with pagination support ────────────────────────────────────────
  async loadTable(tableName, page = 0) {
    this.currentTable = tableName;
        this.editMode = false;
        this.updateEditToggle();
    const def = this.tables[tableName];
    if (!def) return;

    // Ensure pagination settings exist
    if (!def.pageSize) def.pageSize = 10;
    if (def.currentPage === undefined) def.currentPage = 0;
    def.currentPage = page;

    // Highlight the active tab button
    document.querySelectorAll('[id^="dbt-"]').forEach(b => {
      b.className = b.id === 'dbt-' + tableName
        ? 'btn btn-primary btn-sm'
        : 'btn btn-secondary btn-sm';
    });

    const titleEl    = document.getElementById('dbb-table-title');
    const subtitleEl = document.getElementById('dbb-table-subtitle');
    const countEl    = document.getElementById('dbb-row-count');
    const gridEl     = document.getElementById('dbb-grid');
    if (!titleEl || !gridEl) return;

    titleEl.textContent = def.title;
    if (subtitleEl) subtitleEl.textContent = def.subtitle || '';
    if (countEl) countEl.textContent = '';
     gridEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted);">Loading ${SafeHtml.escapeHtml(def.title)}…</div>`;

    try {
      // Build endpoint with pagination parameters
      const endpoint = def.endpoint.includes('?')
        ? `${def.endpoint}&page=${def.currentPage}&size=${def.pageSize}`
        : `${def.endpoint}?page=${def.currentPage}&size=${def.pageSize}`;
      const data = await API.get(endpoint);
      const content = Array.isArray(data) ? data : (data.content || []);
      this.rows = content;
      // Update count display: show total elements if available
      if (countEl) {
        const total = data.totalElements !== undefined ? data.totalElements : this.rows.length;
        countEl.textContent = `${total} rows (page ${def.currentPage + 1})`;
      }
      this._renderGrid(def, gridEl);
      this._renderPaginationControls(def, gridEl, data);
    } catch (e) {
       gridEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--accent-red);">Failed to load: ${SafeHtml.escapeHtml(e.message)}</div>`;
    }
  },

    // ── Refresh current table ─────────────────────────────────────────────────
    refresh() {
        if (this.currentTable) {
            this.loadTable(this.currentTable);
        }
    },

    // ── Format a cell value for display ──────────────────────────────────────
    _display(val, type) {
        if (val === null || val === undefined) return '<span style="color:var(--text-muted);">—</span>';
        if (type === 'bool') {
            return val
                ? '<span class="badge badge-green" style="font-size:11px;">Yes</span>'
                : '<span class="badge badge-red"   style="font-size:11px;">No</span>';
        }
        if (Array.isArray(val)) {
            if (type === 'datetime' && val.length >= 6) {
                const d = new Date(val[0], val[1] - 1, val[2], val[3] || 0, val[4] || 0, val[5] || 0);
                 return SafeHtml.escapeHtml(d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true }));
            }
             return SafeHtml.escapeHtml(new Date(val[0], val[1] - 1, val[2]).toLocaleDateString());
        }
         const str = String(val);
         if (str.length > 60) return `<span title="${SafeHtml.escapeAttribute(str)}">${SafeHtml.escapeHtml(str.substring(0, 58))}…</span>`;
         return SafeHtml.escapeHtml(str);
    },

    // ── Inline cell editor ───────────────────────────────────────────────────
    startEdit(td) {
        if (td.querySelector('input, select')) return; // already editing

        const field    = td.dataset.field;
        const type     = td.dataset.type || 'text';
        const saveUrl  = td.dataset.save;
        const rowIdx   = parseInt(td.dataset.rowidx);
        const row      = this.rows[rowIdx] || {};
        const currentVal = row[field];
        const origHtml   = td.innerHTML;

        let input;
        if (type === 'bool') {
            input = document.createElement('select');
            input.className = 'form-control';
            input.style.cssText = 'font-size:13px;padding:3px 6px;height:30px;width:90px;';
            input.innerHTML = `
                <option value="true"  ${currentVal === true  ? 'selected' : ''}>Yes</option>
                <option value="false" ${currentVal === false ? 'selected' : ''}>No</option>
            `;
        } else {
            input = document.createElement('input');
            input.type  = type === 'number' ? 'number' : 'text';
            if (type === 'number') input.step = 'any';
            input.className = 'form-control';
            input.style.cssText = 'font-size:13px;padding:3px 6px;height:30px;min-width:100px;max-width:200px;';
            input.value = currentVal ?? '';
        }

        td.innerHTML = '';
        td.appendChild(input);
        input.focus();
        if (input.type === 'text') { try { input.select(); } catch(e) {} }

        let saved = false;
        const doSave = async () => {
            if (saved) return;
            saved = true;

            let newVal = input.value;
            if (type === 'bool')   newVal = (newVal === 'true');
            if (type === 'number') newVal = parseFloat(newVal);

            // Restore display immediately
            td.innerHTML = origHtml;
            const span = td.querySelector('.dbb-cell-val');

            // No change — nothing to do
            if (String(newVal) === String(currentVal)) return;

            // Optimistic update
            if (row) row[field] = newVal;
            if (span) span.innerHTML = this._display(newVal, type);

            // Build full payload from the row (backend needs all fields for PUT)
            const fullRow = { ...(this.rows[rowIdx] || {}) };
            fullRow[field] = newVal;

            try {
                await API.put(saveUrl, fullRow);
                td.style.outline = '2px solid var(--accent-green)';
                setTimeout(() => { td.style.outline = ''; }, 1000);

                if (this.currentTable === 'drugs'     && typeof Catalog   !== 'undefined') Catalog.load();
                if (this.currentTable === 'suppliers'  && typeof Suppliers !== 'undefined') Suppliers.load();
                if (this.currentTable === 'patients'   && typeof Patients  !== 'undefined') Patients.load();
                if (this.currentTable === 'users'      && typeof Staff     !== 'undefined') Staff.load();
                if (this.currentTable === 'inventory'  && typeof Inventory !== 'undefined') Inventory.load();
            } catch (e) {
                td.style.outline = '2px solid var(--accent-red)';
                setTimeout(() => { td.style.outline = ''; }, 1500);
                App.toast(`Save failed: ${e.message}`, 'error');
                if (row) row[field] = currentVal;
                if (span) span.innerHTML = this._display(currentVal, type);
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')  { e.preventDefault(); doSave(); }
            if (e.key === 'Escape') { saved = true; td.innerHTML = origHtml; }
        });
        input.addEventListener('blur', doSave);
    },

        toggleEditMode() {
            this.editMode = !this.editMode;
            this.updateEditToggle();
        },

        updateEditToggle() {
            const button = document.getElementById('dbb-edit-toggle');
            if (!button) return;
            button.className = this.editMode ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
            button.title = this.editMode ? 'Lock database editing' : 'Unlock database editing';
            button.setAttribute('aria-label', button.title);
            const label = button.querySelector('span');
            if (label) label.textContent = this.editMode ? 'Lock' : 'Edit';
        },

    // ── Render the data grid (lightweight for WebView performance) ──
    _renderGrid(def, gridEl) {
        const thStyle = 'padding:8px 10px;font-size:11px;font-weight:700;color:#fff;text-align:left;background:#3d8b37;border:1px solid #2d6a2e;';
        let html = '<table class="dbb-table"><thead><tr>';
         def.cols.forEach(col => { html += `<th style="${thStyle}">${SafeHtml.escapeHtml(col.label)}</th>`; });
        html += '</tr></thead><tbody>';
        this.rows.forEach((row, rowIdx) => {
            const rc = rowIdx % 2 === 0 ? 'dbb-row-even' : 'dbb-row-odd';
            const id = row[def.idField];
            html += `<tr class="${rc}">`;
            def.cols.forEach(col => {
                const val = row[col.key];
                const display = this._display(val, col.type);
                if (col.editable && def.saveUrl) {
                     html += `<td class="dbb-editable dbb-cell" data-id="${SafeHtml.escapeAttribute(id)}" data-field="${SafeHtml.escapeAttribute(col.key)}" data-type="${SafeHtml.escapeAttribute(col.type || 'text')}" data-save="${SafeHtml.escapeAttribute(def.saveUrl(id))}" data-rowidx="${SafeHtml.escapeAttribute(rowIdx)}"><span class="dbb-cell-val">${display}</span></td>`;
                } else {
                    html += `<td class="dbb-cell" style="color:var(--text-secondary)">${display}</td>`;
                }
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        gridEl.innerHTML = html;
        // Event delegation keeps the grid lightweight; editing is opt-in.
        if (def.saveUrl && !gridEl._delegated) {
            gridEl._delegated = true;
            gridEl.addEventListener('dblclick', (e) => {
                const td = e.target.closest('td.dbb-editable');
                if (td && DBBrowser.editMode) DBBrowser.startEdit(td);
            });
        }
    },

    _renderPaginationControls(def, gridEl, data) {
        const existing = document.getElementById('dbb-pagination');
        if (existing) existing.remove();
        const totalPages = data.totalPages !== undefined ? data.totalPages : 1;
        if (totalPages <= 1) return;
        const pagination = document.createElement('div');
        pagination.id = 'dbb-pagination';
        pagination.style.cssText = 'text-align:center;padding:12px 0;';
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary btn-sm';
        prevBtn.textContent = '\u2190 Previous';
        prevBtn.disabled = def.currentPage === 0;
        prevBtn.onclick = () => this.loadTable(this.currentTable, def.currentPage - 1);
        const info = document.createElement('span');
        info.style.cssText = 'margin:0 14px;font-size:13px;color:var(--text-secondary);';
        info.textContent = `Page ${def.currentPage + 1} of ${totalPages}`;
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary btn-sm';
        nextBtn.textContent = 'Next \u2192';
        nextBtn.disabled = def.currentPage + 1 >= totalPages;
        nextBtn.onclick = () => this.loadTable(this.currentTable, def.currentPage + 1);
        pagination.appendChild(prevBtn);
        pagination.appendChild(info);
        pagination.appendChild(nextBtn);
        gridEl.parentNode.appendChild(pagination);
    },

    refresh2() {
        if (this.currentTable) {
            this.loadTable(this.currentTable);
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Backup / Restore — with password encryption support
// ─────────────────────────────────────────────────────────────────────────────
const Backup = {
    _errorMessage(error) {
        return error && (error.message || error.toString()) ? (error.message || error.toString()) : 'Unknown backup error';
    },

    async _encrypt(text, password) {
        if (!password) return text;
        const enc = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
            baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
        const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
        const payload = new Uint8Array(salt.length + iv.length + cipher.length);
        payload.set(salt);
        payload.set(iv, salt.length);
        payload.set(cipher, salt.length + iv.length);
        let binary = '';
        for (let i = 0; i < payload.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, payload.subarray(i, i + 0x8000));
        }
        return 'ENCRYPTED|AES-256-GCM-PBKDF2|' + btoa(binary);
    },

    async _decrypt(encryptedText, password) {
        const text = (encryptedText || '').trim();
        if (text.startsWith('ENCRYPTED|AES-256-GCM-PBKDF2|')) {
            if (!password) throw new Error('Password required to decrypt backup');
            const b64 = text.substring('ENCRYPTED|AES-256-GCM-PBKDF2|'.length).replace(/\s+/g, '');
            const binaryStr = atob(b64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

            const enc = new TextEncoder();
            const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
            const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes.slice(0, 16), iterations: 210000, hash: 'SHA-256' },
                baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
            const decryptedBytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, key, bytes.slice(28));
            return new TextDecoder().decode(decryptedBytes);
        }

        if (text.startsWith('ENCRYPTED|PBKDF2_XOR|')) {
            if (!password) throw new Error('Password required to decrypt backup');
            const b64Content = text.substring('ENCRYPTED|PBKDF2_XOR|'.length).replace(/\s+/g, '');
            const binaryStr = atob(b64Content);
            let salted;
            try { salted = decodeURIComponent(escape(binaryStr)); } catch (e) { salted = binaryStr; }
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

        return text; // not encrypted
    },

    promptBackupSecurity() {
        return new Promise(resolve => {
            const html = `
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <p style="margin:0; color:var(--text-secondary); font-size:13.5px; line-height:1.5;">
                        Choose your backup preferences below. You can generate a direct standard backup or encrypt it with password protection.
                    </p>

                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <label style="display:flex; align-items:flex-start; gap:12px; padding:12px 14px; border:2px solid var(--accent-primary); border-radius:8px; cursor:pointer; background:var(--bg-card); transition:all 0.2s;" id="lbl-backup-standard">
                            <input type="radio" name="backup-security-type" id="rad-backup-standard" value="standard" checked style="margin-top:3px; accent-color:var(--accent-primary);">
                            <div style="flex:1;">
                                <div style="font-weight:600; color:var(--text-primary); font-size:14px;">Standard Backup (.mbak)</div>
                                <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                                    Standard unencrypted database backup. Fast, straightforward, and can be restored directly with a single click.
                                </div>
                            </div>
                        </label>

                        <label style="display:flex; align-items:flex-start; gap:12px; padding:12px 14px; border:1px solid var(--border-color); border-radius:8px; cursor:pointer; background:var(--bg-card); transition:all 0.2s;" id="lbl-backup-encrypted">
                            <input type="radio" name="backup-security-type" id="rad-backup-encrypted" value="encrypted" style="margin-top:3px; accent-color:var(--accent-primary);">
                            <div style="flex:1;">
                                <div style="font-weight:600; color:var(--text-primary); font-size:14px;">Encrypted Backup (.enc.mbak)</div>
                                <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                                    Protected with military-grade AES-256 encryption. Requires a password to restore, preventing unauthorized access.
                                </div>
                            </div>
                        </label>
                    </div>

                    <div id="backup-encryption-inputs" style="display:none; flex-direction:column; gap:12px; padding:14px; border:1px solid var(--accent-primary); border-radius:8px; background:rgba(74, 222, 128, 0.05);">
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:13px; font-weight:600; margin-bottom:4px; display:block;">Backup Encryption Password <span style="color:var(--accent-red);">*</span></label>
                            <input type="password" id="modal-backup-pw" class="form-control" placeholder="Enter backup encryption password">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:13px; font-weight:600; margin-bottom:4px; display:block;">Confirm Password <span style="color:var(--accent-red);">*</span></label>
                            <input type="password" id="modal-backup-pw-confirm" class="form-control" placeholder="Confirm encryption password">
                        </div>
                        <div id="backup-pw-err" style="display:none; color:var(--accent-red); font-size:12px; font-weight:600;"></div>
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:12px; border-top:1px solid var(--border-color); padding-top:14px; margin-top:4px;">
                        <button type="button" class="btn btn-secondary" id="btn-backup-cancel">Cancel</button>
                        <button type="button" class="btn btn-primary" id="btn-backup-proceed">Download Backup</button>
                    </div>
                </div>
            `;

            App.openModal('Export Database Backup', html);

            const radStandard = document.getElementById('rad-backup-standard');
            const radEncrypted = document.getElementById('rad-backup-encrypted');
            const lblStandard = document.getElementById('lbl-backup-standard');
            const lblEncrypted = document.getElementById('lbl-backup-encrypted');
            const encInputs = document.getElementById('backup-encryption-inputs');
            const pwInput = document.getElementById('modal-backup-pw');
            const pwConfirm = document.getElementById('modal-backup-pw-confirm');
            const errDiv = document.getElementById('backup-pw-err');

            const updateSelection = () => {
                if (radEncrypted.checked) {
                    lblStandard.style.border = '1px solid var(--border-color)';
                    lblEncrypted.style.border = '2px solid var(--accent-primary)';
                    encInputs.style.display = 'flex';
                    pwInput.focus();
                } else {
                    lblStandard.style.border = '2px solid var(--accent-primary)';
                    lblEncrypted.style.border = '1px solid var(--border-color)';
                    encInputs.style.display = 'none';
                    errDiv.style.display = 'none';
                }
            };

            lblStandard.onclick = () => { radStandard.checked = true; updateSelection(); };
            lblEncrypted.onclick = () => { radEncrypted.checked = true; updateSelection(); };
            radStandard.onchange = updateSelection;
            radEncrypted.onchange = updateSelection;

            document.getElementById('btn-backup-cancel').onclick = () => {
                App.closeModal();
                resolve(null);
            };

            document.getElementById('btn-backup-proceed').onclick = () => {
                if (radEncrypted.checked) {
                    const pw = pwInput.value;
                    const confirm = pwConfirm.value;
                    if (!pw) {
                        errDiv.textContent = 'Please enter an encryption password.';
                        errDiv.style.display = 'block';
                        pwInput.focus();
                        return;
                    }
                    if (pw.length < 3) {
                        errDiv.textContent = 'Password must be at least 3 characters.';
                        errDiv.style.display = 'block';
                        pwInput.focus();
                        return;
                    }
                    if (pw !== confirm) {
                        errDiv.textContent = 'Passwords do not match. Please verify.';
                        errDiv.style.display = 'block';
                        pwConfirm.focus();
                        return;
                    }
                    App.closeModal();
                    resolve({ encrypt: true, password: pw });
                } else {
                    App.closeModal();
                    resolve({ encrypt: false, password: null });
                }
            };
        });
    },

    async createBinaryBackup() {
        return this.createBackup();
    },

    async createBackup() {
        try {
            const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
            if (!token) {
                App.toast('Admin session required. Please sign in.', 'error');
                return;
            }

            const choice = await this.promptBackupSecurity();
            if (!choice) return; // User cancelled

            const filenameBase = `medicare_db_backup_${new Date().toISOString().slice(0, 10)}`;

            App.toast('Generating database backup...', 'info');
            const response = await fetch('/api/backup/download-binary', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.status === 401 || response.status === 403) {
                App.toast('Authentication expired. Please log in as admin again.', 'error');
                return;
            }
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
                throw new Error(errData.message || `HTTP ${response.status}`);
            }

            const jsonText = await response.text();

            if (choice.encrypt) {
                const encryptedText = await this._encrypt(jsonText, choice.password);
                const filename = `${filenameBase}.enc.mbak`;
                const blob = new Blob([encryptedText], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
                App.toast('Encrypted backup downloaded: ' + filename, 'success');
            } else {
                const filename = `${filenameBase}.mbak`;
                const blob = new Blob([jsonText], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
                App.toast('Standard backup downloaded: ' + filename, 'success');
            }
        } catch (e) {
            console.error('Backup failed', e);
            App.toast('Backup failed: ' + this._errorMessage(e), 'error');
        }
    },

    async restoreBackup() {
        const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
        if (!token) {
            App.toast('Admin session required. Please sign in first.', 'error');
            return;
        }

        const input = document.getElementById('db-restore-file-input');
        if (input) {
            input.click();
        } else {
            this._browserPickFile().then(backup => {
                if (backup) this._restoreFileContent(backup.text, backup.filename);
            });
        }
    },

    async handleRestoreFile(event) {
        const file = event.target?.files?.[0];
        if (!file) return;

        try {
            const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
            if (!token) {
                App.toast('Admin session required. Please sign in first.', 'error');
                return;
            }

            const confirmMsg = 'WARNING: Restoring will REPLACE all current database data with the backup (' +
                SafeHtml.escapeHtml(file.name) + ').\n\nAre you sure you want to proceed?';

            if (!await App.confirm(confirmMsg, { title: 'Restore Database Backup', confirmLabel: 'Yes, Restore Backup', danger: true })) {
                return;
            }

            let fileText = await file.text();
            await this._restoreFileContent(fileText, file.name);
        } catch (e) {
            console.error('Restore failed', e);
            App.toast('Restore failed: ' + this._errorMessage(e), 'error');
        } finally {
            if (event.target) event.target.value = '';
        }
    },

    async _restoreFileContent(rawText, filename) {
        let content = (rawText || '').trim();

        // Detect if file is encrypted (starts with ENCRYPTED|)
        if (content.startsWith('ENCRYPTED|')) {
            const password = await this._promptPassword('This backup file is encrypted. Enter the decryption password:');
            if (password === null) {
                App.toast('Restore cancelled', 'info');
                return;
            }

            let decrypted = null;
            try {
                decrypted = await this._decrypt(content, password);
            } catch (err) {
                // If WebCrypto in browser fails, try server-side decryption fallback
                try {
                    await this._uploadBackupText(content, filename, password);
                    return;
                } catch (srvErr) {
                    App.toast('Decryption failed: Incorrect password or corrupted file', 'error');
                    return;
                }
            }

            content = (decrypted || '').trim();
        }

        // Handle base64 wrapped payload if any
        if (!content.startsWith('{') && !content.startsWith('[') && !content.startsWith('--')) {
            try {
                const unb64 = atob(content);
                if (unb64.startsWith('{') || unb64.startsWith('[')) {
                    content = unb64;
                }
            } catch (e) {}
        }

        await this._uploadBackupText(content, filename);
    },

    async _uploadBackupText(text, filename, password = null) {
        const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
        if (!token) {
            App.toast('Admin session required. Please sign in.', 'error');
            return;
        }
        App.toast('Restoring database backup...', 'info');

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        if (password) {
            headers['x-backup-password'] = password;
        }

        const res = await fetch('/api/backup/restore', {
            method: 'POST',
            headers,
            body: text
        });

        const data = await res.json().catch(() => ({ success: false, message: `HTTP ${res.status}` }));
        if (!res.ok || !data.success) {
            throw new Error(data.message || `HTTP ${res.status}`);
        }
        App.toast('Database restored successfully! Reloading...', 'success');
        setTimeout(() => location.reload(), 1500);
    },

    _promptPassword(message) {
        return new Promise((resolve) => {
            const html = `
                <div style="display:flex; flex-direction: column; gap: 14px;">
                     <p style="margin:0; color:var(--text-secondary); font-size:13.5px;">${SafeHtml.escapeHtml(message)}</p>
                    <div class="form-group" style="margin:0;">
                        <input type="password" id="backup-pw" class="form-control" placeholder="Enter decryption password" autofocus>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 12px; border-top:1px solid var(--border-color); padding-top:14px;">
                        <button type="button" class="btn btn-secondary" id="backup-pw-cancel">Cancel</button>
                        <button type="button" class="btn btn-primary" id="backup-pw-ok">Decrypt & Restore</button>
                    </div>
                </div>
            `;
            App.openModal('Password Required', html);
            document.getElementById('backup-pw-cancel').onclick = () => {
                App.closeModal();
                resolve(null);
            };
            document.getElementById('backup-pw-ok').onclick = () => {
                const pw = document.getElementById('backup-pw').value;
                App.closeModal();
                resolve(pw);
            };
            document.getElementById('backup-pw').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('backup-pw-ok').click();
                }
            });
        });
    },

    _browserPickFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.sql,.mbak';
            input.style.display = 'none';
            document.body.appendChild(input);
            input.onchange = async () => {
                const file = input.files[0];
                input.remove();
                if (!file) { resolve(null); return; }
                try {
                    const text = await file.text();
                    resolve({ filename: file.name, text });
                } catch (e) {
                    App.toast('Failed to read file: ' + e.message, 'error');
                    resolve(null);
                }
            };
            input.click();
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Database management — clean & reset
// ─────────────────────────────────────────────────────────────────────────────
const DatabaseUI = {
    async resetToFresh() {
        const confirmed = await App.confirm(
            'WARNING: This will PERMANENTLY DELETE all operational data and remove all sample/seeded records ' +
            '(drugs, inventory, sales, purchases, prescriptions, patients, suppliers, etc.) ' +
            'giving you a completely clean, fresh database to start from scratch.\n\n' +
            'Your admin account will be kept so you can sign in.\n\n' +
            'This action cannot be undone. Are you sure you want to continue?',
            { title: 'Clean & Reset Database (Fresh Start)', confirmLabel: 'Yes, Delete Everything', danger: true }
        );
        if (!confirmed) return;

        // Optional second confirmation for such a destructive action
        const doubleCheck = await App.confirm(
            'Final confirmation: All business records and seeded data will be erased. Continue?',
            { title: 'Are you absolutely sure?', confirmLabel: 'Erase Everything & Fresh Start', danger: true }
        );
        if (!doubleCheck) return;

        try {
            App.toast('Deleting all data for fresh start...', 'info');
            await API.post('/database/reset', {});
            App.toast('Database reset complete. All records cleared. Reloading…', 'success');
            setTimeout(() => location.reload(), 1500);
        } catch (e) {
            console.error('Database reset failed', e);
            App.toast('Reset failed: ' + (e.message || 'Unknown error'), 'error');
        }
    }
};
