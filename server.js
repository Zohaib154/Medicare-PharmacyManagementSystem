const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('./backend/db');
const Security = require('./backend/security');

const app = express();
app.use(cors());
app.use(['/api/backup/restore', '/backup/restore'], express.raw({ type: '*/*', limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static frontend assets
app.use(express.static(path.join(__dirname, 'static')));
app.use('/api', express.static(path.join(__dirname, 'static')));

// ==========================================
// 1. Auth Endpoints
// ==========================================
app.get(['/api/auth/lock-status', '/auth/lock-status'], (req, res) => {
    const status = Security.getLockStatus();
    res.json(status);
});

app.post(['/api/auth/login', '/auth/login'], (req, res) => {
    // 1. Check persistent lockout state
    const lockStatus = Security.getLockStatus();
    if (lockStatus.locked) {
        return res.status(429).json({
            locked: true,
            retryAfterSeconds: lockStatus.remainingSeconds,
            remainingSeconds: lockStatus.remainingSeconds,
            message: `Account locked due to too many failed attempts. Please wait ${lockStatus.remainingSeconds} seconds.`
        });
    }

    const { username, password } = req.body;
    const user = db.data.users.find(u => u.username.toLowerCase() === (username || '').toLowerCase() && u.isActive !== false);

    let isValid = false;
    if (user && user.passwordHash) {
        isValid = bcrypt.compareSync(password || '', user.passwordHash);
    }

    if (!isValid) {
        const attemptResult = Security.recordFailedAttempt();
        if (attemptResult.locked) {
            db.logAudit('AUTH_LOCKOUT', 'Auth', `Account locked for 60 seconds after 5 failed attempts (target: '${username}')`);
            return res.status(429).json(attemptResult);
        } else {
            db.logAudit('AUTH_FAILED', 'Auth', `Failed login attempt for '${username}' (${attemptResult.attemptsRemaining} remaining)`);
            return res.status(401).json(attemptResult);
        }
    }

    // Login succeeded
    Security.recordSuccessfulLogin();
    db.logAudit('USER_LOGIN', 'Auth', `User '${user.username}' logged in successfully`, user.username);

    res.json({
        accessToken: 'jwt-medicare-' + Date.now(),
        refreshToken: 'refresh-medicare-' + Date.now(),
        userId: user.userId,
        username: user.username,
        fullName: user.fullName,
        roles: Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role || 'ROLE_ADMIN']
    });
});

app.post(['/api/auth/logout', '/auth/logout'], (req, res) => {
    const username = req.query.username || (req.body && req.body.username) || 'User';
    db.logAudit('USER_LOGOUT', 'Auth', `User '${username}' signed out`);
    res.json({ success: true, message: 'Logged out successfully' });
});

app.get(['/api/auth/me', '/auth/me'], (req, res) => {
    const admin = db.data.users.find(u => u.role === 'ROLE_ADMIN' || (Array.isArray(u.roles) && u.roles.includes('ROLE_ADMIN'))) || db.data.users[0];
    res.json({
        userId: admin.userId,
        username: admin.username,
        fullName: admin.fullName,
        roles: Array.isArray(admin.roles) ? admin.roles : [admin.role || 'ROLE_ADMIN']
    });
});

// ==========================================
// 2. Drugs / Medication Catalogue
// ==========================================
app.get(['/api/drugs', '/api/drugs/all', '/drugs', '/drugs/all'], (req, res) => {
    const drugs = (db.data.drugs || []).filter(d => d.isActive !== false);
    res.json(drugs);
});

app.get(['/api/drugs/with-stock', '/drugs/with-stock'], (req, res) => {
    const drugs = (db.data.drugs || []).filter(d => d.isActive !== false);
    const inventory = db.data.inventory || [];
    const result = drugs.map(d => {
        const drugBatches = inventory.filter(b => b.drugId === d.drugId && b.stockStatus !== 'EXPIRED');
        const totalStock = drugBatches.reduce((sum, b) => sum + (Number(b.quantityInStock) || 0), 0);
        return {
            ...d,
            totalStock: totalStock,
            batches: drugBatches
        };
    });
    res.json(result);
});

app.get(['/api/drugs/:id', '/drugs/:id'], (req, res) => {
    const id = Number(req.params.id);
    const drug = (db.data.drugs || []).find(d => d.drugId === id);
    if (!drug) return res.status(404).json({ message: 'Drug not found' });
    res.json(drug);
});

app.post(['/api/drugs', '/drugs'], (req, res) => {
    const { drugName, genericName, category, dosageForm, strength, mrp, gstPercent, scheduleType, description } = req.body;
    if (!drugName) return res.status(400).json({ message: 'Drug name is required' });

    const newDrug = {
        drugId: db.nextId('drug'),
        drugName: drugName.trim(),
        genericName: (genericName || '').trim(),
        category: (category || 'General').trim(),
        dosageForm: (dosageForm || 'TABLET').trim(),
        strength: (strength || '').trim(),
        mrp: Number(mrp) || 0,
        gstPercent: Number(gstPercent) || 0,
        scheduleType: (scheduleType || 'NONE').trim(),
        description: (description || '').trim(),
        isActive: true,
        createdAt: new Date().toISOString()
    };
    db.data.drugs.unshift(newDrug);
    db.save();
    db.logAudit('DRUG_CREATE', 'Drugs', `Created drug: ${newDrug.drugName}`);
    res.status(201).json(newDrug);
});

app.put(['/api/drugs/:id', '/drugs/:id'], (req, res) => {
    const id = Number(req.params.id);
    const drug = db.data.drugs.find(d => d.drugId === id);
    if (!drug) return res.status(404).json({ message: 'Drug not found' });

    Object.assign(drug, req.body, { drugId: id });
    db.save();
    db.logAudit('DRUG_UPDATE', 'Drugs', `Updated drug ID ${id}: ${drug.drugName}`);
    res.json(drug);
});

app.delete(['/api/drugs/:id', '/drugs/:id'], (req, res) => {
    const id = Number(req.params.id);
    const drug = db.data.drugs.find(d => d.drugId === id);
    if (drug) {
        drug.isActive = false;
        db.save();
        db.logAudit('DRUG_DELETE', 'Drugs', `Deactivated drug ID ${id}: ${drug.drugName}`);
    }
    res.json({ success: true });
});

// ==========================================
// 3. Inventory / Stock Batches
// ==========================================
app.get(['/api/inventory', '/inventory'], (req, res) => {
    const inventory = db.data.inventory.filter(i => (i.quantityInStock > 0 || i.stockStatus !== 'ARCHIVED'));
    res.json(inventory);
});

app.post(['/api/inventory', '/inventory'], (req, res) => {
    const { drugId, drugName, supplierId, batchNumber, quantityInStock, reorderLevel, expiryDate, manufacturingDate, purchasePrice, sellingPrice, storageLocation } = req.body;
    const qty = Number(quantityInStock) || 0;
    const reorder = Number(reorderLevel) || 10;
    const drug = (db.data.drugs || []).find(d => d.drugId === Number(drugId));
    const resolvedDrugName = drugName || (drug ? drug.drugName : 'Unknown Drug');

    const item = {
        inventoryId: db.nextId('inventory'),
        drugId: Number(drugId),
        drugName: resolvedDrugName,
        supplierId: supplierId ? Number(supplierId) : null,
        batchNumber: (batchNumber || 'BATCH-' + Date.now()).trim(),
        quantityInStock: qty,
        reorderLevel: reorder,
        manufacturingDate: manufacturingDate || new Date().toISOString().slice(0, 10),
        expiryDate: expiryDate || new Date(Date.now() + 365*86400000).toISOString().slice(0, 10),
        purchasePrice: Number(purchasePrice) || 0,
        sellingPrice: Number(sellingPrice) || 0,
        storageLocation: storageLocation || 'Shelf A-1',
        stockStatus: qty <= 0 ? 'OUT_OF_STOCK' : (qty <= reorder ? 'LOW_STOCK' : 'IN_STOCK')
    };
    db.data.inventory.unshift(item);
    db.save();
    db.logAudit('STOCK_ADD', 'Inventory', `Added batch ${item.batchNumber} for ${item.drugName} (Qty: ${qty})`);
    res.status(201).json(item);
});

app.put(['/api/inventory/:id', '/inventory/:id'], (req, res) => {
    const id = Number(req.params.id);
    const item = db.data.inventory.find(i => i.inventoryId === id);
    if (!item) return res.status(404).json({ message: 'Batch not found' });

    Object.assign(item, req.body, { inventoryId: id });
    const qty = Number(item.quantityInStock) || 0;
    const reorder = Number(item.reorderLevel) || 10;
    item.stockStatus = qty <= 0 ? 'OUT_OF_STOCK' : (qty <= reorder ? 'LOW_STOCK' : 'IN_STOCK');
    db.save();
    db.logAudit('STOCK_UPDATE', 'Inventory', `Updated batch ID ${id} (${item.batchNumber})`);
    res.json(item);
});

app.post(['/api/inventory/:id/write-off', '/api/inventory/:id/writeoff', '/inventory/:id/write-off', '/inventory/:id/writeoff'], (req, res) => {
    const id = Number(req.params.id);
    const { quantity, reason, notes } = req.body;
    const item = db.data.inventory.find(i => i.inventoryId === id);
    if (!item) return res.status(404).json({ message: 'Batch not found' });

    const qtyToRemove = Math.min(Number(quantity) || 0, item.quantityInStock);
    const before = item.quantityInStock;
    item.quantityInStock -= qtyToRemove;
    const after = item.quantityInStock;
    const reorder = Number(item.reorderLevel) || 10;
    item.stockStatus = after <= 0 ? 'OUT_OF_STOCK' : (after <= reorder ? 'LOW_STOCK' : 'IN_STOCK');

    const archiveRecord = {
        archiveId: db.nextId('archive'),
        inventoryId: id,
        drugName: item.drugName,
        batchNumber: item.batchNumber,
        quantityBeforeRemoval: before,
        quantityRemoved: qtyToRemove,
        quantityAfterRemoval: after,
        lossValue: Number((qtyToRemove * (item.purchasePrice || 0)).toFixed(2)),
        reason: reason || 'Damaged / Expired',
        notes: notes || '',
        removalDate: new Date().toISOString(),
        removedBy: 'admin',
        removedAt: new Date().toISOString()
    };
    if (!db.data.stock_archives) db.data.stock_archives = [];
    db.data.stock_archives.unshift(archiveRecord);

    db.save();
    db.logAudit('STOCK_WRITE_OFF', 'Inventory', `Removed ${qtyToRemove} units from ${item.drugName} (${reason})`);
    res.json({ success: true, item, archiveRecord });
});

app.post(['/api/inventory/:id/archive', '/inventory/:id/archive'], (req, res) => {
    const id = Number(req.params.id);
    const item = db.data.inventory.find(i => i.inventoryId === id);
    if (!item) return res.status(404).json({ message: 'Batch not found' });

    item.stockStatus = 'ARCHIVED';
    db.save();
    db.logAudit('STOCK_ARCHIVE', 'Inventory', `Archived batch ${item.batchNumber}`);
    res.json({ success: true, item });
});

app.get(['/api/stock-archive', '/stock-archive'], (req, res) => {
    const list = db.data.stock_archives || [];
    res.json({
        content: list,
        totalElements: list.length,
        totalPages: 1
    });
});

// ==========================================
// 4. Patients
// ==========================================
app.get(['/api/patients', '/patients'], (req, res) => {
    res.json(db.data.patients.filter(p => p.isActive !== false));
});

app.post(['/api/patients', '/patients'], (req, res) => {
    const { fullName, dateOfBirth, gender, contactNumber, email, bloodGroup, allergies, address, cnicNumber, chronicConditions, currentMedications, insuranceProvider, insurancePolicyNo } = req.body;
    if (!fullName) return res.status(400).json({ message: 'Patient name is required' });

    const patient = {
        patientId: db.nextId('patient'),
        fullName: fullName.trim(),
        dateOfBirth: dateOfBirth || '1990-01-01',
        gender: gender || 'Other',
        contactNumber: contactNumber || '',
        email: email || '',
        bloodGroup: bloodGroup || 'O+',
        allergies: allergies || '',
        address: address || '',
        cnicNumber: cnicNumber || '',
        chronicConditions: chronicConditions || '',
        currentMedications: currentMedications || '',
        insuranceProvider: insuranceProvider || '',
        insurancePolicyNo: insurancePolicyNo || '',
        isActive: true
    };
    db.data.patients.unshift(patient);
    db.save();
    db.logAudit('PATIENT_CREATE', 'Patients', `Registered patient: ${patient.fullName}`);
    res.status(201).json(patient);
});

app.put(['/api/patients/:id', '/patients/:id'], (req, res) => {
    const id = Number(req.params.id);
    const p = db.data.patients.find(x => x.patientId === id);
    if (!p) return res.status(404).json({ message: 'Patient not found' });
    Object.assign(p, req.body, { patientId: id });
    db.save();
    res.json(p);
});

app.delete(['/api/patients/:id', '/patients/:id'], (req, res) => {
    const id = Number(req.params.id);
    const p = db.data.patients.find(x => x.patientId === id);
    if (p) {
        p.isActive = false;
        db.save();
        db.logAudit('PATIENT_DELETE', 'Patients', `Deactivated patient ID ${id}: ${p.fullName}`);
    }
    res.json({ success: true });
});

// ==========================================
// 5. Suppliers & Purchase Orders
// ==========================================
app.get(['/api/suppliers', '/api/suppliers/all', '/suppliers', '/suppliers/all'], (req, res) => {
    res.json(db.data.suppliers.filter(s => s.isActive !== false));
});

app.post(['/api/suppliers', '/suppliers'], (req, res) => {
    const { supplierName, contactPerson, contactNumber, email, city, address, paymentTerms } = req.body;
    if (!supplierName) return res.status(400).json({ message: 'Supplier name is required' });

    const s = {
        supplierId: db.nextId('supplier'),
        supplierName: supplierName.trim(),
        contactPerson: contactPerson || '',
        contactNumber: contactNumber || '',
        email: email || '',
        city: city || '',
        address: address || '',
        paymentTerms: paymentTerms || 'Net 30 Days',
        outstandingBalance: 0.0,
        isActive: true
    };
    db.data.suppliers.unshift(s);
    db.save();
    db.logAudit('SUPPLIER_CREATE', 'Suppliers', `Added supplier: ${s.supplierName}`);
    res.status(201).json(s);
});

app.put(['/api/suppliers/:id', '/suppliers/:id'], (req, res) => {
    const id = Number(req.params.id);
    const s = db.data.suppliers.find(x => x.supplierId === id);
    if (!s) return res.status(404).json({ message: 'Supplier not found' });
    Object.assign(s, req.body, { supplierId: id });
    db.save();
    res.json(s);
});

app.post(['/api/suppliers/:id/payments', '/suppliers/:id/payments'], (req, res) => {
    const id = Number(req.params.id);
    const { amount, paymentMethod, referenceNumber, notes, purchaseOrderId } = req.body;
    const s = db.data.suppliers.find(x => x.supplierId === id);
    if (!s) return res.status(404).json({ message: 'Supplier not found' });

    const payAmt = Number(amount) || 0;
    s.outstandingBalance = Math.max(0, (Number(s.outstandingBalance) || 0) - payAmt);

    const payment = {
        paymentId: db.nextId('payment'),
        supplierId: id,
        purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : null,
        supplierName: s.supplierName,
        amount: payAmt,
        paymentDate: new Date().toISOString(),
        paymentMethod: paymentMethod || 'BANK_TRANSFER',
        referenceNumber: referenceNumber || 'REF-' + Date.now(),
        notes: notes || '',
        recordedByName: 'MediCare Administrator'
    };
    if (!db.data.supplier_payments) db.data.supplier_payments = [];
    db.data.supplier_payments.unshift(payment);
    db.save();
    db.logAudit('SUPPLIER_PAYMENT', 'Suppliers', `Recorded payment of PKR ${payAmt} to ${s.supplierName}`);
    res.status(201).json(payment);
});

app.get(['/api/suppliers/payments/summary', '/suppliers/payments/summary'], (req, res) => {
    const summary = db.data.suppliers.map(s => {
        const payments = (db.data.supplier_payments || []).filter(p => p.supplierId === s.supplierId);
        const totalPaid = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
        return {
            supplierId: s.supplierId,
            supplierName: s.supplierName,
            contactNumber: s.contactNumber,
            totalOrdered: (Number(s.outstandingBalance) || 0) + totalPaid,
            totalPaid: totalPaid,
            remainingDue: Number(s.outstandingBalance) || 0
        };
    });
    res.json(summary);
});

// Purchase Orders
app.get(['/api/purchase-orders', '/purchase-orders'], (req, res) => {
    res.json(db.data.purchase_orders || []);
});

app.get(['/api/purchase-orders/:id', '/purchase-orders/:id'], (req, res) => {
    const id = Number(req.params.id);
    const po = (db.data.purchase_orders || []).find(p => p.orderId === id);
    if (!po) return res.status(404).json({ message: 'PO not found' });
    res.json(po);
});

app.post(['/api/purchase-orders', '/purchase-orders'], (req, res) => {
    const { supplierId, supplierName, expectedDeliveryDate, notes, items } = req.body;
    let total = 0;
    const safeItems = (Array.isArray(items) ? items : []).map(i => {
        const qty = Number(i.orderedQuantity !== undefined ? i.orderedQuantity : i.quantity) || 0;
        const price = Number(i.unitPrice !== undefined ? i.unitPrice : i.unitCost) || 0;
        const cost = (Number(i.totalPrice) || (qty * price));
        total += cost;
        return {
            drugId: i.drugId,
            drugName: i.drugName,
            quantity: qty,
            orderedQuantity: qty,
            unitPrice: price,
            unitCost: price,
            totalPrice: cost
        };
    });

    const po = {
        orderId: db.nextId('po'),
        poNumber: 'PO-' + (db.data.counters.po || 10001),
        supplierId: Number(supplierId),
        supplierName: supplierName || 'Supplier',
        orderDate: new Date().toISOString(),
        expectedDeliveryDate: expectedDeliveryDate || new Date(Date.now() + 7*86400000).toISOString().slice(0, 10),
        totalAmount: total,
        paidAmount: 0,
        status: 'ORDERED',
        orderedByName: 'MediCare Administrator',
        notes: notes || '',
        items: safeItems
    };
    if (!db.data.purchase_orders) db.data.purchase_orders = [];
    db.data.purchase_orders.unshift(po);

    // Update supplier balance
    const s = db.data.suppliers.find(x => x.supplierId === Number(supplierId));
    if (s) {
        s.outstandingBalance = (Number(s.outstandingBalance) || 0) + total;
    }
    db.save();
    db.logAudit('PO_CREATE', 'Purchases', `Created Purchase Order ${po.poNumber} for PKR ${total}`);
    res.status(201).json(po);
});

app.put(['/api/purchase-orders/:id/status', '/purchase-orders/:id/status'], (req, res) => {
    const id = Number(req.params.id);
    const status = (req.body && req.body.status) || req.query.status || 'ORDERED';
    const po = (db.data.purchase_orders || []).find(p => p.orderId === id);
    if (!po) return res.status(404).json({ message: 'PO not found' });

    po.status = status;
    if ((status === 'RECEIVED' || status === 'DELIVERED') && Array.isArray(po.items)) {
        if (!po.inventoryAdded) {
            po.inventoryAdded = true;
            for (const item of po.items) {
                const qty = Number(item.orderedQuantity || item.quantity) || 0;
                const price = Number(item.unitPrice || item.unitCost) || 0;
                const batch = {
                    inventoryId: db.nextId('inventory'),
                    drugId: item.drugId,
                    drugName: item.drugName,
                    batchNumber: 'PO-BATCH-' + id + '-' + (item.drugId || '0'),
                    quantityInStock: qty,
                    reorderLevel: 20,
                    expiryDate: new Date(Date.now() + 730*86400000).toISOString().slice(0, 10),
                    purchasePrice: price,
                    sellingPrice: Number((price * 1.25).toFixed(2)),
                    stockStatus: 'IN_STOCK'
                };
                db.data.inventory.unshift(batch);
            }
        }
    }
    db.save();
    db.logAudit('PO_STATUS', 'Purchases', `Updated PO ${po.poNumber} status to ${status}`);
    res.json(po);
});

app.put(['/api/purchase-orders/:id/receive', '/purchase-orders/:id/receive'], (req, res) => {
    const id = Number(req.params.id);
    const po = (db.data.purchase_orders || []).find(p => p.orderId === id);
    if (!po) return res.status(404).json({ message: 'PO not found' });

    po.status = 'DELIVERED';
    po.actualDeliveryDate = new Date().toISOString();
    if (!po.inventoryAdded && Array.isArray(po.items)) {
        po.inventoryAdded = true;
        for (const item of po.items) {
            const qty = Number(item.orderedQuantity || item.quantity) || 0;
            const price = Number(item.unitPrice || item.unitCost) || 0;
            const batch = {
                inventoryId: db.nextId('inventory'),
                drugId: item.drugId,
                drugName: item.drugName,
                batchNumber: 'PO-BATCH-' + id + '-' + (item.drugId || '0'),
                quantityInStock: qty,
                reorderLevel: 20,
                expiryDate: new Date(Date.now() + 730*86400000).toISOString().slice(0, 10),
                purchasePrice: price,
                sellingPrice: Number((price * 1.25).toFixed(2)),
                stockStatus: 'IN_STOCK'
            };
            db.data.inventory.unshift(batch);
        }
    }
    db.save();
    db.logAudit('PO_RECEIVE', 'Purchases', `Received PO ${po.poNumber}, added stock to inventory`);
    res.json(po);
});

// Supplier Payments for a specific PO
app.get(['/api/supplier-payments/purchase-order/:id', '/supplier-payments/purchase-order/:id'], (req, res) => {
    const id = Number(req.params.id);
    const payments = (db.data.supplier_payments || []).filter(p => p.purchaseOrderId === id);
    res.json(payments);
});

// Global Supplier Payments endpoint
app.post(['/api/supplier-payments', '/supplier-payments'], (req, res) => {
    const { purchaseOrderId, supplierId, amount, paymentMethod, referenceNumber, notes, paymentDate } = req.body;
    const sId = Number(supplierId);
    const poId = Number(purchaseOrderId);
    const payAmt = Number(amount) || 0;

    const s = (db.data.suppliers || []).find(x => x.supplierId === sId);
    const po = (db.data.purchase_orders || []).find(p => p.orderId === poId);

    if (s) {
        s.outstandingBalance = Math.max(0, (Number(s.outstandingBalance) || 0) - payAmt);
    }
    if (po) {
        po.paidAmount = (Number(po.paidAmount) || 0) + payAmt;
    }

    const payment = {
        paymentId: db.nextId('payment'),
        supplierId: sId,
        purchaseOrderId: poId || null,
        supplierName: s ? s.supplierName : (po ? po.supplierName : 'Supplier'),
        amount: payAmt,
        paymentDate: paymentDate || new Date().toISOString(),
        paymentMethod: paymentMethod || 'CASH',
        referenceNumber: referenceNumber || 'REF-' + Date.now(),
        notes: notes || '',
        recordedByName: 'MediCare Administrator'
    };

    if (!db.data.supplier_payments) db.data.supplier_payments = [];
    db.data.supplier_payments.unshift(payment);
    db.save();
    db.logAudit('SUPPLIER_PAYMENT', 'Suppliers', `Recorded payment of PKR ${payAmt} for PO ${po ? po.poNumber : poId}`);
    res.status(201).json(payment);
});

// ==========================================
// 6. Prescriptions
// ==========================================
app.get(['/api/prescriptions', '/prescriptions'], (req, res) => {
    res.json(db.data.prescriptions || []);
});

app.get(['/api/prescriptions/:id', '/prescriptions/:id'], (req, res) => {
    const id = Number(req.params.id);
    const rx = (db.data.prescriptions || []).find(p => p.prescriptionId === id);
    if (!rx) return res.status(404).json({ message: 'Prescription not found' });
    res.json(rx);
});

app.post(['/api/prescriptions', '/prescriptions'], (req, res) => {
    const { patientId, patientName, doctorName, doctorLicense, diagnosis, items } = req.body;
    const rx = {
        prescriptionId: db.nextId('prescription'),
        rxNumber: 'RX-' + (db.data.counters.prescription || 1001),
        patientId: Number(patientId),
        patientName: patientName || 'Walk-in',
        doctorName: doctorName || 'Dr. Specialist',
        doctorLicense: doctorLicense || '',
        diagnosis: diagnosis || '',
        prescriptionDate: new Date().toISOString(),
        issueDate: new Date().toISOString(),
        status: 'PENDING',
        items: Array.isArray(items) ? items : []
    };
    if (!db.data.prescriptions) db.data.prescriptions = [];
    db.data.prescriptions.unshift(rx);
    db.save();
    db.logAudit('RX_CREATE', 'Prescriptions', `Registered prescription ${rx.rxNumber} for ${rx.patientName}`);
    res.status(201).json(rx);
});

app.put(['/api/prescriptions/:id/dispense', '/prescriptions/:id/dispense'], (req, res) => {
    const id = Number(req.params.id);
    const rx = (db.data.prescriptions || []).find(p => p.prescriptionId === id);
    if (!rx) return res.status(404).json({ message: 'Prescription not found' });

    rx.status = 'DISPENSED';
    rx.dispensedDate = new Date().toISOString();

    // Deduct stock for items in prescription using FEFO
    if (Array.isArray(rx.items)) {
        for (const item of rx.items) {
            const reqQty = Number(item.quantity) || 1;
            let remainingToDeduct = reqQty;
            const batches = (db.data.inventory || []).filter(b => b.drugId === Number(item.drugId) && (Number(b.quantityInStock) || 0) > 0);
            batches.sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));

            for (const batch of batches) {
                if (remainingToDeduct <= 0) break;
                const deduct = Math.min(Number(batch.quantityInStock) || 0, remainingToDeduct);
                batch.quantityInStock -= deduct;
                remainingToDeduct -= deduct;
                const reorder = Number(batch.reorderLevel) || 10;
                batch.stockStatus = batch.quantityInStock <= 0 ? 'OUT_OF_STOCK' : (batch.quantityInStock <= reorder ? 'LOW_STOCK' : 'IN_STOCK');
            }
        }
    }
    db.save();
    db.logAudit('RX_DISPENSE', 'Prescriptions', `Dispensed prescription ${rx.rxNumber} for ${rx.patientName}`);
    res.json(rx);
});

app.put(['/api/prescriptions/:id/cancel', '/prescriptions/:id/cancel'], (req, res) => {
    const id = Number(req.params.id);
    const rx = (db.data.prescriptions || []).find(p => p.prescriptionId === id);
    if (!rx) return res.status(404).json({ message: 'Prescription not found' });

    rx.status = 'CANCELLED';
    db.save();
    db.logAudit('RX_CANCEL', 'Prescriptions', `Cancelled prescription ${rx.rxNumber}`);
    res.json(rx);
});

// ==========================================
// 7. Sales / POS Register
// ==========================================
app.get(['/api/sales', '/sales'], (req, res) => {
    const sales = db.data.sales || [];
    const page = Number(req.query.page) || 0;
    const size = Number(req.query.size) || 50;
    const start = page * size;
    const paged = sales.slice(start, start + size);
    res.json({
        content: paged,
        totalPages: Math.ceil(sales.length / size) || 1,
        totalElements: sales.length,
        number: page,
        size: size
    });
});

app.get(['/api/sales/patient/:id', '/sales/patient/:id'], (req, res) => {
    const patientId = Number(req.params.id);
    const sales = (db.data.sales || []).filter(s => s.patientId === patientId);
    res.json(sales);
});

app.get(['/api/sales/:id', '/sales/:id'], (req, res) => {
    const id = Number(req.params.id);
    const sale = (db.data.sales || []).find(s => s.saleId === id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json(sale);
});

app.post(['/api/sales', '/sales'], (req, res) => {
    const { patientId, patientName, items, paymentMethod, subtotal, discountPercent, discountAmount, gstAmount, totalAmount, amountPaid, changeReturned } = req.body;
    if (!items || !items.length) {
        return res.status(400).json({ message: 'Cannot checkout empty cart' });
    }

    const saleId = db.nextId('bill');
    const billNumber = 'B-' + saleId;

    // Deduct stock from inventory & assemble processed items
    const processedItems = [];
    let calcSubtotal = 0;
    let calcGst = 0;

    for (const item of items) {
        const drug = (db.data.drugs || []).find(d => d.drugId === Number(item.drugId));
        const inv = (db.data.inventory || []).find(i => i.drugId === Number(item.drugId) && (Number(i.quantityInStock) || 0) > 0);
        const qty = Number(item.quantity) || 1;
        if (inv) {
            inv.quantityInStock = Math.max(0, (Number(inv.quantityInStock) || 0) - qty);
            const reorder = Number(inv.reorderLevel) || 10;
            inv.stockStatus = inv.quantityInStock <= 0 ? 'OUT_OF_STOCK' : (inv.quantityInStock <= reorder ? 'LOW_STOCK' : 'IN_STOCK');
        }

        const drugName = item.drugName || (drug ? drug.drugName : (inv ? inv.drugName : 'Medication'));
        const unitPrice = Number(item.unitPrice) || (drug ? Number(drug.mrp) : (inv ? Number(inv.sellingPrice) : 0));
        const lineTotal = Number(item.totalPrice) || (qty * unitPrice);
        const gstPct = Number(drug?.gstPercent) || 0;

        calcSubtotal += lineTotal;
        calcGst += lineTotal * (gstPct / 100);

        processedItems.push({
            drugId: Number(item.drugId),
            drugName: drugName,
            batchNumber: item.batchNumber || (inv ? inv.batchNumber : 'GEN-01'),
            quantity: qty,
            unitPrice: unitPrice,
            totalPrice: lineTotal
        });
    }

    let resolvedPatientName = patientName || 'Walk-in Customer';
    if (patientId) {
        const p = (db.data.patients || []).find(pt => pt.patientId === Number(patientId));
        if (p) resolvedPatientName = p.fullName;
    }

    let resolvedSoldByName = 'MediCare Administrator';
    if (req.body.soldById) {
        const u = (db.data.users || []).find(usr => usr.userId === Number(req.body.soldById));
        if (u) resolvedSoldByName = u.fullName || u.username;
    }

    const finalSubtotal = Number(subtotal) || calcSubtotal;
    const finalDiscPct = Number(discountPercent) || 0;
    const finalDiscAmt = Number(discountAmount) || (finalSubtotal * (finalDiscPct / 100));
    const finalGst = Number(gstAmount) || calcGst;
    const finalTotal = Number(totalAmount) || ((finalSubtotal - finalDiscAmt) + finalGst);
    const finalPaid = Number(amountPaid) || finalTotal;
    const finalChange = Number(changeReturned) || Math.max(0, finalPaid - finalTotal);

    const sale = {
        saleId: saleId,
        billNumber: billNumber,
        patientId: patientId ? Number(patientId) : null,
        patientName: resolvedPatientName,
        soldById: req.body.soldById ? Number(req.body.soldById) : 1,
        soldByName: resolvedSoldByName,
        paymentMethod: paymentMethod || 'CASH',
        subtotal: finalSubtotal,
        discountPercent: finalDiscPct,
        discountAmount: finalDiscAmt,
        gstAmount: finalGst,
        totalAmount: finalTotal,
        amountPaid: finalPaid,
        changeReturned: finalChange,
        saleDateTime: new Date().toISOString(),
        status: 'COMPLETED',
        items: processedItems
    };

    if (!db.data.sales) db.data.sales = [];
    db.data.sales.unshift(sale);
    db.save();

    db.logAudit('SALE_COMPLETE', 'Sales', `Finalized transaction ${billNumber} for ${finalTotal}`);
    res.status(201).json(sale);
});

// ==========================================
// 8. Staff / Users
// ==========================================
app.get(['/api/users', '/users'], (req, res) => {
    res.json(db.data.users || []);
});

app.post(['/api/users', '/users'], (req, res) => {
    const { username, fullName, email, contactNumber } = req.body;
    const password = req.body.password || req.body.passwordHash;
    if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    const roles = Array.isArray(req.body.roles) && req.body.roles.length > 0 ? req.body.roles : [req.body.role || 'ROLE_PHARMACIST'];
    const newUser = {
        userId: db.nextId('user'),
        username: username.trim(),
        passwordHash: hash,
        fullName: fullName || username,
        email: email || '',
        contactNumber: contactNumber || '',
        role: roles[0],
        roles: roles,
        isActive: true,
        createdAt: new Date().toISOString()
    };
    db.data.users.push(newUser);
    db.save();
    db.logAudit('USER_CREATE', 'Staff', `Created user account: ${newUser.username} (${newUser.role})`);
    res.status(201).json(newUser);
});

app.put(['/api/users/:id', '/users/:id'], (req, res) => {
    const id = Number(req.params.id);
    const u = db.data.users.find(x => x.userId === id);
    if (!u) return res.status(404).json({ message: 'User not found' });

    const pass = req.body.password || req.body.passwordHash;
    if (pass && typeof pass === 'string' && pass.trim().length > 0) {
        const salt = bcrypt.genSaltSync(10);
        u.passwordHash = bcrypt.hashSync(pass.trim(), salt);
    }
    if (req.body.fullName) u.fullName = req.body.fullName;
    if (req.body.email !== undefined) u.email = req.body.email;
    if (req.body.contactNumber !== undefined) u.contactNumber = req.body.contactNumber;
    if (Array.isArray(req.body.roles) && req.body.roles.length > 0) {
        u.roles = req.body.roles;
        u.role = req.body.roles[0];
    } else if (req.body.role) {
        u.role = req.body.role;
        u.roles = [req.body.role];
    }
    if (req.body.isActive !== undefined) u.isActive = Boolean(req.body.isActive);

    db.save();
    db.logAudit('USER_UPDATE', 'Staff', `Updated user account: ${u.username}`);
    res.json(u);
});

app.delete(['/api/users/:id', '/users/:id'], (req, res) => {
    const id = Number(req.params.id);
    const index = (db.data.users || []).findIndex(x => x.userId === id);
    if (index !== -1) {
        const deleted = db.data.users.splice(index, 1)[0];
        db.save();
        db.logAudit('USER_DELETE', 'Staff', `Removed user account: ${deleted.username}`);
    }
    res.json({ success: true });
});

// ==========================================
// 9. Dashboard KPIs & Revenue Chart
// ==========================================
app.get(['/api/dashboard', '/dashboard'], (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);

    const sales = db.data.sales || [];
    const inventory = db.data.inventory || [];
    const todaySales = sales.filter(s => s.saleDateTime && s.saleDateTime.startsWith(today));
    const monthSales = sales.filter(s => s.saleDateTime && s.saleDateTime.startsWith(thisMonth));

    const todayRev = todaySales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const monthRev = monthSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);

    const outOfStock = inventory.filter(i => (Number(i.quantityInStock) || 0) <= 0).length;
    const in30Days = new Date(Date.now() + 30*86400000).toISOString().slice(0, 10);
    const expiring = inventory.filter(i => i.expiryDate && i.expiryDate <= in30Days && (Number(i.quantityInStock) || 0) > 0).length;

    // Top selling drugs
    const drugSalesMap = {};
    for (const s of sales) {
        if (Array.isArray(s.items)) {
            for (const item of s.items) {
                const name = item.drugName || 'Medication';
                if (!drugSalesMap[name]) drugSalesMap[name] = { unitsSold: 0, revenue: 0 };
                drugSalesMap[name].unitsSold += (Number(item.quantity) || 1);
                drugSalesMap[name].revenue += (Number(item.totalPrice) || 0);
            }
        }
    }
    const topDrugs = Object.entries(drugSalesMap).map(([drugName, stat]) => ({
        drugName,
        unitsSold: stat.unitsSold,
        revenue: stat.revenue
    })).sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 10);

    res.json({
        todayRevenue: todayRev,
        monthRevenue: monthRev,
        outOfStockCount: outOfStock,
        expiringIn30Days: expiring,
        todayTransactions: todaySales.length,
        avgBillValue: todaySales.length ? (todayRev / todaySales.length) : 0,
        totalPatients: (db.data.patients || []).length,
        topSellingDrugs: topDrugs
    });
});

app.get(['/api/dashboard/revenue-chart', '/dashboard/revenue-chart'], (req, res) => {
    const days = [];
    const sales = db.data.sales || [];
    for (let i = 6; i >= 0; i--) {
        const dateObj = new Date(Date.now() - i * 86400000);
        const dateStr = dateObj.toISOString().slice(0, 10);
        const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const dayTotal = sales
            .filter(s => s.saleDateTime && s.saleDateTime.startsWith(dateStr))
            .reduce((acc, s) => acc + (Number(s.totalAmount) || 0), 0);
        days.push({ day: dayLabel, date: dateStr, revenue: dayTotal });
    }
    res.json(days);
});

// ==========================================
// 10. Audit Logs & Settings
// ==========================================
app.get(['/api/audit-logs', '/audit-logs'], (req, res) => {
    const logs = (db.data.audit_logs || []).map(l => ({
        ...l,
        username: l.performedBy || l.username || 'admin',
        entity: l.module || l.entity || 'System',
        entityRef: l.entityRef || l.action || '—'
    }));
    res.json(logs);
});

app.get(['/api/settings', '/settings'], (req, res) => {
    res.json(db.data.settings || {});
});

app.put(['/api/settings', '/settings'], (req, res) => {
    db.data.settings = { ...db.data.settings, ...req.body };
    db.save();
    res.json(db.data.settings);
});

app.post(['/api/settings', '/settings'], (req, res) => {
    db.data.settings = { ...db.data.settings, ...req.body };
    db.save();
    res.json(db.data.settings);
});

// ==========================================
// 11. Backup & Restore (.mbak / JSON)
// ==========================================
app.get(['/api/backup/download', '/api/backup/download-binary'], (req, res) => {
    const payload = {
        format: 'MEDICARE_MBAK_V1',
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        data: db.data
    };
    const json = JSON.stringify(payload, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `medicare_db_backup_${dateStr}.mbak`;

    db.logAudit('BACKUP_DOWNLOAD', 'Backup', `Exported full database backup (${json.length} bytes)`);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(Buffer.from(json, 'utf8'));
});

app.post(['/api/backup/restore', '/backup/restore'], (req, res) => {
    const handleRestoreContent = (contentStr) => {
        try {
            let jsonStr = (contentStr || '').trim();
            if (jsonStr.includes('------')) {
                const parts = jsonStr.split(/\r?\n\r?\n/);
                if (parts.length > 1) {
                    jsonStr = parts.slice(1).join('\n\n');
                    const lastBoundary = jsonStr.lastIndexOf('------');
                    if (lastBoundary !== -1) {
                        jsonStr = jsonStr.substring(0, lastBoundary);
                    }
                }
            }
            jsonStr = jsonStr.trim();

            // Handle server-side decryption if raw encrypted text is uploaded
            if (jsonStr.startsWith('ENCRYPTED|')) {
                const configuredPw = db.data.settings?.backupEncryptionPassword;
                const reqPw = req.headers['x-backup-password'] || req.query?.password || configuredPw;
                if (!reqPw) {
                    return res.status(400).json({ success: false, message: 'This backup is encrypted. Please provide the backup password.' });
                }
                try {
                    jsonStr = Security.decryptBackup(jsonStr, reqPw);
                    jsonStr = (jsonStr || '').trim();
                } catch (err) {
                    return res.status(400).json({ success: false, message: 'Decryption failed: ' + err.message });
                }
            }

            // Check if payload is base64 encoded string
            if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
                try {
                    const decoded = Buffer.from(jsonStr, 'base64').toString('utf8');
                    if (decoded.startsWith('{') || decoded.startsWith('[')) {
                        jsonStr = decoded;
                    }
                } catch (e) {}
            }

            const parsed = JSON.parse(jsonStr.trim());
            const incoming = parsed.data || parsed;
            if (!incoming.users && !incoming.drugs && !incoming.inventory) {
                return res.status(400).json({ success: false, message: 'Unrecognized backup structure. Please provide a valid .mbak file.' });
            }

            db.data = { ...db.getDefaultState(), ...incoming };
            db.save();
            db.logAudit('BACKUP_RESTORE', 'Backup', 'Successfully restored database from backup file');

            return res.json({ success: true, message: 'Database restored successfully! Reloading...' });
        } catch (e) {
            console.error('Restore error:', e);
            return res.status(400).json({ success: false, message: 'Invalid backup format: ' + e.message });
        }
    };

    if (Buffer.isBuffer(req.body)) {
        handleRestoreContent(req.body.toString('utf8'));
    } else if (req.body && (req.body.data || req.body.users || typeof req.body === 'string')) {
        handleRestoreContent(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    } else {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            const buf = Buffer.concat(chunks);
            handleRestoreContent(buf.toString('utf8'));
        });
        req.on('error', (err) => {
            res.status(500).json({ success: false, message: 'Upload error: ' + err.message });
        });
    }
});

// ==========================================
// 12. Database Reset (Clean Start)
// ==========================================
app.post(['/api/database/reset', '/database/reset'], (req, res) => {
    db.seedInitialData();
    db.save();
    db.logAudit('DB_RESET', 'Database', 'Reset database to clean initial state');
    res.json({ success: true, message: 'Database reset successfully' });
});

// Start listening if run standalone
const PORT = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(PORT, '127.0.0.1', () => {
        console.log(`MediCare backend server running at http://127.0.0.1:${PORT}`);
    });
}

module.exports = app;
