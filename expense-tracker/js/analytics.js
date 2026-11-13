/**
 * Expense Analytics Module
 *
 * Computes category-wise expense breakdown, monthly income vs. expenses,
 * spending distribution, highest spending category, and total savings.
 */

import {
  calculateTotals,
  escapeHtml,
  filterByMonth,
  formatCurrency,
  formatMonthLabel,
  getCategoryColor,
} from './transactions.js';

let comparisonChartInstance = null;
let categoryBarChartInstance = null;
let distributionChartInstance = null;
let analyticsScope = 'month'; // 'month' | 'all'

function destroyAnalyticsCharts() {
  if (comparisonChartInstance) {
    comparisonChartInstance.destroy();
    comparisonChartInstance = null;
  }
  if (categoryBarChartInstance) {
    categoryBarChartInstance.destroy();
    categoryBarChartInstance = null;
  }
  if (distributionChartInstance) {
    distributionChartInstance.destroy();
    distributionChartInstance = null;
  }
}

export function getMonthlyComparison(transactions, endMonthKey, count = 6) {
  const [endYear, endMonth] = endMonthKey.split('-').map(Number);
  const buckets = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(endYear, endMonth - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    buckets.push({ key, label, income: 0, expense: 0 });
  }

  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const txn of transactions) {
    const key = String(txn.date || '').slice(0, 7);
    const target = byKey.get(key);
    if (!target) continue;
    if (txn.type === 'income') {
      target.income += Number(txn.amount) || 0;
    } else {
      target.expense += Number(txn.amount) || 0;
    }
  }

  return buckets.map((b) => ({
    ...b,
    income: Math.round(b.income * 100) / 100,
    expense: Math.round(b.expense * 100) / 100,
  }));
}

export function getAnalyticsMetrics(transactions) {
  const totals = calculateTotals(transactions);
  const expenses = transactions.filter((t) => t.type === 'expense');

  const categoryMap = new Map();
  for (const txn of expenses) {
    const amt = Number(txn.amount) || 0;
    const prev = categoryMap.get(txn.category) || { amount: 0, count: 0 };
    categoryMap.set(txn.category, {
      amount: prev.amount + amt,
      count: prev.count + 1,
    });
  }

  const breakdown = Array.from(categoryMap.entries())
    .map(([category, info]) => ({
      category,
      amount: Math.round(info.amount * 100) / 100,
      count: info.count,
      percentage:
        totals.totalExpenses > 0
          ? Math.round((info.amount / totals.totalExpenses) * 1000) / 10
          : 0,
      color: getCategoryColor(category),
    }))
    .sort((a, b) => b.amount - a.amount);

  const highestCategory = breakdown[0] || null;
  const totalSavings = totals.totalBalance;
  const savingsRate =
    totals.totalIncome > 0
      ? Math.round((totalSavings / totals.totalIncome) * 1000) / 10
      : 0;
  const averageExpense =
    expenses.length > 0
      ? Math.round((totals.totalExpenses / expenses.length) * 100) / 100
      : 0;

  return {
    totals,
    breakdown,
    highestCategory,
    totalSavings,
    savingsRate,
    averageExpense,
    expenseCount: expenses.length,
  };
}

export const AnalyticsModule = {
  render(container, context) {
    const { transactions, selectedMonth, onOpenAddModal } = context;

    destroyAnalyticsCharts();

    const scopedTransactions =
      analyticsScope === 'month' ? filterByMonth(transactions, selectedMonth) : transactions;
    const metrics = getAnalyticsMetrics(scopedTransactions);
    const allTimeTotals = calculateTotals(transactions);
    const monthlySeries = getMonthlyComparison(transactions, selectedMonth, 6);
    const scopeLabel =
      analyticsScope === 'month' ? formatMonthLabel(selectedMonth) : 'All Time';

    container.innerHTML = `
      <div class="card" style="padding: 14px 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div class="card-title-group">
            <h2 class="card-title">Financial Analytics Scope</h2>
            <p class="card-subtitle">Inspect category breakdown and savings for ${escapeHtml(
              scopeLabel
            )}</p>
          </div>
          <div class="segmented-control" role="group" aria-label="Analytics timeframe scope">
            <button type="button" class="segmented-btn ${
              analyticsScope === 'month' ? 'active' : ''
            }" data-analytics-scope="month">Selected Month</button>
            <button type="button" class="segmented-btn ${
              analyticsScope === 'all' ? 'active' : ''
            }" data-analytics-scope="all">All Time</button>
          </div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Highest Spending Category</span>
          </div>
          <p class="kpi-value">${
            metrics.highestCategory
              ? escapeHtml(metrics.highestCategory.category)
              : '—'
          }</p>
          <div class="kpi-meta">
            ${
              metrics.highestCategory
                ? `<span class="num">${formatCurrency(
                    metrics.highestCategory.amount
                  )}</span> · ${metrics.highestCategory.percentage.toFixed(1)}% of expenses`
                : 'No expenses in range'
            }
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Total Savings (${escapeHtml(scopeLabel)})</span>
          </div>
          <p class="kpi-value ${
            metrics.totalSavings >= 0 ? 'is-positive' : 'is-negative'
          }">${formatCurrency(metrics.totalSavings)}</p>
          <div class="kpi-meta">
            Savings rate: <span class="num">${metrics.savingsRate.toFixed(1)}%</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Cumulative Savings</span>
          </div>
          <p class="kpi-value ${
            allTimeTotals.totalBalance >= 0 ? 'is-positive' : 'is-negative'
          }">${formatCurrency(allTimeTotals.totalBalance)}</p>
          <div class="kpi-meta">All-time income minus expenses</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Average Expense</span>
          </div>
          <p class="kpi-value">${formatCurrency(metrics.averageExpense)}</p>
          <div class="kpi-meta">${metrics.expenseCount} expense transactions</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <h2 class="card-title">Monthly Income vs. Expenses</h2>
            <p class="card-subtitle">6-month cashflow comparison ending ${escapeHtml(
              formatMonthLabel(selectedMonth)
            )}</p>
          </div>
        </div>
        <div class="card-body">
          ${
            transactions.length === 0
              ? `
            <div class="empty-state">
              <div class="empty-state-icon"><i data-lucide="bar-chart-3"></i></div>
              <h3 class="empty-state-title">No transaction history</h3>
              <p class="empty-state-desc">Add transactions to visualize monthly income versus expenses.</p>
              <button type="button" class="btn btn-primary btn-sm" id="analytics-empty-add-btn">
                <i data-lucide="plus"></i>
                <span>Add Transaction</span>
              </button>
            </div>
          `
              : `<div class="chart-container"><canvas id="analytics-comparison-chart"></canvas></div>`
          }
        </div>
      </div>

      <div class="grid-equal-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <h2 class="card-title">Category-Wise Expense Breakdown</h2>
              <p class="card-subtitle">${escapeHtml(scopeLabel)}</p>
            </div>
          </div>
          <div class="card-body">
            ${
              metrics.breakdown.length === 0
                ? `
              <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="bar-chart-horizontal"></i></div>
                <h3 class="empty-state-title">No expense data</h3>
                <p class="empty-state-desc">No expenses found for ${escapeHtml(scopeLabel)}.</p>
              </div>
            `
                : `<div class="chart-container"><canvas id="analytics-category-bar-chart"></canvas></div>`
            }
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <h2 class="card-title">Spending Distribution</h2>
              <p class="card-subtitle">Share of total expenses (${escapeHtml(scopeLabel)})</p>
            </div>
          </div>
          <div class="card-body">
            ${
              metrics.breakdown.length === 0
                ? `
              <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="pie-chart"></i></div>
                <h3 class="empty-state-title">No spending distribution</h3>
                <p class="empty-state-desc">Add expense entries to view category percentages.</p>
              </div>
            `
                : `<div class="chart-container"><canvas id="analytics-distribution-chart"></canvas></div>`
            }
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <h2 class="card-title">Category Summary Table</h2>
            <p class="card-subtitle">Detailed spend metrics for ${escapeHtml(scopeLabel)}</p>
          </div>
        </div>
        <div class="card-body card-body-flush">
          ${
            metrics.breakdown.length === 0
              ? `
            <div class="empty-state">
              <p class="empty-state-desc">No expense categories to summarize for ${escapeHtml(
                scopeLabel
              )}.</p>
            </div>
          `
              : `
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th class="text-right">Transactions</th>
                    <th class="text-right">Total Spent</th>
                    <th class="text-right">Share of Expenses</th>
                  </tr>
                </thead>
                <tbody>
                  ${metrics.breakdown
                    .map(
                      (row) => `
                    <tr>
                      <td>
                        <span class="breakdown-label">
                          <span class="swatch" style="background-color: ${row.color}"></span>
                          <span>${escapeHtml(row.category)}</span>
                        </span>
                      </td>
                      <td class="text-right num">${row.count}</td>
                      <td class="text-right num">${formatCurrency(row.amount)}</td>
                      <td class="text-right num">${row.percentage.toFixed(1)}%</td>
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

    container.querySelectorAll('[data-analytics-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        analyticsScope = btn.dataset.analyticsScope;
        this.render(container, context);
      });
    });

    container
      .querySelector('#analytics-empty-add-btn')
      ?.addEventListener('click', () => onOpenAddModal());

    this.renderCharts(container, transactions, monthlySeries, metrics.breakdown);

    if (window.lucide) window.lucide.createIcons();
  },

  renderCharts(container, transactions, monthlySeries, breakdown) {
    if (typeof window.Chart !== 'function') return;

    const compCanvas = container.querySelector('#analytics-comparison-chart');
    if (compCanvas && transactions.length > 0) {
      comparisonChartInstance = new window.Chart(compCanvas, {
        type: 'bar',
        data: {
          labels: monthlySeries.map((m) => m.label),
          datasets: [
            {
              label: 'Income',
              data: monthlySeries.map((m) => m.income),
              backgroundColor: '#15803d',
              borderRadius: 4,
              maxBarThickness: 28,
            },
            {
              label: 'Expenses',
              data: monthlySeries.map((m) => m.expense),
              backgroundColor: '#0f4c81',
              borderRadius: 4,
              maxBarThickness: 28,
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

    const barCanvas = container.querySelector('#analytics-category-bar-chart');
    if (barCanvas && breakdown.length > 0) {
      categoryBarChartInstance = new window.Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: breakdown.map((b) => b.category),
          datasets: [
            {
              label: 'Spent',
              data: breakdown.map((b) => b.amount),
              backgroundColor: breakdown.map((b) => b.color),
              borderRadius: 4,
              maxBarThickness: 22,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (item) => `Spent: ${formatCurrency(item.raw)}`,
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: '#f1f5f9' },
              ticks: {
                color: '#64748b',
                font: { size: 11 },
                callback: (val) => `$${val}`,
              },
            },
            y: {
              grid: { display: false },
              ticks: { color: '#334155', font: { size: 12 } },
            },
          },
        },
      });
    }

    const distCanvas = container.querySelector('#analytics-distribution-chart');
    if (distCanvas && breakdown.length > 0) {
      distributionChartInstance = new window.Chart(distCanvas, {
        type: 'doughnut',
        data: {
          labels: breakdown.map((b) => b.category),
          datasets: [
            {
              data: breakdown.map((b) => b.amount),
              backgroundColor: breakdown.map((b) => b.color),
              borderColor: '#ffffff',
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'right',
              labels: { boxWidth: 10, color: '#475569', font: { size: 12 } },
            },
            tooltip: {
              callbacks: {
                label: (item) => {
                  const row = breakdown[item.dataIndex];
                  return `${row.category}: ${formatCurrency(row.amount)} (${row.percentage.toFixed(
                    1
                  )}%)`;
                },
              },
            },
          },
        },
      });
    }
  },
};
