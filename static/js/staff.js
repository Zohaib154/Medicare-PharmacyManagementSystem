const Staff = {
    staffMembers: [],

    async load() {
        try {
            this.staffMembers = await API.get('/users');
            this.renderStaffList();
        } catch (e) {
            console.error('Failed to load staff list', e);
            App.toast('Could not fetch staff members.', 'error');
        }
    },

    renderStaffList() {
        const tableBody = document.getElementById('staff-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const currentUser = API.getUserInfo();
        // Only show active staff — inactive staff hidden from list (same as suppliers)
        // Admin accounts are always shown regardless of active state
        const visibleStaff = this.staffMembers.filter(user => {
            const roles = Array.isArray(user.roles) ? user.roles : [];
            const isAdmin = roles.includes('ROLE_ADMIN');
            return user.isActive || isAdmin; // admins always visible
        });

        if (visibleStaff.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No staff members found.</td></tr>';
            return;
        }

        visibleStaff.forEach(user => {
            const tr = document.createElement('tr');
            const roles = Array.isArray(user.roles) ? user.roles : [];
            const isAdmin = roles.includes('ROLE_ADMIN');
            const roleBadges = roles.map(r => `<span class="badge badge-blue" style="margin-right:4px;">${SafeHtml.escapeHtml(String(r).replace('ROLE_', ''))}</span>`).join('');
            const isSelf = currentUser && user.userId === currentUser.userId;

            // Active user → Edit only (deactivate via Status dropdown in Edit)
            // Inactive admin → Edit + Remove (admins are always shown even when inactive)
            // Current user → label only
            let actionBtns = '';
            if (isSelf) {
                actionBtns = '<span style="font-size:11px;color:var(--text-muted);">Current user</span>';
            } else if (user.isActive) {
                actionBtns = `<button class="btn btn-secondary btn-sm" onclick="Staff.openEditModal(${SafeHtml.inlineArgument(user.userId)})">Edit</button>`;
            } else {
                // Inactive admin shown with Edit + Remove
                actionBtns = `
                     <button class="btn btn-secondary btn-sm" onclick="Staff.openEditModal(${SafeHtml.inlineArgument(user.userId)})">Edit</button>
                     <button class="btn btn-danger btn-sm" onclick="Staff.deleteStaff(${SafeHtml.inlineArgument(user.userId)})">Remove</button>
                `;
            }

            tr.innerHTML = `
                <td>
                     <div style="font-weight:600;">${SafeHtml.escapeHtml(user.fullName)}</div>
                     <div style="font-size:12px; color:var(--text-secondary);">@${SafeHtml.escapeHtml(user.username)}</div>
                 </td>
                 <td>${SafeHtml.escapeHtml(user.email || '—')}</td>
                 <td>${SafeHtml.escapeHtml(user.contactNumber || '—')}</td>
                <td>${roleBadges}</td>
                <td><span class="badge ${user.isActive ? 'badge-green' : 'badge-red'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${actionBtns}
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    },

    openAddModal() {
        const html = `
            <form id="add-staff-form" class="form-grid">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="staff-username" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" id="staff-fullname" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="staff-email" class="form-control">
                </div>
                <div class="form-group">
                    <label>Contact Number</label>
                    <input type="text" id="staff-contact" class="form-control">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="staff-password" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Roles (Comma separated)</label>
                    <input type="text" id="staff-roles" class="form-control" value="ROLE_PHARMACIST"
                        placeholder="ROLE_PHARMACIST, ROLE_CASHIER, ROLE_STORE_MANAGER, ROLE_ADMIN">
                </div>
                <div style="grid-column: span 2; display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Create User</button>
                </div>
            </form>
        `;
        App.openModal('Add New Staff Member', html);

        document.getElementById('add-staff-form').onsubmit = async (e) => {
            e.preventDefault();
            const rolesArr = document.getElementById('staff-roles').value.split(',').map(r => r.trim()).filter(r => r);
            const newUser = {
                username: document.getElementById('staff-username').value,
                fullName: document.getElementById('staff-fullname').value,
                email: document.getElementById('staff-email').value,
                contactNumber: document.getElementById('staff-contact').value,
                passwordHash: document.getElementById('staff-password').value,
                roles: rolesArr,
                isActive: true
            };

            try {
                await API.post('/users', newUser);
                App.toast('Staff member created!', 'success');
                App.closeModal();
                this.load();
            } catch (err) {
                App.toast(err.message, 'error');
            }
        };
    },

    async openEditModal(userId) {
        const user = this.staffMembers.find(u => u.userId === userId);
        if (!user) return;
        const roles = Array.isArray(user.roles) ? user.roles : [];

        const html = `
            <form id="edit-staff-form" class="form-grid">
                <div class="form-group">
                    <label>Full Name</label>
                     <input type="text" id="edit-staff-fullname" class="form-control" value="${SafeHtml.escapeAttribute(user.fullName)}" required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                     <input type="email" id="edit-staff-email" class="form-control" value="${SafeHtml.escapeAttribute(user.email || '')}">
                </div>
                <div class="form-group">
                    <label>Contact Number</label>
                     <input type="text" id="edit-staff-contact" class="form-control" value="${SafeHtml.escapeAttribute(user.contactNumber || '')}">
                </div>
                <div class="form-group">
                    <label>New Password (Leave blank to keep current)</label>
                    <input type="password" id="edit-staff-password" class="form-control">
                </div>
                <div class="form-group">
                    <label>Roles (Comma separated)</label>
                     <input type="text" id="edit-staff-roles" class="form-control" value="${SafeHtml.escapeAttribute(roles.join(', '))}">
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="edit-staff-active" class="form-control">
                        <option value="true" ${user.isActive ? 'selected' : ''}>Active</option>
                        <option value="false" ${!user.isActive ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
                <div style="grid-column: span 2; display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Update User</button>
                </div>
            </form>
        `;
        App.openModal('Edit Staff Member', html);

        document.getElementById('edit-staff-form').onsubmit = async (e) => {
            e.preventDefault();
            const rolesArr = document.getElementById('edit-staff-roles').value.split(',').map(r => r.trim()).filter(r => r);
            const isActive = document.getElementById('edit-staff-active').value === 'true';
            const updatedUser = {
                fullName: document.getElementById('edit-staff-fullname').value,
                email: document.getElementById('edit-staff-email').value,
                contactNumber: document.getElementById('edit-staff-contact').value,
                passwordHash: document.getElementById('edit-staff-password').value,
                roles: rolesArr,
                isActive
            };

            try {
                await API.put(`/users/${userId}`, updatedUser);
                // Give a clear message when someone was deactivated
                if (!isActive && user.isActive) {
                    App.toast(`${updatedUser.fullName} has been deactivated. The "Remove" button will now appear on their row.`, 'warning');
                } else {
                    App.toast('Staff member updated!', 'success');
                }
                App.closeModal();
                this.load();
            } catch (err) {
                App.toast(err.message, 'error');
            }
        };
    },

    // Permanently remove an already-inactive staff member
    async deleteStaff(userId) {
        const user = this.staffMembers.find(u => u.userId === userId);
        if (!user) return;
        if (user.isActive) {
            App.toast('Staff member is still active. Set their status to Inactive via Edit first.', 'warning');
            return;
        }
        if (!await App.confirm(`Permanently remove "${user.fullName}" (@${user.username})?\n\nThis cannot be undone.`, { title: 'Remove Staff', confirmLabel: 'Remove', danger: true })) return;
        try {
            await API.delete(`/users/${userId}`);
            App.toast(`Staff member @${user.username} permanently removed.`, 'success');
            this.load();
        } catch (e) {
            App.toast(e.message, 'error');
        }
    }
};
