/**
 * Application Controller (app.js)
 *
 * Coordinates navigation, modal lifecycle, form validation, CSV export,
 * and delegates rendering to feature modules.
 */

import { AnalyticsModule } from './analytics.js';
import { BudgetModule } from './budget.js';
import { DashboardModule } from './dashboard.js';
import { StorageService } from './storage.js';
import {
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
    appState.editingId = transaction.id;
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

function openDeleteModal(id) {
  const txn = StorageService.getTransactionById(id);
  if (!txn) return;
  appState.deletingId = id;
  dom.deleteTxnName.textContent = `"${txn.title}" (${formatCurrency(txn.amount)})`;
  dom.deleteModal.hidden = false;
  dom.confirmDeleteBtn.focus();
}

function closeDeleteModal() {
  dom.deleteModal.hidden = true;
  appState.deletingId = null;
}

function handleSaveTransaction(e) {
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

  if (appState.editingId) {
    StorageService.updateTransaction(appState.editingId, validation.sanitized);
    showToast('Transaction updated.');
  } else {
    StorageService.saveTransaction(validation.sanitized);
    showToast('Transaction added.');
  }

  // Keep active month aligned if the new transaction belongs to another month?
  // Only keep current selectedMonth unless user changes it, so navigation stays predictable.
  closeTransactionModal();
  renderActiveView();
}

function handleConfirmDelete() {
  if (!appState.deletingId) return;
  const deleted = StorageService.deleteTransaction(appState.deletingId);
  closeDeleteModal();
  if (deleted) {
    showToast('Transaction deleted.');
    renderActiveView();
  }
}

function handleSaveBudget(monthlyLimit) {
  StorageService.saveBudget(monthlyLimit);
  showToast('Monthly budget updated.');
  renderActiveView();
}

function handleExportCSV() {
  const transactions = StorageService.getTransactions();
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
}

function handleResetDemo() {
  StorageService.resetDemoData();
  appState.selectedMonth = getCurrentMonthKey();
  dom.monthSelector.value = appState.selectedMonth;
  showToast('Sample data restored.');
  renderActiveView();
}

function renderActiveView() {
  const transactions = StorageService.getTransactions();
  const budget = StorageService.getBudget();
  const selectedMonth = appState.selectedMonth;

  const context = {
    transactions,
    budget,
    selectedMonth,
    onNavigate: navigateTo,
    onOpenAddModal: () => openTransactionModal(null),
    onEditTransaction: (id) => {
      const txn = StorageService.getTransactionById(id);
      if (txn) openTransactionModal(txn);
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

function init() {
  StorageService.initializeIfNeeded();
  cacheDom();
  dom.monthSelector.value = appState.selectedMonth;
  bindEvents();
  navigateTo('dashboard');
  if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', init);
