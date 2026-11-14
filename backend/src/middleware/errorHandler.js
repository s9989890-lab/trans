// JSON 404 handler for unknown /api routes
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// Central error-handling middleware
function errorHandler(err, req, res, next) {
  console.error('Unhandled server error:', err);

  // SQLite UNIQUE constraint violation
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({
      success: false,
      error: 'A record with these unique details already exists.',
    });
  }

  // SQLite CHECK constraint violation
  if (err.code === 'SQLITE_CONSTRAINT_CHECK') {
    return res.status(400).json({
      success: false,
      error: 'Invalid data violates database constraints.',
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'An unexpected internal server error occurred.',
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
