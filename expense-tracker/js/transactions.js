/**
 * Transactions Module
 *
 * Pure financial calculations, query/filter utilities, validation,
 * CSV formatting, and Transaction History view rendering.
 */

import { ALL_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './storage.js';

export const CATEGORY_COLORS = {
  Food: '#0f4c81',
  Housing: '#1e293b',
  Transport: '#0284c7',
  Utilities: '#0d9488',
  Healthcare: '#16a34a',
  Entertainment: '#d97706',
  Shopping: '#475569',
  Education: '#2563eb',
  Other: '#94a3b8',
  Salary: '#15803d',
  Freelance: '#0f766e',
  Investments: '#0369a1',
  Gift: '#64748b',
  Refund: '#475569',
};

export function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#64748b';
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCurrency(amount) {
  const numeric = Number(amount) || 0;
  const absFormatted = Math.abs(numeric).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return numeric < 0 ? `-$${absFormatted}` : `$${absFormatted}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '';
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Pure calculation: Total Balance = Total Income - Total Expenses
 */
export function calculateTotals(transactions) {
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const txn of transactions) {
    const amount = Number(txn.amount) || 0;
    if (txn.type === 'income') {
      totalIncome += amount;
    } else {
      totalExpenses += amount;
    }
  }

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    totalBalance: Math.round((totalIncome - totalExpenses) * 100) / 100,
  };
}

export function filterByMonth(transactions, monthKey) {
  if (!monthKey) return transactions;
  return transactions.filter((txn) => String(txn.date || '').startsWith(monthKey));
}

export function queryTransactions(transactions, filters = {}) {
  const {
    search = '',
    category = 'all',
    type = 'all',
    sortBy = 'date-desc',
  } = filters;

  const query = search.trim().toLowerCase();

  const filtered = transactions.filter((txn) => {
    if (type !== 'all' && txn.type !== type) return false;
    if (category !== 'all' && txn.category !== category) return false;
    if (query) {
      const haystack = `${txn.title} ${txn.description} ${txn.category}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (sortBy === 'date-asc') {
      return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    }
    if (sortBy === 'amount-desc') {
      return b.amount - a.amount || b.date.localeCompare(a.date);
    }
    if (sortBy === 'amount-asc') {
      return a.amount - b.amount || b.date.localeCompare(a.date);
    }
    return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
  });

  return sorted;
}

export function getCategoriesForType(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function validateTransactionInput(data) {
  const errors = {};
  const title = String(data.title || '').trim();
  const amount = Number(data.amount);
  const category = String(data.category || '').trim();
  const type = data.type === 'income' ? 'income' : 'expense';
  const date = String(data.date || '').trim();
  const description = String(data.description || '').trim();

  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0.';
  } else if (amount > 100000000) {
    errors.amount = 'Amount exceeds supported limit.';
  }

  if (!category) {
    errors.category = 'Please select a category.';
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Please select a valid date.';
  }

  if (description.length > 200) {
    errors.description = 'Description must be 200 characters or fewer.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      title,
      amount: Math.round(amount * 100) / 100,
      category,
      type,
      date,
      description,
    },
  };
}

export function transactionsToCSV(transactions) {
  const headers = ['ID', 'Date', 'Title', 'Type', 'Category', 'Amount', 'Description'];
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = transactions.map((t) =>
    [t.id, t.date, t.title, t.type, t.category, t.amount.toFixed(2), t.description]
      .map(escapeCsv)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

const filterState = {
  search: '',
  type: 'all',
  category: 'all',
  sortBy: 'date-desc',
  scopeMonthOnly: false,
};

let shellMounted = false;

export const TransactionsModule = {
  render(container, context) {
    const {
      transactions,
      selectedMonth,
      onEditTransaction,
      onDeleteTransaction,
      onOpenAddModal,
    } = context;

    if (!shellMounted || !container.querySelector('#txn-table-region')) {
      container.innerHTML = `
        <div class="card">
          <div class="filter-toolbar">
            <div class="filter-controls">
              <div class="search-input-wrap">
                <i data-lucide="search"></i>
                <input
                  type="search"
                  id="txn-search-input"
                  class="search-input"
                  placeholder="Search title, category, or note..."
                  aria-label="Search transactions"
                />
              </div>

              <div class="segmented-control" role="group" aria-label="Filter by transaction type">
                <button type="button" class="segmented-btn" data-type-filter="all">All</button>
                <button type="button" class="segmented-btn" data-type-filter="income">Income</button>
                <button type="button" class="segmented-btn" data-type-filter="expense">Expense</button>
              </div>

              <select id="txn-category-filter" class="select-control" aria-label="Filter by category">
                <option value="all">All Categories</option>
                ${ALL_CATEGORIES.map(
                  (cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
                ).join('')}
              </select>

              <select id="txn-sort-select" class="select-control" aria-label="Sort transactions">
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="amount-desc">Highest Amount</option>
                <option value="amount-asc">Lowest Amount</option>
              </select>

              <select id="txn-scope-select" class="select-control" aria-label="Filter by timeframe">
                <option value="all">All Dates</option>
                <option value="month">Selected Month</option>
              </select>
            </div>

            <button type="button" class="btn btn-ghost btn-sm" id="txn-clear-filters-btn" hidden>
              Clear Filters
            </button>
          </div>

          <div class="filter-summary-bar" id="txn-summary-bar"></div>
          <div id="txn-table-region"></div>
        </div>
      `;

      shellMounted = true;
      this.bindToolbarEvents(container, context);
    }

    // Store latest callbacks on container for event handlers
    container._txnContext = context;

    // Sync control values cleanly without resetting focus
    const searchInput = container.querySelector('#txn-search-input');
    if (searchInput && searchInput.value !== filterState.search) {
      searchInput.value = filterState.search;
    }

    const catSelect = container.querySelector('#txn-category-filter');
    if (catSelect) catSelect.value = filterState.category;

    const sortSelect = container.querySelector('#txn-sort-select');
    if (sortSelect) sortSelect.value = filterState.sortBy;

    const scopeSelect = container.querySelector('#txn-scope-select');
    if (scopeSelect) scopeSelect.value = filterState.scopeMonthOnly ? 'month' : 'all';

    container.querySelectorAll('[data-type-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.typeFilter === filterState.type);
    });

    this.renderResults(container, {
      transactions,
      selectedMonth,
      onEditTransaction,
      onDeleteTransaction,
      onOpenAddModal,
    });
  },

  bindToolbarEvents(container) {
    const refresh = () => {
      if (container._txnContext) {
        this.renderResults(container, container._txnContext);
      }
    };

    const searchInput = container.querySelector('#txn-search-input');
    searchInput.addEventListener('input', (e) => {
      filterState.search = e.target.value;
      refresh();
    });

    container.querySelectorAll('[data-type-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filterState.type = btn.dataset.typeFilter;
        container.querySelectorAll('[data-type-filter]').forEach((el) => {
          el.classList.toggle('active', el === btn);
        });
        refresh();
      });
    });

    container.querySelector('#txn-category-filter').addEventListener('change', (e) => {
      filterState.category = e.target.value;
      refresh();
    });

    container.querySelector('#txn-sort-select').addEventListener('change', (e) => {
      filterState.sortBy = e.target.value;
      refresh();
    });

    container.querySelector('#txn-scope-select').addEventListener('change', (e) => {
      filterState.scopeMonthOnly = e.target.value === 'month';
      refresh();
    });

    container.querySelector('#txn-clear-filters-btn').addEventListener('click', () => {
      filterState.search = '';
      filterState.type = 'all';
      filterState.category = 'all';
      filterState.sortBy = 'date-desc';
      filterState.scopeMonthOnly = false;
      this.render(container, container._txnContext);
    });
  },

  renderResults(container, context) {
    const {
      transactions,
      selectedMonth,
      onEditTransaction,
      onDeleteTransaction,
      onOpenAddModal,
    } = context;

    const scopedList = filterState.scopeMonthOnly
      ? filterByMonth(transactions, selectedMonth)
      : transactions;

    const filtered = queryTransactions(scopedList, filterState);
    const totals = calculateTotals(filtered);

    const hasActiveFilters =
      filterState.search.trim() !== '' ||
      filterState.type !== 'all' ||
      filterState.category !== 'all' ||
      filterState.scopeMonthOnly;

    const clearBtn = container.querySelector('#txn-clear-filters-btn');
    if (clearBtn) clearBtn.hidden = !hasActiveFilters;

    const summaryBar = container.querySelector('#txn-summary-bar');
    summaryBar.innerHTML = `
      <span>Showing <strong>${filtered.length}</strong> of ${transactions.length} transactions${
        filterState.scopeMonthOnly ? ` (${escapeHtml(formatMonthLabel(selectedMonth))})` : ''
      }</span>
      <div class="filter-summary-metrics">
        <span>Income: <strong class="num" style="color: var(--color-positive)">${formatCurrency(totals.totalIncome)}</strong></span>
        <span>Expenses: <strong class="num">${formatCurrency(totals.totalExpenses)}</strong></span>
        <span>Net: <strong class="num">${formatCurrency(totals.totalBalance)}</strong></span>
      </div>
    `;

    const tableRegion = container.querySelector('#txn-table-region');

    if (transactions.length === 0) {
      tableRegion.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="receipt"></i></div>
          <h3 class="empty-state-title">No transactions recorded yet</h3>
          <p class="empty-state-desc">Add your first income or expense entry to begin tracking your cashflow.</p>
          <button type="button" class="btn btn-primary btn-sm" id="empty-add-txn-btn">
            <i data-lucide="plus"></i>
            <span>Add Transaction</span>
          </button>
        </div>
      `;
      tableRegion
        .querySelector('#empty-add-txn-btn')
        ?.addEventListener('click', () => onOpenAddModal());
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    if (filtered.length === 0) {
      tableRegion.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="search-x"></i></div>
          <h3 class="empty-state-title">No matching transactions</h3>
          <p class="empty-state-desc">Try adjusting your search query, category filter, or date scope.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="empty-clear-filters-btn">
            Clear Filters
          </button>
        </div>
      `;
      tableRegion
        .querySelector('#empty-clear-filters-btn')
        ?.addEventListener('click', () => {
          filterState.search = '';
          filterState.type = 'all';
          filterState.category = 'all';
          filterState.scopeMonthOnly = false;
          this.render(container, container._txnContext);
        });
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    tableRegion.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Transaction</th>
              <th>Category</th>
              <th>Type</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered
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
                        ? `<span class="txn-desc" title="${escapeHtml(txn.description)}">${escapeHtml(
                            txn.description
                          )}</span>`
                        : ''
                    }
                  </div>
                </td>
                <td>${escapeHtml(txn.category)}</td>
                <td>
                  <span class="type-label ${txn.type === 'income' ? 'is-income' : 'is-expense'}">
                    ${txn.type === 'income' ? 'Income' : 'Expense'}
                  </span>
                </td>
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
                      data-action="edit"
                      data-id="${escapeHtml(txn.id)}"
                      aria-label="Edit ${escapeHtml(txn.title)}"
                      title="Edit"
                    >
                      <i data-lucide="pencil"></i>
                    </button>
                    <button
                      type="button"
                      class="icon-btn icon-btn-danger"
                      data-action="delete"
                      data-id="${escapeHtml(txn.id)}"
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
    `;

    tableRegion.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => onEditTransaction(btn.dataset.id));
    });

    tableRegion.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => onDeleteTransaction(btn.dataset.id));
    });

    if (window.lucide) window.lucide.createIcons();
  },
};
