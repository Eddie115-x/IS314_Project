const AuditLogger = require('../utils/auditLogger');

/**
 * Audit Middleware
 * Automatically logs requests and responses for audit purposes
 */
const auditMiddleware = (req, res, next) => {
  try {
    // Store original send method
    const originalSend = res.send;
    const originalJson = res.json;
    
    // Capture request start time
    const startTime = Date.now();
    
    // Capture request details with validation
    const requestDetails = {
      method: req.method || 'UNKNOWN',
      url: req.originalUrl || req.url || '/',
      ip: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      userId: req.user?.id || null,
      body: sanitizeRequestBody(req.body),
      query: sanitizeQueryParams(req.query),
      params: sanitizeParams(req.params)
    };

    // Override send method to capture response
    res.send = function(data) {
      try {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode || 200;
        
        // Log the request/response
        logRequestResponse(requestDetails, {
          statusCode,
          responseTime,
          responseSize: data?.length || 0,
          success: statusCode >= 200 && statusCode < 400
        });
      } catch (auditError) {
        console.error('❌ Audit logging error in send method:', {
          error: auditError.message,
          url: requestDetails.url,
          method: requestDetails.method,
          timestamp: new Date().toISOString()
        });
      }
      
      // Call original send method
      return originalSend.call(this, data);
    };

    // Override json method to capture response
    res.json = function(data) {
      try {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode || 200;
        
        // Log the request/response
        logRequestResponse(requestDetails, {
          statusCode,
          responseTime,
          responseSize: JSON.stringify(data)?.length || 0,
          success: statusCode >= 200 && statusCode < 400
        });
      } catch (auditError) {
        console.error('❌ Audit logging error in json method:', {
          error: auditError.message,
          url: requestDetails.url,
          method: requestDetails.method,
          timestamp: new Date().toISOString()
        });
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    console.error('❌ Audit middleware initialization error:', {
      error: error.message,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    next(); // Continue processing even if audit fails
  }
};

/**
 * Sanitize request body for audit logging
 */
function sanitizeRequestBody(body) {
  try {
    if (!body) return null;
    
    const sanitized = { ...body };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  } catch (error) {
    console.error('❌ Error sanitizing request body:', error);
    return { error: 'Failed to sanitize body' };
  }
}

/**
 * Sanitize query parameters for audit logging
 */
function sanitizeQueryParams(query) {
  try {
    if (!query || Object.keys(query).length === 0) return null;
    
    const sanitized = { ...query };
    
    // Remove sensitive query parameters
    const sensitiveParams = ['token', 'key', 'secret', 'auth'];
    sensitiveParams.forEach(param => {
      if (sanitized[param]) {
        sanitized[param] = '[REDACTED]';
      }
    });
    
    return sanitized;
  } catch (error) {
    console.error('❌ Error sanitizing query parameters:', error);
    return { error: 'Failed to sanitize query' };
  }
}

/**
 * Sanitize route parameters for audit logging
 */
function sanitizeParams(params) {
  try {
    if (!params || Object.keys(params).length === 0) return null;
    return { ...params };
  } catch (error) {
    console.error('❌ Error sanitizing route parameters:', error);
    return { error: 'Failed to sanitize params' };
  }
}

/**
 * Log request/response details
 */
async function logRequestResponse(requestDetails, responseDetails) {
  try {
    const { method, url, ip, userAgent, userId } = requestDetails;
    const { statusCode, responseTime, success } = responseDetails;

    // Determine action based on HTTP method and URL
    let action = method.toLowerCase();
    let entityType = 'api_request';
    let description = `${method} ${url} - ${statusCode} (${responseTime}ms)`;

    // Map specific endpoints to entity types
    if (url.includes('/auth/')) {
      entityType = 'authentication';
      if (url.includes('/login')) action = 'login';
      else if (url.includes('/logout')) action = 'logout';
      else if (url.includes('/register')) action = 'register';
    } else if (url.includes('/users/')) {
      entityType = 'user';
      if (method === 'GET') action = 'read';
      else if (method === 'POST') action = 'create';
      else if (method === 'PUT' || method === 'PATCH') action = 'update';
      else if (method === 'DELETE') action = 'delete';
    } else if (url.includes('/leaves/')) {
      entityType = 'leave';
      if (method === 'GET') action = 'read';
      else if (method === 'POST') action = 'create';
      else if (method === 'PUT' || method === 'PATCH') action = 'update';
      else if (method === 'DELETE') action = 'delete';
    } else if (url.includes('/admin/')) {
      entityType = 'admin_operation';
      action = 'admin_action';
    } else if (url.includes('/audit/')) {
      entityType = 'audit';
      action = 'audit_access';
    }

    // Log the audit event
    await AuditLogger.log({
      userId,
      action,
      entityType,
      category: 'data_access',
      severity: success ? 'low' : 'medium',
      description,
      isSuccessful: success,
      ipAddress: ip,
      userAgent,
      metadata: {
        method,
        url,
        statusCode,
        responseTime,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error logging request/response audit:', {
      error: error.message,
      url: requestDetails?.url,
      method: requestDetails?.method,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Audit middleware for specific routes
 */
const auditRoute = (entityType, action = null) => {
  return async (req, res, next) => {
    try {
      const startTime = Date.now();
      
      // Store original methods
      const originalSend = res.send;
      const originalJson = res.json;
      
      // Override methods to capture response
      res.send = function(data) {
        try {
          const responseTime = Date.now() - startTime;
          const statusCode = res.statusCode || 200;
          
          logRouteAudit(req, res, {
            entityType,
            action: action || req.method.toLowerCase(),
            statusCode,
            responseTime,
            success: statusCode >= 200 && statusCode < 400
          });
        } catch (auditError) {
          console.error('❌ Route audit logging error in send method:', {
            error: auditError.message,
            entityType,
            action,
            timestamp: new Date().toISOString()
          });
        }
        
        return originalSend.call(this, data);
      };

      res.json = function(data) {
        try {
          const responseTime = Date.now() - startTime;
          const statusCode = res.statusCode || 200;
          
          logRouteAudit(req, res, {
            entityType,
            action: action || req.method.toLowerCase(),
            statusCode,
            responseTime,
            success: statusCode >= 200 && statusCode < 400
          });
        } catch (auditError) {
          console.error('❌ Route audit logging error in json method:', {
            error: auditError.message,
            entityType,
            action,
            timestamp: new Date().toISOString()
          });
        }
        
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('❌ Route audit middleware initialization error:', {
        error: error.message,
        entityType,
        action,
        timestamp: new Date().toISOString()
      });
      next(); // Continue processing even if audit fails
    }
  };
};

/**
 * Log route-specific audit
 */
async function logRouteAudit(req, res, details) {
  try {
    const { entityType, action, statusCode, responseTime, success } = details;
    const userId = req.user?.id || null;
    const ip = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    let description = `${action} ${entityType} - ${statusCode} (${responseTime}ms)`;
    
    // Add entity ID if available
    if (req.params.id) {
      description += ` - Entity ID: ${req.params.id}`;
    }

    await AuditLogger.log({
      userId,
      action,
      entityType,
      entityId: req.params.id ? parseInt(req.params.id) : null,
      category: 'data_access',
      severity: success ? 'low' : 'medium',
      description,
      isSuccessful: success,
      ipAddress: ip,
      userAgent,
      metadata: {
        method: req.method,
        url: req.originalUrl,
        statusCode,
        responseTime,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error logging route audit:', {
      error: error.message,
      entityType: details?.entityType,
      action: details?.action,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Audit middleware for data modifications
 */
const auditDataModification = (entityType) => {
  return async (req, res, next) => {
    try {
      const originalSend = res.send;
      const originalJson = res.json;
      
      res.send = function(data) {
        try {
          if (req.method !== 'GET') {
            logDataModification(req, res, entityType, data);
          }
        } catch (auditError) {
          console.error('❌ Data modification audit error in send method:', {
            error: auditError.message,
            entityType,
            method: req.method,
            timestamp: new Date().toISOString()
          });
        }
        return originalSend.call(this, data);
      };

      res.json = function(data) {
        try {
          if (req.method !== 'GET') {
            logDataModification(req, res, entityType, data);
          }
        } catch (auditError) {
          console.error('❌ Data modification audit error in json method:', {
            error: auditError.message,
            entityType,
            method: req.method,
            timestamp: new Date().toISOString()
          });
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('❌ Data modification audit middleware initialization error:', {
        error: error.message,
        entityType,
        timestamp: new Date().toISOString()
      });
      next(); // Continue processing even if audit fails
    }
  };
};

/**
 * Log data modification audit
 */
async function logDataModification(req, res, entityType, responseData) {
  try {
    const userId = req.user?.id || null;
    const entityId = req.params.id ? parseInt(req.params.id) : null;
    const action = req.method.toLowerCase();
    const ip = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    let oldValues = null;
    let newValues = null;

    // For updates, we might want to capture old values
    if (action === 'update' || action === 'put' || action === 'patch') {
      // This would require fetching the old values before update
      // For now, we'll just log the new values
      newValues = sanitizeRequestBody(req.body);
    } else if (action === 'create' || action === 'post') {
      newValues = sanitizeRequestBody(req.body);
    } else if (action === 'delete') {
      // For deletes, we might want to capture what was deleted
      oldValues = { deleted: true };
    }

    const description = `${action} ${entityType}${entityId ? ` (ID: ${entityId})` : ''}`;

    await AuditLogger.log({
      userId,
      action,
      entityType,
      entityId,
      oldValues,
      newValues,
      category: 'data_modification',
      severity: 'medium',
      description,
      isSuccessful: res.statusCode >= 200 && res.statusCode < 400,
      ipAddress: ip,
      userAgent,
      metadata: {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error logging data modification audit:', {
      error: error.message,
      entityType,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  auditMiddleware,
  auditRoute,
  auditDataModification
}; 