const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 3306
};

const DB_NAME = process.env.DB_NAME || 'jm_glass_db';

async function connectWithFallback() {
    const ports = [process.env.DB_PORT || 8889, 3306, 8888];
    // Remove duplicates
    const uniquePorts = [...new Set(ports)];

    for (const port of uniquePorts) {
        try {
            console.log(`Trying to connect to MySQL on port ${port}...`);
            const connection = await mysql.createConnection({
                ...dbConfig,
                port: port
            });
            console.log(`✅ Connected successfully on port ${port}!`);
            if (port != dbConfig.port) {
                console.log(`⚠️ IMPORTANT: Your MAMP MySQL is running on port ${port}, but your .env file says ${dbConfig.port}.`);
                console.log(`👉 Please update backend/.env to: DB_PORT=${port}`);
            }
            return connection;
        } catch (error) {
            console.log(`❌ Failed to connect on port ${port}: ${error.code}`);
        }
    }
    throw new Error('Could not connect to MySQL on any common port. Is MAMP running?');
}

async function setupDatabase() {
    let connection;
    try {
        // 1. Connect without Database to Create it
        connection = await connectWithFallback();

        console.log(`Creating database '${DB_NAME}' if it doesn't exist...`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
        await connection.query(`USE \`${DB_NAME}\``);

        console.log('Database selected. Creating tables...');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INT(11) NOT NULL AUTO_INCREMENT,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                phone VARCHAR(20),
                address TEXT,
                role ENUM('customer', 'admin', 'seller') DEFAULT 'customer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS categories (
                category_id INT(11) NOT NULL AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL UNIQUE,
                image_url VARCHAR(255),
                description TEXT,
                PRIMARY KEY (category_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS shops (
                shop_id INT(11) NOT NULL AUTO_INCREMENT,
                user_id INT(11) NOT NULL UNIQUE,
                shop_name VARCHAR(100) NOT NULL,
                description TEXT,
                address TEXT,
                tin_number VARCHAR(50),
                is_verified TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (shop_id),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                product_id INT(11) NOT NULL AUTO_INCREMENT,
                category_id INT(11) NOT NULL,
                shop_id INT(11),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(10, 2) NOT NULL,
                stock_quantity INT(11) DEFAULT 0,
                image_url VARCHAR(255),
                sizes JSON DEFAULT NULL,
                colors JSON DEFAULT NULL,
                specs JSON DEFAULT NULL,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (product_id),
                FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
                FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS orders (
                order_id INT(11) NOT NULL AUTO_INCREMENT,
                user_id INT(11) NOT NULL,
                total_amount DECIMAL(10, 2) NOT NULL,
                status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
                shipping_address TEXT NOT NULL,
                payment_method VARCHAR(50) DEFAULT 'COD',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (order_id),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                item_id INT(11) NOT NULL AUTO_INCREMENT,
                order_id INT(11) NOT NULL,
                product_id INT(11) NOT NULL,
                quantity INT(11) NOT NULL,
                price_at_purchase DECIMAL(10, 2) NOT NULL,
                selected_variant VARCHAR(100),
                PRIMARY KEY (item_id),
                FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(product_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                review_id INT(11) NOT NULL AUTO_INCREMENT,
                user_id INT(11) NOT NULL,
                product_id INT(11) NOT NULL,
                rating INT(1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (review_id),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        console.log('Creating views...');
        await connection.query('DROP VIEW IF EXISTS vw_product_details');

        // Note: Logic fixed for sql_mode=only_full_group_by compatibility by adding ANY_VALUE or grouping
        // But for MAMP default (usually 5.7), it might be lenient. I'll stick to the query.
        await connection.query(`
            CREATE VIEW vw_product_details AS
            SELECT 
                p.product_id,
                p.title,
                p.price,
                p.image_url,
                p.description,
                p.stock_quantity,
                p.sizes,
                p.colors,
                p.specs,
                p.theme,
                p.created_at,
                p.shop_id,
                s.user_id AS owner_id,
                c.name AS category_name,
                c.category_id,
                COALESCE(AVG(r.rating), 0) AS avg_rating,
                COUNT(DISTINCT r.review_id) AS review_count,
                COALESCE(SUM(CASE WHEN o.order_id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS sold_count
            FROM products p
            JOIN categories c ON p.category_id = c.category_id
            JOIN shops s ON p.shop_id = s.shop_id
            LEFT JOIN reviews r ON p.product_id = r.product_id
            LEFT JOIN order_items oi ON p.product_id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.order_id AND o.status != 'cancelled'
            GROUP BY p.product_id, c.name, c.category_id, p.theme
        `);

        await connection.query('DROP VIEW IF EXISTS vw_user_orders');
        await connection.query(`
            CREATE VIEW vw_user_orders AS
            SELECT 
                o.order_id,
                o.user_id,
                o.total_amount,
                o.status,
                o.created_at,
                COUNT(oi.item_id) AS item_count,
                GROUP_CONCAT(p.title SEPARATOR ', ') AS product_titles
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN products p ON oi.product_id = p.product_id
            GROUP BY o.order_id
        `);

        await connection.query('DROP VIEW IF EXISTS vw_seller_dashboard_stats');
        await connection.query(`
            CREATE VIEW vw_seller_dashboard_stats AS
            SELECT 
                s.shop_id,
                s.user_id AS seller_id,
                COALESCE(SUM(o.total_amount), 0) AS total_revenue,
                COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.order_id END) AS pending_orders,
                COUNT(DISTINCT p.product_id) AS total_products
            FROM shops s
            LEFT JOIN products p ON s.shop_id = p.shop_id
            LEFT JOIN order_items oi ON p.product_id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.order_id AND o.status != 'cancelled'
            GROUP BY s.shop_id, s.user_id
        `);

        await connection.query('DROP VIEW IF EXISTS vw_active_handyman_tasks');
        await connection.query(`
            CREATE VIEW vw_active_handyman_tasks AS
            SELECT 
                h.handyman_id,
                h.name AS handyman_name,
                o.order_id,
                o.status AS order_status,
                u.full_name AS customer_name,
                o.shipping_address,
                o.created_at
            FROM handymen h
            JOIN orders o ON h.handyman_id = o.handyman_id
            JOIN users u ON o.user_id = u.user_id
            WHERE o.status NOT IN ('delivered', 'completed', 'cancelled')
        `);

        await connection.query('DROP VIEW IF EXISTS vw_sales_by_month');
        await connection.query(`
            CREATE VIEW vw_sales_by_month AS
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') AS sale_month,
                SUM(total_amount) AS total_revenue,
                COUNT(order_id) AS total_orders
            FROM orders
            WHERE status != 'cancelled'
            GROUP BY sale_month
        `);

        await connection.query('DROP VIEW IF EXISTS vw_top_selling_products');
        await connection.query(`
            CREATE VIEW vw_top_selling_products AS
            SELECT 
                p.product_id, 
                p.title, 
                s.shop_name,
                s.shop_id,
                COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
                COALESCE(SUM(oi.quantity * oi.price_at_purchase), 0) AS total_revenue_generated
            FROM products p
            LEFT JOIN order_items oi ON p.product_id = oi.product_id
            JOIN shops s ON p.shop_id = s.shop_id
            GROUP BY p.product_id, p.title, s.shop_name, s.shop_id
            ORDER BY total_units_sold DESC
        `);

        await connection.query('DROP VIEW IF EXISTS vw_customer_lifetime_value');
        await connection.query(`
            CREATE VIEW vw_customer_lifetime_value AS
            SELECT 
                u.user_id,
                u.full_name,
                u.email,
                COUNT(o.order_id) AS total_orders,
                COALESCE(SUM(o.total_amount), 0) AS lifetime_spent
            FROM users u
            JOIN orders o ON u.user_id = o.user_id
            WHERE o.status = 'delivered' OR o.status = 'completed'
            GROUP BY u.user_id, u.full_name, u.email
            ORDER BY lifetime_spent DESC
        `);

        console.log('Creating stored procedures...');

        await connection.query('DROP PROCEDURE IF EXISTS sp_register_user');
        await connection.query(`
            CREATE PROCEDURE sp_register_user(
                IN p_email VARCHAR(255),
                IN p_password_hash VARCHAR(255),
                IN p_full_name VARCHAR(100),
                IN p_phone VARCHAR(20),
                IN p_address TEXT
            )
            BEGIN
                IF EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Email already exists';
                ELSE
                    INSERT INTO users (email, password_hash, full_name, phone, address)
                    VALUES (p_email, p_password_hash, p_full_name, p_phone, p_address);
                    SELECT LAST_INSERT_ID() AS new_user_id;
                END IF;
            END
        `);

        await connection.query('DROP PROCEDURE IF EXISTS sp_create_order_header');
        await connection.query(`
            CREATE PROCEDURE sp_create_order_header(
                IN p_user_id INT,
                IN p_total_amount DECIMAL(10,2),
                IN p_shipping_address TEXT,
                IN p_payment_method VARCHAR(50)
            )
            BEGIN
                INSERT INTO orders (user_id, total_amount, shipping_address, payment_method, status)
                VALUES (p_user_id, p_total_amount, p_shipping_address, p_payment_method, 'pending');
                SELECT LAST_INSERT_ID() AS new_order_id;
            END
        `);

        await connection.query('DROP PROCEDURE IF EXISTS sp_get_products_by_category');
        await connection.query(`
            CREATE PROCEDURE sp_get_products_by_category(
                IN p_category_name VARCHAR(100)
            )
            BEGIN
                SELECT * FROM vw_product_details
                WHERE category_name = p_category_name OR p_category_name = 'All'
                ORDER BY created_at DESC;
            END
        `);

        await connection.query('DROP PROCEDURE IF EXISTS sp_checkout_cart');
        await connection.query(`
            CREATE PROCEDURE sp_checkout_cart(
                IN p_user_id INT,
                IN p_total_amount DECIMAL(10,2),
                IN p_shipping_address TEXT,
                IN p_payment_method VARCHAR(50)
            )
            BEGIN
                DECLARE new_order_id INT;

                DECLARE EXIT HANDLER FOR SQLEXCEPTION
                BEGIN
                    ROLLBACK;
                    RESIGNAL;
                END;

                START TRANSACTION;

                -- Create Order
                INSERT INTO orders (user_id, total_amount, shipping_address, payment_method, status)
                VALUES (p_user_id, p_total_amount, p_shipping_address, p_payment_method, 'pending');
                SET new_order_id = LAST_INSERT_ID();

                -- Insert Order Items
                INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase, selected_size, selected_color, service_type)
                SELECT new_order_id, c.product_id, c.quantity, p.price, c.selected_size, c.selected_color, c.service_type
                FROM cart_items c
                JOIN products p ON c.product_id = p.product_id
                WHERE c.user_id = p_user_id;

                -- Update Stock
                UPDATE products p
                JOIN cart_items c ON p.product_id = c.product_id
                SET p.stock_quantity = p.stock_quantity - c.quantity
                WHERE c.user_id = p_user_id;

                -- Delete Cart Items
                DELETE FROM cart_items WHERE user_id = p_user_id;

                COMMIT;
                SELECT new_order_id;
            END
        `);

        await connection.query('DROP PROCEDURE IF EXISTS sp_assign_handyman');
        await connection.query(`
            CREATE PROCEDURE sp_assign_handyman(
                IN p_order_id INT,
                IN p_handyman_id INT
            )
            BEGIN
                DECLARE var_user_id INT;

                DECLARE EXIT HANDLER FOR SQLEXCEPTION
                BEGIN
                    ROLLBACK;
                    RESIGNAL;
                END;

                START TRANSACTION;

                -- Update Order
                UPDATE orders SET handyman_id = p_handyman_id WHERE order_id = p_order_id;

                -- Get the customer id for notification
                SELECT user_id INTO var_user_id FROM orders WHERE order_id = p_order_id;

                -- Insert Notification
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (var_user_id, 'Handyman Assigned', CONCAT('A handyman has been assigned to your order #', p_order_id), 'handyman_assigned');

                COMMIT;
            END
        `);

        await connection.query('DROP PROCEDURE IF EXISTS sp_request_customization');
        await connection.query(`
            CREATE PROCEDURE sp_request_customization(
                IN p_user_id INT,
                IN p_shop_id INT,
                IN p_product_type VARCHAR(100),
                IN p_details TEXT
            )
            BEGIN
                DECLARE var_seller_id INT;
                DECLARE new_req_id INT;

                DECLARE EXIT HANDLER FOR SQLEXCEPTION
                BEGIN
                    ROLLBACK;
                    RESIGNAL;
                END;

                START TRANSACTION;

                -- Create Request
                INSERT INTO custom_requests (user_id, shop_id, product_type, details, status)
                VALUES (p_user_id, p_shop_id, p_product_type, p_details, 'pending');
                SET new_req_id = LAST_INSERT_ID();

                -- Get Seller ID
                SELECT user_id INTO var_seller_id FROM shops WHERE shop_id = p_shop_id;

                -- Insert Notification for the seller
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (var_seller_id, 'New Custom Request', CONCAT('You have a new custom request for a ', p_product_type), 'customization_request');

                COMMIT;
                SELECT new_req_id;
            END
        `);

        console.log('Seeding initial data...');
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM categories');
        if (rows[0].count === 0) {
            await connection.query(`
                INSERT INTO categories (name, image_url) VALUES 
                ('Window', 'https://images.unsplash.com/photo-1503708928676-1cb796a0891e'),
                ('Door', 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e'),
                ('Cabinets', 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f'),
                ('Sink', 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a'),
                ('Shower Enclosure', 'https://images.unsplash.com/photo-1620626011761-996317b8d101');
            `);
            console.log('Categories seeded.');
        }

        console.log('✅ Database setup completed successfully!');
        console.log('🚀 You can now run "npm start" to start the server.');

    } catch (error) {
        console.error('❌ Database setup failed:', error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

setupDatabase();
