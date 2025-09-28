const errorHandler = (err, req, res, next) => {
  // Log error with additional context
  console.error('❌ Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous',
    timestamp: new Date().toISOString()
  });

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map(error => ({
      field: error.path,
      message: error.message,
      value: error.value
    }));
    
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Please check your input data',
      details: errors,
      timestamp: new Date().toISOString()
    });
  }

  // Sequelize unique constraint errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    const errors = err.errors.map(error => ({
      field: error.path,
      message: `${error.path} already exists`,
      value: error.value
    }));
    
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: 'A record with this information already exists',
      details: errors,
      timestamp: new Date().toISOString()
    });
  }

  // Sequelize foreign key constraint errors
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      error: 'Foreign Key Constraint Error',
      message: 'Referenced record does not exist',
      details: {
        table: err.table,
        field: err.fields?.join(', '),
        value: err.value
      },
      timestamp: new Date().toISOString()
    });
  }

  // Sequelize database connection errors
  if (err.name === 'SequelizeConnectionError') {
    return res.status(503).json({
      error: 'Database Connection Error',
      message: 'Unable to connect to the database. Please try again later.',
      timestamp: new Date().toISOString()
    });
  }

  // Sequelize timeout errors
  if (err.name === 'SequelizeTimeoutError') {
    return res.status(408).json({
      error: 'Database Timeout',
      message: 'Database operation timed out. Please try again.',
      timestamp: new Date().toISOString()
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid Token',
      message: 'The provided token is invalid',
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token Expired',
      message: 'Your session has expired. Please login again',
      timestamp: new Date().toISOString()
    });
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'File Too Large',
      message: 'The uploaded file exceeds the maximum allowed size',
      maxSize: process.env.MAX_FILE_SIZE || '10MB',
      timestamp: new Date().toISOString()
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Unexpected File',
      message: 'An unexpected file was uploaded',
      timestamp: new Date().toISOString()
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      error: 'Too Many Files',
      message: 'Too many files were uploaded',
      timestamp: new Date().toISOString()
    });
  }

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Request validation failed',
      details: err.errors,
      timestamp: new Date().toISOString()
    });
  }

  // Rate limiting errors
  if (err.status === 429) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many requests from this IP, please try again later',
      retryAfter: err.headers?.['retry-after'] || 60,
      timestamp: new Date().toISOString()
    });
  }

  // Network errors
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'External service is currently unavailable',
      timestamp: new Date().toISOString()
    });
  }

  // Memory errors
  if (err.code === 'ENOMEM') {
    return res.status(500).json({
      error: 'Server Resource Error',
      message: 'Server is experiencing high memory usage. Please try again later.',
      timestamp: new Date().toISOString()
    });
  }

  // Default error handling
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  // Don't expose internal errors in production
  const isProduction = process.env.NODE_ENV === 'production';
  const errorMessage = isProduction && statusCode === 500 
    ? 'Something went wrong. Please try again later.' 
    : message;

  const response = {
    error: statusCode === 500 ? 'Internal Server Error' : 'Request Error',
    message: errorMessage,
    timestamp: new Date().toISOString()
  };

  // Include error ID for tracking in development
  if (!isProduction) {
    response.errorId = Math.random().toString(36).substr(2, 9);
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler; 