# 💊 MediCare v1.0.0 — Official Production Release

We are proud to announce the first production release of **MediCare (Advanced Pharmacy Management Desktop Application)**. Engineered with a modern glassmorphism aesthetic, offline-first architecture, local cryptographic security, and high-speed point-of-sale operations.

---

## 📦 Downloads & Installation

| Distribution | File Name | Size | Target Environment |
|---|---|---|---|
| **Windows Setup Installer** *(Recommended)* | `MediCare-Setup.exe` | ~78 MB | Standard Windows installation (Desktop & Start Menu shortcuts, clean uninstaller) |
| **Portable Edition** | `MediCare-Portable.exe` | ~77 MB | Standalone single-file binary (Run from USB or any folder, zero installation) |

---

## ⚡ Key Highlights in v1.0.0

### 🛒 High-Speed Point of Sale (POS) & Billing
- **Instant Search**: Real-time medication search across trade names, generic formulas, and therapeutic categories.
- **Automated Pricing**: Live cart calculations with item-level discounts, customizable tax/GST percentages, and cash change computation.
- **Hardware-Ready Printing**: Native Chromium print integration supporting 80mm/58mm thermal receipt printers, laser printers, and **Microsoft Print to PDF**.
- **Bill History & Receipts**: Instant invoice reprint and customer receipt lookup.

### 📦 Medication Catalog & FEFO Inventory Engine
- **Multi-Batch Control**: Track multiple batches per drug with manufacturing dates, expiry dates, purchase costs, and retail prices.
- **Automated FEFO Ingestion**: First-Expiry-First-Out dispensing logic ensures older stock is sold before newer inventory.
- **Stock Health & Write-offs**: Instant stock adjustments, write-off auditing for expired/damaged items, and low-stock threshold monitoring.

### 📋 Digital Prescriptions & Patient Registry
- **Prescription Workflow**: Prescribing doctor tracking, patient history, directions for use, and one-click stock deduction dispensing.
- **Comprehensive Patient Profiles**: Demographics, contact information, purchase history, and recorded medical allergies.
- **Patient Removal**: Dedicated options to safely delete inactive or duplicate patient profiles.

### 🚚 Supplier Management & Purchase Orders
- **Supplier Ledger**: Vendor directory with outstanding balance tracking and contact management.
- **Purchase Order Workflow**: Create professional purchase orders, track approval status, and print PO documents.
- **One-Click Receiving**: Receiving orders automatically generates and restocks inventory batches with cost tracking.

### 🛡️ Enterprise-Grade Security & Persistent Brute-Force Defense
- **100% Offline Privacy**: Zero telemetry, all records persist locally in `%USERPROFILE%\.medicare\`.
- **Brute-Force Lockout Defense**: 5 consecutive failed login attempts trigger an immediate **60-second account lockout**.
- **Restart-Resilient Protection**: The 60-second lockout timer is stored on disk and persists across application closes and system reboots.
- **Live Lockout Countdown**: Real-time visual countdown timer displayed on the login interface.
- **Session Auto-Logout**: Closes active sessions upon window exit to safeguard sensitive healthcare records.

### 🔐 Interactive Backup Security (.mbak)
- **On-Demand Security Prompt**: When downloading a backup, choose between:
  - **Standard Backup (`.mbak`)**: Fast, unencrypted export restorable with a single click.
  - **Encrypted Backup (`.enc.mbak`)**: Secured with military-grade **AES-256-GCM** encryption (derived via PBKDF2 with 210,000 iterations).
- **Direct Restore**: Standard backups restore directly without asking for a password.
- **Password Decryption**: Automatically prompts for the decryption password only when an encrypted backup file is detected.
- **Clean Reset**: One-click database clean start option to wipe all sample data.

### 🔔 Real-Time Startup Operational Alerts
- **Automated Health Scanner**: Automatically scans inventory on application launch, login, and restart.
- **Screen Toast Notifications**: Alerts pharmacy staff immediately to critical operational events:
  - Out-of-stock medications (e.g. *"Flagyl 400mg is completely out of stock!"*)
  - Low-stock warnings when inventory drops below reorder level.
  - Expired batch alerts and expiring-soon warnings.
- **Notification Center**: Bell icon dropdown with live unread badge counters and quick navigation to inventory.

### 🎨 Dynamic Pharmacy Branding & Modern Themes
- Dynamic pharmacy name, address, tax number, and invoice footer customization reflected on all receipts and reports.
- High-contrast **Dark Mode** and crisp **Light Mode** styling with glassmorphism visual design.

---

## 🛡️ Windows SmartScreen Installation Note

Because MediCare is distributed as an independent open-source project without expensive enterprise signing certificates ($400+/year), Microsoft Defender SmartScreen may show an advisory prompt on first run:

1. Click **"More info"**
2. Click **"Run anyway"**

*The application is 100% clean, open-source, and does not require elevated Administrator privileges (`PrivilegesRequired=lowest`).*

---

## 🛠️ Verification & System Requirements

- **Operating System**: Windows 10 / Windows 11 (64-bit)
- **Architecture**: x64
- **Runtime**: Electron 35, Chromium Embedded & Node.js Express
- **Default Credentials**:
  - **Username**: `admin`
  - **Password**: `admin123`
  - **Role**: `ROLE_ADMIN`
- **License**: MIT Open Source License

---

*Developed by [Zohaib Asghar](https://github.com/Zohaib154)*
