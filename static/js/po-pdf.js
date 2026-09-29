// Purchase Order PDF generation + print helper (client-side, no CDN).
// Mirrors the invoice PDF approach so PO documents can be reliably saved as PDF
// inside the JavaFX WebView (where window.print may be unavailable).

const PrintHelper = {
    safeFilename(filename) {
        return String(filename || 'document.pdf').replace(/[\\/:*?"<>|]/g, '_');
    },

    escapeHtml(value) {
        return SafeHtml.escapeHtml(value);
    },

    normalizeResult(result) {
        if (result === true) return 'PRINTED';
        if (result === false) return 'ERROR';
        if (result === undefined || result === null) return 'UNKNOWN';
        return String(result).trim().toUpperCase() || 'UNKNOWN';
    },

    notify(message, type) {
        if (typeof App !== 'undefined' && typeof App.toast === 'function') {
            App.toast(message, type);
        }
    },

    report(result, filename) {
        const name = this.safeFilename(filename);
        if (result === 'PRINTED') {
            this.notify('Document sent to printer.', 'success');
        } else if (result === 'SAVED') {
            this.notify(`PDF saved: ${name}`, 'success');
        } else if (result === 'CANCELLED') {
            this.notify('Action cancelled.', 'info');
        } else if (result === 'BUSY') {
            this.notify('Another print or PDF action is already open.', 'warning');
        } else if (result === 'ERROR') {
            this.notify('Could not print or save document.', 'error');
        } else {
            this.notify('Print action cancelled or completed.', 'info');
        }
        return result;
    },

    pdfByteLength(value) {
        return new TextEncoder().encode(String(value ?? '')).length;
    },

    pdfEscapeText(value) {
        const bytes = new TextEncoder().encode(String(value ?? ''));
        let escaped = '';
        for (const byte of bytes) {
            if (byte === 92) escaped += '\\\\';
            else if (byte === 40) escaped += '\\(';
            else if (byte === 41) escaped += '\\)';
            else if (byte >= 32 && byte <= 126) escaped += String.fromCharCode(byte);
            else escaped += '\\' + byte.toString(8).padStart(3, '0');
        }
        return escaped;
    },

    createPdf(lines, options = {}) {
        const sourceLines = (Array.isArray(lines) ? lines : []).map(line => String(line ?? '').slice(0, 120));
        const linesPerPage = Math.max(20, Number(options.linesPerPage) || 45);
        const pageCount = Math.max(1, Math.ceil(sourceLines.length / linesPerPage));
        const pageIds = [];
        const contentIds = [];
        for (let i = 0; i < pageCount; i++) {
            pageIds.push(3 + i * 2);
            contentIds.push(4 + i * 2);
        }
        const fontId = 3 + pageCount * 2;
        const objects = new Array(fontId).fill('');
        objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
        objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`;
        for (let page = 0; page < pageCount; page++) {
            const start = page * linesPerPage;
            const pageLines = sourceLines.slice(start, start + linesPerPage);
            let y = 750;
            let stream = 'BT /F1 10 Tf\n';
            for (const line of pageLines) {
                stream += `1 0 0 1 50 ${y} Tm (${this.pdfEscapeText(line)}) Tj\n`;
                y -= 14;
            }
            stream += 'ET';
            objects[pageIds[page] - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentIds[page]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
            objects[contentIds[page] - 1] = `<< /Length ${this.pdfByteLength(stream)} >>\nstream\n${stream}\nendstream`;
        }
        objects[fontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

        let pdf = '%PDF-1.4\n';
        const offsets = [0];
        objects.forEach((object, index) => {
            offsets[index + 1] = this.pdfByteLength(pdf);
            pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });
        const xrefStart = this.pdfByteLength(pdf);
        pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        for (let i = 1; i <= objects.length; i++) {
            pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
        }
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
        return pdf;
    },

    download(base64Data, filename) {
        try {
            const binary = atob(base64Data);
            const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = this.safeFilename(filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.notify(`PDF downloaded: ${link.download}`, 'success');
            return 'DOWNLOADED';
        } catch (e) {
            this.notify('PDF download failed.', 'error');
            return 'ERROR';
        }
    },

    savePdf(base64Data, filename) {
        if (!base64Data) {
            this.notify('PDF data is unavailable.', 'error');
            return 'ERROR';
        }
        const bridge = window.javaBridge;
        if (bridge && typeof bridge.savePdf === 'function') {
            try {
                const result = this.normalizeResult(bridge.savePdf(base64Data, this.safeFilename(filename)));
                return this.report(result, filename);
            } catch (e) {
                this.notify('The native PDF save dialog failed.', 'error');
                return 'ERROR';
            }
        }
        return this.download(base64Data, filename);
    },

    printDocument(base64Data, filename, text = '') {
        const bridge = window.javaBridge;
        if (bridge && typeof bridge.printReceipt === 'function') {
            try {
                const result = this.normalizeResult(bridge.printReceipt());
                if (result === 'NO_PRINTER') {
                    this.notify('No printer configured. Saving as PDF instead...', 'info');
                    return this.savePdf(base64Data, filename);
                }
                return this.report(result, filename);
            } catch (e) {
                this.notify('The native print dialog failed. Saving as PDF instead...', 'error');
                return this.savePdf(base64Data, filename);
            }
        }
        if (bridge && typeof bridge.printPageOrSavePdf === 'function') {
            try {
                const result = this.normalizeResult(bridge.printPageOrSavePdf(
                    base64Data, this.safeFilename(filename)));
                return this.report(result, filename);
            } catch (e) {
                this.notify('The native print dialog failed.', 'error');
                return 'ERROR';
            }
        }
        if (bridge && typeof bridge.printTextDocument === 'function') {
            try {
                const result = this.normalizeResult(bridge.printTextDocument(
                    text, base64Data, this.safeFilename(filename)));
                return this.report(result, filename);
            } catch (e) {
                this.notify('The native print dialog failed.', 'error');
                return 'ERROR';
            }
        }
        if (bridge) {
            this.notify('The native print dialog is unavailable.', 'error');
            return 'ERROR';
        }
        if (typeof window.print === 'function') {
            window.print();
            this.notify('Print dialog opened.', 'info');
            return 'PRINTED';
        }
        return this.savePdf(base64Data, filename);
    }
};

const PO_PDF = {
    escape(text) {
        return String(text ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n');
    },

    fmt(val) {
        return (typeof AppSettings !== 'undefined' ? AppSettings.load().currencySymbol || '$' : '$') + (parseFloat(val) || 0).toFixed(2);
    },

    build(po) {
        const settings = (typeof AppSettings !== 'undefined') ? AppSettings.load() : {};
        const hospitalName = settings.hospitalName || 'MediCare Pharmacy';
        const lines = [
            hospitalName,
            'PURCHASE ORDER',
            '',
            `PO Number: ${po.poNumber || po.orderId || 'N/A'}`,
            `Supplier: ${po.supplierName || 'N/A'}`,
            `Ordered By: ${po.orderedByName || 'System'}`,
            `Order Date: ${po.orderDate || ''}`,
            `Expected Delivery: ${po.expectedDeliveryDate || 'N/A'}`,
            `Status: ${(po.status || 'PENDING').replace('_',' ')}`,
            '',
            'Item                     Qty     Unit     Total',
            '------------------------------------------------'
        ];

        (po.items || []).forEach(item => {
            const up = parseFloat(item.unitPrice !== undefined ? item.unitPrice : item.unitCost) || 0;
            const qty = parseInt(item.orderedQuantity !== undefined ? item.orderedQuantity : item.quantity) || 0;
            const name = String(item.drugName || '');
            lines.push(`${name.substring(0,24).padEnd(24)} ${String(qty).padStart(4)} ${this.fmt(up).padStart(8)} ${this.fmt(up*qty).padStart(8)}`);
        });

        lines.push('------------------------------------------------');
        lines.push(`PO TOTAL:${this.fmt(po.totalAmount).padStart(42)}`);
        if (po.notes) lines.push('');
        if (po.notes) lines.push(`Notes: ${po.notes}`);
        lines.push('');
        lines.push(`PO Ref: ${po.poNumber || po.orderId || 'N/A'}-${po.orderId || ''}`);
        return lines;
    },

    generatePdfBytes(lines) {
        if (typeof PrintHelper !== 'undefined' && typeof PrintHelper.createPdf === 'function') {
            return PrintHelper.createPdf(lines, { linesPerPage: 45 });
        }
        return String(lines?.join('\n') || '');
    },

    toBase64(pdfString) {
        const bytes = new TextEncoder().encode(pdfString);
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        return btoa(binary);
    }
};
