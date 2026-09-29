const Dashboard = {
    _loadPromise: null,

    async load() {
        if (this._loadPromise) return this._loadPromise;
        const promise = (async () => {
            try {
                const metrics = await API.get('/dashboard');
                await this.renderMetrics(metrics);
                await this.loadChart();
                return true;
            } catch (e) {
                console.error('Failed to load dashboard metrics', e);
                App.toast('Could not fetch dashboard KPIs.', 'error');
                return false;
            }
        })();
        this._loadPromise = promise;
        promise.finally(() => {
            if (this._loadPromise === promise) this._loadPromise = null;
        }).catch(() => {});
        return promise;
    },

    async loadChart() {
        try {
            const data = await API.get('/dashboard/revenue-chart');
            const container = document.getElementById('db-revenue-chart');
            if (!container) return true;
            const chartData = Array.isArray(data) ? data.slice(-7) : [];
            const maxRevenue = chartData.reduce((max, item) => Math.max(max, Number(item.revenue) || 0), 0) || 100;
            await App.renderRows(container, chartData, d => {
                const revenue = Number(d.revenue) || 0;
                const pct = (revenue / maxRevenue) * 100;
                const barHeight = revenue > 0 ? Math.max(8, Math.min(72, Math.round((pct / 100) * 64) + 8)) : 6;
                const barWrapper = document.createElement('div');
                barWrapper.className = 'revenue-bar-wrapper';
                const fmt = (val) => App.formatCurrency(val, 0);
                const revenueText = revenue > 0 ? fmt(revenue) : '';
                const dayLabel = d.day || (d.date ? new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : 'Day');
                barWrapper.innerHTML = `
                    <div class="revenue-value" title="${SafeHtml.escapeAttribute(revenueText)}">${SafeHtml.escapeHtml(revenueText)}</div>
                    <div class="revenue-bar" style="height: ${barHeight}%; opacity: ${revenue > 0 ? '1' : '0.35'};"></div>
                    <div class="revenue-day" title="${SafeHtml.escapeAttribute(d.date || dayLabel)}">${SafeHtml.escapeHtml(dayLabel)}</div>
                `;
                return barWrapper;
            }, { chunkSize: 7 });
            return true;
        } catch (e) {
            console.error('Failed to load dashboard chart', e);
            return false;
        }
    },

    async renderMetrics(m) {
        const fmt = (val) => App.formatCurrency(val);

        document.getElementById('db-revenue').textContent = fmt(m.todayRevenue);
        document.getElementById('db-monthly-revenue').textContent = fmt(m.monthRevenue);
        document.getElementById('db-out-stock').textContent = m.outOfStockCount || 0;
        document.getElementById('db-expiring').textContent = m.expiringIn30Days || 0;
        
        document.getElementById('db-today-sales').textContent = m.todayTransactions || 0;
        document.getElementById('db-avg-bill').textContent = fmt(m.avgBillValue);
        document.getElementById('db-total-patients').textContent = m.totalPatients || 0;

        // Make cards clickable to navigate
        this._makeCardClickable('db-out-stock', 'inventory', m.outOfStockCount > 0);
        this._makeCardClickable('db-expiring', 'inventory', m.expiringIn30Days > 0);

        const topDrugsTableBody = document.getElementById('db-top-drugs-list');
        if (!topDrugsTableBody) return false;
        const topDrugs = Array.isArray(m.topSellingDrugs) ? m.topSellingDrugs.slice(0, 20) : [];
        if (topDrugs.length === 0) {
            await App.renderRows(topDrugsTableBody, [], () => null, {
                emptyHtml: `
                    <tr>
                        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px;">
                            No transactions registered this month.
                        </td>
                    </tr>
                `
            });
            return true;
        }

        await App.renderRows(topDrugsTableBody, topDrugs, drug => {
            const tr = document.createElement('tr');
             tr.innerHTML = `
                 <td style="font-weight: 600;">${SafeHtml.escapeHtml(drug.drugName)}</td>
                 <td><span class="badge badge-blue">${SafeHtml.escapeHtml(drug.unitsSold)} units</span></td>
                 <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-green);">${SafeHtml.escapeHtml(fmt(drug.revenue))}</td>
             `;
            return tr;
        });
        return true;
    },

    _makeCardClickable(elementId, targetTab, highlight) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const card = el.closest('.metric-card');
        if (!card) return;
        card.style.cursor = 'pointer';
        card.title = `Click to view ${targetTab}`;
        card.onclick = () => {
            if (typeof App !== 'undefined' && App.switchTab) {
                App.switchTab(targetTab);
            }
        };
        if (highlight) {
            card.style.boxShadow = '0 0 0 2px var(--accent-orange)';
            setTimeout(() => { card.style.boxShadow = ''; }, 3000);
        }
    }
};
