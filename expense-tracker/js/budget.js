/**
 * Budget Management Module
 *
 * Computes monthly budget utilization, remaining budget, and threshold alerts
 * (80% warning and >100% exceeded alert) independently of storage.
 */

import {
  escapeHtml,
  filterByMonth,
  formatCurrency,
  formatMonthLabel,
  getCategoryColor,
} from './transactions.js';

export function calculateBudgetStatus(transactions, budget, monthKey) {
  const monthlyLimit = Math.max(0, Number(budget?.monthlyLimit) || 0);
  const monthTransactions = filterByMonth(transactions, monthKey);

  const monthlyExpenses =
    Math.round(
      monthTransactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0) * 100
    ) / 100;

  const remainingBudget = Math.round((monthlyLimit - monthlyExpenses) * 100) / 100;
  const utilizationPct =
    monthlyLimit > 0 ? Math.round((monthlyExpenses / monthlyLimit) * 1000) / 10 : 0;

  let status = 'nominal';
  if (monthlyLimit <= 0) {
    status = 'unset';
  } else if (utilizationPct > 100) {
    status = 'exceeded';
  } else if (utilizationPct >= 80) {
    status = 'warning';
  }

  return {
    monthlyLimit,
    monthlyExpenses,
    remainingBudget,
    utilizationPct,
    status,
    monthTransactions,
  };
}

export function renderBudgetAlertMarkup(budgetStatus, monthKey, includeAction = false, smartAlerts = []) {
  const monthLabel = formatMonthLabel(monthKey);

  if (Array.isArray(smartAlerts) && smartAlerts.length > 0) {
    return `
      <div class="smart-alerts-container" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px;">
        ${smartAlerts
          .map((alert) => {
            const levelClass =
              alert.level === 'danger'
                ? 'is-danger'
                : alert.level === 'warning'
                ? 'is-warning'
                : 'is-nominal';
            const icon = alert.icon || (alert.level === 'danger' ? 'alert-octagon' : alert.level === 'warning' ? 'alert-triangle' : 'check-circle-2');
            return `
              <div class="alert-banner ${levelClass}" role="alert">
                <div class="alert-banner-content">
                  <i data-lucide="${escapeHtml(icon)}"></i>
                  <span>
                    <strong>${escapeHtml(alert.title)}:</strong> ${escapeHtml(alert.message)}
                  </span>
                </div>
                ${
                  includeAction && (alert.level === 'danger' || alert.level === 'warning')
                    ? `<button type="button" class="btn btn-secondary btn-sm" data-goto-budget>Review Budget</button>`
                    : ''
                }
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  if (budgetStatus.status === 'exceeded') {
    const overBy = Math.abs(budgetStatus.remainingBudget);
    return `
      <div class="alert-banner is-danger" role="alert">
        <div class="alert-banner-content">
          <i data-lucide="alert-octagon"></i>
          <span>
            <strong>Budget Exceeded (${escapeHtml(monthLabel)}):</strong>
            Monthly expenses (${formatCurrency(budgetStatus.monthlyExpenses)}) exceeded your
            ${formatCurrency(budgetStatus.monthlyLimit)} limit by
            <strong class="num">${formatCurrency(overBy)}</strong> (${budgetStatus.utilizationPct.toFixed(1)}% used).
          </span>
        </div>
        ${
          includeAction
            ? `<button type="button" class="btn btn-secondary btn-sm" data-goto-budget>Review Budget</button>`
            : ''
        }
      </div>
    `;
  }

  if (budgetStatus.status === 'warning') {
    return `
      <div class="alert-banner is-warning" role="status">
        <div class="alert-banner-content">
          <i data-lucide="alert-triangle"></i>
          <span>
            <strong>Approaching Budget Limit (${escapeHtml(monthLabel)}):</strong>
            You have used <strong class="num">${budgetStatus.utilizationPct.toFixed(1)}%</strong>
            (${formatCurrency(budgetStatus.monthlyExpenses)} of ${formatCurrency(
      budgetStatus.monthlyLimit
    )}). Remaining: <strong class="num">${formatCurrency(budgetStatus.remainingBudget)}</strong>.
          </span>
        </div>
        ${
          includeAction
            ? `<button type="button" class="btn btn-secondary btn-sm" data-goto-budget>Review Budget</button>`
            : ''
        }
      </div>
    `;
  }

  return '';
}

export const BudgetModule = {
  render(container, context) {
    const { transactions, budget, selectedMonth, onSaveBudget, smartAlerts } = context;
    const status = calculateBudgetStatus(transactions, budget, selectedMonth);
    const monthLabel = formatMonthLabel(selectedMonth);

    const progressWidth = Math.min(100, Math.max(0, status.utilizationPct));
    const statusClass =
      status.status === 'exceeded'
        ? 'is-danger'
        : status.status === 'warning'
        ? 'is-warning'
        : 'is-nominal';

    const statusText =
      status.status === 'unset'
        ? 'No monthly budget set'
        : status.status === 'exceeded'
        ? `Exceeded by ${formatCurrency(Math.abs(status.remainingBudget))}`
        : status.status === 'warning'
        ? `Warning: ${status.utilizationPct.toFixed(1)}% utilized`
        : `On Track: ${status.utilizationPct.toFixed(1)}% utilized`;

    // Category spending breakdown for the selected month vs budget
    const categoryMap = new Map();
    for (const txn of status.monthTransactions) {
      if (txn.type !== 'expense') continue;
      const prev = categoryMap.get(txn.category) || { amount: 0, count: 0 };
      categoryMap.set(txn.category, {
        amount: prev.amount + txn.amount,
        count: prev.count + 1,
      });
    }

    const categoryRows = Array.from(categoryMap.entries())
      .map(([category, info]) => ({
        category,
        amount: Math.round(info.amount * 100) / 100,
        count: info.count,
        shareOfBudget:
          status.monthlyLimit > 0
            ? Math.round((info.amount / status.monthlyLimit) * 1000) / 10
            : 0,
        shareOfSpend:
          status.monthlyExpenses > 0
            ? Math.round((info.amount / status.monthlyExpenses) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const alertHtml = smartAlerts && smartAlerts.length > 0
      ? renderBudgetAlertMarkup(status, selectedMonth, false, smartAlerts)
      : (status.status === 'exceeded' || status.status === 'warning')
        ? renderBudgetAlertMarkup(status, selectedMonth, false)
        : `
          <div class="alert-banner is-nominal" role="status">
            <div class="alert-banner-content">
              <i data-lucide="check-circle-2"></i>
              <span>
                <strong>Within Budget (${escapeHtml(monthLabel)}):</strong>
                You have <strong class="num">${formatCurrency(status.remainingBudget)}</strong>
                remaining from your ${formatCurrency(status.monthlyLimit)} monthly budget.
              </span>
            </div>
          </div>
        `;

    container.innerHTML = `
      ${status.status !== 'unset' ? alertHtml : ''}

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Monthly Budget</span>
          </div>
          <p class="kpi-value">${formatCurrency(status.monthlyLimit)}</p>
          <div class="kpi-meta">Target spending cap</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Monthly Expenses</span>
          </div>
          <p class="kpi-value">${formatCurrency(status.monthlyExpenses)}</p>
          <div class="kpi-meta">${escapeHtml(monthLabel)}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Remaining Budget</span>
          </div>
          <p class="kpi-value ${
            status.remainingBudget < 0
              ? 'is-negative'
              : status.status === 'warning'
              ? 'is-warning'
              : 'is-positive'
          }">
            ${formatCurrency(status.remainingBudget)}
          </p>
          <div class="kpi-meta">
            ${
              status.remainingBudget < 0
                ? 'Over monthly limit'
                : 'Available for the rest of month'
            }
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Budget Utilization</span>
          </div>
          <p class="kpi-value ${
            status.status === 'exceeded'
              ? 'is-negative'
              : status.status === 'warning'
              ? 'is-warning'
              : ''
          }">
            ${status.utilizationPct.toFixed(1)}%
          </p>
          <div class="kpi-meta">${escapeHtml(statusText)}</div>
        </div>
      </div>

      <div class="grid-equal-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <h2 class="card-title">Set Monthly Budget</h2>
              <p class="card-subtitle">Configure your spending limit across all expense categories</p>
            </div>
          </div>
          <div class="card-body">
            <form id="budget-form" class="budget-form-inline" novalidate>
              <div class="budget-input-group">
                <label for="budget-limit-input" class="form-label">Monthly Limit ($)</label>
                <input
                  type="number"
                  id="budget-limit-input"
                  class="form-control mono-input"
                  min="1"
                  step="1"
                  value="${status.monthlyLimit > 0 ? status.monthlyLimit : ''}"
                  placeholder="e.g. 3200"
                  required
                />
                <span class="field-error" id="budget-error" role="alert"></span>
              </div>
              <div style="padding-top: 22px;">
                <button type="submit" class="btn btn-primary">Save Budget</button>
              </div>
            </form>

            <div class="budget-progress-wrap" style="margin-top: 20px;">
              <div class="progress-labels">
                <span>Monthly Utilization</span>
                <span class="num"><strong>${formatCurrency(status.monthlyExpenses)}</strong> / ${formatCurrency(
      status.monthlyLimit
    )}</span>
              </div>
              <div class="progress-track" role="progressbar" aria-valuenow="${Math.round(
                status.utilizationPct
              )}" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-fill ${statusClass}" style="width: ${progressWidth}%"></div>
              </div>
              <div class="progress-labels">
                <span>0%</span>
                <span>Warning threshold: 80%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <h2 class="card-title">Category Impact (${escapeHtml(monthLabel)})</h2>
              <p class="card-subtitle">How each category contributes to your monthly budget</p>
            </div>
          </div>
          <div class="card-body card-body-flush">
            ${
              categoryRows.length === 0
                ? `
              <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="wallet"></i></div>
                <h3 class="empty-state-title">No expenses in ${escapeHtml(monthLabel)}</h3>
                <p class="empty-state-desc">Expenses added for this month will appear here against your budget.</p>
              </div>
            `
                : `
              <div class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th class="text-right">Transactions</th>
                      <th class="text-right">Spent</th>
                      <th class="text-right">% of Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${categoryRows
                      .map(
                        (row) => `
                      <tr>
                        <td>
                          <span class="breakdown-label">
                            <span class="swatch" style="background-color: ${getCategoryColor(
                              row.category
                            )}"></span>
                            <span>${escapeHtml(row.category)}</span>
                          </span>
                        </td>
                        <td class="text-right num">${row.count}</td>
                        <td class="text-right num">${formatCurrency(row.amount)}</td>
                        <td class="text-right num">${row.shareOfBudget.toFixed(1)}%</td>
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
      </div>
    `;

    const form = container.querySelector('#budget-form');
    const input = container.querySelector('#budget-limit-input');
    const errorEl = container.querySelector('#budget-error');

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = Number(input.value);
      if (!Number.isFinite(val) || val <= 0) {
        input.classList.add('is-invalid');
        errorEl.textContent = 'Enter a budget amount greater than $0.';
        return;
      }
      if (val > 100000000) {
        input.classList.add('is-invalid');
        errorEl.textContent = 'Budget amount is too large.';
        return;
      }
      input.classList.remove('is-invalid');
      errorEl.textContent = '';
      onSaveBudget(val);
    });

    if (window.lucide) window.lucide.createIcons();
  },
};
