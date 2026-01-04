-- TrueBackup MySQL Database Schema
-- Created: January 3, 2026
-- Database: TrueBackup

-- Drop database if exists and create fresh
DROP DATABASE IF EXISTS TrueBackup;
CREATE DATABASE TrueBackup CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE TrueBackup;

-- =============================================================================
-- 1. USERS & AUTHENTICATION
-- =============================================================================

-- Users table (replaces Supabase auth.users)
CREATE TABLE users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires DATETIME,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_email_verification_token (email_verification_token),
    INDEX idx_password_reset_token (password_reset_token)
) ENGINE=InnoDB;

-- User roles table
CREATE TABLE user_roles (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    role ENUM('admin', 'client') NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_role (user_id, role),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_role (role)
) ENGINE=InnoDB;

-- Sessions table (for JWT token management)
CREATE TABLE user_sessions (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_token_hash (token_hash),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB;

-- =============================================================================
-- 2. PROFILES
-- =============================================================================

CREATE TABLE profiles (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_email (email)
) ENGINE=InnoDB;

-- =============================================================================
-- 3. CLIENTS
-- =============================================================================

CREATE TABLE clients (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    company VARCHAR(255),
    storage_quota_gb DECIMAL(10,2) NOT NULL DEFAULT 100.00,
    storage_used_gb DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    egress_used_gb DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    egress_free_limit_gb DECIMAL(10,2) NOT NULL DEFAULT 2048.00,
    status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    bucket_name VARCHAR(255),
    folder_prefix VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_email (email)
) ENGINE=InnoDB;

-- =============================================================================
-- 4. FILES METADATA
-- =============================================================================

CREATE TABLE files (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL,
    name VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    type ENUM('file', 'folder') NOT NULL,
    mime_type VARCHAR(255),
    path TEXT NOT NULL,
    parent_id CHAR(36),
    s3_key TEXT,
    s3_etag VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES files(id) ON DELETE CASCADE,
    INDEX idx_client_id (client_id),
    INDEX idx_parent_id (parent_id),
    INDEX idx_type (type),
    INDEX idx_deleted_at (deleted_at),
    FULLTEXT idx_name_search (name)
) ENGINE=InnoDB;

-- =============================================================================
-- 5. ACTIVITY LOGS
-- =============================================================================

CREATE TABLE activity_logs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    user_name VARCHAR(255) NOT NULL,
    user_role ENUM('admin', 'client') NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    resource_type VARCHAR(50),
    resource_id CHAR(36),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at),
    INDEX idx_resource_type (resource_type)
) ENGINE=InnoDB;

-- =============================================================================
-- 6. EGRESS USAGE TRACKING (Monthly Reset)
-- =============================================================================

CREATE TABLE egress_usage (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL,
    month_year VARCHAR(7) NOT NULL,                  -- Format: 'YYYY-MM' e.g., '2026-01'
    egress_used_gb DECIMAL(12,4) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    UNIQUE KEY unique_client_month (client_id, month_year),
    INDEX idx_client_month (client_id, month_year)
) ENGINE=InnoDB;

-- =============================================================================
-- 7. DOWNLOAD HISTORY
-- =============================================================================

CREATE TABLE download_history (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL,
    file_id CHAR(36),
    file_name VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    status ENUM('pending', 'in_progress', 'completed', 'failed') NOT NULL DEFAULT 'completed',
    ip_address VARCHAR(45),
    user_agent TEXT,
    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL,
    INDEX idx_client_id (client_id),
    INDEX idx_file_id (file_id),
    INDEX idx_downloaded_at (downloaded_at)
) ENGINE=InnoDB;

-- =============================================================================
-- 9. SYSTEM SETTINGS
-- =============================================================================

CREATE TABLE system_settings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    `key` VARCHAR(100) UNIQUE NOT NULL,
    value JSON NOT NULL,
    description TEXT,
    updated_by CHAR(36),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_key (`key`)
) ENGINE=InnoDB;

-- Insert default settings
INSERT INTO system_settings (`key`, value, description) VALUES
('egress_free_limit_gb', '2048', 'Default free egress limit per client in GB'),
('egress_overage_price_per_gb', '{"inr": 3.5, "usd": 0.04}', 'Price per GB for egress over free limit'),
('storage_price_per_gb', '{"inr": 0.59, "usd": 0.0068}', 'Price per GB for storage'),
('block_downloads_on_overage', 'false', 'Block downloads when client exceeds free egress'),
('egress_alert_thresholds', '[80, 90, 100]', 'Percentage thresholds for egress alerts'),
('default_storage_quota_gb', '100', 'Default storage quota for new clients'),
('session_timeout_minutes', '30', 'Session timeout in minutes'),
('require_2fa_admin', 'false', 'Require 2FA for admin accounts');

-- =============================================================================
-- 8. CLIENT STORAGE CONFIGURATION (Per-Client S3 Credentials)
-- =============================================================================

CREATE TABLE client_storage_config (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL UNIQUE,
    
    -- S3-compatible storage credentials (per client)
    bucket_name VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,              -- e.g., 's3.wasabisys.com', 's3.amazonaws.com'
    region VARCHAR(50) NOT NULL,                 -- e.g., 'us-east-1', 'ap-south-1'
    access_key_id TEXT NOT NULL,                 -- Encrypted at rest
    secret_access_key TEXT NOT NULL,             -- Encrypted at rest
    
    -- Optional: bucket prefix for multi-tenant within single bucket
    bucket_prefix VARCHAR(255),                  -- e.g., 'client-123/' if sharing bucket
    
    -- Connection status
    is_verified BOOLEAN DEFAULT FALSE,
    last_verified_at DATETIME,
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_client_id (client_id)
) ENGINE=InnoDB;

-- =============================================================================
-- 9. SHARED LINKS (File Sharing)
-- =============================================================================

CREATE TABLE shared_links (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    file_id CHAR(36) NOT NULL,
    client_id CHAR(36) NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    max_downloads INT,
    download_count INT DEFAULT 0,
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_token (token),
    INDEX idx_file_id (file_id),
    INDEX idx_expires_at (expires_at),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB;
-- =============================================================================
-- 10. ALERTS
-- =============================================================================

CREATE TABLE alerts (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36),
    alert_type ENUM('egress_warning', 'egress_limit', 'storage_warning', 'storage_limit') NOT NULL,
    message TEXT NOT NULL,
    threshold_percent INT,                           -- 80, 90, 100
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_client_id (client_id),
    INDEX idx_is_read (is_read),
    INDEX idx_alert_type (alert_type),
    INDEX idx_created_at (created_at),
    INDEX idx_unread (client_id, is_read)
) ENGINE=InnoDB;

-- =============================================================================
-- STORED PROCEDURES & FUNCTIONS
-- =============================================================================

DELIMITER $$

-- Function to check if user has a specific role
CREATE FUNCTION has_role(p_user_id CHAR(36), p_role VARCHAR(20))
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE role_exists BOOLEAN;
    
    SELECT EXISTS(
        SELECT 1 FROM user_roles
        WHERE user_id = p_user_id AND role = p_role
    ) INTO role_exists;
    
    RETURN role_exists;
END$$

-- Procedure to recalculate client storage usage
CREATE PROCEDURE recalculate_client_storage(IN p_client_id CHAR(36))
BEGIN
    DECLARE total_size_gb DECIMAL(10,2);
    
    SELECT COALESCE(SUM(size_bytes), 0) / (1024 * 1024 * 1024)
    INTO total_size_gb
    FROM files
    WHERE client_id = p_client_id
        AND type = 'file'
        AND deleted_at IS NULL;
    
    UPDATE clients
    SET storage_used_gb = total_size_gb
    WHERE id = p_client_id;
END$$

-- Function to get current month's egress for a client
CREATE FUNCTION get_client_monthly_egress(p_client_id CHAR(36))
RETURNS DECIMAL(12,4)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_egress DECIMAL(12,4);
    
    SELECT COALESCE(egress_used_gb, 0) INTO v_egress
    FROM egress_usage
    WHERE client_id = p_client_id
        AND month_year = DATE_FORMAT(NOW(), '%Y-%m');
    
    RETURN COALESCE(v_egress, 0);
END$$

-- Procedure to record egress and trigger alerts
CREATE PROCEDURE record_egress(
    IN p_client_id CHAR(36),
    IN p_bytes BIGINT
)
BEGIN
    DECLARE v_month_year VARCHAR(7);
    DECLARE v_gb DECIMAL(12,4);
    DECLARE v_current_egress DECIMAL(12,4);
    DECLARE v_free_limit DECIMAL(10,2);
    DECLARE v_usage_percent DECIMAL(5,2);
    
    SET v_month_year = DATE_FORMAT(NOW(), '%Y-%m');
    SET v_gb = p_bytes / (1024 * 1024 * 1024);
    
    -- Upsert egress usage
    INSERT INTO egress_usage (client_id, month_year, egress_used_gb)
    VALUES (p_client_id, v_month_year, v_gb)
    ON DUPLICATE KEY UPDATE egress_used_gb = egress_used_gb + v_gb;
    
    -- Get current egress and free limit
    SELECT egress_used_gb, c.egress_free_limit_gb
    INTO v_current_egress, v_free_limit
    FROM egress_usage e
    JOIN clients c ON e.client_id = c.id
    WHERE e.client_id = p_client_id AND e.month_year = v_month_year;
    
    -- Calculate usage percentage
    SET v_usage_percent = (v_current_egress / v_free_limit) * 100;
    
    -- Check thresholds and create alerts
    IF v_usage_percent >= 100 THEN
        INSERT IGNORE INTO alerts (client_id, alert_type, message, threshold_percent)
        VALUES (p_client_id, 'egress_limit', 
                'You have exceeded your free egress limit!', 100);
    ELSEIF v_usage_percent >= 90 THEN
        IF NOT EXISTS (
            SELECT 1 FROM alerts
            WHERE client_id = p_client_id
              AND alert_type = 'egress_warning'
              AND threshold_percent = 90
              AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
        ) THEN
            INSERT INTO alerts (client_id, alert_type, message, threshold_percent)
            VALUES (p_client_id, 'egress_warning', 
                   'You have used 90% of your free egress limit', 90);
        END IF;
    ELSEIF v_usage_percent >= 80 THEN
        IF NOT EXISTS (
            SELECT 1 FROM alerts
            WHERE client_id = p_client_id
              AND alert_type = 'egress_warning'
              AND threshold_percent = 80
              AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
        ) THEN
            INSERT INTO alerts (client_id, alert_type, message, threshold_percent)
            VALUES (p_client_id, 'egress_warning', 
                   'You have used 80% of your free egress limit', 80);
        END IF;
    END IF;
END$$

-- Procedure to reset monthly egress alerts (run as cron job on 1st of month)
CREATE PROCEDURE reset_monthly_egress()
BEGIN
    -- Clear old monthly alerts (keep current month)
    DELETE FROM alerts
    WHERE alert_type IN ('egress_warning', 'egress_limit')
        AND created_at < DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00');
    
    -- Note: egress_usage table maintains historical data, no reset needed
    
    -- Log the reset
    INSERT INTO activity_logs (user_name, user_role, action, details)
    VALUES ('System', 'admin', 'monthly_egress_reset', 'Monthly egress alerts cleared');
END$$

DELIMITER ;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

DELIMITER $$

-- Trigger to create profile when user is created
CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    INSERT INTO profiles (id, email, name)
    VALUES (NEW.id, NEW.email, NEW.name);
END$$

DELIMITER ;

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Additional composite indexes for common queries
CREATE INDEX idx_files_client_deleted ON files(client_id, deleted_at);
CREATE INDEX idx_activity_logs_user_action ON activity_logs(user_id, action);
CREATE INDEX idx_sessions_user_expires ON user_sessions(user_id, expires_at);

-- =============================================================================
-- VIEWS FOR CONVENIENT QUERIES
-- =============================================================================

-- View for user details with roles
CREATE VIEW v_user_details AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.email_verified,
    u.last_login,
    u.created_at,
    GROUP_CONCAT(ur.role) as roles,
    p.company,
    p.avatar_url
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN profiles p ON u.id = p.id
GROUP BY u.id, u.email, u.name, u.email_verified, u.last_login, u.created_at, p.company, p.avatar_url;

-- View for client statistics with current month egress
CREATE VIEW v_client_stats AS
SELECT 
    c.id,
    c.user_id,
    c.name,
    c.email,
    c.company,
    c.storage_quota_gb,
    c.storage_used_gb,
    COALESCE(e.egress_used_gb, 0) as egress_used_gb,
    c.egress_free_limit_gb,
    c.status,
    c.created_at,
    c.last_active_at,
    ROUND((c.storage_used_gb / c.storage_quota_gb) * 100, 2) as storage_used_percent,
    ROUND((COALESCE(e.egress_used_gb, 0) / c.egress_free_limit_gb) * 100, 2) as egress_used_percent,
    GREATEST(0, COALESCE(e.egress_used_gb, 0) - c.egress_free_limit_gb) as chargeable_egress_gb,
    COUNT(DISTINCT CASE WHEN f.type = 'file' THEN f.id END) as files_count,
    COUNT(DISTINCT CASE WHEN f.type = 'folder' THEN f.id END) as folders_count,
    cs.is_verified as storage_configured
FROM clients c
LEFT JOIN files f ON c.id = f.client_id AND f.deleted_at IS NULL
LEFT JOIN egress_usage e ON c.id = e.client_id AND e.month_year = DATE_FORMAT(NOW(), '%Y-%m')
LEFT JOIN client_storage_config cs ON c.id = cs.client_id
GROUP BY c.id, e.egress_used_gb, cs.is_verified;

-- =============================================================================
-- SECURITY & PERMISSIONS (Optional - uncomment if needed)
-- =============================================================================
-- Create application user and grant permissions
-- Run these commands with appropriate database user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TrueBackup.* TO 'truebackup_app'@'localhost';
-- GRANT EXECUTE ON PROCEDURE TrueBackup.* TO 'truebackup_app'@'localhost';
-- GRANT EXECUTE ON FUNCTION TrueBackup.* TO 'truebackup_app'@'localhost';
