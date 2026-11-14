/**
 * Application Controller (app.js)
 *
 * Coordinates navigation, modal lifecycle, form validation, CSV export,
 * and delegates rendering to feature modules using asynchronous REST API data.
 */

import { AnalyticsModule } from './analytics.js';
import { BudgetModule } from './budget.js';
import { DashboardModule } from './dashboard.js';
import { StorageService } from './storage.js';
import {
  escapeHtml,
  formatCurrency,
  getCategoriesForType,
  TransactionsModule,
  transactionsToCSV,
  validateTransactionInput,
} from './transactions.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  analytics: 'Expense Analytics',
  budget: 'Budget Management',
};

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getTodayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

const appState = {
  activeView: 'dashboard',
  selectedMonth: getCurrentMonthKey(),
  editingId: null,
  deletingId: null,
  isLoading: false,
};

const dom = {};

function cacheDom() {
  dom.sidebar = document.getElementById('sidebar');
  dom.sidebarBackdrop = document.getElementById('sidebar-backdrop');
  dom.mobileMenuBtn = document.getElementById('mobile-menu-btn');
  dom.sidebarCloseBtn = document.getElementById('sidebar-close-btn');
  dom.navItems = document.querySelectorAll('.nav-item[data-view]');
  dom.pageTitle = document.getElementById('page-title');
  dom.monthSelector = document.getElementById('month-selector');
  dom.openAddModalBtn = document.getElementById('open-add-modal-btn');
  dom.exportCsvBtn = document.getElementById('export-csv-btn');
  dom.resetDemoBtn = document.getElementById('reset-demo-btn');
  dom.globalBudgetAlert = document.getElementById('global-budget-alert');

  dom.views = {
    dashboard: document.getElementById('view-dashboard'),
    transactions: document.getElementById('view-transactions'),
    analytics: document.getElementById('view-analytics'),
    budget: document.getElementById('view-budget'),
  };

  // Transaction Modal
  dom.txnModal = document.getElementById('transaction-modal');
  dom.txnModalTitle = document.getElementById('modal-title');
  dom.txnForm = document.getElementById('transaction-form');
  dom.txnId = document.getElementById('txn-id');
  dom.txnTypeInput = document.getElementById('txn-type');
  dom.typeBtnExpense = document.getElementById('type-btn-expense');
  dom.typeBtnIncome = document.getElementById('type-btn-income');
  dom.txnTitle = document.getElementById('txn-title');
  dom.txnAmount = document.getElementById('txn-amount');
  dom.txnCategory = document.getElementById('txn-category');
  dom.txnDate = document.getElementById('txn-date');
  dom.txnDescription = document.getElementById('txn-description');
  dom.closeModalBtn = document.getElementById('close-modal-btn');
  dom.cancelModalBtn = document.getElementById('cancel-modal-btn');

  // Delete Modal
  dom.deleteModal = document.getElementById('delete-modal');
  dom.deleteTxnName = document.getElementById('delete-txn-name');
  dom.closeDeleteModalBtn = document.getElementById('close-delete-modal-btn');
  dom.cancelDeleteBtn = document.getElementById('cancel-delete-btn');
  dom.confirmDeleteBtn = document.getElementById('confirm-delete-btn');

  // Toasts
  dom.toastContainer = document.getElementById('toast-container');
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast is-${type}`;
  const iconName = type === 'error' ? 'alert-circle' : 'check-circle-2';
  toast.innerHTML = `<i data-lucide="${iconName}"></i><span></span>`;
  toast.querySelector('span').textContent = message;
  dom.toastContainer.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

function showConnectionError(message) {
  if (!dom.globalBudgetAlert) return;
  dom.globalBudgetAlert.hidden = false;
  dom.globalBudgetAlert.innerHTML = `
    <div class="alert-banner is-danger" role="alert" style="margin-bottom: 16px;">
      <div class="alert-banner-content">
        <i data-lucide="alert-octagon"></i>
        <span>
          <strong>Server Error:</strong> ${escapeHtml(message || 'Unable to connect to the backend server.')}
        </span>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="retry-fetch-btn">Retry</button>
    </div>
  `;
  dom.globalBudgetAlert.querySelector('#retry-fetch-btn')?.addEventListener('click', () => {
    clearConnectionError();
    renderActiveView();
  });
  if (window.lucide) window.lucide.createIcons();
}

function clearConnectionError() {
  if (!dom.globalBudgetAlert) return;
  dom.globalBudgetAlert.hidden = true;
  dom.globalBudgetAlert.innerHTML = '';
}

function showLoadingState(targetView) {
  if (!targetView) return;
  targetView.innerHTML = `
    <div class="empty-state" style="padding: 60px 20px;">
      <div class="empty-state-icon">
        <i data-lucide="rotate-cw"></i>
      </div>
      <h3 class="empty-state-title">Loading data...</h3>
      <p class="empty-state-desc">Fetching financial records from the database.</p>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function toggleSidebar(open) {
  dom.sidebar.classList.toggle('open', open);
  dom.sidebarBackdrop.hidden = !open;
  dom.mobileMenuBtn?.setAttribute('aria-expanded', String(open));
}

function navigateTo(view) {
  if (!VIEW_TITLES[view]) return;
  appState.activeView = view;
  dom.pageTitle.textContent = VIEW_TITLES[view];

  dom.navItems.forEach((btn) => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle('active', isActive);
    if (isActive) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  Object.entries(dom.views).forEach(([key, section]) => {
    const isCurrent = key === view;
    section.hidden = !isCurrent;
    section.classList.toggle('active', isCurrent);
  });

  toggleSidebar(false);
  renderActiveView();
}

function populateCategoryOptions(type, selectedCategory = '') {
  const categories = getCategoriesForType(type);
  dom.txnCategory.innerHTML = categories
    .map((cat) => `<option value="${cat}">${cat}</option>`)
    .join('');

  if (selectedCategory && categories.includes(selectedCategory)) {
    dom.txnCategory.value = selectedCategory;
  } else {
    dom.txnCategory.value = categories[0];
  }
}

function setFormType(type, preferredCategory = '') {
  const normalized = type === 'income' ? 'income' : 'expense';
  dom.txnTypeInput.value = normalized;
  dom.typeBtnExpense.classList.toggle('active', normalized === 'expense');
  dom.typeBtnIncome.classList.toggle('active', normalized === 'income');
  dom.typeBtnExpense.setAttribute('aria-pressed', String(normalized === 'expense'));
  dom.typeBtnIncome.setAttribute('aria-pressed', String(normalized === 'income'));
  populateCategoryOptions(normalized, preferredCategory);
}

function clearFormErrors() {
  ['title', 'amount', 'category', 'date', 'description'].forEach((field) => {
    const errEl = document.getElementById(`error-${field}`);
    const inputEl = document.getElementById(`txn-${field}`);
    if (errEl) errEl.textContent = '';
    if (inputEl) {
      inputEl.classList.remove('is-invalid');
      inputEl.removeAttribute('aria-invalid');
    }
  });
}

function showFormErrors(errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const errEl = document.getElementById(`error-${field}`);
    const inputEl = document.getElementById(`txn-${field}`);
    if (errEl) errEl.textContent = message;
    if (inputEl) {
      inputEl.classList.add('is-invalid');
      inputEl.setAttribute('aria-invalid', 'true');
    }
  });
}

function openTransactionModal(transaction = null) {
  clearFormErrors();
  if (transaction) {
    appState.editingId = String(transaction.id);
    dom.txnModalTitle.textContent = 'Edit Transaction';
    dom.txnId.value = transaction.id;
    setFormType(transaction.type, transaction.category);
    dom.txnTitle.value = transaction.title;
    dom.txnAmount.value = transaction.amount;
    dom.txnDate.value = transaction.date;
    dom.txnDescription.value = transaction.description || '';
  } else {
    appState.editingId = null;
    dom.txnModalTitle.textContent = 'Add Transaction';
    dom.txnId.value = '';
    setFormType('expense');
    dom.txnTitle.value = '';
    dom.txnAmount.value = '';
    const today = getTodayDateString();
    dom.txnDate.value = today.startsWith(appState.selectedMonth)
      ? today
      : `${appState.selectedMonth}-01`;
    dom.txnDescription.value = '';
  }

  dom.txnModal.hidden = false;
  dom.txnTitle.focus();
  if (window.lucide) window.lucide.createIcons();
}

function closeTransactionModal() {
  dom.txnModal.hidden = true;
  appState.editingId = null;
}

async function openDeleteModal(id) {
  try {
    const txn = await StorageService.getTransactionById(id);
    if (!txn) {
      showToast('Transaction not found.', 'error');
      return;
    }
    appState.deletingId = String(id);
    dom.deleteTxnName.textContent = `"${txn.title}" (${formatCurrency(txn.amount)})`;
    dom.deleteModal.hidden = false;
    dom.confirmDeleteBtn.focus();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeDeleteModal() {
  dom.deleteModal.hidden = true;
  appState.deletingId = null;
}

async function handleSaveTransaction(e) {
  e.preventDefault();
  clearFormErrors();

  const rawData = {
    title: dom.txnTitle.value,
    amount: dom.txnAmount.value,
    category: dom.txnCategory.value,
    type: dom.txnTypeInput.value,
    date: dom.txnDate.value,
    description: dom.txnDescription.value,
  };

  const validation = validateTransactionInput(rawData);
  if (!validation.isValid) {
    showFormErrors(validation.errors);
    return;
  }

  try {
    if (appState.editingId) {
      await StorageService.updateTransaction(appState.editingId, validation.sanitized);
      showToast('Transaction updated.');
    } else {
      await StorageService.saveTransaction(validation.sanitized);
      showToast('Transaction added.');
    }
    closeTransactionModal();
    await renderActiveView();
  } catch (err) {
    showToast(err.message || 'Failed to save transaction.', 'error');
  }
}

async function handleConfirmDelete() {
  if (!appState.deletingId) return;
  try {
    await StorageService.deleteTransaction(appState.deletingId);
    closeDeleteModal();
    showToast('Transaction deleted.');
    await renderActiveView();
  } catch (err) {
    showToast(err.message || 'Failed to delete transaction.', 'error');
  }
}

async function handleSaveBudget(monthlyLimit) {
  try {
    const [yearStr, monthStr] = appState.selectedMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    await StorageService.saveBudget(year, month, monthlyLimit);
    showToast('Monthly budget updated.');
    await renderActiveView();
  } catch (err) {
    showToast(err.message || 'Failed to update monthly budget.', 'error');
  }
}

async function handleExportCSV() {
  try {
    const transactions = await StorageService.getTransactions();
    if (transactions.length === 0) {
      showToast('No transactions available to export.', 'error');
      return;
    }

    const csv = transactionsToCSV(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clearledger-transactions-${getTodayDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Transactions exported as CSV.');
  } catch (err) {
    showToast(err.message || 'Failed to export transactions.', 'error');
  }
}

async function handleResetDemo() {
  try {
    await StorageService.resetDemoData(appState.selectedMonth);
    showToast('Sample data synchronized.');
    await renderActiveView();
  } catch (err) {
    showToast(err.message || 'Failed to synchronize demo data.', 'error');
  }
}

async function renderActiveView() {
  const currentViewSection = dom.views[appState.activeView];
  const [yearStr, monthStr] = appState.selectedMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  // If section is empty, display loading indicator
  if (currentViewSection && !currentViewSection.innerHTML.trim()) {
    showLoadingState(currentViewSection);
  }

  try {
    const [transactions, budget, smartAlertsData] = await Promise.all([
      StorageService.getTransactions(),
      StorageService.getBudget(year, month),
      StorageService.getSmartAlerts(year, month),
    ]);

    clearConnectionError();

    const smartAlerts = smartAlertsData?.alerts || [];

    const context = {
      transactions,
      budget,
      selectedMonth: appState.selectedMonth,
      smartAlerts,
      onNavigate: navigateTo,
      onOpenAddModal: () => openTransactionModal(null),
      onEditTransaction: async (id) => {
        try {
          const txn = await StorageService.getTransactionById(id);
          if (txn) openTransactionModal(txn);
        } catch (err) {
          showToast(err.message, 'error');
        }
      },
      onDeleteTransaction: (id) => openDeleteModal(id),
      onSaveBudget: handleSaveBudget,
    };

    if (appState.activeView === 'dashboard') {
      DashboardModule.render(dom.views.dashboard, context);
    } else if (appState.activeView === 'transactions') {
      TransactionsModule.render(dom.views.transactions, context);
    } else if (appState.activeView === 'analytics') {
      AnalyticsModule.render(dom.views.analytics, context);
    } else if (appState.activeView === 'budget') {
      BudgetModule.render(dom.views.budget, context);
    }
  } catch (err) {
    showConnectionError(err.message);
  }
}

function bindEvents() {
  dom.navItems.forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  document.querySelector('[data-nav-home]')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('dashboard');
  });

  dom.mobileMenuBtn.addEventListener('click', () => toggleSidebar(true));
  dom.sidebarCloseBtn.addEventListener('click', () => toggleSidebar(false));
  dom.sidebarBackdrop.addEventListener('click', () => toggleSidebar(false));

  dom.monthSelector.addEventListener('change', (e) => {
    if (e.target.value) {
      appState.selectedMonth = e.target.value;
      renderActiveView();
    }
  });

  dom.openAddModalBtn.addEventListener('click', () => openTransactionModal(null));
  dom.closeModalBtn.addEventListener('click', closeTransactionModal);
  dom.cancelModalBtn.addEventListener('click', closeTransactionModal);
  dom.txnModal.addEventListener('click', (e) => {
    if (e.target === dom.txnModal) closeTransactionModal();
  });

  dom.typeBtnExpense.addEventListener('click', () => setFormType('expense'));
  dom.typeBtnIncome.addEventListener('click', () => setFormType('income'));
  dom.txnForm.addEventListener('submit', handleSaveTransaction);

  dom.closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
  dom.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
  dom.confirmDeleteBtn.addEventListener('click', handleConfirmDelete);
  dom.deleteModal.addEventListener('click', (e) => {
    if (e.target === dom.deleteModal) closeDeleteModal();
  });

  dom.exportCsvBtn.addEventListener('click', handleExportCSV);
  dom.resetDemoBtn.addEventListener('click', handleResetDemo);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!dom.txnModal.hidden) closeTransactionModal();
      if (!dom.deleteModal.hidden) closeDeleteModal();
      if (dom.sidebar.classList.contains('open')) toggleSidebar(false);
    }
  });
}

async function init() {
  cacheDom();
  dom.monthSelector.value = appState.selectedMonth;
  bindEvents();
  navigateTo('dashboard');

  // Trigger migration if old LocalStorage records exist
  const migrationResult = await StorageService.initializeIfNeeded();
  if (migrationResult.migrated && migrationResult.count > 0) {
    showToast(`Imported ${migrationResult.count} saved records to database.`);
    await renderActiveView();
  }

  if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', init);
