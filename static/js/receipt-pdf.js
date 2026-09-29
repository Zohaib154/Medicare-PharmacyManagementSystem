/**
 * Lightweight client-side PDF generator for POS receipts (no external CDN).
 * Works in browser and JavaFX WebView; desktop save uses javaBridge.savePdf when available.
 */
const ReceiptPdf = {
    escapePdf(text) {
        return String(text || '')
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)');
    },

    buildLines(sale) {
        const fmt = (val) => App.formatCurrency(val);
        const dateStr = App.formatLocalDateTime(sale.saleDateTime);
        const discountPct = parseFloat(sale.discountPercent) || 0;
        const discountAmt = parseFloat(sale.discountAmount) || 0;

        // Pull from AppSettings
        const settings = (typeof AppSettings !== 'undefined') ? AppSettings.load() : {};
        const hospitalName  = settings.hospitalName  || 'MediCare Pharmacy';
        const ownerName     = settings.ownerName     || '';
        const address       = settings.address       || '';
        const phone         = settings.phone         || '';
        const invoiceFooter = settings.invoiceFooter || 'Thank you for your business!';
        const taxLabel      = settings.taxLabel      || 'GST';

        const lines = [
            hospitalName,
        ];
        if (ownerName) lines.push(ownerName);
        if (address)   lines.push(address);
        if (phone)     lines.push(`Tel: ${phone}`);
        lines.push(
            '',
            `Bill Code: ${sale.billNumber || sale.saleId || 'N/A'}`,
            `Date: ${dateStr}`,
            `Operator: ${sale.soldByName || '—'}`,
            `Customer: ${sale.patientName || 'Walk-in Customer'}`,
            `Payment: ${sale.paymentMethod || '—'}`,
            `Status: ${String(sale.status || 'COMPLETED').toUpperCase()}`,
            '',
            'Item                          Rate      Amount',
            '------------------------------------------------'
        );

        (sale.items || []).forEach(item => {
            const name = `${item.drugName || 'Item'} x ${item.quantity || 0}`;
            lines.push(`${name.substring(0, 28).padEnd(28)} ${fmt(item.unitPrice).padStart(8)} ${fmt(item.totalPrice).padStart(8)}`);
        });

        lines.push('------------------------------------------------');
        lines.push(`Subtotal:${fmt(sale.subtotal).padStart(42)}`);
        if (discountPct > 0) {
            lines.push(`Discount (${discountPct}%):${('-' + fmt(discountAmt)).padStart(35)}`);
        }
        lines.push(`${taxLabel} Tax Total:${fmt(sale.gstAmount).padStart(36)}`);
        lines.push(`GRAND TOTAL:${fmt(sale.totalAmount).padStart(38)}`);
        lines.push(`Cash Tendered:${fmt(sale.amountPaid).padStart(36)}`);
        lines.push(`Change Returned:${fmt(sale.changeReturned).padStart(34)}`);
        lines.push('');
        lines.push(invoiceFooter);
        lines.push(`Ref: ${sale.billNumber || sale.saleId || 'N/A'}-${sale.saleId || ''}`);
        return lines;
    },

    generatePdfBytes(lines) {
        if (typeof PrintHelper !== 'undefined' && typeof PrintHelper.createPdf === 'function') {
            return PrintHelper.createPdf(lines, { linesPerPage: 45 });
        }
        return String(lines?.join('\n') || '');
    },

    pdfFilename(sale) {
        const bill = (sale && sale.billNumber) ? sale.billNumber.replace(/[^\w-]/g, '') : 'invoice';
        return `MediCare-Invoice-${bill}.pdf`;
    },

    toBase64(pdfString) {
        const bytes = new TextEncoder().encode(pdfString);
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        return btoa(binary);
    },

    download(sale) {
        if (!sale) {
            App.toast('No receipt data available for PDF export.', 'error');
            return false;
        }

        try {
            const lines = this.buildLines(sale);
            const pdfString = this.generatePdfBytes(lines);
            const filename = this.pdfFilename(sale);

            if (typeof PrintHelper !== 'undefined') {
                return PrintHelper.savePdf(this.toBase64(pdfString), filename) !== 'ERROR';
            }

            const blob = new Blob([pdfString], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            App.toast(`PDF downloaded: ${filename}`, 'success');
            return true;
        } catch (e) {
            console.error('PDF generation failed', e);
            App.toast('Could not generate PDF. Try Print Invoice and choose "Save as PDF".', 'error');
            return false;
        }
    }
};
