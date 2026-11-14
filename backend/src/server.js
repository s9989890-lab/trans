const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from backend/.env
const backendDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendDir, '.env') });

// Initialize database & tables
require('./config/database');

const healthRoutes = require('./routes/healthRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const alertRoutes = require('./routes/alertRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Resolve frontend directory path without moving files
const frontendDir = path.resolve(backendDir, '..', 'expense-tracker');

// Serve static frontend files
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

// API Routes
app.use('/api', healthRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/alerts', alertRoutes);

// Catch-all 404 for unknown /api requests
app.use('/api', notFoundHandler);

// Fallback to index.html for root or client navigation if frontend exists
if (fs.existsSync(frontendDir)) {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(frontendDir, 'index.html'));
    }
    next();
  });
}

// Centralized error handling middleware
app.use(errorHandler);

// Start server if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Expense Tracker server running at http://localhost:${PORT}`);
    console.log(`API health check: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
