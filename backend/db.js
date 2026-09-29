const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');

class Database {
    constructor() {
        this.appDataDir = path.join(os.homedir(), '.medicare');
        if (!fs.existsSync(this.appDataDir)) {
            fs.mkdirSync(this.appDataDir, { recursive: true });
        }
        this.dbFilePath = path.join(this.appDataDir, 'medicare_data.json');
        this.data = this.getDefaultState();
        this.load();
    }

    getDefaultState() {
        return {
            users: [],
            drugs: [],
            inventory: [],
            patients: [],
            suppliers: [],
            prescriptions: [],
            sales: [],
            purchase_orders: [],
            supplier_payments: [],
            stock_archives: [],
            audit_logs: [],
            settings: {
                pharmacyName: 'MediCare Pharmacy',
                address: 'Main Healthcare Boulevard, Suite 101',
                phone: '+92 300 1234567',
                email: 'support@medicare.local',
                gstNumber: 'GST-987654321',
                invoiceFooter: 'Thank you for choosing us. Get well soon!',
                currencySymbol: 'PKR',
                taxLabel: 'GST'
            },
            counters: {
                user: 1,
                drug: 1,
                inventory: 1,
                patient: 1,
                supplier: 1,
                prescription: 1001,
                bill: 20001,
                po: 10001,
                payment: 1,
                archive: 1,
                audit: 1
            }
        };
    }

    load() {
        try {
            if (fs.existsSync(this.dbFilePath)) {
                const raw = fs.readFileSync(this.dbFilePath, 'utf8');
                const parsed = JSON.parse(raw);
                this.data = { ...this.getDefaultState(), ...parsed };
            } else {
                this.seedInitialData();
                this.save();
            }
        } catch (e) {
            console.error('Failed to load database, using defaults:', e);
            this.seedInitialData();
            this.save();
        }

        // Ensure default admin exists
        if (!this.data.users || this.data.users.length === 0) {
            this.seedInitialData();
            this.save();
        }
    }

    save() {
        try {
            const tempFile = this.dbFilePath + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf8');
            fs.renameSync(tempFile, this.dbFilePath);
            return true;
        } catch (e) {
            console.error('Failed to save database atomically:', e);
            return false;
        }
    }

    seedInitialData() {
        const salt = bcrypt.genSaltSync(10);
        const adminHash = bcrypt.hashSync('admin123', salt);

        this.data.users = [
            {
                userId: 1,
                username: 'admin',
                passwordHash: adminHash,
                fullName: 'MediCare Administrator',
                email: 'admin@medicare.local',
                role: 'ROLE_ADMIN',
                isActive: true,
                createdAt: new Date().toISOString()
            }
        ];

        this.data.drugs = [];
        this.data.inventory = [];
        this.data.suppliers = [];
        this.data.patients = [];
        this.data.prescriptions = [];
        this.data.sales = [];
        this.data.purchase_orders = [];
        this.data.supplier_payments = [];
        this.data.stock_archives = [];
        this.data.audit_logs = [
            {
                logId: 1,
                action: 'SYSTEM_INIT',
                module: 'System',
                details: 'Database initialized with clean operational state',
                performedBy: 'system',
                timestamp: new Date().toISOString()
            }
        ];

        this.data.counters = {
            user: 2,
            drug: 1,
            inventory: 1,
            patient: 1,
            supplier: 1,
            prescription: 1001,
            bill: 20001,
            po: 10001,
            payment: 1,
            archive: 1,
            audit: 2
        };
    }

    nextId(counterKey) {
        if (!this.data.counters) this.data.counters = {};
        if (!this.data.counters[counterKey]) this.data.counters[counterKey] = 1;
        const id = this.data.counters[counterKey];
        this.data.counters[counterKey] += 1;
        return id;
    }

    logAudit(action, module, details, performedBy = 'admin') {
        const logEntry = {
            logId: this.nextId('audit'),
            action,
            module,
            details,
            performedBy,
            timestamp: new Date().toISOString()
        };
        if (!this.data.audit_logs) this.data.audit_logs = [];
        this.data.audit_logs.unshift(logEntry);
        if (this.data.audit_logs.length > 500) {
            this.data.audit_logs = this.data.audit_logs.slice(0, 500);
        }
        this.save();
    }
}

const db = new Database();
module.exports = db;
