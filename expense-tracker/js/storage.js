/**
 * Centralized Storage Module
 *
 * Isolates all persistence operations behind a clean service interface so
 * LocalStorage can be swapped for REST API calls (Node.js/Express/SQL)
 * without altering UI or calculation modules.
 */

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transport',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Education',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Gift',
  'Refund',
  'Other',
];

export const ALL_CATEGORIES = Array.from(
  new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])
);

const STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGET: 'clearledger_budget_v1',
  INITIALIZED: 'clearledger_initialized_v1',
};

const DEFAULT_BUDGET = {
  monthlyLimit: 3200,
  updatedAt: '2026-11-01',
};

const SEED_TRANSACTIONS = [
  {
    id: 'txn_seed_01',
    title: 'Monthly Salary',
    amount: 5400,
    category: 'Salary',
    type: 'income',
    date: '2026-11-01',
    description: 'Primary paycheck deposit',
  },
  {
    id: 'txn_seed_02',
    title: 'Apartment Rent',
    amount: 1450,
    category: 'Housing',
    type: 'expense',
    date: '2026-11-02',
    description: 'November lease payment',
  },
  {
    id: 'txn_seed_03',
    title: 'Grocery Shopping',
    amount: 184.5,
    category: 'Food',
    type: 'expense',
    date: '2026-11-04',
    description: 'Weekly groceries and fresh produce',
  },
  {
    id: 'txn_seed_04',
    title: 'Electric & Internet',
    amount: 142.25,
    category: 'Utilities',
    type: 'expense',
    date: '2026-11-06',
    description: 'Monthly electricity and fiber internet',
  },
  {
    id: 'txn_seed_05',
    title: 'Design Consulting',
    amount: 750,
    category: 'Freelance',
    type: 'income',
    date: '2026-11-08',
    description: 'UI audit deliverable',
  },
  {
    id: 'txn_seed_06',
    title: 'Transit Pass & Fuel',
    amount: 96,
    category: 'Transport',
    type: 'expense',
    date: '2026-11-09',
    description: 'Monthly metro card and fuel',
  },
  {
    id: 'txn_seed_07',
    title: 'Pharmacy & Dental Checkup',
    amount: 125,
    category: 'Healthcare',
    type: 'expense',
    date: '2026-11-11',
    description: 'Routine dental cleaning copay',
  },
  {
    id: 'txn_seed_08',
    title: 'Whole Foods Market',
    amount: 158.4,
    category: 'Food',
    type: 'expense',
    date: '2026-11-12',
    description: 'Mid-week household groceries',
  },
  {
    id: 'txn_seed_09',
    title: 'Monthly Salary',
    amount: 5400,
    category: 'Salary',
    type: 'income',
    date: '2026-10-01',
    description: 'October paycheck deposit',
  },
  {
    id: 'txn_seed_10',
    title: 'Apartment Rent',
    amount: 1450,
    category: 'Housing',
    type: 'expense',
    date: '2026-10-02',
    description: 'October lease payment',
  },
  {
    id: 'txn_seed_11',
    title: 'Grocery & Dining',
    amount: 465,
    category: 'Food',
    type: 'expense',
    date: '2026-10-14',
    description: 'October groceries and team lunch',
  },
  {
    id: 'txn_seed_12',
    title: 'Winter Coat & Boots',
    amount: 280,
    category: 'Shopping',
    type: 'expense',
    date: '2026-10-20',
    description: 'Seasonal apparel',
  },
  {
    id: 'txn_seed_13',
    title: 'Utilities & Water',
    amount: 138,
    category: 'Utilities',
    type: 'expense',
    date: '2026-10-22',
    description: 'Monthly utility bill',
  },
  {
    id: 'txn_seed_14',
    title: 'Monthly Salary',
    amount: 5200,
    category: 'Salary',
    type: 'income',
    date: '2026-09-01',
    description: 'September paycheck deposit',
  },
  {
    id: 'txn_seed_15',
    title: 'Apartment Rent',
    amount: 1450,
    category: 'Housing',
    type: 'expense',
    date: '2026-09-02',
    description: 'September lease payment',
  },
  {
    id: 'txn_seed_16',
    title: 'Online Course Subscription',
    amount: 199,
    category: 'Education',
    type: 'expense',
    date: '2026-09-10',
    description: 'Annual technical workshop',
  },
  {
    id: 'txn_seed_17',
    title: 'Groceries & Coffee',
    amount: 390,
    category: 'Food',
    type: 'expense',
    date: '2026-09-18',
    description: 'Monthly food expenses',
  },
  {
    id: 'txn_seed_18',
    title: 'Cinema & Concert Tickets',
    amount: 112,
    category: 'Entertainment',
    type: 'expense',
    date: '2026-09-25',
    description: 'Weekend outing',
  },
];

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `txn_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeTransaction(raw) {
  const numericAmount = Number(raw?.amount);
  const type = raw?.type === 'income' ? 'income' : 'expense';
  return {
    id: String(raw?.id || generateId()),
    title: String(raw?.title || '').trim(),
    amount: Number.isFinite(numericAmount) ? Math.round(numericAmount * 100) / 100 : 0,
    category: String(raw?.category || 'Other').trim(),
    type,
    date: String(raw?.date || ''),
    description: String(raw?.description || '').trim(),
  };
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const StorageService = {
  /**
   * Seeds initial sample records only once on a fresh browser profile.
   */
  initializeIfNeeded() {
    const initialized = window.localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!initialized) {
      writeJson(STORAGE_KEYS.TRANSACTIONS, SEED_TRANSACTIONS);
      writeJson(STORAGE_KEYS.BUDGET, DEFAULT_BUDGET);
      window.localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    }
  },

  /**
   * Retrieve all transactions.
   * Future API equivalent: GET /api/transactions
   */
  getTransactions() {
    const list = readJson(STORAGE_KEYS.TRANSACTIONS, []);
    if (!Array.isArray(list)) return [];
    return list.map(normalizeTransaction);
  },

  /**
   * Retrieve a single transaction by ID.
   * Future API equivalent: GET /api/transactions/:id
   */
  getTransactionById(id) {
    return this.getTransactions().find((txn) => txn.id === id) || null;
  },

  /**
   * Create and persist a new transaction.
   * Future API equivalent: POST /api/transactions
   */
  saveTransaction(payload) {
    const transactions = this.getTransactions();
    const record = normalizeTransaction({
      ...payload,
      id: payload?.id || generateId(),
    });
    transactions.unshift(record);
    writeJson(STORAGE_KEYS.TRANSACTIONS, transactions);
    return record;
  },

  /**
   * Update an existing transaction by ID.
   * Future API equivalent: PUT /api/transactions/:id
   */
  updateTransaction(id, updates) {
    const transactions = this.getTransactions();
    const index = transactions.findIndex((txn) => txn.id === id);
    if (index === -1) return null;

    const updated = normalizeTransaction({
      ...transactions[index],
      ...updates,
      id,
    });
    transactions[index] = updated;
    writeJson(STORAGE_KEYS.TRANSACTIONS, transactions);
    return updated;
  },

  /**
   * Delete a transaction by ID.
   * Future API equivalent: DELETE /api/transactions/:id
   */
  deleteTransaction(id) {
    const transactions = this.getTransactions();
    const filtered = transactions.filter((txn) => txn.id !== id);
    if (filtered.length === transactions.length) return false;
    writeJson(STORAGE_KEYS.TRANSACTIONS, filtered);
    return true;
  },

  /**
   * Retrieve monthly budget configuration.
   * Future API equivalent: GET /api/budget
   */
  getBudget() {
    const saved = readJson(STORAGE_KEYS.BUDGET, null);
    if (!saved || !Number.isFinite(Number(saved.monthlyLimit))) {
      return { ...DEFAULT_BUDGET };
    }
    return {
      monthlyLimit: Math.max(0, Math.round(Number(saved.monthlyLimit) * 100) / 100),
      updatedAt: String(saved.updatedAt || DEFAULT_BUDGET.updatedAt),
    };
  },

  /**
   * Save monthly budget limit.
   * Future API equivalent: PUT /api/budget
   */
  saveBudget(monthlyLimit) {
    const parsed = Math.round(Number(monthlyLimit) * 100) / 100;
    const budget = {
      monthlyLimit: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    writeJson(STORAGE_KEYS.BUDGET, budget);
    return budget;
  },

  /**
   * Restore default demonstration transactions and budget.
   */
  resetDemoData() {
    writeJson(STORAGE_KEYS.TRANSACTIONS, SEED_TRANSACTIONS);
    writeJson(STORAGE_KEYS.BUDGET, DEFAULT_BUDGET);
    window.localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  },
};
