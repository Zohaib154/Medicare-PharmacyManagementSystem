const Patients = {
    patients: [],
    _loadPromise: null,

    async load() {
        if (typeof App !== 'undefined' && App.activeTab === 'backup' && App.invalidateTabs) App.invalidateTabs('dashboard', 'pos', 'prescriptions');
        return this.fetchPatients();
    },

    async fetchPatients() {
        if (this._loadPromise) return this._loadPromise;
        const promise = (async () => {
            try {
                const data = await API.get('/patients?size=100');
                this.patients = (Array.isArray(data) ? data : (data.content || [])).slice(0, 100);
                await this.renderList();
                return true;
            } catch (e) {
                App.toast('Failed to load patient registries.', 'error');
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
        const tbody = document.getElementById('patients-table-body');
        if (!tbody) return;
        if (this.patients.length === 0) {
            await App.renderRows(tbody, [], () => null, {
                emptyHtml: `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">
                            No patients registered in the system database.
                        </td>
                    </tr>
                `
            });
            return;
        }

        await App.renderRows(tbody, this.patients, p => {
            const tr = document.createElement('tr');
            const dob = p.dateOfBirth
                ? (Array.isArray(p.dateOfBirth)
                    ? new Date(p.dateOfBirth[0], p.dateOfBirth[1]-1, p.dateOfBirth[2]).toLocaleDateString()
                    : new Date(p.dateOfBirth).toLocaleDateString())
                : 'N/A';
            tr.innerHTML = `
                <td><div style="font-weight: 600;">${SafeHtml.escapeHtml(p.fullName)}</div></td>
                <td style="font-family: var(--font-mono);">${SafeHtml.escapeHtml(dob)}</td>
                <td><span class="badge badge-muted">${SafeHtml.escapeHtml(p.gender || 'Other')}</span></td>
                <td style="font-family: var(--font-mono);">${SafeHtml.escapeHtml(p.contactNumber || 'N/A')}</td>
                <td><span class="badge badge-red" style="font-family: var(--font-mono);">${SafeHtml.escapeHtml(p.bloodGroup || 'N/A')}</span></td>
                <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color:var(--text-secondary); font-size:14px;" title="${SafeHtml.escapeAttribute(p.allergies || 'None')}">${SafeHtml.escapeHtml(p.allergies || 'None')}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="Patients.openHistory(${SafeHtml.inlineArgument(p.patientId)})">View File</button>
                        <button class="btn btn-primary btn-sm" onclick="Patients.openEditModal(${SafeHtml.inlineArgument(p.patientId)})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="Patients.deletePatient(${SafeHtml.inlineArgument(p.patientId)})">Remove</button>
                    </div>
                </td>
            `;
            return tr;
        });
    },

    openAddModal() {
        this.openPatientModal();
    },

    openEditModal(patientId) {
        const p = this.patients.find(item => item.patientId === patientId);
        if (p) {
            this.openPatientModal(p);
        }
    },

    openPatientModal(p = null) {
        const title = p ? 'Edit Patient Profile' : 'Register New Patient Profile';
        
        let bloodOptions = `<option value="">Unknown / N/A</option>`;
        const bloodGroups = [
            { val: 'A_POSITIVE', label: 'A+' },
            { val: 'A_NEGATIVE', label: 'A-' },
            { val: 'B_POSITIVE', label: 'B+' },
            { val: 'B_NEGATIVE', label: 'B-' },
            { val: 'AB_POSITIVE', label: 'AB+' },
            { val: 'AB_NEGATIVE', label: 'AB-' },
            { val: 'O_POSITIVE', label: 'O+' },
            { val: 'O_NEGATIVE', label: 'O-' }
        ];
        bloodGroups.forEach(bg => {
            const selected = p && p.bloodGroup === bg.val ? 'selected' : '';
            bloodOptions += `<option value="${bg.val}" ${selected}>${bg.label}</option>`;
        });

        const html = `
            <form id="patient-form" style="display: flex; flex-direction: column; gap: 20px;">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Patient Full Name</label>
                         <input type="text" id="patient-name" class="form-control" placeholder="e.g. Richard Hendricks" value="${SafeHtml.escapeAttribute(p ? p.fullName : '')}" required>
                    </div>
                    <div class="form-group">
                        <label>Date of Birth</label>
                         <input type="date" id="patient-dob" class="form-control" value="${SafeHtml.escapeAttribute(p ? p.dateOfBirth : '1990-01-01')}" required>
                    </div>
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label>Gender</label>
                        <select id="patient-gender" class="form-control" required>
                            <option value="MALE" ${p && p.gender === 'MALE' ? 'selected' : ''}>Male</option>
                            <option value="FEMALE" ${p && p.gender === 'FEMALE' ? 'selected' : ''}>Female</option>
                            <option value="OTHER" ${p && p.gender === 'OTHER' ? 'selected' : ''}>Other</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Contact Phone Number</label>
                         <input type="text" id="patient-contact" class="form-control" placeholder="e.g. 555-0199" value="${SafeHtml.escapeAttribute(p ? p.contactNumber || '' : '')}" required>
                    </div>
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label>Email Address</label>
                         <input type="email" id="patient-email" class="form-control" placeholder="e.g. patient@email.com" value="${SafeHtml.escapeAttribute(p ? p.email || '' : '')}">

                    </div>
                    <div class="form-group">
                        <label>Blood Group</label>
                        <select id="patient-blood" class="form-control">
                            ${bloodOptions}
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label>Address</label>
                     <input type="text" id="patient-address" class="form-control" placeholder="e.g. 123 Main St, City" value="${SafeHtml.escapeAttribute(p ? p.address || '' : '')}">

                </div>

                <div class="form-group">
                    <label>National ID / CNIC Number</label>
                     <input type="text" id="patient-cnic" class="form-control" placeholder="e.g. 35202-1234567-1" value="${SafeHtml.escapeAttribute(p ? p.cnicNumber || '' : '')}">

                </div>

                <div class="form-group">
                    <label>Medical History / Known Allergies</label>
                     <textarea id="patient-history" class="form-control" placeholder="Describe drug allergies (e.g. Penicillin allergy)..." rows="2">${SafeHtml.escapeHtml(p ? (p.allergies || '') : '')}</textarea>
                </div>

                <div class="form-group">
                    <label>Chronic Conditions</label>
                     <textarea id="patient-chronic" class="form-control" placeholder="e.g. Diabetes Type 2, Hypertension..." rows="2">${SafeHtml.escapeHtml(p ? (p.chronicConditions || '') : '')}</textarea>
                </div>

                <div class="form-group">
                    <label>Current Medications</label>
                     <textarea id="patient-medications" class="form-control" placeholder="e.g. Metformin 500mg, Lisinopril 10mg..." rows="2">${SafeHtml.escapeHtml(p ? (p.currentMedications || '') : '')}</textarea>
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label>Insurance Provider</label>
                         <input type="text" id="patient-insurance-provider" class="form-control" placeholder="e.g. BlueCross" value="${SafeHtml.escapeAttribute(p ? p.insuranceProvider || '' : '')}">

                    </div>
                    <div class="form-group">
                        <label>Insurance Policy No.</label>
                         <input type="text" id="patient-insurance-policy" class="form-control" placeholder="e.g. BC-9876543" value="${SafeHtml.escapeAttribute(p ? p.insurancePolicyNo || '' : '')}">

                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top:1px solid var(--border-color); padding-top:15px;">
                    <div>
                        ${p ? `<button type="button" class="btn btn-danger btn-sm" onclick="Patients.deletePatient(${SafeHtml.inlineArgument(p.patientId)})">Remove Profile</button>` : ''}
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">${p ? 'SAVE CHANGES' : 'REGISTER PATIENT'}</button>
                    </div>
                </div>
            </form>
        `;

        App.openModal(title, html);

        // Bind form submit
        document.getElementById('patient-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitPatient(p ? p.patientId : null);
        });
    },

    async submitPatient(patientId = null) {
        const fullName = document.getElementById('patient-name').value.trim();
        const dateOfBirth = document.getElementById('patient-dob').value;
        const gender = document.getElementById('patient-gender').value;
        const contactNumber = document.getElementById('patient-contact').value.trim() || null;
        const email = document.getElementById('patient-email').value.trim() || null;
        const bloodGroup = document.getElementById('patient-blood').value || null;
        const address = document.getElementById('patient-address').value.trim() || null;
        const cnicNumber = document.getElementById('patient-cnic').value.trim() || null;
        const allergies = document.getElementById('patient-history').value.trim() || null;
        const chronicConditions = document.getElementById('patient-chronic').value.trim() || null;
        const currentMedications = document.getElementById('patient-medications').value.trim() || null;
        const insuranceProvider = document.getElementById('patient-insurance-provider').value.trim() || null;
        const insurancePolicyNo = document.getElementById('patient-insurance-policy').value.trim() || null;

        const payload = {
            fullName,
            dateOfBirth,
            gender,
            contactNumber,
            email,
            bloodGroup,
            address,
            cnicNumber,
            allergies,
            chronicConditions,
            currentMedications,
            insuranceProvider,
            insurancePolicyNo
        };

        try {
            if (patientId) {
                await API.put(`/patients/${patientId}`, payload);
                App.toast(`Patient ${fullName} updated successfully.`, 'success');
            } else {
                await API.post('/patients', payload);
                App.toast(`Patient ${fullName} registered successfully.`, 'success');
            }
            App.closeModal();
            if (typeof App !== 'undefined' && App.invalidateTabs) {
                App.invalidateTabs('pos', 'prescriptions');
            }
            await this.load();
        } catch (e) {
            App.toast(`Saving failed: ${e.message}`, 'error');
        }
    },

    async deletePatient(patientId) {
        const p = this.patients.find(item => item.patientId === patientId);
        const name = p ? p.fullName : 'this patient profile';
        if (!await App.confirm(`Permanently remove patient profile for "${name}"?\n\nThis cannot be undone.`, { title: 'Remove Patient Profile', confirmLabel: 'Yes, Remove Profile', danger: true })) return;
        try {
            await API.delete(`/patients/${patientId}`);
            App.toast(`Patient profile "${name}" removed.`, 'success');
            App.closeModal();
            if (typeof App !== 'undefined' && App.invalidateTabs) {
                App.invalidateTabs('pos', 'prescriptions');
            }
            await this.load();
        } catch (e) {
            App.toast(`Failed to remove patient: ${e.message}`, 'error');
        }
    },

    async openHistory(patientId) {
        const p = this.patients.find(item => item.patientId === patientId);
        if (!p) return;

        try {
            const salesData = await API.get(`/sales/patient/${patientId}`);
            const sales = Array.isArray(salesData) ? salesData : (salesData?.content || []);
            const recentSales = sales.slice(0, 25);
            let billHistoryHtml = '';
            if (recentSales.length > 0) {
                recentSales.forEach(sale => {
                    const billDate = App.formatLocalDateTime(sale.saleDateTime);
                    const totalFormatted = App.formatCurrency(sale.totalAmount);
                    const itemsString = (sale.items || []).map(item => `${item.drugName} (x${item.quantity})`).join(', ');

                    billHistoryHtml += `
                        <div style="background-color:var(--bg-primary); border:1px solid var(--border-color); padding: 12px; border-radius:8px;">
                            <div style="display:flex; justify-content:space-between; font-weight:600; font-size:14px; margin-bottom:4px;">
                                <span>Bill: ${SafeHtml.escapeHtml(sale.billNumber)}</span>
                                <span style="color:var(--accent-green);">${SafeHtml.escapeHtml(totalFormatted)}</span>
                            </div>
                            <div style="font-size:12px; color:var(--text-secondary); mb-4">Date: ${SafeHtml.escapeHtml(billDate)}</div>
                            <div style="font-size:12px; color:var(--text-muted); line-height:1.4;">Items: ${SafeHtml.escapeHtml(itemsString)}</div>
                        </div>
                    `;
                });
            } else {
                billHistoryHtml = '<p style="color:var(--text-muted); font-size:13px; text-align:center;">No past purchase records found for this patient.</p>';
            }

            const html = `
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div>
                        <h4 style="color:var(--accent-blue); margin-bottom:8px;">Patient Medical File</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:14px; line-height:1.5;">
                            <div><span style="color:var(--text-secondary);">Phone:</span> ${SafeHtml.escapeHtml(p.contactNumber || 'N/A')}</div>
                            <div><span style="color:var(--text-secondary);">Blood Group:</span> ${SafeHtml.escapeHtml(p.bloodGroup || 'N/A')}</div>
                            <div><span style="color:var(--text-secondary);">DOB:</span> ${SafeHtml.escapeHtml(new Date(p.dateOfBirth).toLocaleDateString())}</div>
                            <div><span style="color:var(--text-secondary);">Gender:</span> ${SafeHtml.escapeHtml(p.gender || 'N/A')}</div>
                        </div>
                        <div style="margin-top:10px; background-color:rgba(255, 93, 143, 0.05); border: 1px dashed var(--accent-red-glow); padding:10px; border-radius:6px; font-size:13px;">
                            <strong>Known Allergies / Case History:</strong>
                             <p style="margin-top:4px; color:var(--text-secondary);">${SafeHtml.escapeHtml(p.allergies || 'No drug allergies or medical conditions registered.')}</p>
                        </div>
                    </div>

                    <div style="border-top:1px solid var(--border-color); padding-top:15px;">
                        <h4 style="color:var(--accent-purple); margin-bottom:12px;">Billing & Prescription History</h4>
                        <div style="display:flex; flex-direction:column; gap:10px; max-height:220px; overflow-y:auto; padding-right:4px;">
                            ${billHistoryHtml}
                        </div>
                    </div>
                    
                    <div style="display:flex; justify-content:flex-end; border-top:1px solid var(--border-color); padding-top:15px;">
                        <button class="btn btn-secondary" onclick="App.closeModal()">Close Profile</button>
                    </div>
                </div>
            `;

            App.openModal(`Patient File — ${p.fullName}`, html);
        } catch (e) {
            App.toast('Failed to load patient history: ' + e.message, 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Bind search bar filter
    const search = document.getElementById('patients-search');
    if (search) {
        search.addEventListener('input', App.debounce((e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('#patients-table-body tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
            });
        }));
    }
});
