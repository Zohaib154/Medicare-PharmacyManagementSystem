const Prescriptions = {
    prescriptions: [],
    drugs: [],
    patients: [],
    _loadPromise: null,

    async load() {
        return this.fetchPrescriptions();
    },

    async fetchPrescriptions() {
        if (this._loadPromise) return this._loadPromise;
        const promise = (async () => {
            try {
                const data = await API.get('/prescriptions?size=100');
                this.prescriptions = (Array.isArray(data) ? data : (data.content || [])).slice(0, 100);
                await this.renderList();
                return true;
            } catch (e) {
                App.toast('Failed to load prescriptions.', 'error');
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
        const tbody = document.getElementById('rx-table-body');
        if (!tbody) return;
        if (this.prescriptions.length === 0) {
            await App.renderRows(tbody, [], () => null, {
                emptyHtml: `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">
                            No prescription records found in the system.
                        </td>
                    </tr>
                `
            });
            return;
        }

        await App.renderRows(tbody, this.prescriptions, p => {
            const tr = document.createElement('tr');
            let statusBadge = 'badge-blue';
            if (p.status === 'DISPENSED') statusBadge = 'badge-green';
            if (p.status === 'CANCELLED') statusBadge = 'badge-red';
            if (p.status === 'PENDING') statusBadge = 'badge-orange';
            let itemsSummary = '';
            if (p.items && p.items.length > 0) {
                itemsSummary = p.items.map(item => `${item.drugName} (qty: ${item.quantity})`).join(', ');
            } else {
                itemsSummary = 'No drugs listed';
            }
            const canDispense = p.status === 'PENDING' || p.status === 'PARTIALLY_DISPENSED';
            const dispenseButton = canDispense
                ? `<button class="btn btn-success btn-sm" onclick="Prescriptions.dispense(${SafeHtml.inlineArgument(p.prescriptionId)})">DISPENSE</button>`
                : '';
            const cancelButton = canDispense
                ? `<button class="btn btn-danger btn-sm" onclick="Prescriptions.cancel(${SafeHtml.inlineArgument(p.prescriptionId)})">CANCEL</button>`
                : '';
            const dateStr = new Date(p.issueDate).toLocaleDateString();
            tr.innerHTML = `
                <td style="font-family: var(--font-mono); font-weight: 700;">${SafeHtml.escapeHtml(p.rxNumber)}</td>
                <td><div style="font-weight: 600;">${SafeHtml.escapeHtml(p.patientName)}</div></td>
                <td>
                    <div style="font-size:14px; font-weight: 500;">${SafeHtml.escapeHtml(p.doctorName)}</div>
                    <div style="font-size:11px; color:var(--text-secondary);">${SafeHtml.escapeHtml(p.hospitalClinic || '')}</div>
                </td>
                <td style="font-family: var(--font-mono);">${SafeHtml.escapeHtml(dateStr)}</td>
                <td><span class="badge ${statusBadge}">${SafeHtml.escapeHtml(p.status)}</span></td>
                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size:13px; color: var(--text-secondary);" title="${SafeHtml.escapeAttribute(itemsSummary)}">${SafeHtml.escapeHtml(itemsSummary)}</td>
                <td>
                    <div style="display:flex; gap: 8px;">
                        ${dispenseButton}
                        ${cancelButton}
                    </div>
                </td>
            `;
            return tr;
        });
    },

    async dispense(rxId) {
        if (!await App.confirm('Dispense this prescription? This will automatically deduct inventory stock via FEFO rules.', { title: 'Dispense Prescription', confirmLabel: 'Dispense', danger: false })) return;
        try {
            const user = API.getUserInfo();
            const pharmacistId = user ? user.userId : 1;
            const res = await API.put(`/prescriptions/${rxId}/dispense?pharmacistId=${pharmacistId}`);
            App.toast(`Prescription dispensed successfully! Stock deducted.`, 'success');
            if (typeof App !== 'undefined' && App.invalidateTabs) {
                App.invalidateTabs('pos', 'inventory');
            }
            await this.load();
            Dashboard.load();
        } catch (e) {
            App.toast(`Dispense failed: ${e.message}`, 'error');
        }
    },

    async cancel(rxId) {
        if (!await App.confirm('Cancel this prescription?', { title: 'Cancel Prescription', confirmLabel: 'Cancel', danger: true })) return;
        try {
            await API.put(`/prescriptions/${rxId}/cancel`);
            App.toast('Prescription cancelled.', 'warning');
            await this.load();
        } catch (e) {
            App.toast(`Cancel failed: ${e.message}`, 'error');
        }
    },

    async openNewModal() {
        try {
            // Load patients and drugs for the form
            const patientsData = await API.get('/patients?size=100');
            this.patients = Array.isArray(patientsData) ? patientsData : (patientsData.content || []);
            
            const drugsData = await API.get('/drugs?size=100');
            this.drugs = Array.isArray(drugsData) ? drugsData : (drugsData.content || []);

            let patientOptions = '';
            this.patients.forEach(p => {
                 patientOptions += `<option value="${SafeHtml.escapeAttribute(p.patientId)}">${SafeHtml.escapeHtml(p.fullName)}</option>`;
            });

            let drugOptions = '';
            this.drugs.forEach(d => {
                if (d.isActive) {
                     drugOptions += `<option value="${SafeHtml.escapeAttribute(d.drugId)}">${SafeHtml.escapeHtml(d.drugName)} (${SafeHtml.escapeHtml(d.genericName || '')})</option>`;
                }
            });

            const html = `
                <form id="rx-create-form" style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Patient Profile</label>
                            <select id="rx-patient-id" class="form-control" required>
                                ${patientOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Doctor Name</label>
                            <input type="text" id="rx-doctor-name" class="form-control" placeholder="Dr. John Doe" required>
                        </div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Hospital/Clinic</label>
                            <input type="text" id="rx-clinic" class="form-control" placeholder="City General Hospital">
                        </div>
                        <div class="form-group">
                            <label>Issue Date</label>
                            <input type="date" id="rx-issue-date" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                        </div>
                    </div>

                    <div style="border-top:1px solid var(--border-color); padding-top:15px; margin-top:10px;">
                        <h4 style="margin-bottom:10px;">Prescribed Medications</h4>
                        <div id="rx-form-items" style="display:flex; flex-direction:column; gap:12px; margin-bottom:15px;">
                            <!-- Items row injected here -->
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="Prescriptions.addFormItemRow()">+ Add Medication</button>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 12px; border-top:1px solid var(--border-color); padding-top:15px;">
                        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">CREATE PRESCRIPTION</button>
                    </div>
                </form>
            `;

            App.openModal('Create Medical Prescription', html);

            // Bind submit event
            document.getElementById('rx-create-form').addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitNewPrescription();
            });

            // Add first item row by default
            this.addFormItemRow();

        } catch (e) {
            App.toast('Failed to load prescription form dependencies.', 'error');
        }
    },

    addFormItemRow() {
        const container = document.getElementById('rx-form-items');
        
        let drugOptions = '';
        this.drugs.forEach(d => {
            if (d.isActive) {
                 drugOptions += `<option value="${SafeHtml.escapeAttribute(d.drugId)}">${SafeHtml.escapeHtml(d.drugName)}</option>`;
            }
        });

        const row = document.createElement('div');
        row.className = 'rx-item-row';
        row.style = 'display: grid; grid-template-columns: 2fr 1fr 2fr auto; gap:12px; align-items:center;';
        row.innerHTML = `
            <div class="form-group">
                <select class="form-control rx-item-drug" required>
                    ${drugOptions}
                </select>
            </div>
            <div class="form-group">
                <input type="number" class="form-control rx-item-qty" placeholder="Qty" min="1" value="10" required>
            </div>
            <div class="form-group">
                <input type="text" class="form-control rx-item-instructions" placeholder="Dosage instructions (e.g. 1-0-1 after food)" required>
            </div>
            <div style="color:var(--accent-red); cursor:pointer;" onclick="this.parentElement.remove()">
                <svg style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </div>
        `;
        container.appendChild(row);
    },

    async submitNewPrescription() {
        const patientId = document.getElementById('rx-patient-id').value;
        const doctorName = document.getElementById('rx-doctor-name').value;
        const hospitalClinic = document.getElementById('rx-clinic').value;
        const issueDate = document.getElementById('rx-issue-date').value;

        // Gather items
        const itemRows = document.querySelectorAll('.rx-item-row');
        const items = [];

        itemRows.forEach(row => {
            const drugId = row.querySelector('.rx-item-drug').value;
            const quantity = row.querySelector('.rx-item-qty').value;
            const dosageInstructions = row.querySelector('.rx-item-instructions').value;

            items.push({
                drugId: parseInt(drugId),
                quantity: parseInt(quantity),
                dosageInstructions: dosageInstructions,
                frequency: 'Daily',
                duration: '7 Days'
            });
        });

        if (items.length === 0) {
            App.toast('Please prescribe at least one medication.', 'warning');
            return;
        }

        const payload = {
            patientId: parseInt(patientId),
            doctorName: doctorName,
            doctorLicenseNo: 'LIC-RX-' + Math.floor(Math.random() * 90000 + 10000),
            hospitalClinic: hospitalClinic,
            issueDate: issueDate,
            items: items,
            status: 'PENDING'
        };

        try {
            const res = await API.post('/prescriptions', payload);
            App.toast(`Prescription ${res.rxNumber} registered!`, 'success');
            App.closeModal();
            await this.load();
        } catch (e) {
            App.toast(`Registration failed: ${e.message}`, 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Bind search bar filter
    const search = document.getElementById('rx-search');
    if (search) {
        search.addEventListener('input', App.debounce((e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('#rx-table-body tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
            });
        }));
    }
});
