const path = require('path');
// Logger might not be available at this level if required by logger itself, standard console is safer for config
// const logger = require('./logger'); 

class DatabaseConfig {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    // Use Postgres if specified or in production, otherwise default to SQLite for local dev
    this.databaseType = (this.isProduction || process.env.DATABASE_URL) ? 'postgresql' : 'sqlite';
    this.databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/inspectionapp';
    
    // Log the database configuration
    console.log(Database Config: Environment=, Type=, Production=);
    if (this.databaseType === 'postgresql') {
        console.log(Database URL: ); // Hide credentials in logs
    }
  }

  async getConnection() {
    if (this.databaseType === 'postgresql') {
        return this.getPostgreSQLConnection();
    } else {
        return this.getSQLiteConnection();
    }
  }

  async getSQLiteConnection() {
    return new Promise((resolve, reject) => {
        const sqlite3 = require('sqlite3').verbose();
        const dbPath = path.resolve(__dirname, 'database.sqlite');
        
        console.log(Connecting to SQLite database at: );
        
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error(' SQLite connection failed:', err);
                reject(err);
            } else {
                console.log(' Connected to SQLite database');
                resolve(db);
            }
        });
    });
  }

  async getPostgreSQLConnection() {
    try {
      const { Pool } = require('pg');
      
      const pool = new Pool({
        connectionString: this.databaseUrl,
        ssl: this.isProduction ? { rejectUnauthorized: false } : false
      });

      // Test the connection to ensure it's working
      pool.on('error', (err) => {
        console.error('PostgreSQL pool error:', err);
      });

      // Test the connection with a simple query to verify it works
      try {
        const testResult = await pool.query('SELECT NOW() as current_time');
        console.log(' PostgreSQL connection test successful:', testResult.rows[0]);
      } catch (testError) {
        console.error(' PostgreSQL connection test failed:', testError);
        throw testError;
      }

      console.log(' Connected to PostgreSQL database');
      return pool;
    } catch (error) {
      console.error(' PostgreSQL connection failed:', error);
      throw error;
    }
  }
}

module.exports = DatabaseConfig;
