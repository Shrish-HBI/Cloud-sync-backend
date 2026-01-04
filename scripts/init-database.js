import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initializeDatabase() {
  let connection;
  
  try {
    console.log('🔄 Connecting to MySQL server...');
    
    // Connect to MySQL server (without database)
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    console.log('✅ Connected to MySQL server');

    // Read schema SQL file
    const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');

    console.log('🔄 Creating database and tables...');
    
    // Remove DELIMITER commands and split properly
    let processedSql = schemaSql
      .replace(/DELIMITER \$\$/gi, '')
      .replace(/DELIMITER ;/gi, '')
      .replace(/\$\$/g, ';;PROC_END;;'); // Mark procedure ends
    
    // Split into individual statements
    const parts = processedSql.split(';;PROC_END;;');
    
    for (let part of parts) {
      part = part.trim();
      if (!part) continue;
      
      // Check if this is a CREATE PROCEDURE/FUNCTION or regular SQL
      if (part.match(/CREATE (PROCEDURE|FUNCTION|TRIGGER)/i)) {
        // Execute stored procedure/function as single statement
        await connection.query(part);
      } else {
        // Execute regular SQL statements
        const statements = part.split(';').filter(s => s.trim());
        for (const stmt of statements) {
          if (stmt.trim()) {
            await connection.query(stmt);
          }
        }
      }
    }

    console.log('✅ Database schema created successfully');

    // Close connection
    await connection.end();

    // Reconnect to the new database to create admin user
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'TrueBackup'
    });

    console.log('🔄 Creating default admin user...');

    const bcrypt = (await import('bcryptjs')).default;
    const { v4: uuidv4 } = await import('uuid');

    const adminId = uuidv4();
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@truebackup.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const adminName = process.env.ADMIN_NAME || 'System Administrator';
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    // Create admin user
    await connection.execute(
      'INSERT INTO users (id, email, password_hash, name, email_verified) VALUES (?, ?, ?, ?, ?)',
      [adminId, adminEmail, passwordHash, adminName, true]
    );

    // Assign admin role
    await connection.execute(
      'INSERT INTO user_roles (user_id, role) VALUES (?, ?)',
      [adminId, 'admin']
    );

    console.log('✅ Admin user created successfully');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Admin Email:', adminEmail);
    console.log('🔑 Admin Password:', adminPassword);
    console.log('⚠️  IMPORTANT: Change the admin password after first login!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🎉 Database initialization complete!');

  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run initialization
initializeDatabase();
