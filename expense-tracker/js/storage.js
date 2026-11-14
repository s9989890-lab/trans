/**
 * Centralized Storage Module (API Integration Layer)
 *
 * All persistence is handled via REST API calls (Node.js/Express/SQLite)
 * using the fetch() API. LocalStorage is kept solely for migration flag
 * and backup retention.
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

const API_BASE = '/api';

const STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGET: 'clearledger_budget_v1',
  INITIALIZED: 'clearledger_initialized_v1',
  MIGRATED: 'clearledger_migrated_to_db_v1',
};

const DEFAULT_BUDGET = {
  monthlyLimit: 3200,
  updatedAt: '2026-11-01',
};

const SEED_TRANSACTIONS = [
  {
    title: 'Monthly Salary',
    amount: 5400,
    category: 'Salary',
    type: 'income',
    date: '2026-11-01',
    description: 'Primary paycheck deposit',
  },
  {
    title: 'Apartment Rent',
    amount: 1450,
    category: 'Housing',
    type: 'expense',
    date: '2026-11-02',
    description: 'November lease payment',
  },
  {
    title: 'Grocery Shopping',
    amount: 184.5,
    category: 'Food',
    type: 'expense',
    date: '2026-11-04',
    description: 'Weekly groceries and fresh produce',
  },
  {
    title: 'Electric & Internet',
    amount: 142.25,
    category: 'Utilities',
    type: 'expense',
    date: '2026-11-06',
    description: 'Monthly electricity and fiber internet',
  },
  {
    title: 'Design Consulting',
    amount: 750,
    category: 'Freelance',
    type: 'income',
    date: '2026-11-08',
    description: 'UI audit deliverable',
  },
  {
    title: 'Transit Pass & Fuel',
    amount: 96,
    category: 'Transport',
    type: 'expense',
    date: '2026-11-09',
    description: 'Monthly metro card and fuel',
  },
  {
    title: 'Pharmacy & Dental Checkup',
    amount: 125,
    category: 'Healthcare',
    type: 'expense',
    date: '2026-11-11',
    description: 'Routine dental cleaning copay',
  },
  {
    title: 'Whole Foods Market',
    amount: 158.4,
    category: 'Food',
    type: 'expense',
    date: '2026-11-12',
    description: 'Mid-week household groceries',
  },
  {
    title: 'Monthly Salary',
    amount: 5400,
    category: 'Salary',
    type: 'income',
    date: '2026-10-01',
    description: 'October paycheck deposit',
  },
  {
    title: 'Apartment Rent',
    amount: 1450,
    category: 'Housing',
    type: 'expense',
    date: '2026-10-02',
    description: 'October lease payment',
  },
  {
    title: 'Grocery & Dining',
    amount: 465,
    category: 'Food',
    type: 'expense',
    date: '2026-10-14',
    description: 'October groceries and team lunch',
  },
  {
    title: 'Winter Coat & Boots',
    amount: 280,
    category: 'Shopping',
    type: 'expense',
    date: '2026-10-20',
    description: 'Seasonal apparel',
  },
  {
    title: 'Utilities & Water',
    amount: 138,
    category: 'Utilities',
    type: 'expense',
    date: '2026-10-22',
    description: 'Monthly utility bill',
  },
  {
    title: 'Monthly Salary',
    amount: 5200,
    category: 'Salary',
    type: 'income',
    date: '2026-09-01',
    description: 'September paycheck deposit',
  },
  {
    title: 'Apartment Rent',
    amount: 1450,
    category: 'Housing',
    type: 'expense',
    date: '2026-09-02',
    description: 'September lease payment',
  },
  {
    title: 'Online Course Subscription',
    amount: 199,
    category: 'Education',
    type: 'expense',
    date: '2026-09-10',
    description: 'Annual technical workshop',
  },
  {
    title: 'Groceries & Coffee',
    amount: 390,
    category: 'Food',
    type: 'expense',
    date: '2026-09-18',
    description: 'Monthly food expenses',
  },
  {
    title: 'Cinema & Concert Tickets',
    amount: 112,
    category: 'Entertainment',
    type: 'expense',
    date: '2026-09-25',
    description: 'Weekend outing',
  },
];

function normalizeTransaction(raw) {
  const numericAmount = Number(raw?.amount);
  const type = raw?.type === 'income' ? 'income' : 'expense';
  return {
    id: raw?.id !== undefined ? String(raw.id) : '',
    title: String(raw?.title || '').trim(),
    amount: Number.isFinite(numericAmount) ? Math.round(numericAmount * 100) / 100 : 0,
    category: String(raw?.category || 'Other').trim(),
    type,
    date: String(raw?.date || ''),
    description: String(raw?.description || '').trim(),
  };
}

async function apiRequest(endpoint, options = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = json.error || `Server returned error (${response.status})`;
    const err = new Error(errorMsg);
    err.status = response.status;
    throw err;
  }

  return json;
}

export const StorageService = {
  /**
   * One-time migration: imports transactions and budget from LocalStorage into SQLite via API.
   * Original LocalStorage keys are kept intact as a safe backup.
   */
  async initializeIfNeeded() {
    const migrated = window.localStorage.getItem(STORAGE_KEYS.MIGRATED);
    if (migrated === 'true') {
      return { migrated: false, count: 0 };
    }

    let importedCount = 0;
    try {
      // Check if DB already has records
      const existing = await this.getTransactions();

      // Read unmigrated records from LocalStorage
      const rawTxns = window.localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      let localTxns = [];
      if (rawTxns) {
        try {
          const parsed = JSON.parse(rawTxns);
          if (Array.isArray(parsed)) localTxns = parsed;
        } catch {
          localTxns = [];
        }
      }

      // If database is empty and LocalStorage had transactions, import them
      if (existing.length === 0 && localTxns.length > 0) {
        const chronological = [...localTxns].reverse();
        for (const txn of chronological) {
          await this.saveTransaction({
            title: txn.title,
            amount: txn.amount,
            category: txn.category,
            type: txn.type,
            date: txn.date,
            description: txn.description || '',
          });
          importedCount++;
        }
      }

      // Read unmigrated budget
      const rawBudget = window.localStorage.getItem(STORAGE_KEYS.BUDGET);
      if (rawBudget) {
        try {
          const parsedBudget = JSON.parse(rawBudget);
          if (parsedBudget && Number(parsedBudget.monthlyLimit) > 0) {
            const now = new Date();
            await this.saveBudget(now.getFullYear(), now.getMonth() + 1, parsedBudget.monthlyLimit);
          }
        } catch {
          // Ignore parse errors on budget
        }
      }

      window.localStorage.setItem(STORAGE_KEYS.MIGRATED, 'true');
      console.log(`[StorageService] Migration completed: imported ${importedCount} transactions.`);
      return { migrated: true, count: importedCount };
    } catch (err) {
      console.warn('[StorageService] Migration check warning:', err.message);
      return { migrated: false, count: importedCount, error: err.message };
    }
  },

  /**
   * Retrieve all transactions from the API.
   * GET /api/transactions
   */
  async getTransactions() {
    const res = await apiRequest(`${API_BASE}/transactions`);
    const list = Array.isArray(res?.data) ? res.data : [];
    return list.map(normalizeTransaction);
  },

  /**
   * Retrieve a single transaction by ID.
   * GET /api/transactions/:id
   */
  async getTransactionById(id) {
    try {
      const res = await apiRequest(`${API_BASE}/transactions/${encodeURIComponent(id)}`);
      return res?.data ? normalizeTransaction(res.data) : null;
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  },

  /**
   * Create and persist a new transaction.
   * POST /api/transactions
   */
  async saveTransaction(payload) {
    const res = await apiRequest(`${API_BASE}/transactions`, {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        amount: payload.amount,
        category: payload.category,
        type: payload.type,
        date: payload.date,
        description: payload.description || '',
      }),
    });
    return normalizeTransaction(res.data);
  },

  /**
   * Update an existing transaction by ID.
   * PUT /api/transactions/:id
   */
  async updateTransaction(id, updates) {
    const res = await apiRequest(`${API_BASE}/transactions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: updates.title,
        amount: updates.amount,
        category: updates.category,
        type: updates.type,
        date: updates.date,
        description: updates.description || '',
      }),
    });
    return normalizeTransaction(res.data);
  },

  /**
   * Delete a transaction by ID.
   * DELETE /api/transactions/:id
   */
  async deleteTransaction(id) {
    await apiRequest(`${API_BASE}/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  },

  /**
   * Retrieve monthly budget configuration for a specific year and month.
   * GET /api/budgets/:year/:month
   */
  async getBudget(year, month) {
    try {
      const res = await apiRequest(`${API_BASE}/budgets/${year}/${month}`);
      if (res?.data) {
        return {
          id: res.data.id,
          monthlyLimit: Number(res.data.amount) || 0,
          year: res.data.year,
          month: res.data.month,
          updatedAt: res.data.created_at || '',
        };
      }
    } catch (err) {
      if (err.status === 404) {
        return {
          monthlyLimit: 0,
          year,
          month,
          updatedAt: '',
        };
      }
      throw err;
    }
    return { monthlyLimit: 0, year, month, updatedAt: '' };
  },

  /**
   * Save or update monthly budget limit via POST or PUT /api/budgets.
   */
  async saveBudget(year, month, monthlyLimit) {
    const parsedAmount = Math.round(Number(monthlyLimit) * 100) / 100;

    // Check if budget exists for this month
    let existing = null;
    try {
      const res = await apiRequest(`${API_BASE}/budgets/${year}/${month}`);
      existing = res?.data;
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    if (existing && existing.id) {
      // Update existing budget
      const updated = await apiRequest(`${API_BASE}/budgets/${existing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          amount: parsedAmount,
          year,
          month,
        }),
      });
      return {
        id: updated.data.id,
        monthlyLimit: updated.data.amount,
        year: updated.data.year,
        month: updated.data.month,
      };
    } else {
      // Create new budget
      const created = await apiRequest(`${API_BASE}/budgets`, {
        method: 'POST',
        body: JSON.stringify({
          year,
          month,
          amount: parsedAmount,
        }),
      });
      return {
        id: created.data.id,
        monthlyLimit: created.data.amount,
        year: created.data.year,
        month: created.data.month,
      };
    }
  },

  /**
   * Retrieve smart spending alerts for a specific month.
   * GET /api/alerts/:year/:month
   */
  async getSmartAlerts(year, month) {
    try {
      const res = await apiRequest(`${API_BASE}/alerts/${year}/${month}`);
      return res?.data || { summary: {}, alerts: [] };
    } catch (err) {
      console.warn('Failed to fetch smart alerts:', err.message);
      return { summary: {}, alerts: [] };
    }
  },

  /**
   * Populate sample demonstration transactions if database is currently empty.
   */
  async resetDemoData(selectedMonth) {
    const current = await this.getTransactions();
    if (current.length === 0) {
      for (const txn of SEED_TRANSACTIONS) {
        await this.saveTransaction(txn);
      }
    }
    const [yearStr, monthStr] = (selectedMonth || '2026-11').split('-');
    await this.saveBudget(Number(yearStr), Number(monthStr), DEFAULT_BUDGET.monthlyLimit);
  },
};
