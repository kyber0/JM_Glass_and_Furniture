-- ============================================================
-- Points System Migration
-- Run once against jm_glass_db
-- ============================================================

-- 1. Balance table (one row per user)
CREATE TABLE IF NOT EXISTS user_points (
    user_id    INT PRIMARY KEY,
    balance    INT          NOT NULL DEFAULT 0,
    lifetime   INT          NOT NULL DEFAULT 0,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 2. Audit log
CREATE TABLE IF NOT EXISTS points_transactions (
    txn_id     INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT          NOT NULL,
    order_id   INT          NULL,
    type       ENUM('earn','redeem','reverse') NOT NULL,
    points     INT          NOT NULL,
    note       VARCHAR(255) NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)  REFERENCES users(user_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- 3. Track points per order (safe for MySQL 5.x / early 8.x)
DROP PROCEDURE IF EXISTS add_points_columns;

DELIMITER $$
CREATE PROCEDURE add_points_columns()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'orders'
          AND COLUMN_NAME  = 'points_redeemed'
    ) THEN
        ALTER TABLE orders ADD COLUMN points_redeemed INT NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'orders'
          AND COLUMN_NAME  = 'points_earned'
    ) THEN
        ALTER TABLE orders ADD COLUMN points_earned INT NOT NULL DEFAULT 0;
    END IF;
END$$
DELIMITER ;

CALL add_points_columns();
DROP PROCEDURE IF EXISTS add_points_columns;
