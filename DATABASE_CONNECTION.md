# Database Connection Guide

## Connecting to MySQL from Your Existing Connection

You mentioned you have a MySQL connection named `Test_DB`. Here's how to use it:

### Option 1: Using MySQL Workbench

1. **Open MySQL Workbench**
2. **Use your existing `Test_DB` connection**
3. **Open the schema.sql file**:
   - File → Open SQL Script
   - Navigate to: `database/schema.sql`
4. **Execute the script**:
   - Click the lightning bolt icon ⚡ or press Ctrl+Shift+Enter
   - This will create the `TrueBackup` database

### Option 2: Using VS Code MySQL Extension

If you have a MySQL extension installed in VS Code:

1. **Connect to Test_DB**
2. **Open `database/schema.sql`**
3. **Execute the script** using the extension's "Run" command

### Option 3: Using Command Line

```powershell
# Navigate to project directory
cd c:\Users\Shrish\Desktop\projects\Cloud-sync-backend

# Execute schema file (replace with your MySQL credentials)
mysql -u root -p < database\schema.sql
```

When prompted, enter your MySQL password.

---

## Verify Database Creation

After running the schema, verify it was created:

```sql
-- Show all databases
SHOW DATABASES;

-- Use TrueBackup database
USE TrueBackup;

-- Show all tables
SHOW TABLES;

-- Should show these 11 tables:
-- activity_logs
-- alerts
-- clients
-- cloud_vendors
-- download_history
-- files
-- profiles
-- shared_links
-- system_settings
-- user_roles
-- user_sessions
-- users

-- Check default system settings
SELECT * FROM system_settings;

-- Check cloud vendor configuration
SELECT * FROM cloud_vendors;
```

---

## Update .env File with Your MySQL Credentials

Edit `.env` file with your Test_DB connection details:

```env
# Database Configuration (Use your Test_DB credentials)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_actual_password_here
DB_NAME=TrueBackup
```

---

## Initialize with Admin User

Once database is created and .env is configured:

```powershell
npm install
npm run db:init
```

This will:
1. Connect to MySQL using your credentials
2. Create the TrueBackup database (if not exists)
3. Execute the schema
4. Create the admin user

**Save the admin credentials displayed in the console!**

---

## Testing Database Connection

### Test Script

Create a test file to verify connection:

```javascript
// test-db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    console.log('✅ Connected to MySQL successfully!');

    // Test query
    const [tables] = await connection.execute('SHOW TABLES');
    console.log(`\n📊 Found ${tables.length} tables in TrueBackup database:`);
    tables.forEach(table => console.log(`  - ${Object.values(table)[0]}`));

    // Test stored procedure
    await connection.execute('CALL check_egress_alerts(?)', ['test-uuid']);
    console.log('\n✅ Stored procedures working!');

    // Test function
    const [result] = await connection.execute('SELECT has_role(?, ?) as has_role', ['test-uuid', 'admin']);
    console.log('\n✅ Functions working!');

    await connection.end();
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();
```

Run it:
```powershell
node test-db.js
```

---

## Common Issues & Solutions

### Issue: Access Denied

```
Error: Access denied for user 'root'@'localhost'
```

**Solution**: Check your password in `.env` matches your MySQL password

### Issue: Database Doesn't Exist

```
Error: Unknown database 'TrueBackup'
```

**Solution**: Run `npm run db:init` or execute `database/schema.sql` manually

### Issue: Connection Timeout

```
Error: connect ETIMEDOUT
```

**Solution**: 
- Check MySQL is running
- Verify DB_HOST and DB_PORT in `.env`
- Check firewall settings

### Issue: Too Many Connections

```
Error: Too many connections
```

**Solution**: Increase MySQL `max_connections` or reduce connection pool size in `src/config/database.js`

---

## Useful MySQL Commands

```sql
-- Check current database
SELECT DATABASE();

-- Show database size
SELECT 
    table_schema AS 'Database',
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'TrueBackup'
GROUP BY table_schema;

-- Show table sizes
SELECT 
    table_name AS 'Table',
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'TrueBackup'
ORDER BY (data_length + index_length) DESC;

-- Check indexes
SELECT 
    table_name,
    index_name,
    column_name
FROM information_schema.statistics
WHERE table_schema = 'TrueBackup'
ORDER BY table_name, index_name;

-- View stored procedures
SHOW PROCEDURE STATUS WHERE Db = 'TrueBackup';

-- View functions
SHOW FUNCTION STATUS WHERE Db = 'TrueBackup';

-- View triggers
SHOW TRIGGERS FROM TrueBackup;
```

---

## Quick Reference: Your Connection Details

Based on your setup, your `.env` should look like:

```env
# Server
NODE_ENV=development
PORT=5000

# Database (Test_DB connection)
DB_HOST=localhost          # or your MySQL host
DB_PORT=3306              # default MySQL port
DB_USER=root              # or your MySQL username
DB_PASSWORD=YOUR_PASSWORD  # ⚠️ CHANGE THIS
DB_NAME=TrueBackup

# JWT (Generate secure keys in production)
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# S3/Wasabi (Get from Wasabi console)
S3_ACCESS_KEY_ID=your_wasabi_access_key
S3_SECRET_ACCESS_KEY=your_wasabi_secret_key
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.wasabisys.com
S3_DEFAULT_BUCKET=truebackup-storage

# CORS (Frontend URL)
CORS_ORIGIN=http://localhost:3000
```

---

## Next Steps

1. ✅ Create TrueBackup database using schema.sql
2. ✅ Configure .env with your Test_DB credentials  
3. ✅ Run `npm install`
4. ✅ Run `npm run db:init` to create admin user
5. ✅ Run `npm run dev` to start server
6. ✅ Test with `curl http://localhost:5000/health`

---

**You're ready to go! 🚀**
