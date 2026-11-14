const db = require('../config/database');

function parseYear(raw) {
  const y = Number(raw);
  return Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : null;
}

function parseMonth(raw) {
  const m = Number(raw);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}

// GET /api/alerts/:year/:month
function getSmartAlerts(req, res, next) {
  try {
    const year = parseYear(req.params.year);
    const month = parseMonth(req.params.month);

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'Year and Month must be valid integers (month between 1 and 12).',
      });
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const daysInMonth = new Date(year, month, 0).getDate();

    // 1. Get Monthly Budget
    const budgetStmt = db.prepare('SELECT id, year, month, amount FROM monthly_budgets WHERE year = ? AND month = ?');
    const budgetRow = budgetStmt.get(year, month);
    const monthlyLimit = budgetRow ? Number(budgetRow.amount) : 0;

    // 2. Get All Expense Transactions for this month
    const monthTxnsStmt = db.prepare(`
      SELECT id, title, amount, category, type, date, description
      FROM transactions
      WHERE date LIKE ? AND type = 'expense'
      ORDER BY date ASC, id ASC
    `);
    const expenses = monthTxnsStmt.all(`${monthKey}-%`);

    const totalExpenses = Math.round(
      expenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) * 100
    ) / 100;

    const remainingBudget = monthlyLimit > 0
      ? Math.round((monthlyLimit - totalExpenses) * 100) / 100
      : 0;

    const utilizationPct = monthlyLimit > 0
      ? Math.round((totalExpenses / monthlyLimit) * 1000) / 10
      : 0;

    const alerts = [];

    // Current date logic to determine if current, past, or future month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    const isCurrentMonth = year === currentYear && month === currentMonth;
    const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth);

    // --- CHECK 1: Budget Exceeded or Warning Threshold ---
    if (monthlyLimit > 0) {
      if (totalExpenses > monthlyLimit) {
        const overBy = Math.round((totalExpenses - monthlyLimit) * 100) / 100;
        alerts.push({
          id: 'budget-exceeded',
          level: 'danger',
          type: 'budget_exceeded',
          icon: 'alert-octagon',
          title: 'Budget Exceeded',
          message: `Monthly expenses ($${totalExpenses.toFixed(2)}) have exceeded your $${monthlyLimit.toFixed(2)} limit by $${overBy.toFixed(2)} (${utilizationPct.toFixed(1)}% used).`,
        });
      } else if (utilizationPct >= 80) {
        alerts.push({
          id: 'budget-warning',
          level: 'warning',
          type: 'budget_threshold',
          icon: 'alert-triangle',
          title: 'Approaching Budget Limit',
          message: `You have consumed ${utilizationPct.toFixed(1)}% of your $${monthlyLimit.toFixed(2)} budget. Only $${remainingBudget.toFixed(2)} remains.`,
        });
      }
    } else {
      alerts.push({
        id: 'budget-unset',
        level: 'nominal',
        type: 'budget_unset',
        icon: 'info',
        title: 'No Budget Set',
        message: 'No spending limit set for this month. Set a monthly budget to enable proactive overrun alerts.',
      });
    }

    // --- CHECK 2: Smart Run-Rate / Pacing Alert (for current active month) ---
    let projectedMonthEndSpend = null;
    if (isCurrentMonth && monthlyLimit > 0 && currentDay > 1 && totalExpenses > 0) {
      const dailyAverage = totalExpenses / currentDay;
      projectedMonthEndSpend = Math.round(dailyAverage * daysInMonth * 100) / 100;

      // If already exceeded, the pacing alert is redundant
      if (totalExpenses <= monthlyLimit && projectedMonthEndSpend > monthlyLimit) {
        const projectedExceedDay = Math.min(daysInMonth, Math.ceil(monthlyLimit / dailyAverage));
        alerts.push({
          id: 'pacing-overrun',
          level: 'warning',
          type: 'pacing_warning',
          icon: 'trending-up',
          title: 'Spending Pace Warning',
          message: `At your current pace of $${dailyAverage.toFixed(2)}/day, you are projected to reach $${projectedMonthEndSpend.toFixed(2)} by month-end, exceeding your budget around day ${projectedExceedDay}.`,
        });
      }
    }

    // --- CHECK 3: Large Single Transaction Impact ---
    if (monthlyLimit > 0 && expenses.length > 0) {
      const highestExpense = [...expenses].sort((a, b) => b.amount - a.amount)[0];
      const singleImpactPct = Math.round((highestExpense.amount / monthlyLimit) * 1000) / 10;
      if (singleImpactPct >= 25) {
        alerts.push({
          id: `large-txn-${highestExpense.id}`,
          level: 'warning',
          type: 'large_transaction',
          icon: 'alert-circle',
          title: 'High Single Expense Impact',
          message: `Single transaction "${highestExpense.title}" ($${highestExpense.amount.toFixed(2)}) took ${singleImpactPct.toFixed(1)}% of your total monthly budget.`,
        });
      }
    }

    // --- CHECK 4: Category Spending Surge (vs prior 3 months) ---
    // Calculate current category spend
    const currentCategorySpend = {};
    for (const t of expenses) {
      currentCategorySpend[t.category] = (currentCategorySpend[t.category] || 0) + Number(t.amount);
    }

    // Query previous 3 months
    const prevMonths = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(year, month - 1 - i, 1);
      prevMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const prevTxnsStmt = db.prepare(`
      SELECT category, date, amount
      FROM transactions
      WHERE type = 'expense' AND (date LIKE ? OR date LIKE ? OR date LIKE ?)
    `);
    const prevExpenses = prevTxnsStmt.all(
      `${prevMonths[0]}-%`,
      `${prevMonths[1]}-%`,
      `${prevMonths[2]}-%`
    );

    if (prevExpenses.length > 0) {
      // Group by category and month to get distinct monthly averages
      const categoryMonthMap = {};
      for (const p of prevExpenses) {
        const pMonth = p.date.slice(0, 7);
        if (!categoryMonthMap[p.category]) categoryMonthMap[p.category] = {};
        categoryMonthMap[p.category][pMonth] =
          (categoryMonthMap[p.category][pMonth] || 0) + Number(p.amount);
      }

      for (const [cat, currentAmt] of Object.entries(currentCategorySpend)) {
        if (categoryMonthMap[cat]) {
          const pastMonthTotals = Object.values(categoryMonthMap[cat]);
          const pastAvg = pastMonthTotals.reduce((a, b) => a + b, 0) / pastMonthTotals.length;

          // If current spend is more than 35% higher than past average and difference > $40
          if (pastAvg > 0 && currentAmt >= 1.35 * pastAvg && currentAmt - pastAvg >= 40) {
            const surgePct = Math.round(((currentAmt - pastAvg) / pastAvg) * 100);
            alerts.push({
              id: `surge-${cat}`,
              level: 'warning',
              type: 'category_surge',
              icon: 'activity',
              title: `${cat} Surge Detected`,
              message: `${cat} spending ($${currentAmt.toFixed(2)}) is ${surgePct}% above your recent monthly average ($${pastAvg.toFixed(2)}).`,
            });
          }
        }
      }
    }

    // --- CHECK 5: Nominal State (No warnings or danger) ---
    const hasDangerOrWarning = alerts.some((a) => a.level === 'danger' || a.level === 'warning');
    if (!hasDangerOrWarning && monthlyLimit > 0) {
      alerts.push({
        id: 'budget-healthy',
        level: 'nominal',
        type: 'budget_healthy',
        icon: 'check-circle-2',
        title: 'Spending On Track',
        message: `Within Budget: You have $${remainingBudget.toFixed(2)} remaining (${utilizationPct.toFixed(1)}% used).`,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        summary: {
          year,
          month,
          monthlyLimit,
          totalExpenses,
          remainingBudget,
          utilizationPct,
          projectedMonthEndSpend,
          isCurrentMonth,
        },
        alerts,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSmartAlerts,
};
