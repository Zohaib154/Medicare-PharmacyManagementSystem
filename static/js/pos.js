const POS = {
    cart: [],
    drugs: [],
    patients: [],
    currentReceipt: null,
    catalogPage: 0,
    catalogPageSize: 50,
    catalogQuery: '',
    catalogTotalPages: 1,
    _drugRequestId: 0,
    _patientRequestId: 0,

    async load(options = {}) {
        const resetCart = options.resetCart !== false;
        if (resetCart) {
            this.cart = [];
            this.updateCartUI();
            document.getElementById('pos-discount').value = 0;
            document.getElementById('pos-amount-paid').value = "";
            this.calculateTotals(0, 0, 0);
        }

        const settings = (typeof AppSettings !== 'undefined') ? AppSettings.load() : {};
        const symbol = settings.currencySymbol || '$';
        const amtPaidInput = document.getElementById('pos-amount-paid');
        if (amtPaidInput) {
            amtPaidInput.placeholder = `${symbol} Amount tendered`;
        }
        if (!resetCart && this.cart.length > 0) {
            this.recalculateCartValues();
        }

        const results = await Promise.all([
            this.fetchPatients(),
            this.fetchDrugs()
        ]);
        return results.every(result => result !== false);
    },

    async fetchPatients() {
        const requestId = ++this._patientRequestId;
        try {
            const data = await API.get('/patients?size=100');
            if (requestId !== this._patientRequestId) return false;
            this.patients = (Array.isArray(data) ? data : (data.content || [])).slice(0, 100);
            const select = document.getElementById('pos-select-patient');
            if (select) {
                const walkIn = document.createElement('option');
                walkIn.value = '';
                walkIn.textContent = 'Walk-in Customer';
                const fragment = document.createDocumentFragment();
                this.patients.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.patientId;
                    option.textContent = `${p.fullName} (${p.contactNumber || 'No Contact'})`;
                    fragment.appendChild(option);
                });
                select.replaceChildren(walkIn, fragment);
            }
            return true;
        } catch (e) {
            console.error('Failed to fetch patients for POS', e);
            return false;
        }
    },

    async fetchDrugs() {
        const requestId = ++this._drugRequestId;
        try {
            const drugsWithStock = await API.get('/drugs/with-stock');
            if (requestId !== this._drugRequestId) return false;
            this.drugs = Array.isArray(drugsWithStock) ? drugsWithStock : [];
            await this.renderDrugList();
            return true;
        } catch (e) {
            if (requestId !== this._drugRequestId) return false;
            const drugListTable = document.getElementById('pos-drug-list-table');
            if (drugListTable) {
                 drugListTable.innerHTML = `<tr><td colspan="6" class="catalogue-error">Unable to load the catalogue. ${SafeHtml.escapeHtml(e.message || 'Please try again.')}<button class="btn btn-secondary btn-sm" onclick="POS.fetchDrugs()">Retry</button></td></tr>`;
            }
            const pagination = document.getElementById('pos-drug-pagination');
            if (pagination) pagination.remove();
            App.toast(`Catalogue unavailable: ${e.message || 'Please try again.'}`, 'error');
            return false;
        }
    },

    getFilteredDrugs() {
        const query = this.catalogQuery.trim().toLowerCase();
        if (!query) return this.drugs;
        return this.drugs.filter(d => [
            d.drugName,
            d.genericName,
            d.category,
            d.dosageForm,
            d.strength
        ].some(value => String(value || '').toLowerCase().includes(query)));
    },

    async renderDrugList() {
        const drugListTable = document.getElementById('pos-drug-list-table');
        if (!drugListTable) return;
        const filtered = this.getFilteredDrugs();
        this.catalogTotalPages = Math.max(1, Math.ceil(filtered.length / this.catalogPageSize));
        this.catalogPage = Math.max(0, Math.min(this.catalogPage, this.catalogTotalPages - 1));
        const start = this.catalogPage * this.catalogPageSize;
        const visible = filtered.slice(start, start + this.catalogPageSize);

        if (visible.length === 0) {
            await App.renderRows(drugListTable, [], () => null, {
                emptyHtml: '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px;">No medications match your search.</td></tr>'
            });
        } else {
            await App.renderRows(drugListTable, visible, d => {
                const totalStock = Number(d.totalStock) || 0;
                let stockBadgeClass = 'badge-green';
                let stockStatusText = `${totalStock} in stock`;
                if (totalStock === 0) {
                    stockBadgeClass = 'badge-red';
                    stockStatusText = 'Out of Stock';
                } else if (totalStock < 20) {
                    stockBadgeClass = 'badge-orange';
                    stockStatusText = `Low Stock (${totalStock})`;
                }
                const tr = document.createElement('tr');
                 tr.innerHTML = `
                     <td>
                         <div style="font-weight: 600;">${SafeHtml.escapeHtml(d.drugName)}</div>
                         <div style="font-size: 12px; color: var(--text-secondary);">${SafeHtml.escapeHtml(d.genericName || '')}</div>
                     </td>
                     <td><span class="badge badge-muted">${SafeHtml.escapeHtml(d.dosageForm || 'Tablet')}</span> <span style="font-size:12px;">${SafeHtml.escapeHtml(d.strength || '')}</span></td>
                     <td style="font-family: var(--font-mono); font-size:13px;">—</td>
                     <td><span class="badge ${stockBadgeClass}">${SafeHtml.escapeHtml(stockStatusText)}</span></td>
                     <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-primary);">${SafeHtml.escapeHtml(App.formatCurrency(d.mrp))}</td>
                     <td>
                         <button class="btn btn-primary btn-sm" onclick="POS.addToCart(${SafeHtml.inlineArgument(d.drugId)})" ${totalStock === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                             ADD TO BILL
                         </button>
                     </td>
                 `;
                return tr;
            });
        }
        this.renderCatalogPagination(filtered.length);
    },

    renderCatalogPagination(totalItems) {
        const table = document.getElementById('pos-drug-list-table');
        const tableContainer = table?.closest('.table-container');
        if (!tableContainer?.parentNode) return;
        let controls = document.getElementById('pos-drug-pagination');
        if (totalItems === 0) {
            if (controls) controls.remove();
            return;
        }
        if (!controls) {
            controls = document.createElement('div');
            controls.id = 'pos-drug-pagination';
            controls.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 0;font-size:13px;';
            tableContainer.parentNode.appendChild(controls);
        }
        const previous = document.createElement('button');
        previous.className = 'btn btn-secondary btn-sm';
        previous.textContent = '← Previous';
        previous.disabled = this.catalogPage === 0;
        previous.onclick = () => {
            this.catalogPage--;
            this.renderDrugList();
        };
        const info = document.createElement('span');
        info.style.cssText = 'color:var(--text-secondary);font-weight:600;';
        info.textContent = `Page ${this.catalogPage + 1} of ${this.catalogTotalPages} (${totalItems} medications)`;
        const next = document.createElement('button');
        next.className = 'btn btn-secondary btn-sm';
        next.textContent = 'Next →';
        next.disabled = this.catalogPage >= this.catalogTotalPages - 1;
        next.onclick = () => {
            this.catalogPage++;
            this.renderDrugList();
        };
        controls.replaceChildren(previous, info, next);
    },

    setSearchQuery(query) {
        this.catalogQuery = query || '';
        this.catalogPage = 0;
        return this.renderDrugList();
    },

    addToCart(drugId) {
        const drug = this.drugs.find(d => String(d.drugId) === String(drugId));
        if (!drug) return;

        const cartItem = this.cart.find(item => String(item.drugId) === String(drugId));
        if (cartItem) {
            cartItem.quantity += 1;
        } else {
            this.cart.push({
                drugId: drug.drugId,
                drugName: drug.drugName,
                mrp: drug.mrp,
                gstPercent: drug.gstPercent || 12.00,
                quantity: 1
            });
        }
        
        App.toast(`${drug.drugName} added to register drawer.`, 'success');
        this.updateCartUI();
    },

    updateQty(drugId, change) {
        const item = this.cart.find(item => String(item.drugId) === String(drugId));
        if (!item) return;

        item.quantity += change;
        if (item.quantity <= 0) {
            this.removeFromCart(drugId);
        } else {
            this.updateCartUI();
        }
    },

    removeFromCart(drugId) {
        const idx = this.cart.findIndex(item => String(item.drugId) === String(drugId));
        if (idx !== -1) {
            const name = this.cart[idx].drugName;
            this.cart.splice(idx, 1);
            App.toast(`${name} removed from register drawer.`, 'warning');
            this.updateCartUI();
        }
    },

    updateCartUI() {
        const cartList = document.getElementById('pos-cart-list');
        cartList.innerHTML = '';

        document.getElementById('pos-cart-badge').textContent = `${this.cart.length} Items`;

        if (this.cart.length === 0) {
            cartList.innerHTML = `
                <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color: var(--text-muted); text-align:center; padding: 40px 0;">
                    <svg style="width: 48px; height: 48px; stroke: currentColor; fill:none; stroke-width:1.5; margin-bottom:12px;" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    <p style="font-weight: 500;">Register Drawer Empty</p>
                    <p style="font-size:12px; margin-top:4px;">Add medications from the catalog on the left to start billing.</p>
                </div>
            `;
            this.calculateTotals(0, 0, 0);
            return;
        }

        const fragment = document.createDocumentFragment();
        this.cart.forEach(item => {
            const priceFormatted = App.formatCurrency(item.mrp * item.quantity);
            
            const div = document.createElement('div');
            div.className = 'cart-item';
             div.innerHTML = `
                 <div class="cart-item-info">
                     <div class="cart-item-title">${SafeHtml.escapeHtml(item.drugName)}</div>
                     <div class="cart-item-meta">${SafeHtml.escapeHtml(App.formatCurrency(item.mrp))} each (Tax: ${SafeHtml.escapeHtml(item.gstPercent)}%)</div>
                 </div>
                 <div class="cart-item-qty">
                     <div class="qty-btn" onclick="POS.updateQty(${SafeHtml.inlineArgument(item.drugId)}, -1)">-</div>
                     <div style="font-weight: 600; font-size:14px; min-width:20px; text-align:center;">${SafeHtml.escapeHtml(item.quantity)}</div>
                     <div class="qty-btn" onclick="POS.updateQty(${SafeHtml.inlineArgument(item.drugId)}, 1)">+</div>
                 </div>
                 <div style="font-family: var(--font-mono); font-weight: 700; font-size: 14px; min-width: 70px; text-align: right;">${SafeHtml.escapeHtml(priceFormatted)}</div>
                 <div style="color: var(--accent-red); cursor: pointer; display: flex; align-items: center;" onclick="POS.removeFromCart(${SafeHtml.inlineArgument(item.drugId)})">
                     <svg style="width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:2;" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                 </div>
             `;
            fragment.appendChild(div);
        });
        cartList.appendChild(fragment);

        this.recalculateCartValues();
    },

    recalculateCartValues() {
        let subtotal = 0;
        let totalGst = 0;
        const discountPct = parseFloat(document.getElementById('pos-discount').value) || 0;

        this.cart.forEach(item => {
            const lineTotal = item.mrp * item.quantity;
            const itemGst = lineTotal * (item.gstPercent / 100);
            subtotal += lineTotal;
            totalGst += itemGst;
        });

        const discountAmount = subtotal * (discountPct / 100);
        const grandTotal = (subtotal - discountAmount) + totalGst;

        this.calculateTotals(subtotal, totalGst, grandTotal);
    },

    calculateTotals(subtotal, gst, total) {
        const fmt = (val) => App.formatCurrency(val);
        document.getElementById('pos-subtotal').textContent = fmt(subtotal);
        document.getElementById('pos-gst').textContent = fmt(gst);
        document.getElementById('pos-total').textContent = fmt(total);

        // IMPORTANT: do NOT auto-fill the amount paid field. The cashier must
        // type the exact amount tendered themselves — auto-filling with the
        // grand total caused accidental/hasty checkouts.
    },

    async finalizeCheckout() {
        if (this.cart.length === 0) {
            App.toast('No items in checkout cart.', 'warning');
            return;
        }

        const user = API.getUserInfo();
        const patientId = document.getElementById('pos-select-patient').value;
        const paymentMethod = document.getElementById('pos-payment-method').value;
        const discountPercent = parseFloat(document.getElementById('pos-discount').value) || 0;
        const amountPaid = parseFloat(document.getElementById('pos-amount-paid').value) || 0;

        // Recompute the grand total the same way the cart totals are shown so we
        // can block underpayment. CASH leaves must tender >= the grand total; this
        // prevents "amount less than total" transaction warnings on the receipt.
        let subtotal = 0, totalGst = 0;
        const discPct = parseFloat(document.getElementById('pos-discount').value) || 0;
        this.cart.forEach(item => {
            const lineTotal = item.mrp * item.quantity;
            subtotal += lineTotal;
            totalGst += lineTotal * ((item.gstPercent || 0) / 100);
        });
        const grandTotal = (subtotal - (subtotal * (discPct / 100))) + totalGst;

        const requiresTender = paymentMethod === 'CASH' || paymentMethod === 'MOBILE_BANKING';
        if (requiresTender && amountPaid < grandTotal - 0.001) {
            App.toast(`Amount paid is less than the total. Please enter at least ${App.formatCurrency(grandTotal)}.`, 'error');
            return;
        }

        const requestBody = {
            soldById: user.userId,
            patientId: patientId ? parseInt(patientId) : null,
            paymentMethod: paymentMethod,
            discountPercent: discountPercent,
            amountPaid: amountPaid,
            items: this.cart.map(item => ({
                drugId: item.drugId,
                quantity: item.quantity,
                unitPrice: item.mrp,
                discountPercent: 0
            }))
        };

        try {
            const completedSale = await API.post('/sales', requestBody);
            App.toast(`Bill ${completedSale.billNumber} created successfully!`, 'success');
            
            this.showReceipt(completedSale);
            if (typeof App !== 'undefined' && App.invalidateTabs) {
                App.invalidateTabs('history', 'dashboard');
            }
            this.load({ resetCart: true });
        } catch (e) {
            App.toast(`Checkout failed: ${e.message}`, 'error');
        }
    },

    showReceipt(s) {
        this.currentReceipt = s;
        const fmt = (val) => App.formatCurrency(val);

        // Pull from AppSettings (persisted on server, loaded at login)
        const settings = (typeof AppSettings !== 'undefined') ? AppSettings.load() : {};
        const hospitalName   = settings.hospitalName   || 'MediCare Pharmacy';
        const ownerName      = settings.ownerName      || '';
        const address        = settings.address        || '';
        const phone          = settings.phone          || '';
        const invoiceFooter  = settings.invoiceFooter  || 'Thank you for your business!';
        const taxLabel       = settings.taxLabel       || 'GST';

        let itemsHtml = '';
        s.items.forEach(item => {
            itemsHtml += `
                <tr>
                 <td>${SafeHtml.escapeHtml(item.drugName)} x ${SafeHtml.escapeHtml(item.quantity)}</td>
                     <td style="text-align: right;">${SafeHtml.escapeHtml(fmt(item.unitPrice))}</td>
                     <td style="text-align: right;">${SafeHtml.escapeHtml(fmt(item.totalPrice))}</td>
                </tr>
            `;
        });

        const patientName = s.patientName || 'Walk-in Customer';
        const dateStr = App.formatLocalDateTime(s.saleDateTime);
        const discountPct = parseFloat(s.discountPercent) || 0;
        const discountAmt = parseFloat(s.discountAmount) || 0;

        const html = `
            <div class="receipt-wrapper">
                <div class="receipt-header">
                     <div class="receipt-title">${SafeHtml.escapeHtml(hospitalName)}</div>
                     ${ownerName ? `<div style="font-size: 12px; font-weight:600; margin-top:3px;">${SafeHtml.escapeHtml(ownerName)}</div>` : ''}
                     ${address ? `<div style="font-size: 11px; margin-top:4px;">${SafeHtml.escapeHtml(address)}</div>` : ''}
                     ${phone   ? `<div style="font-size: 11px;">Tel: ${SafeHtml.escapeHtml(phone)}</div>` : ''}
                </div>
                
                <div style="margin-bottom: 12px;">
                     <div class="receipt-details"><span>Bill Code:</span> <strong class="selectable">${SafeHtml.escapeHtml(s.billNumber)}</strong></div>
                     <div class="receipt-details"><span>Date:</span> <span>${SafeHtml.escapeHtml(dateStr)}</span></div>
                     <div class="receipt-details"><span>Operator:</span> <span>${SafeHtml.escapeHtml(s.soldByName)}</span></div>
                     <div class="receipt-details"><span>Customer:</span> <span>${SafeHtml.escapeHtml(patientName)}</span></div>
                     <div class="receipt-details"><span>Method:</span> <span>${SafeHtml.escapeHtml(s.paymentMethod)}</span></div>
                     <div class="receipt-details"><span>Status:</span> <span>${SafeHtml.escapeHtml(String(s.status || 'COMPLETED').toUpperCase())}</span></div>
                </div>

                <table class="receipt-table">
                    <thead>
                        <tr>
                            <th>Item Details</th>
                            <th style="text-align: right;">Rate</th>
                            <th style="text-align: right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="receipt-totals">
                     <div class="receipt-details"><span>Subtotal:</span> <span>${SafeHtml.escapeHtml(fmt(s.subtotal))}</span></div>
                     ${discountPct > 0 ? `<div class="receipt-details receipt-discount"><span>Bill Discount (${SafeHtml.escapeHtml(discountPct)}%):</span> <span>-${SafeHtml.escapeHtml(fmt(discountAmt))}</span></div>` : ''}
                     <div class="receipt-details"><span>${SafeHtml.escapeHtml(taxLabel)} Tax Total:</span> <span>${SafeHtml.escapeHtml(fmt(s.gstAmount))}</span></div>
                     <div class="receipt-details" style="font-size:16px; font-weight:700; border-top: 1px dashed black; padding-top:6px; margin-top:6px;">
                         <span>GRAND TOTAL:</span> <span>${SafeHtml.escapeHtml(fmt(s.totalAmount))}</span>
                     </div>
                     <div class="receipt-details" style="margin-top:6px;"><span>Cash Tendered:</span> <span>${SafeHtml.escapeHtml(fmt(s.amountPaid))}</span></div>
                     <div class="receipt-details"><span>Change Returned:</span> <span>${SafeHtml.escapeHtml(fmt(s.changeReturned))}</span></div>
                </div>

                <div class="receipt-footer">
                     <div>${SafeHtml.escapeHtml(invoiceFooter)}</div>
                     <div style="font-size:10px; color:var(--text-muted); margin-top:6px;">Please retain this receipt as proof of purchase.</div>
                     <div style="font-size:9px; color:var(--text-muted); margin-top:4px; font-family:var(--font-sans)">* Barcode Signature: ${SafeHtml.escapeHtml(s.billNumber)}-${SafeHtml.escapeHtml(s.saleId)} *</div>
                </div>
            </div>
            <div class="no-print" style="display:flex; justify-content: flex-end; gap:12px; margin-top:20px; flex-wrap: wrap;">
                <button class="btn btn-secondary" onclick="App.closeModal()">Close Window</button>
                <button class="btn btn-secondary" onclick="POS.saveReceiptPdf()">Save PDF</button>
                <button class="btn btn-primary" onclick="POS.printReceipt()">Print</button>
            </div>
        `;

        App.openModal('POS Sale Invoice', html);
    },

    async saveAndPrintReceipt() {
        if (!this.currentReceipt) {
            App.toast('No receipt data available to save or print.', 'error');
            return;
        }
        return this.printReceipt();
    },

    saveReceiptPdf() {
        if (!this.currentReceipt) {
            App.toast('No receipt data available for PDF export.', 'error');
            return 'ERROR';
        }
        try {
            const lines = ReceiptPdf.buildLines(this.currentReceipt);
            const pdfString = ReceiptPdf.generatePdfBytes(lines);
            return PrintHelper.savePdf(ReceiptPdf.toBase64(pdfString), ReceiptPdf.pdfFilename(this.currentReceipt));
        } catch (ex) {
            App.toast('PDF save failed: ' + (ex && ex.message ? ex.message : String(ex)), 'error');
            return 'ERROR';
        }
    },

    async printReceipt() {
        document.body.classList.add('printing-receipt');
        const cleanup = () => document.body.classList.remove('printing-receipt');
        window.addEventListener('afterprint', cleanup, { once: true });
        setTimeout(cleanup, 4000);

        const bridge = window.javaBridge;
        if (bridge && typeof bridge.printReceipt === 'function') {
            try {
                const res = PrintHelper.normalizeResult(bridge.printReceipt());
                if (res === 'PRINTED') {
                    App.toast('Document sent to printer.', 'success');
                    cleanup();
                    return res;
                } else if (res === 'CANCELLED') {
                    App.toast('Print cancelled.', 'info');
                    cleanup();
                    return res;
                } else if (res === 'NO_PRINTER') {
                    App.toast('No printer detected. Opening Save as PDF...', 'info');
                    cleanup();
                    return this.saveReceiptPdf();
                } else if (res === 'ERROR') {
                    App.toast('Print failed.', 'error');
                    cleanup();
                    return res;
                } else {
                    cleanup();
                    return res;
                }
            } catch (e) {
                console.error('bridge.printReceipt failed', e);
                App.toast('Print failed: ' + (e.message || String(e)), 'error');
                cleanup();
                return 'ERROR';
            }
        }

        if (typeof window.print === 'function') {
            window.print();
            return 'PRINTED';
        }
        return this.saveReceiptPdf();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Bind checkout button click
    const btn = document.getElementById('pos-checkout-btn');
    if (btn) {
        btn.addEventListener('click', () => POS.finalizeCheckout());
    }

    // Bind discount change recalculations
    const disc = document.getElementById('pos-discount');
    if (disc) {
        disc.addEventListener('input', () => POS.recalculateCartValues());
    }

    const search = document.getElementById('pos-search-drug');
    if (search) {
        search.addEventListener('input', App.debounce((e) => {
            POS.setSearchQuery(e.target.value);
        }));
    }
});
