# TrueBackup Backend - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies

```powershell
npm install
```

### Step 2: Configure Environment

Create a `.env` file:

```powershell
copy .env.example .env
```

Edit `.env` and set your MySQL password and S3 credentials:

```env
DB_PASSWORD=your_mysql_password
S3_ACCESS_KEY_ID=your_wasabi_access_key
S3_SECRET_ACCESS_KEY=your_wasabi_secret_key
```

### Step 3: Initialize Database

Make sure MySQL is running, then:

```powershell
npm run db:init
```

This creates the database and admin user. **Save the admin credentials shown!**

### Step 4: Start Server

```powershell
npm run dev
```

Server starts at `http://localhost:5000`

### Step 5: Test API

**Health Check:**
```powershell
curl http://localhost:5000/health
```

**Login:**
```powershell
curl -X POST http://localhost:5000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@truebackup.com\",\"password\":\"Admin@123456\"}'
```

## 📝 Default Admin Credentials

```
Email: admin@truebackup.com
Password: Admin@123456
```

**⚠️ IMPORTANT: Change these immediately after first login!**

## 🔧 Common Commands

```powershell
# Development
npm run dev          # Start with auto-reload

# Production
npm start            # Start production server

# Database
npm run db:init      # Initialize database
npm run db:reset     # Reset database (⚠️ deletes all data)

# Testing
npm test             # Run tests
npm run lint         # Check code quality
```

## 📚 Next Steps

1. **Change Admin Password** - Use `/api/v1/auth/change-password`
2. **Configure S3 Bucket** - Create bucket in Wasabi console
3. **Create Test Client** - Use admin panel or API
4. **Test File Upload** - Use client API endpoints
5. **Review Logs** - Check `logs/` directory

## 📖 Documentation

- [Full README](README.md) - Complete documentation
- [API Docs](API_DOCUMENTATION.md) - All endpoints
- [Database Schema](database/schema.sql) - MySQL structure

## 🆘 Troubleshooting

### Database Connection Failed
```
Error: Access denied for user 'root'@'localhost'
```
**Fix:** Check DB_PASSWORD in `.env`

### S3 Upload Failed
```
Error: InvalidAccessKeyId
```
**Fix:** Verify S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in `.env`

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::5000
```
**Fix:** Change PORT in `.env` or stop other service on port 5000

## 📧 Support

For issues, check:
1. Logs in `logs/` directory
2. MySQL error logs
3. Console output

---

**You're all set! 🎉**
