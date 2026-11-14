const db = require('../config/database');

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

// GET /api/transactions
function getAllTransactions(req, res, next) {
  try {
    const stmt = db.prepare(`
      SELECT id, title, amount, category, type, date, description, created_at
      FROM transactions
      ORDER BY date DESC, id DESC
    `);
    const transactions = stmt.all();
    res.status(200).json({ success: true, data: transactions });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/:id
function getTransactionById(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid transaction ID. Must be a positive integer.' });
    }

    const stmt = db.prepare(`
      SELECT id, title, amount, category, type, date, description, created_at
      FROM transactions
      WHERE id = ?
    `);
    const transaction = stmt.get(id);

    if (!transaction) {
      return res.status(404).json({ success: false, error: `Transaction with ID ${id} not found.` });
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
}

// POST /api/transactions
function createTransaction(req, res, next) {
  try {
    const { title, amount, category, type, date, description } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Title is required and must not be empty.' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a number greater than 0.' });
    }

    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Category is required and must not be empty.' });
    }

    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ success: false, error: 'Type must be either "income" or "expense".' });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({ success: false, error: 'Date must be a valid date in YYYY-MM-DD format.' });
    }

    const cleanTitle = title.trim();
    const cleanCategory = category.trim();
    const cleanDescription = description && typeof description === 'string' ? description.trim() : null;
    const roundedAmount = Math.round(numericAmount * 100) / 100;

    const stmt = db.prepare(`
      INSERT INTO transactions (title, amount, category, type, date, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(cleanTitle, roundedAmount, cleanCategory, type, date, cleanDescription);

    const createdStmt = db.prepare(`
      SELECT id, title, amount, category, type, date, description, created_at
      FROM transactions
      WHERE id = ?
    `);
    const created = createdStmt.get(result.lastInsertRowid);

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

// PUT /api/transactions/:id
function updateTransaction(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid transaction ID. Must be a positive integer.' });
    }

    const existingStmt = db.prepare('SELECT id FROM transactions WHERE id = ?');
    const existing = existingStmt.get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: `Transaction with ID ${id} not found.` });
    }

    const { title, amount, category, type, date, description } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Title is required and must not be empty.' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a number greater than 0.' });
    }

    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Category is required and must not be empty.' });
    }

    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ success: false, error: 'Type must be either "income" or "expense".' });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({ success: false, error: 'Date must be a valid date in YYYY-MM-DD format.' });
    }

    const cleanTitle = title.trim();
    const cleanCategory = category.trim();
    const cleanDescription = description && typeof description === 'string' ? description.trim() : null;
    const roundedAmount = Math.round(numericAmount * 100) / 100;

    const updateStmt = db.prepare(`
      UPDATE transactions
      SET title = ?, amount = ?, category = ?, type = ?, date = ?, description = ?
      WHERE id = ?
    `);
    updateStmt.run(cleanTitle, roundedAmount, cleanCategory, type, date, cleanDescription, id);

    const updatedStmt = db.prepare(`
      SELECT id, title, amount, category, type, date, description, created_at
      FROM transactions
      WHERE id = ?
    `);
    const updated = updatedStmt.get(id);

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/transactions/:id
function deleteTransaction(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid transaction ID. Must be a positive integer.' });
    }

    const deleteStmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    const result = deleteStmt.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: `Transaction with ID ${id} not found.` });
    }

    res.status(200).json({ success: true, message: `Transaction with ID ${id} deleted successfully.` });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
