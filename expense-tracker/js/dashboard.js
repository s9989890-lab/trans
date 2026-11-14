/**
 * Dashboard Module
 *
 * Displays dynamic KPI summary cards, Monthly Spending Overview chart,
 * Expense Category Breakdown chart, budget alert status, and Recent Transactions.
 */

import { calculateBudgetStatus, renderBudgetAlertMarkup } from './budget.js';
import {
  calculateTotals,
  escapeHtml,
  filterByMonth,
  formatCurrency,
  formatDate,
  formatMonthLabel,
  getCategoryColor,
  queryTransactions,
} from './transactions.js';

let overviewChartInstance = null;
let categoryChartInstance = null;
let overviewMode = 'daily'; // 'daily' | 'six-month'

function destroyCharts() {
  if (overviewChartInstance) {
    overviewChartInstance.destroy();
    overviewChartInstance = null;
  }
  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }
}

function getDailySpendingSeries(transactions, monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyTotals = new Array(daysInMonth).fill(0);

  for (const txn of filterByMonth(transactions, monthKey)) {
    if (txn.type !== 'expense') continue;
    const day = Number(String(txn.date).split('-')[2]);
    if (day >= 1 && day <= daysInMonth) {
      dailyTotals[day - 1] += Number(txn.amount) || 0;
    }
  }

  return {
    labels: dailyTotals.map((_, idx) => String(idx + 1)),
    values: dailyTotals.map((v) => Math.round(v * 100) / 100),
  };
}

function getLastSixMonthsSeries(transactions, endMonthKey) {
  const [endYear, endMonth] = endMonthKey.split('-').map(Number);
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(endYear, endMonth - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    months.push({ key, label, income: 0, expense: 0 });
  }

  const map = new Map(months.map((m) => [m.key, m]));
  for (const txn of transactions) {
    const key = String(txn.date || '').slice(0, 7);
    const bucket = map.get(key);
    if (!bucket) continue;
    if (txn.type === 'income') {
      bucket.income += Number(txn.amount) || 0;
    } else {
      bucket.expense += Number(txn.amount) || 0;
    }
  }

  return months.map((m) => ({
    ...m,
    income: Math.round(m.income * 100) / 100,
    expense: Math.round(m.expense * 100) / 100,
  }));
}

function getExpenseCategoryBreakdown(transactions, monthKey) {
  const monthTxns = filterByMonth(transactions, monthKey).filter((t) => t.type === 'expense');
  const totals = new Map();
  let grandTotal = 0;

  for (const txn of monthTxns) {
    const amt = Number(txn.amount) || 0;
    grandTotal += amt;
    totals.set(txn.category, (totals.get(txn.category) || 0) + amt);
  }

  return Array.from(totals.entries())
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount * 100) / 100,
      percentage: grandTotal > 0 ? Math.round((amount / grandTotal) * 1000) / 10 : 0,
      color: getCategoryColor(category),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export const DashboardModule = {
  render(container, context) {
    const {
      transactions,
      budget,
      selectedMonth,
      onNavigate,
      onEditTransaction,
      onDeleteTransaction,
      onOpenAddModal,
      smartAlerts,
    } = context;

    destroyCharts();

    const allTotals = calculateTotals(transactions);
    const monthTransactions = filterByMonth(transactions, selectedMonth);
    const monthTotals = calculateTotals(monthTransactions);
    const budgetStatus = calculateBudgetStatus(transactions, budget, selectedMonth);
    const monthLabel = formatMonthLabel(selectedMonth);

    const recentTransactions = queryTransactions(transactions, {
      sortBy: 'date-desc',
    }).slice(0, 6);

    const categoryBreakdown = getExpenseCategoryBreakdown(transactions, selectedMonth);
    const alertBannerHtml = renderBudgetAlertMarkup(budgetStatus, selectedMonth, true, smartAlerts);

    container.innerHTML = `
      ${alertBannerHtml}

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Total Balance</span>
          </div>
          <p class="kpi-value ${
            allTotals.totalBalance < 0 ? 'is-negative' : ''
          }">${formatCurrency(allTotals.totalBalance)}</p>
          <div class="kpi-meta">Total Income minus Total Expenses</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Total Income</span>
          </div>
          <p class="kpi-value is-positive">${formatCurrency(allTotals.totalIncome)}</p>
          <div class="kpi-meta">${formatCurrency(monthTotals.totalIncome)} in ${escapeHtml(
      monthLabel
    )}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Total Expenses</span>
          </div>
          <p class="kpi-value">${formatCurrency(allTotals.totalExpenses)}</p>
          <div class="kpi-meta">Across ${transactions.filter((t) => t.type === 'expense').length} entries</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Monthly Spending</span>
          </div>
          <p class="kpi-value ${
            budgetStatus.status === 'exceeded'
              ? 'is-negative'
              : budgetStatus.status === 'warning'
              ? 'is-warning'
              : ''
          }">${formatCurrency(monthTotals.totalExpenses)}</p>
          <div class="kpi-meta">
            ${
              budgetStatus.monthlyLimit > 0
                ? `${budgetStatus.utilizationPct.toFixed(1)}% of ${formatCurrency(
                    budgetStatus.monthlyLimit
                  )} budget`
                : escapeHtml(monthLabel)
            }
          </div>
        </div>
      </div>

      <div class="grid-2-col">
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <h2 class="card-title">Monthly Spending Overview</h2>
              <p class="card-subtitle">
                ${
                  overviewMode === 'daily'
                    ? `Daily expenses for ${escapeHtml(monthLabel)}`
                    : '6-month expense and income comparison'
                }
              </p>
            </div>
            <div class="segmented-control" role="group" aria-label="Chart timeframe">
              <button type="button" class="segmented-btn ${
                overviewMode === 'daily' ? 'active' : ''
              }" data-overview-mode="daily">Daily</button>
              <button type="button" class="segmented-btn ${
                overviewMode === 'six-month' ? 'active' : ''
              }" data-overview-mode="six-month">6 Months</button>
            </div>
          </div>
          <div class="card-body">
            ${
              transactions.length === 0
                ? `
              <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="bar-chart-2"></i></div>
                <h3 class="empty-state-title">No spending data yet</h3>
                <p class="empty-state-desc">Add income or expense entries to render your monthly spending overview.</p>
              </div>
            `
                : `<div class="chart-container"><canvas id="dashboard-overview-chart"></canvas></div>`
            }
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <h2 class="card-title">Expense Category Breakdown</h2>
              <p class="card-subtitle">${escapeHtml(monthLabel)}</p>
            </div>
          </div>
          <div class="card-body">
            ${
              categoryBreakdown.length === 0
                ? `
              <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="pie-chart"></i></div>
                <h3 class="empty-state-title">No expenses this month</h3>
                <p class="empty-state-desc">Expenses recorded in ${escapeHtml(
                  monthLabel
                )} will populate this breakdown.</p>
              </div>
            `
                : `
              <div class="breakdown-layout">
                <div class="chart-container-sm"><canvas id="dashboard-category-chart"></canvas></div>
                <ul class="breakdown-list">
                  ${categoryBreakdown
                    .slice(0, 5)
                    .map(
                      (item) => `
                    <li class="breakdown-item">
                      <span class="breakdown-label">
                        <span class="swatch" style="background-color: ${item.color}"></span>
                        <span>${escapeHtml(item.category)}</span>
                      </span>
                      <span class="breakdown-values">
                        <span class="num">${formatCurrency(item.amount)}</span>
                        <span class="breakdown-pct num">${item.percentage.toFixed(1)}%</span>
                      </span>
                    </li>
                  `
                    )
                    .join('')}
                </ul>
              </div>
            `
            }
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <h2 class="card-title">Recent Transactions</h2>
            <p class="card-subtitle">Latest activity across all accounts</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="view-all-txns-btn">
            View All
          </button>
        </div>
        <div class="card-body card-body-flush">
          ${
            recentTransactions.length === 0
              ? `
            <div class="empty-state">
              <div class="empty-state-icon"><i data-lucide="receipt"></i></div>
              <h3 class="empty-state-title">No recent transactions</h3>
              <p class="empty-state-desc">Start tracking your finances by adding your first transaction.</p>
              <button type="button" class="btn btn-primary btn-sm" id="dash-empty-add-btn">
                <i data-lucide="plus"></i>
                <span>Add Transaction</span>
              </button>
            </div>
          `
              : `
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction</th>
                    <th>Category</th>
                    <th class="text-right">Amount</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${recentTransactions
                    .map(
                      (txn) => `
                    <tr>
                      <td style="white-space: nowrap; color: var(--text-secondary);">${escapeHtml(
                        formatDate(txn.date)
                      )}</td>
                      <td>
                        <div class="txn-title-cell">
                          <span class="txn-title">${escapeHtml(txn.title)}</span>
                          ${
                            txn.description
                              ? `<span class="txn-desc">${escapeHtml(txn.description)}</span>`
                              : ''
                          }
                        </div>
                      </td>
                      <td>${escapeHtml(txn.category)}</td>
                      <td class="text-right amount-cell ${
                        txn.type === 'income' ? 'is-income' : 'is-expense'
                      }">
                        ${txn.type === 'income' ? '+' : '-'}${formatCurrency(txn.amount)}
                      </td>
                      <td class="text-right">
                        <div class="row-actions">
                          <button
                            type="button"
                            class="icon-btn"
                            data-dash-edit="${escapeHtml(txn.id)}"
                            aria-label="Edit ${escapeHtml(txn.title)}"
                            title="Edit"
                          >
                            <i data-lucide="pencil"></i>
                          </button>
                          <button
                            type="button"
                            class="icon-btn icon-btn-danger"
                            data-dash-delete="${escapeHtml(txn.id)}"
                            aria-label="Delete ${escapeHtml(txn.title)}"
                            title="Delete"
                          >
                            <i data-lucide="trash-2"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
          }
        </div>
      </div>
    `;

    // Bind interactive actions
    container.querySelector('[data-goto-budget]')?.addEventListener('click', () => {
      onNavigate('budget');
    });

    container.querySelector('#view-all-txns-btn')?.addEventListener('click', () => {
      onNavigate('transactions');
    });

    container.querySelector('#dash-empty-add-btn')?.addEventListener('click', () => {
      onOpenAddModal();
    });

    container.querySelectorAll('[data-overview-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        overviewMode = btn.dataset.overviewMode;
        this.render(container, context);
      });
    });

    container.querySelectorAll('[data-dash-edit]').forEach((btn) => {
      btn.addEventListener('click', () => onEditTransaction(btn.dataset.dashEdit));
    });

    container.querySelectorAll('[data-dash-delete]').forEach((btn) => {
      btn.addEventListener('click', () => onDeleteTransaction(btn.dataset.dashDelete));
    });

    // Render Charts
    this.renderCharts(container, transactions, selectedMonth, categoryBreakdown);

    if (window.lucide) window.lucide.createIcons();
  },

  renderCharts(container, transactions, selectedMonth, categoryBreakdown) {
    if (typeof window.Chart !== 'function') return;

    const overviewCanvas = container.querySelector('#dashboard-overview-chart');
    if (overviewCanvas && transactions.length > 0) {
      if (overviewMode === 'daily') {
        const daily = getDailySpendingSeries(transactions, selectedMonth);
        overviewChartInstance = new window.Chart(overviewCanvas, {
          type: 'bar',
          data: {
            labels: daily.labels,
            datasets: [
              {
                label: 'Daily Spending',
                data: daily.values,
                backgroundColor: '#0f4c81',
                borderRadius: 4,
                maxBarThickness: 18,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => `Day ${items[0].label}`,
                  label: (item) => `Spent: ${formatCurrency(item.raw)}`,
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#64748b', font: { size: 11 } },
              },
              y: {
                beginAtZero: true,
                grid: { color: '#f1f5f9' },
                ticks: {
                  color: '#64748b',
                  font: { size: 11 },
                  callback: (val) => `$${val}`,
                },
              },
            },
          },
        });
      } else {
        const series = getLastSixMonthsSeries(transactions, selectedMonth);
        overviewChartInstance = new window.Chart(overviewCanvas, {
          type: 'bar',
          data: {
            labels: series.map((m) => m.label),
            datasets: [
              {
                label: 'Income',
                data: series.map((m) => m.income),
                backgroundColor: '#15803d',
                borderRadius: 4,
                maxBarThickness: 22,
              },
              {
                label: 'Expenses',
                data: series.map((m) => m.expense),
                backgroundColor: '#0f4c81',
                borderRadius: 4,
                maxBarThickness: 22,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                align: 'end',
                labels: { boxWidth: 10, color: '#475569', font: { size: 12 } },
              },
              tooltip: {
                callbacks: {
                  label: (item) => `${item.dataset.label}: ${formatCurrency(item.raw)}`,
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#64748b', font: { size: 11 } },
              },
              y: {
                beginAtZero: true,
                grid: { color: '#f1f5f9' },
                ticks: {
                  color: '#64748b',
                  font: { size: 11 },
                  callback: (val) => `$${val}`,
                },
              },
            },
          },
        });
      }
    }

    const categoryCanvas = container.querySelector('#dashboard-category-chart');
    if (categoryCanvas && categoryBreakdown.length > 0) {
      categoryChartInstance = new window.Chart(categoryCanvas, {
        type: 'doughnut',
        data: {
          labels: categoryBreakdown.map((c) => c.category),
          datasets: [
            {
              data: categoryBreakdown.map((c) => c.amount),
              backgroundColor: categoryBreakdown.map((c) => c.color),
              borderColor: '#ffffff',
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '66%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (item) => {
                  const row = categoryBreakdown[item.dataIndex];
                  return `${row.category}: ${formatCurrency(row.amount)} (${row.percentage.toFixed(1)}%)`;
                },
              },
            },
          },
        },
      });
    }
  },
};
