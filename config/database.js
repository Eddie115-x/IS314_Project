const { Sequelize } = require('sequelize');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  console.error('Please check your .env file');
  process.exit(1);
}

// Create Sequelize instance with enhanced error handling
const sequelize = new Sequelize(
  process.env.DB_NAME || 'datec_leave_system',
  process.env.DB_USER || 'is314',
  process.env.DB_PASSWORD || 'admin',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 5,
      min: parseInt(process.env.DB_POOL_MIN) || 0,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
      idle: parseInt(process.env.DB_POOL_IDLE) || 10000
    },
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: true
    },
    retry: {
      max: parseInt(process.env.DB_RETRY_MAX) || 3,
      timeout: parseInt(process.env.DB_RETRY_TIMEOUT) || 5000
    },
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false,
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT) || 60000,
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000
    }
  }
);

// Enhanced connection test function
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    // Provide specific error messages for common issues
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Database server is not running or not accessible');
      console.error('Please check if PostgreSQL is running on the specified host and port');
    } else if (error.code === 'ENOTFOUND') {
      console.error('❌ Database host not found');
      console.error('Please check your DB_HOST configuration');
    } else if (error.code === '3D000') {
      console.error('❌ Database does not exist');
      console.error('Please create the database or check your DB_NAME configuration');
    } else if (error.code === '28P01') {
      console.error('❌ Authentication failed');
      console.error('Please check your DB_USER and DB_PASSWORD configuration');
    }
    
    return false;
  }
}

// Connection event handlers
sequelize.addHook('beforeConnect', async (config) => {
  try {
    console.log('🔗 Attempting database connection...');
  } catch (error) {
    console.error('❌ Error in beforeConnect hook:', error);
  }
});

sequelize.addHook('afterConnect', async (connection) => {
  try {
    console.log('✅ Database connection established');
  } catch (error) {
    console.error('❌ Error in afterConnect hook:', error);
  }
});

// Handle connection errors
sequelize.addHook('afterDisconnect', async (connection) => {
  try {
    console.log('🔌 Database connection closed');
  } catch (error) {
    console.error('❌ Error in afterDisconnect hook:', error);
  }
});

// Enhanced sync function with retry logic
async function syncDatabase(options = {}) {
  const maxRetries = parseInt(process.env.DB_SYNC_RETRIES) || 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Database sync attempt ${attempt}/${maxRetries}...`);
      await sequelize.sync(options);
      console.log('✅ Database models synchronized successfully.');
      return true;
    } catch (error) {
      lastError = error;
      console.error(`❌ Database sync attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error('❌ Database sync failed after all retries:', lastError);
  throw lastError;
}

// Graceful shutdown function
async function closeDatabase() {
  try {
    await sequelize.close();
    console.log('✅ Database connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
    throw error;
  }
}

module.exports = { 
  sequelize, 
  testConnection, 
  syncDatabase, 
  closeDatabase 
}; 