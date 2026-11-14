const db = require('../config/database');

function parseId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

function parseMonth(rawMonth) {
  const month = Number(rawMonth);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return month;
}

function parseYear(rawYear) {
  const year = Number(rawYear);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return null;
  }
  return year;
}

// GET /api/budgets/:year/:month
function getBudgetByMonth(req, res, next) {
  try {
    const year = parseYear(req.params.year);
    const month = parseMonth(req.params.month);

    if (!year) {
      return res.status(400).json({ success: false, error: 'Year must be a valid 4-digit integer.' });
    }
    if (!month) {
      return res.status(400).json({ success: false, error: 'Month must be an integer between 1 and 12.' });
    }

    const stmt = db.prepare(`
      SELECT id, year, month, amount, created_at
      FROM monthly_budgets
      WHERE year = ? AND month = ?
    `);
    const budget = stmt.get(year, month);

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: `No budget found for ${year}-${String(month).padStart(2, '0')}.`,
      });
    }

    res.status(200).json({ success: true, data: budget });
  } catch (err) {
    next(err);
  }
}

// POST /api/budgets
function createBudget(req, res, next) {
  try {
    const { year, month, amount } = req.body;

    const parsedYear = parseYear(year);
    const parsedMonth = parseMonth(month);
    const numericAmount = Number(amount);

    if (!parsedYear) {
      return res.status(400).json({ success: false, error: 'Year is required and must be a valid integer.' });
    }
    if (!parsedMonth) {
      return res.status(400).json({ success: false, error: 'Month is required and must be an integer between 1 and 12.' });
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a number greater than 0.' });
    }

    // Check if a budget already exists for this year and month
    const existingStmt = db.prepare('SELECT id FROM monthly_budgets WHERE year = ? AND month = ?');
    const existing = existingStmt.get(parsedYear, parsedMonth);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A budget for ${parsedYear}-${String(parsedMonth).padStart(2, '0')} already exists.`,
      });
    }

    const roundedAmount = Math.round(numericAmount * 100) / 100;
    const insertStmt = db.prepare(`
      INSERT INTO monthly_budgets (year, month, amount)
      VALUES (?, ?, ?)
    `);
    const result = insertStmt.run(parsedYear, parsedMonth, roundedAmount);

    const createdStmt = db.prepare('SELECT id, year, month, amount, created_at FROM monthly_budgets WHERE id = ?');
    const created = createdStmt.get(result.lastInsertRowid);

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

// PUT /api/budgets/:id
function updateBudget(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid budget ID. Must be a positive integer.' });
    }

    const existingStmt = db.prepare('SELECT id, year, month, amount FROM monthly_budgets WHERE id = ?');
    const existing = existingStmt.get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: `Budget with ID ${id} not found.` });
    }

    const { amount, year, month } = req.body;

    let targetYear = existing.year;
    let targetMonth = existing.month;
    let targetAmount = existing.amount;

    if (year !== undefined) {
      const parsedYear = parseYear(year);
      if (!parsedYear) {
        return res.status(400).json({ success: false, error: 'Year must be a valid integer.' });
      }
      targetYear = parsedYear;
    }

    if (month !== undefined) {
      const parsedMonth = parseMonth(month);
      if (!parsedMonth) {
        return res.status(400).json({ success: false, error: 'Month must be an integer between 1 and 12.' });
      }
      targetMonth = parsedMonth;
    }

    if (amount !== undefined) {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Amount must be a number greater than 0.' });
      }
      targetAmount = Math.round(numericAmount * 100) / 100;
    }

    // Check if changing year/month conflicts with another record
    if (targetYear !== existing.year || targetMonth !== existing.month) {
      const conflictStmt = db.prepare('SELECT id FROM monthly_budgets WHERE year = ? AND month = ? AND id != ?');
      const conflict = conflictStmt.get(targetYear, targetMonth, id);
      if (conflict) {
        return res.status(409).json({
          success: false,
          error: `A budget for ${targetYear}-${String(targetMonth).padStart(2, '0')} already exists.`,
        });
      }
    }

    const updateStmt = db.prepare(`
      UPDATE monthly_budgets
      SET year = ?, month = ?, amount = ?
      WHERE id = ?
    `);
    updateStmt.run(targetYear, targetMonth, targetAmount, id);

    const updatedStmt = db.prepare('SELECT id, year, month, amount, created_at FROM monthly_budgets WHERE id = ?');
    const updated = updatedStmt.get(id);

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBudgetByMonth,
  createBudget,
  updateBudget,
};
