# IIS Deployment Guide for TrueBackup Backend

## Prerequisites

### Required IIS Components
1. **IIS (Internet Information Services)** - Already installed
2. **URL Rewrite Module** - [Download here](https://www.iis.net/downloads/microsoft/url-rewrite)
3. **Application Request Routing (ARR)** - [Download here](https://www.iis.net/downloads/microsoft/application-request-routing)

### Required Software
- **Node.js 18+** (already installed)
- **PM2** - Process manager for Node.js

---

## Installation Steps

### Step 1: Install PM2 Globally

```powershell
npm install -g pm2 pm2-windows-startup
```

### Step 2: Install IIS Modules

1. **Install URL Rewrite Module**
   - Download from: https://www.iis.net/downloads/microsoft/url-rewrite
   - Run installer and follow prompts
   - Restart IIS after installation

2. **Install Application Request Routing (ARR)**
   - Download from: https://www.iis.net/downloads/microsoft/application-request-routing
   - Run installer
   - Restart IIS after installation

3. **Enable ARR Proxy**
   - Open IIS Manager
   - Click on server name (root level)
   - Double-click "Application Request Routing Cache"
   - Click "Server Proxy Settings" on right panel
   - Check "Enable proxy"
   - Click "Apply"

### Step 3: Configure Environment Variables

Create a `.env` file in your project root:

```env
NODE_ENV=production
PORT=5000
API_VERSION=v1

DB_HOST=20.219.110.126
DB_PORT=3306
DB_USER=TrueBackup
DB_PASSWORD=your_actual_password
DB_NAME=TrueBackup
DB_SSL=false

JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-super-secret-refresh-key
JWT_REFRESH_EXPIRES_IN=7d

S3_REGION=us-east-1
S3_ENDPOINT=https://s3.wasabisys.com
S3_PRESIGNED_URL_EXPIRES=3600

CORS_ORIGIN=*

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

MAX_FILE_SIZE_MB=5120
SESSION_TIMEOUT_MINUTES=30
ENABLE_ACTIVITY_LOGS=true

ADMIN_EMAIL=admin@truebackup.in
ADMIN_PASSWORD=Admin@123
```

### Step 4: Start Application with PM2

```powershell
cd "E:\Warsoft Test Data\Truebackup\ConsoleTruebackup_API"

# Start the application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on Windows boot
pm2-startup install
```

### Step 5: Configure IIS Site

1. **Open IIS Manager**

2. **Create New Site**
   - Right-click "Sites" → "Add Website"
   - Site name: `TrueBackup-API`
   - Physical path: `E:\Warsoft Test Data\Truebackup\ConsoleTruebackup_API`
   - Binding:
     - Type: `http`
     - IP address: `All Unassigned`
     - Port: `80` (or your preferred port)
     - Host name: (leave empty or add your domain)

3. **Configure Application Pool**
   - Right-click your new site → "Basic Settings"
   - Click "Select" next to Application Pool
   - Create new or use existing pool with:
     - .NET CLR Version: `No Managed Code`
     - Managed Pipeline Mode: `Integrated`
     - Identity: `ApplicationPoolIdentity` or custom account with proper permissions

4. **Set Folder Permissions**
   - Right-click physical path folder in Windows Explorer
   - Properties → Security
   - Add `IIS_IUSRS` group with Read & Execute permissions
   - Add `IUSR` user with Read permissions

### Step 6: Verify web.config

Ensure `web.config` is in your project root with the correct configuration (already done).

---

## Testing the Deployment

### 1. Verify PM2 is Running

```powershell
pm2 list
pm2 logs truebackup-backend
```

You should see:
- Status: `online`
- No error messages in logs

### 2. Test Direct Node.js Access

```powershell
curl http://localhost:5000/health
```

Should return:
```json
{
  "status": "OK",
  "timestamp": "2026-01-04T...",
  "environment": "production",
  "version": "v1"
}
```

### 3. Test IIS Reverse Proxy

Open browser and go to:
```
http://localhost/health
```

Should return the same JSON response.

### 4. Test API Endpoints

```powershell
# Test login
Invoke-RestMethod -Uri "http://localhost/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admin@truebackup.in","password":"Admin@123"}'
```

---

## Production Configuration

### Enable HTTPS (Recommended)

1. **Get SSL Certificate**
   - Purchase from CA or use Let's Encrypt
   - Or generate self-signed for testing

2. **Import Certificate in IIS**
   - Open IIS Manager
   - Click on server name
   - Double-click "Server Certificates"
   - Import your certificate

3. **Add HTTPS Binding**
   - Select your site
   - Click "Bindings" on right panel
   - Add new binding:
     - Type: `https`
     - Port: `443`
     - SSL Certificate: Select your certificate

4. **Enable HTTP to HTTPS Redirect**
   - Uncomment the redirect rule in `web.config` (lines 13-19)

### Security Headers

The `web.config` already includes:
- ✅ CORS headers
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: SAMEORIGIN
- ✅ X-XSS-Protection
- ✅ Remove X-Powered-By header

### File Upload Limits

Current limit: 5GB (5368709120 bytes)

To change, edit `web.config`:
```xml
<requestLimits maxAllowedContentLength="10737418240" /> <!-- 10GB -->
```

---

## Troubleshooting

### Issue: "502 Bad Gateway"

**Cause**: PM2 application not running or wrong port

**Solution**:
```powershell
pm2 restart truebackup-backend
pm2 logs --lines 50
```

### Issue: "500 Internal Server Error"

**Cause**: web.config syntax error or missing IIS modules

**Solution**:
1. Check IIS logs: `C:\inetpub\logs\LogFiles`
2. Verify URL Rewrite and ARR are installed
3. Check Event Viewer → Windows Logs → Application

### Issue: CORS errors

**Cause**: Outbound rules not working

**Solution**:
1. Ensure ARR is installed and proxy is enabled
2. Check browser console for specific CORS errors
3. Verify `Access-Control-Allow-Origin` in response headers (F12 → Network)

### Issue: Database connection failed

**Cause**: Environment variables not loaded

**Solution**:
```powershell
# Stop PM2
pm2 stop truebackup-backend

# Verify .env file exists
Get-Content .env

# Restart PM2
pm2 restart truebackup-backend

# Check logs
pm2 logs --lines 100
```

### Issue: Application crashes on startup

**Cause**: Missing dependencies or syntax errors

**Solution**:
```powershell
# Navigate to project directory
cd "E:\Warsoft Test Data\Truebackup\ConsoleTruebackup_API"

# Reinstall dependencies
npm install

# Test manually first
npm run dev

# If manual works, restart PM2
pm2 restart truebackup-backend
```

---

## Useful PM2 Commands

```powershell
# View running processes
pm2 list

# View logs
pm2 logs truebackup-backend
pm2 logs --lines 100

# Monitor resources
pm2 monit

# Restart application
pm2 restart truebackup-backend

# Stop application
pm2 stop truebackup-backend

# Start application
pm2 start ecosystem.config.js

# Delete application
pm2 delete truebackup-backend

# View detailed info
pm2 show truebackup-backend
```

---

## Performance Optimization

### Enable IIS Caching

1. Open IIS Manager
2. Select your site
3. Double-click "Output Caching"
4. Add caching rules for static content

### Enable Compression (Already Configured)

The `web.config` includes compression for:
- ✅ JSON responses
- ✅ JavaScript
- ✅ Text content

### Connection Limits

The database pool is configured for 10 connections. Adjust in `src/config/database.js`:

```javascript
connectionLimit: 20, // Increase for high traffic
```

---

## Monitoring and Logs

### Application Logs
- **PM2 Logs**: Check with `pm2 logs`
- **File Logs**: `logs/app-*.log` and `logs/error-*.log`

### IIS Logs
- **Location**: `C:\inetpub\logs\LogFiles\W3SVC*`
- **Format**: IIS format with timestamp, IP, request, response

### Database Logs
- Check MySQL server logs for connection issues
- Monitor slow queries

---

## Backup and Restore

### Backup PM2 Configuration

```powershell
pm2 save
# Saves to: C:\Users\<username>\.pm2\dump.pm2
```

### Backup Application

```powershell
# Stop services
pm2 stop all

# Backup folder
Copy-Item -Recurse "E:\Warsoft Test Data\Truebackup\ConsoleTruebackup_API" `
  "E:\Backups\ConsoleTruebackup_API_$(Get-Date -Format 'yyyyMMdd')"

# Restart services
pm2 restart all
```

---

## Contact and Support

For issues or questions:
- Check logs first: `pm2 logs`
- Review IIS logs: `C:\inetpub\logs\LogFiles`
- Check Event Viewer for system errors
- Verify database connectivity: `mysql -h 20.219.110.126 -u TrueBackup -p`

---

## Quick Reference

| Component | Location |
|-----------|----------|
| Application Path | `E:\Warsoft Test Data\Truebackup\ConsoleTruebackup_API` |
| Port | 5000 (Node.js), 80/443 (IIS) |
| PM2 Config | `ecosystem.config.js` |
| IIS Config | `web.config` |
| Environment | `.env` |
| Logs | `logs/` folder |
| Database | `20.219.110.126:3306` |
| API Base | `http://localhost/api/v1` |

---

**Last Updated**: January 4, 2026
