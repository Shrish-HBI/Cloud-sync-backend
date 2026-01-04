@echo off
cd /d "%~dp0"
pm2 delete truebackup-backend
pm2 start ecosystem.config.js
pm2 save
echo TrueBackup Backend started with PM2
pause
