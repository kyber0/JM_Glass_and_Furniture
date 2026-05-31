-- phpMyAdmin SQL Dump
-- version 5.1.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:8889
-- Generation Time: Apr 23, 2026 at 04:11 AM
-- Server version: 5.7.24
-- PHP Version: 8.3.1

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `jm_glass_db`
--

DELIMITER $$
--
-- Procedures
--
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_assign_handyman` (IN `p_order_id` INT, IN `p_handyman_id` INT)   BEGIN
    DECLARE var_user_id INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;

    -- Remove any previous assignment for this order (one active handyman rule)
    DELETE FROM order_handymen WHERE order_id = p_order_id;

    -- Record the new assignment in the junction table
    INSERT INTO order_handymen (order_id, handyman_id)
    VALUES (p_order_id, p_handyman_id);

    -- Get customer id for notification
    SELECT user_id INTO var_user_id FROM orders WHERE order_id = p_order_id;

    -- Notify customer
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
        var_user_id,
        'Handyman Assigned',
        CONCAT('A handyman has been assigned to your order #', p_order_id),
        'handyman_assigned'
    );

    COMMIT;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_checkout_cart` (IN `p_user_id` INT, IN `p_total_amount` DECIMAL(10,2), IN `p_shipping_address` TEXT, IN `p_payment_method` VARCHAR(50))   BEGIN
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
            END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_create_order_header` (IN `p_user_id` INT, IN `p_total_amount` DECIMAL(10,2), IN `p_shipping_address` TEXT, IN `p_payment_method` VARCHAR(50), IN `p_voucher_code` VARCHAR(50), IN `p_discount_amount` DECIMAL(10,2))   BEGIN
                INSERT INTO orders (user_id, total_amount, shipping_address, payment_method, status, voucher_code, discount_amount)
                VALUES (p_user_id, p_total_amount, p_shipping_address, p_payment_method, 'pending', p_voucher_code, p_discount_amount);
                SELECT LAST_INSERT_ID() AS new_order_id;
            END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_get_products_by_category` (IN `p_category_name` VARCHAR(100))   BEGIN
                SELECT * FROM vw_product_details
                WHERE category_name = p_category_name OR p_category_name = 'All'
                ORDER BY created_at DESC;
            END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_get_top_customers` (IN `p_limit` INT)   BEGIN
    -- ── CTE 1 SIMULATION: aggregate customer order stats ──────
    DROP TEMPORARY TABLE IF EXISTS tmp_cte1_customer_orders;
    CREATE TEMPORARY TABLE tmp_cte1_customer_orders AS
    SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.created_at                              AS member_since,
        COUNT(DISTINCT o.order_id)                AS total_orders,
        COALESCE(SUM(o.total_amount),    0)       AS total_spent,
        COALESCE(SUM(o.discount_amount), 0)       AS total_savings
    FROM users u
    LEFT JOIN orders o ON u.user_id = o.user_id
                      AND o.status IN ('delivered', 'completed')
    WHERE u.role = 'customer'
    GROUP BY u.user_id, u.full_name, u.email, u.created_at;

    -- ── CTE 2 SIMULATION: add window function columns ─────────
    ALTER TABLE tmp_cte1_customer_orders
        ADD COLUMN spend_rank      INT DEFAULT 0,
        ADD COLUMN order_freq_rank INT DEFAULT 0;

    -- Simulate DENSE_RANK() OVER (ORDER BY total_spent DESC)
    -- Count how many distinct spend values are >= current row
    UPDATE tmp_cte1_customer_orders t1
    SET spend_rank = (
        SELECT COUNT(DISTINCT sub.total_spent)
        FROM (SELECT total_spent FROM tmp_cte1_customer_orders) AS sub
        WHERE sub.total_spent >= t1.total_spent
    );

    -- Simulate ROW_NUMBER() OVER (ORDER BY total_orders DESC)
    UPDATE tmp_cte1_customer_orders t1
    SET order_freq_rank = (
        SELECT COUNT(DISTINCT sub.total_orders)
        FROM (SELECT total_orders FROM tmp_cte1_customer_orders) AS sub
        WHERE sub.total_orders >= t1.total_orders
    );

    -- ── Final SELECT: join with user_points, filter top N ─────
    SELECT
        t.user_id,
        t.full_name,
        t.email,
        t.member_since,
        t.total_orders,
        t.total_spent,
        t.total_savings,
        COALESCE(up.balance, 0) AS current_point_balance,
        t.spend_rank,
        t.order_freq_rank
    FROM tmp_cte1_customer_orders t
    LEFT JOIN user_points up ON t.user_id = up.user_id
    WHERE t.spend_rank <= GREATEST(p_limit, 1)
    ORDER BY t.spend_rank, t.total_orders DESC;

    DROP TEMPORARY TABLE IF EXISTS tmp_cte1_customer_orders;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_product_performance_report` ()   BEGIN
    -- ── CTE 1: revenue per product ────────────────────────────
    DROP TEMPORARY TABLE IF EXISTS tmp_cte1_product_revenue;
    CREATE TEMPORARY TABLE tmp_cte1_product_revenue AS
    SELECT
        p.product_id,
        p.title,
        p.category_id,
        p.shop_id,
        COALESCE(SUM(oi.quantity), 0)                        AS units_sold,
        COALESCE(SUM(oi.quantity * oi.price_at_purchase), 0) AS revenue
    FROM products p
    LEFT JOIN order_items oi ON p.product_id = oi.product_id
    LEFT JOIN orders o       ON oi.order_id  = o.order_id
                             AND o.status NOT IN ('cancelled')
    GROUP BY p.product_id, p.title, p.category_id, p.shop_id;

    -- ── CTE 2: category revenue totals (references CTE 1) ─────
    DROP TEMPORARY TABLE IF EXISTS tmp_cte2_category_totals;
    CREATE TEMPORARY TABLE tmp_cte2_category_totals AS
    SELECT
        category_id,
        SUM(revenue) AS category_revenue
    FROM tmp_cte1_product_revenue
    GROUP BY category_id;

    -- ── CTE 3 / Window columns: add rank columns to CTE 1 ─────
    ALTER TABLE tmp_cte1_product_revenue
        ADD COLUMN rank_in_category  INT DEFAULT 0,
        ADD COLUMN overall_rank      INT DEFAULT 0,
        ADD COLUMN revenue_quartile  INT DEFAULT 0;

    -- Simulate RANK() OVER (PARTITION BY category ORDER BY revenue DESC)
    UPDATE tmp_cte1_product_revenue t1
    SET rank_in_category = (
        SELECT COUNT(*) + 1
        FROM (SELECT product_id, category_id, revenue
              FROM tmp_cte1_product_revenue) AS sub
        WHERE sub.category_id = t1.category_id
          AND sub.revenue > t1.revenue
    );

    -- Simulate RANK() OVER (ORDER BY revenue DESC)
    UPDATE tmp_cte1_product_revenue t1
    SET overall_rank = (
        SELECT COUNT(*) + 1
        FROM (SELECT product_id, revenue
              FROM tmp_cte1_product_revenue) AS sub
        WHERE sub.revenue > t1.revenue
    );

    -- Simulate NTILE(4) OVER (ORDER BY revenue DESC)
    UPDATE tmp_cte1_product_revenue t1
    SET revenue_quartile = LEAST(4,
        1 + FLOOR(
            (SELECT COUNT(*)
             FROM (SELECT revenue FROM tmp_cte1_product_revenue) AS sub
             WHERE sub.revenue > t1.revenue)
            * 4.0
            / NULLIF((SELECT COUNT(*) FROM tmp_cte1_product_revenue), 0)
        )
    );

    -- ── Final SELECT: joins all CTEs + dim tables ──────────────
    SELECT
        pr.product_id,
        pr.title,
        c.name                                           AS category,
        s.shop_name,
        pr.units_sold,
        pr.revenue,
        ROUND(100.0 * pr.revenue
              / NULLIF(ct.category_revenue, 0), 2)      AS pct_of_category_revenue,
        pr.rank_in_category,
        pr.overall_rank,
        pr.revenue_quartile,
        -- Simulate cumulative SUM() OVER (ORDER BY revenue DESC)
        ROUND(
            (SELECT SUM(sub.revenue)
             FROM (SELECT revenue FROM tmp_cte1_product_revenue) AS sub
             WHERE sub.revenue >= pr.revenue)
            * 100.0
            / NULLIF((SELECT SUM(revenue) FROM tmp_cte1_product_revenue), 0)
        , 2) AS cumulative_revenue_pct
    FROM tmp_cte1_product_revenue pr
    JOIN categories c    ON pr.category_id = c.category_id
    JOIN shops      s    ON pr.shop_id     = s.shop_id
    JOIN tmp_cte2_category_totals ct ON pr.category_id = ct.category_id
    ORDER BY pr.overall_rank;

    DROP TEMPORARY TABLE IF EXISTS tmp_cte1_product_revenue;
    DROP TEMPORARY TABLE IF EXISTS tmp_cte2_category_totals;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_register_user` (IN `p_email` VARCHAR(255), IN `p_password_hash` VARCHAR(255), IN `p_full_name` VARCHAR(100), IN `p_phone` VARCHAR(20), IN `p_address` TEXT)   BEGIN
                IF EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Email already exists';
                ELSE
                    INSERT INTO users (email, password_hash, full_name, phone, address)
                    VALUES (p_email, p_password_hash, p_full_name, p_phone, p_address);
                    SELECT LAST_INSERT_ID() AS new_user_id;
                END IF;
            END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_request_customization` (IN `p_user_id` INT, IN `p_shop_id` INT, IN `p_product_type` VARCHAR(100), IN `p_details` TEXT)   BEGIN
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
            END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `activity_logs`
--

CREATE TABLE `activity_logs` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `details` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `activity_logs`
--

INSERT INTO `activity_logs` (`id`, `user_id`, `action`, `details`, `created_at`) VALUES
(1, 9, 'seller_approved', 'Shop \"SAM GLASS SHOP\" approved by admin', '2026-03-10 05:58:42'),
(2, 10, 'seller_approved', 'Shop \"mae\" approved by admin', '2026-03-10 05:58:50'),
(3, 11, 'seller_approved', 'Shop \"JM GLASS\" approved by admin', '2026-03-13 05:25:42');

-- --------------------------------------------------------

--
-- Table structure for table `carousel_banners`
--

CREATE TABLE `carousel_banners` (
  `banner_id` int(11) NOT NULL,
  `image_url` varchar(255) NOT NULL,
  `link_url` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `cart_items`
--

CREATE TABLE `cart_items` (
  `cart_item_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `quantity` int(11) DEFAULT '1',
  `selected_size` varchar(50) DEFAULT NULL,
  `selected_color` varchar(50) DEFAULT NULL,
  `service_type` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `cart_items`
--

INSERT INTO `cart_items` (`cart_item_id`, `user_id`, `product_id`, `quantity`, `selected_size`, `selected_color`, `service_type`, `created_at`) VALUES
(1, 10, 4, 1, 'Medium', 'Transparent', 'Delivery', '2026-04-21 01:30:25');

-- --------------------------------------------------------

--
-- Table structure for table `categories`
--

CREATE TABLE `categories` (
  `category_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `description` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `categories`
--

INSERT INTO `categories` (`category_id`, `name`, `image_url`, `description`) VALUES
(1, 'Window', 'https://images.unsplash.com/photo-1503708928676-1cb796a0891e', NULL),
(2, 'Door', 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e', NULL),
(3, 'Cabinets', 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f', NULL),
(4, 'Sink', 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a', NULL),
(5, 'Shower Enclosure', 'https://images.unsplash.com/photo-1620626011761-996317b8d101', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `custom_requests`
--

CREATE TABLE `custom_requests` (
  `request_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `product_id` int(11) DEFAULT NULL,
  `status` enum('pending','accepted','rejected','completed') DEFAULT 'pending',
  `details` text,
  `budget` decimal(10,2) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `service_type` enum('Delivery','Installation') NOT NULL DEFAULT 'Delivery',
  `images` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `custom_requests`
--

INSERT INTO `custom_requests` (`request_id`, `user_id`, `shop_id`, `product_id`, `status`, `details`, `budget`, `created_at`, `service_type`, `images`) VALUES
(1, 9, 2, 2, 'rejected', 'hehehehs', '200.00', '2026-04-23 11:14:43', 'Delivery', '[\"uploads/custom/custom-1776914083101.jpg\"]');

-- --------------------------------------------------------

--
-- Table structure for table `custom_request_images`
--

CREATE TABLE `custom_request_images` (
  `id` int(11) NOT NULL,
  `request_id` int(11) NOT NULL,
  `image_url` varchar(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `disputes`
--

CREATE TABLE `disputes` (
  `dispute_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `description` text,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `resolution_notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `faqs`
--

CREATE TABLE `faqs` (
  `id` int(11) NOT NULL,
  `question` varchar(255) NOT NULL,
  `answer` text NOT NULL,
  `display_order` int(11) DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `faqs`
--

INSERT INTO `faqs` (`id`, `question`, `answer`, `display_order`, `is_active`, `created_at`) VALUES
(1, 'How do I place an order?', 'To place an order, browse our design themes or categories, select the item you want, click \"Add to Cart,\" and proceed to Checkout. You will be able to review your order details before confirming.', 1, 1, '2026-02-26 03:10:01'),
(2, 'What are the available payment methods?', 'We currently accept Cash on Delivery (COD) and GCash. You can select your preferred payment method during the checkout process.', 2, 1, '2026-02-26 03:10:01'),
(3, 'Can I track my order?', 'Yes! Once your order is confirmed, you can track its status in the \"My Orders\" tab within your Profile or Menu.', 3, 1, '2026-02-26 03:10:01'),
(4, 'How do I become a seller?', 'Go to your Profile and tap \"Become a Seller.\" You will need to upload valid ID and permit images for verification. Once approved, you can start adding your own products.', 4, 1, '2026-02-26 03:10:01'),
(5, 'What is your return policy?', 'If you receive a damaged or incorrect item, please contact our support team immediately. We offer returns or replacements within 7 days of delivery for valid issues.', 5, 1, '2026-02-26 03:10:01');

-- --------------------------------------------------------

--
-- Table structure for table `favorites`
--

CREATE TABLE `favorites` (
  `favorite_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `favorites`
--

INSERT INTO `favorites` (`favorite_id`, `user_id`, `product_id`, `created_at`) VALUES
(2, 9, 2, '2026-04-23 02:48:42'),
(3, 10, 1, '2026-04-23 03:34:59');

-- --------------------------------------------------------

--
-- Table structure for table `handymen`
--

CREATE TABLE `handymen` (
  `handyman_id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` enum('available','busy','off') DEFAULT 'available',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `specialty` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `handymen`
--

INSERT INTO `handymen` (`handyman_id`, `shop_id`, `name`, `phone`, `status`, `created_at`, `specialty`) VALUES
(1, 1, 'Keaneth', '111111111', 'available', '2026-04-23 02:53:20', 'Glass Installation');

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `message_id` int(11) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `receiver_id` int(11) NOT NULL,
  `message` text,
  `is_read` tinyint(4) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `request_id` int(11) DEFAULT NULL,
  `image_url` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `messages`
--

INSERT INTO `messages` (`message_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `request_id`, `image_url`) VALUES
(1, 9, 11, 'hello', 1, '2026-03-13 13:59:41', NULL, NULL),
(2, 11, 9, 'Hello po', 1, '2026-03-13 14:00:19', NULL, NULL),
(3, 10, 9, 'hi', 1, '2026-04-21 10:49:06', NULL, NULL),
(4, 9, 10, 'low', 1, '2026-04-21 10:57:46', NULL, NULL),
(5, 9, 10, 'high', 1, '2026-04-21 11:12:02', NULL, NULL),
(6, 10, 9, 'ina mo', 0, '2026-04-23 10:13:25', NULL, NULL),
(7, 10, 9, 'hstdog', 0, '2026-04-23 10:17:09', NULL, NULL),
(8, 10, 9, 'nyenye', 0, '2026-04-23 10:17:36', NULL, NULL),
(9, 10, 9, 'kkk', 0, '2026-04-23 10:17:50', NULL, NULL),
(10, 10, 9, 'llll', 0, '2026-04-23 10:18:11', NULL, NULL),
(11, 10, 9, 'yahwhahehe', 0, '2026-04-23 11:06:04', NULL, NULL),
(12, 10, 9, 'aalop nako sir', 0, '2026-04-23 11:06:16', NULL, NULL),
(13, 10, 9, 'okay sir', 0, '2026-04-23 11:07:17', NULL, NULL),
(14, 9, 10, 'New Custom Request #1\n\nDetails: hehehehs\nBudget: ₱200\nService: Delivery', 1, '2026-04-23 11:14:43', 1, 'uploads/custom/custom-1776914083101.jpg');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `notification_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('order','promo','message','delivery','system','handyman_assigned','customization_request','shop_order','review') NOT NULL DEFAULT 'system',
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `icon` varchar(50) DEFAULT NULL,
  `icon_color` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reference_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`notification_id`, `user_id`, `type`, `title`, `message`, `is_read`, `icon`, `icon_color`, `created_at`, `reference_id`) VALUES
(1, 9, 'system', '📋 Application Received!', 'Hi Sam Canonce! Your seller application for \"SAM GLASS SHOP\" has been submitted and is now under review. We will notify you once it has been processed.', 1, 'sparkles', '#8D6E63', '2026-03-10 05:57:36', NULL),
(2, 10, 'system', '📋 Application Received!', 'Hi Jaika Bañaria! Your seller application for \"mae\" has been submitted and is now under review. We will notify you once it has been processed.', 1, 'sparkles', '#8D6E63', '2026-03-10 05:57:40', NULL),
(3, 9, 'system', '🎉 Seller Application Approved!', 'Congratulations! Your shop \"SAM GLASS SHOP\" has been approved. You can now log in as a Seller and start selling.', 1, 'sparkles', '#8D6E63', '2026-03-10 05:58:42', 1),
(4, 10, 'system', '🎉 Seller Application Approved!', 'Congratulations! Your shop \"mae\" has been approved. You can now log in as a Seller and start selling.', 1, 'sparkles', '#8D6E63', '2026-03-10 05:58:50', 2),
(5, 11, 'system', '📋 Application Received!', 'Hi Sam Canonce! Your seller application for \"JM GLASS\" has been submitted and is now under review. We will notify you once it has been processed.', 1, 'sparkles', '#8D6E63', '2026-03-13 05:24:36', NULL),
(6, 11, 'system', '🎉 Seller Application Approved!', 'Congratulations! Your shop \"JM GLASS\" has been approved. You can now log in as a Seller and start selling.', 1, 'sparkles', '#8D6E63', '2026-03-13 05:25:42', 3),
(7, 9, 'order', 'Order Confirmed! 🎉', 'Your order #JM-1 for item has been placed successfully.', 1, 'checkmark-circle', '#4CAF50', '2026-03-13 05:51:56', 1),
(8, 11, 'shop_order', 'New Order Received! 🛒', 'Sam Canonce ordered: Modern Window. Order #JM-1.', 1, 'storefront', '#FF9800', '2026-03-13 05:51:56', 1),
(9, 9, 'delivery', 'Order Being Processed 🏭', 'Your order #JM-1 is now being processed by the seller.', 1, 'car', '#2196F3', '2026-03-13 05:54:57', 1),
(10, 9, 'delivery', 'Order Out for Delivery 🚚', 'Great news! Your order #JM-1 is on its way to you.', 1, 'car', '#2196F3', '2026-03-13 05:55:04', 1),
(11, 9, 'order', 'Order Delivered! 🎉', 'Your order #JM-1 has been delivered. Please confirm receipt.', 1, 'checkmark-circle', '#4CAF50', '2026-03-13 05:55:13', 1),
(12, 11, 'message', 'New message from Sam Canonce', 'hello', 1, 'chatbubble-ellipses', '#00BCD4', '2026-03-13 05:59:41', 9),
(13, 9, 'message', 'New message from Sam Canonce', 'Hello po', 1, 'chatbubble-ellipses', '#00BCD4', '2026-03-13 06:00:19', 11),
(14, 9, 'message', 'New message from Jaika Bañaria', 'hi', 1, 'chatbubble-ellipses', '#00BCD4', '2026-04-21 02:49:06', 10),
(15, 10, 'message', 'New message from Sam Canonce', 'low', 1, 'chatbubble-ellipses', '#00BCD4', '2026-04-21 02:57:46', 9),
(16, 10, 'message', 'New message from Sam Canonce', 'high', 1, 'chatbubble-ellipses', '#00BCD4', '2026-04-21 03:12:02', 9),
(17, 9, 'message', 'New message from Jaika Bañaria', 'ina mo', 1, 'chatbubble-ellipses', '#00BCD4', '2026-04-23 02:13:25', 10),
(18, 9, 'message', 'New message from Jaika Bañaria', 'hstdog', 1, 'chatbubble-ellipses', '#00BCD4', '2026-04-23 02:17:09', 10),
(19, 9, 'message', 'New message from Jaika Bañaria', 'nyenye', 1, 'chatbubble-ellipses', '#00BCD4', '2026-04-23 02:17:36', 10),
(20, 9, 'message', 'New message from Jaika Bañaria', 'kkk', 1, 'chatbubble-ellipses', '#00BCD4', '2026-04-23 02:17:50', 10),
(21, 9, 'message', 'New message from Jaika Bañaria', 'llll', 1, 'chatbubble-ellipses', '#00BCD4', '2026-04-23 02:18:11', 10),
(22, 9, 'order', 'Order Confirmed! 🎉', 'Your order #JM-2 for item has been placed successfully.', 1, 'checkmark-circle', '#4CAF50', '2026-04-23 02:46:12', 2),
(23, 10, 'shop_order', 'New Order Received! 🛒', 'Sam Canonce ordered: Wooden Door. Order #JM-2.', 1, 'storefront', '#FF9800', '2026-04-23 02:46:12', 2),
(24, 9, 'message', 'New message from Jaika Bañaria', 'yahwhahehe', 0, 'chatbubble-ellipses', '#00BCD4', '2026-04-23 03:06:04', 10),
(25, 9, 'message', 'New message from Jaika Bañaria', 'aalop nako sir', 0, 'chatbubble-ellipses', '#00BCD4', '2026-04-23 03:06:16', 10),
(26, 9, 'message', 'New message from Jaika Bañaria', 'okay sir', 0, 'chatbubble-ellipses', '#00BCD4', '2026-04-23 03:07:17', 10),
(27, 9, 'system', 'Custom Request Sent', 'Your custom request has been submitted! The seller will review it shortly.', 0, 'sparkles', '#8D6E63', '2026-04-23 03:14:43', 1),
(28, 10, 'system', 'New Custom Request', 'A customer has submitted a new custom Delivery to your shop. Tap to review it.', 1, 'sparkles', '#8D6E63', '2026-04-23 03:14:43', 1),
(29, 10, 'message', 'New message from Sam Canonce', 'New Custom Request #1\n\nDetails: hehehehs\nBudget: ₱200\nServic...', 1, 'chatbubble-ellipses', '#00BCD4', '2026-04-23 03:14:43', 9),
(30, 9, 'system', 'Request Declined', 'Unfortunately, your custom request has been declined by the seller.', 0, 'sparkles', '#8D6E63', '2026-04-23 03:16:31', 1);

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `order_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `status` enum('pending','processing','shipped','delivered','cancelled','completed') NOT NULL DEFAULT 'pending',
  `shipping_address` text NOT NULL,
  `payment_method` varchar(50) DEFAULT 'COD',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `current_lat` decimal(10,8) DEFAULT NULL,
  `current_lng` decimal(11,8) DEFAULT NULL,
  `last_location_update` timestamp NULL DEFAULT NULL,
  `voucher_code` varchar(50) DEFAULT NULL,
  `discount_amount` decimal(10,2) DEFAULT '0.00',
  `points_redeemed` int(11) NOT NULL DEFAULT '0',
  `points_earned` int(11) NOT NULL DEFAULT '0',
  `commission_rate` decimal(5,2) DEFAULT '0.00',
  `commission_amount` decimal(10,2) DEFAULT '0.00',
  `transaction_fee_pct` decimal(5,2) DEFAULT '0.00',
  `transaction_fee_fixed` decimal(10,2) DEFAULT '0.00',
  `transaction_fee_amount` decimal(10,2) DEFAULT '0.00',
  `seller_net` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`order_id`, `user_id`, `total_amount`, `status`, `shipping_address`, `payment_method`, `created_at`, `updated_at`, `current_lat`, `current_lng`, `last_location_update`, `voucher_code`, `discount_amount`, `points_redeemed`, `points_earned`, `commission_rate`, `commission_amount`, `transaction_fee_pct`, `transaction_fee_fixed`, `transaction_fee_amount`, `seller_net`) VALUES
(1, 9, '5500.00', 'delivered', 'Sam Canonce, 09776714630, Buluang Bato Cam Sur', 'Cash on Delivery', '2026-03-13 05:51:56', '2026-03-13 05:55:13', NULL, NULL, NULL, NULL, '0.00', 0, 0, '0.00', '0.00', '0.00', '0.00', '0.00', NULL),
(2, 9, '15500.00', 'pending', 'Sam Canonce, 09776714630, Nabua', 'Cash on Delivery', '2026-04-23 02:46:12', '2026-04-23 02:46:12', NULL, NULL, NULL, NULL, '0.00', 0, 0, '0.00', '0.00', '0.00', '0.00', '0.00', NULL);

--
-- Triggers `orders`
--
DELIMITER $$
CREATE TRIGGER `trg_orders_award_points` AFTER UPDATE ON `orders` FOR EACH ROW BEGIN
  DECLARE v_points INT;

  IF OLD.status <> 'delivered' AND NEW.status = 'delivered' THEN
    -- 1 point per ₱100 (after discount)
    SET v_points = FLOOR((NEW.total_amount - COALESCE(NEW.discount_amount, 0)) / 100);

    IF v_points > 0 THEN
      -- Record the earning transaction
      INSERT INTO points_transactions (user_id, order_id, type, points, note)
      VALUES (
        NEW.user_id, NEW.order_id, 'earn', v_points,
        CONCAT('Earned from Order #JM-', NEW.order_id)
      );

      -- Upsert user_points balance
      INSERT INTO user_points (user_id, balance, lifetime)
      VALUES (NEW.user_id, v_points, v_points)
      ON DUPLICATE KEY UPDATE
        balance  = balance  + v_points,
        lifetime = lifetime + v_points;

      -- Notify customer
      INSERT INTO notifications (user_id, type, title, message, icon, icon_color)
      VALUES (
        NEW.user_id, 'system',
        '⭐ Loyalty Points Earned!',
        CONCAT('You earned ', v_points, ' points from Order #JM-',
               NEW.order_id, '. View your balance in the Rewards section!'),
        'star', '#FFC107'
      );
    END IF;
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_orders_on_cancel` AFTER UPDATE ON `orders` FOR EACH ROW BEGIN
  DECLARE v_earned INT DEFAULT 0;

  IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
    -- Restore stock quantities
    UPDATE products p
      JOIN order_items oi ON p.product_id = oi.product_id
    SET p.stock_quantity = p.stock_quantity + oi.quantity
    WHERE oi.order_id = NEW.order_id;

    -- Check for previously earned points on this order
    SELECT COALESCE(SUM(points), 0)
      INTO v_earned
    FROM points_transactions
    WHERE order_id = NEW.order_id AND type = 'earn';

    IF v_earned > 0 THEN
      INSERT INTO points_transactions (user_id, order_id, type, points, note)
      VALUES (
        NEW.user_id, NEW.order_id, 'reverse', v_earned,
        CONCAT('Reversed for cancelled Order #JM-', NEW.order_id)
      );

      UPDATE user_points
      SET balance = GREATEST(0, balance - v_earned)
      WHERE user_id = NEW.user_id;
    END IF;

    -- Notify customer
    INSERT INTO notifications (user_id, type, title, message, icon, icon_color)
    VALUES (
      NEW.user_id, 'order',
      '❌ Order Cancelled',
      CONCAT('Order #JM-', NEW.order_id, ' cancelled. Stock restored',
             IF(v_earned > 0, CONCAT(' and ', v_earned, ' points reversed.'), '.')),
      'close-circle', '#F44336'
    );
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `order_handymen`
--

CREATE TABLE `order_handymen` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `handyman_id` int(11) NOT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE `order_items` (
  `item_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `price_at_purchase` decimal(10,2) NOT NULL,
  `selected_variant` varchar(100) DEFAULT NULL,
  `request_id` int(11) DEFAULT NULL,
  `selected_size` varchar(50) DEFAULT NULL,
  `selected_color` varchar(50) DEFAULT NULL,
  `selected_service` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `order_items`
--

INSERT INTO `order_items` (`item_id`, `order_id`, `product_id`, `quantity`, `price_at_purchase`, `selected_variant`, `request_id`, `selected_size`, `selected_color`, `selected_service`) VALUES
(1, 1, 4, 1, '5000.00', 'Small - Transparent - Delivery', NULL, 'Small', 'Transparent', 'Delivery'),
(2, 2, 2, 1, '15000.00', 'default - White - Delivery', NULL, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `payment_methods`
--

CREATE TABLE `payment_methods` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('cod','gcash','bank') NOT NULL,
  `label` varchar(100) NOT NULL,
  `account_name` varchar(100) DEFAULT NULL,
  `account_number` varchar(100) DEFAULT NULL,
  `is_default` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `payouts`
--

CREATE TABLE `payouts` (
  `payout_id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `account_name` varchar(100) DEFAULT NULL,
  `account_number` varchar(100) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `platform_settings`
--

CREATE TABLE `platform_settings` (
  `key` varchar(100) NOT NULL,
  `value` text,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `platform_settings`
--

INSERT INTO `platform_settings` (`key`, `value`, `updated_at`) VALUES
('commission_rate', '3.00', '2026-03-04 06:49:27'),
('last_reset_at', '2026-03-10T05:50:45.824Z', '2026-03-10 05:50:45'),
('maintenance_message', 'We are currently under maintenance. Please check back later.', '2026-03-04 06:42:31'),
('maintenance_mode', 'false', '2026-03-04 06:42:31'),
('transaction_fee_fixed', '15.00', '2026-03-04 06:49:27'),
('transaction_fee_pct', '2.00', '2026-03-04 06:49:27');

-- --------------------------------------------------------

--
-- Table structure for table `points_transactions`
--

CREATE TABLE `points_transactions` (
  `txn_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `type` enum('earn','redeem','reverse') NOT NULL,
  `points` int(11) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `product_id` int(11) NOT NULL,
  `category_id` int(11) NOT NULL,
  `theme` varchar(50) DEFAULT NULL,
  `service_type` enum('delivery','installation') NOT NULL DEFAULT 'delivery',
  `title` varchar(255) NOT NULL,
  `description` text,
  `price` decimal(10,2) NOT NULL,
  `stock_quantity` int(11) DEFAULT '0',
  `image_url` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `shop_id` int(11) DEFAULT NULL,
  `sold_count` int(11) DEFAULT '0',
  `is_hidden` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`product_id`, `category_id`, `theme`, `service_type`, `title`, `description`, `price`, `stock_quantity`, `image_url`, `is_active`, `created_at`, `shop_id`, `sold_count`, `is_hidden`) VALUES
(1, 5, 'Modern', 'delivery', 'Modern Shower Glass', 'My shower is good', '5000.00', 5, 'uploads/products/1773122486735.jpeg', 1, '2026-03-10 06:01:27', 1, 0, 0),
(2, 2, 'Modern', 'delivery', 'Wooden Door', 'Modern Wooden Door', '15000.00', 99, 'uploads/products/1776915773800.jpeg', 1, '2026-03-10 06:02:56', 2, 1, 0),
(3, 5, 'Modern', 'delivery', 'Aesthetic Shower Glass', 'My shower head glass cover is classy and modern', '50000.00', 5, 'uploads/products/1773122626191.jpeg', 1, '2026-03-10 06:03:46', 1, 0, 0),
(4, 1, 'Modern', 'delivery', 'Modern Window', 'Aiensjjs', '5000.00', 1, 'uploads/products/1773379906159.jpeg', 1, '2026-03-13 05:31:46', 3, 1, 0),
(5, 2, 'Vintage', 'installation', 'pintuans', 'pintuan iniyo', '1.00', 5, 'uploads/products/1776912977661.jpeg', 1, '2026-04-23 02:56:18', 1, 0, 0);

-- --------------------------------------------------------

--
-- Table structure for table `product_colors`
--

CREATE TABLE `product_colors` (
  `product_id` int(11) NOT NULL,
  `color` varchar(50) NOT NULL,
  `stock` int(11) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `product_colors`
--

INSERT INTO `product_colors` (`product_id`, `color`, `stock`) VALUES
(1, 'Transparent', 0),
(2, 'Black', 50),
(2, 'White', 49),
(3, 'Blue', 0),
(4, 'Transparent', 0),
(5, 'Black', 1),
(5, 'Mink', 1),
(5, 'Miolet', 1),
(5, 'Mlue', 1),
(5, 'Puti', 1);

-- --------------------------------------------------------

--
-- Table structure for table `product_images`
--

CREATE TABLE `product_images` (
  `image_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `image_url` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `product_images`
--

INSERT INTO `product_images` (`image_id`, `product_id`, `image_url`) VALUES
(1, 1, 'uploads/products/1773122486735.jpeg'),
(3, 3, 'uploads/products/1773122626191.jpeg'),
(4, 4, 'uploads/products/1773379906159.jpeg'),
(5, 5, 'uploads/products/1776912977661.jpeg'),
(6, 5, 'uploads/products/1776912977983.jpeg'),
(7, 5, 'uploads/products/1776912978080.jpeg'),
(9, 2, 'uploads/products/1776915043059.jpeg'),
(10, 2, 'uploads/products/1776915773800.jpeg');

-- --------------------------------------------------------

--
-- Table structure for table `product_sizes`
--

CREATE TABLE `product_sizes` (
  `product_id` int(11) NOT NULL,
  `size` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `product_sizes`
--

INSERT INTO `product_sizes` (`product_id`, `size`) VALUES
(1, 'Small'),
(2, 'default'),
(3, 'Medium'),
(3, 'Small'),
(4, 'Medium'),
(4, 'Small'),
(5, 'Larj'),
(5, 'Midyom'),
(5, 'Smol');

-- --------------------------------------------------------

--
-- Table structure for table `product_specs`
--

CREATE TABLE `product_specs` (
  `product_id` int(11) NOT NULL,
  `spec_label` varchar(100) NOT NULL,
  `spec_value` varchar(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `product_specs`
--

INSERT INTO `product_specs` (`product_id`, `spec_label`, `spec_value`) VALUES
(1, 'Tempered', 'Glass'),
(3, 'Glass', 'Military'),
(4, 'Material', 'Glass'),
(5, 'Material', 'Kawoy'),
(5, 'Warranty', '2yirs');

-- --------------------------------------------------------

--
-- Table structure for table `reported_problems`
--

CREATE TABLE `reported_problems` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `issue_type` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `status` enum('pending','reviewed','resolved') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `reviews`
--

CREATE TABLE `reviews` (
  `review_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `rating` int(1) NOT NULL,
  `comment` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `image_url` varchar(255) DEFAULT NULL,
  `seller_reply` text,
  `replied_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Triggers `reviews`
--
DELIMITER $$
CREATE TRIGGER `trg_after_review_insert` AFTER INSERT ON `reviews` FOR EACH ROW BEGIN
  DECLARE v_seller_id    INT;
  DECLARE v_product_name VARCHAR(255);
  DECLARE v_stars        VARCHAR(10);

  SELECT s.user_id, p.title
    INTO v_seller_id, v_product_name
  FROM products p
  JOIN shops s ON p.shop_id = s.shop_id
  WHERE p.product_id = NEW.product_id;

  SET v_stars = REPEAT('★', NEW.rating);

  INSERT INTO notifications
    (user_id, type, title, message, icon, icon_color, reference_id)
  VALUES (
    v_seller_id, 'review',
    '⭐ New Product Review!',
    CONCAT(v_stars, ' (', NEW.rating, '/5) on "', v_product_name, '": ',
           IF(NEW.comment IS NOT NULL AND NEW.comment <> '',
              CONCAT('"', LEFT(NEW.comment, 80), '"'),
              '(no comment)')),
    'star', '#FF9800', NEW.review_id
  );

  INSERT INTO activity_logs (user_id, action, details)
  VALUES (
    NEW.user_id, 'review_submitted',
    CONCAT('Rating: ', NEW.rating, '★ on product_id=', NEW.product_id)
  );
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `review_tags`
--

CREATE TABLE `review_tags` (
  `review_id` int(11) NOT NULL,
  `tag` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `shops`
--

CREATE TABLE `shops` (
  `shop_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `shop_name` varchar(100) NOT NULL,
  `description` text,
  `address` text,
  `tin_number` varchar(50) DEFAULT NULL,
  `is_verified` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `logo_url` varchar(255) DEFAULT NULL,
  `id_image` varchar(255) DEFAULT NULL,
  `permit_image` varchar(255) DEFAULT NULL,
  `status` enum('pending','active','rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `shops`
--

INSERT INTO `shops` (`shop_id`, `user_id`, `shop_name`, `description`, `address`, `tin_number`, `is_verified`, `created_at`, `logo_url`, `id_image`, `permit_image`, `status`, `rejection_reason`) VALUES
(1, 9, 'SAM GLASS SHOP', 'My shop is about me', 'Corner, Norberto boncayao st, Baao, Bicol, Philippines', '123456', 0, '2026-03-10 05:57:36', NULL, 'uploads/shop-ids/id_image-1773122254872.jpeg', 'uploads/shop-ids/permit_image-1773122255763.jpeg', 'active', NULL),
(2, 10, 'mae', 'jexidj', 'Corner, Norberto boncayao st, Baao, Bicol, Philippines', '6238649497', 0, '2026-03-10 05:57:40', NULL, 'uploads/shop-ids/id_image-1773122259063.jpeg', 'uploads/shop-ids/permit_image-1773122259601.jpeg', 'active', NULL),
(3, 11, 'JM GLASS', 'Glass shop', 'Corner, Norberto boncayao st, Baao, Bicol, Philippines', '1626131316', 0, '2026-03-13 05:24:36', NULL, 'uploads/shop-ids/id_image-1773379474063.jpeg', 'uploads/shop-ids/permit_image-1773379475865.jpeg', 'active', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `stock_alerts`
--

CREATE TABLE `stock_alerts` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `user_id` int(11) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `profile_image` varchar(255) DEFAULT NULL,
  `address` text,
  `role` enum('customer','admin','seller') DEFAULT 'customer',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `referral_code` varchar(20) DEFAULT NULL,
  `referred_by_code` varchar(20) DEFAULT NULL,
  `referral_rewarded` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`user_id`, `email`, `password_hash`, `full_name`, `phone`, `profile_image`, `address`, `role`, `created_at`, `is_active`, `referral_code`, `referred_by_code`, `referral_rewarded`) VALUES
(5, 'admin123@gmail.com', '$2a$10$UZh3NrOpBEbuh.tbwzAfOuI2GCeQSQpXRV9SnAts7pPezWEhGSnz2', 'Administrator', NULL, NULL, NULL, 'admin', '2026-02-27 15:48:54', 1, 'JM-E4DA3B', NULL, 0),
(9, 'canoncesam76@gmail.com', '$2a$10$jsuLx9lGgk8oprOESdY8Wepx9hcIEyFRQ/81SFaO6RHxdtPPaBgX2', 'Sam Canonce', '09776714630', NULL, 'Corner, Norberto boncayao st, Baao, Bicol, Philippines', 'seller', '2026-03-10 05:55:36', 1, 'JM-00009', NULL, 0),
(10, 'jaibanaria@my.cspc.edu.ph', '$2a$10$dgug.zGUJme0GJrgxMQMsO8upAR6C6juuBpuXFZS2kONo4G.iDcx6', 'Jaika Bañaria', '09982782033', 'uploads/profiles/profile-1776916611544.jpg', 'Corner, Norberto boncayao st, Baao, Bicol, Philippines', 'seller', '2026-03-10 05:56:08', 1, 'JM-0000A', NULL, 0),
(11, 'canoncesam11@gmail.com', '$2a$10$SDcHn2N7B.Ht7AM.P/9uMubDiWbL/6AtW3ntb8byJiq34S0To1OMO', 'Sam Canonce', '09776714639', NULL, 'Corner, Norberto boncayao st, Baao, Bicol, Philippines', 'seller', '2026-03-13 05:22:48', 1, 'JM-0000B', NULL, 0);

-- --------------------------------------------------------

--
-- Table structure for table `user_addresses`
--

CREATE TABLE `user_addresses` (
  `address_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `address` text NOT NULL,
  `label` varchar(50) DEFAULT 'Home',
  `is_default` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `user_addresses`
--

INSERT INTO `user_addresses` (`address_id`, `user_id`, `full_name`, `phone`, `address`, `label`, `is_default`, `created_at`) VALUES
(1, 9, 'Sam Canonce', '09776714630', 'Buluang Bato Cam Sur', 'Home', 1, '2026-03-13 05:51:23'),
(2, 9, 'Sam Canonce', '09776714630', 'Nabua', 'Home', 0, '2026-04-23 02:44:55');

-- --------------------------------------------------------

--
-- Table structure for table `user_points`
--

CREATE TABLE `user_points` (
  `user_id` int(11) NOT NULL,
  `balance` int(11) NOT NULL DEFAULT '0',
  `lifetime` int(11) NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `user_points`
--

INSERT INTO `user_points` (`user_id`, `balance`, `lifetime`, `updated_at`) VALUES
(9, 0, 0, '2026-03-10 05:59:02'),
(10, 0, 0, '2026-04-23 03:56:18');

-- --------------------------------------------------------

--
-- Table structure for table `user_vouchers`
--

CREATE TABLE `user_vouchers` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `voucher_code` varchar(50) CHARACTER SET utf8 NOT NULL,
  `claimed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_used` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vouchers`
--

CREATE TABLE `vouchers` (
  `voucher_id` int(11) NOT NULL,
  `code` varchar(50) NOT NULL,
  `discount_type` varchar(20) NOT NULL DEFAULT 'percentage',
  `discount_value` decimal(10,2) NOT NULL,
  `min_spend` decimal(10,2) DEFAULT '0.00',
  `max_discount` decimal(10,2) DEFAULT NULL,
  `usage_limit` int(11) DEFAULT NULL,
  `used_count` int(11) DEFAULT '0',
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_active_handyman_tasks`
-- (See below for the actual view)
--
CREATE TABLE `vw_active_handyman_tasks` (
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_customer_lifetime_value`
-- (See below for the actual view)
--
CREATE TABLE `vw_customer_lifetime_value` (
`user_id` int(11)
,`full_name` varchar(100)
,`email` varchar(255)
,`total_orders` bigint(21)
,`lifetime_spent` decimal(32,2)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_customer_ranking`
-- (See below for the actual view)
--
CREATE TABLE `vw_customer_ranking` (
`user_id` int(11)
,`full_name` varchar(100)
,`email` varchar(255)
,`member_since` timestamp
,`total_orders` bigint(21)
,`lifetime_spent` decimal(32,2)
,`current_points` bigint(11)
,`lifetime_points` bigint(11)
,`spend_rank` bigint(22)
,`beats_pct_of_customers` decimal(25,1)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_monthly_revenue_running_total`
-- (See below for the actual view)
--
CREATE TABLE `vw_monthly_revenue_running_total` (
`sale_month` varchar(7)
,`monthly_revenue` decimal(32,2)
,`order_count` bigint(21)
,`running_total` decimal(54,2)
,`pct_of_total_revenue` decimal(38,2)
,`prev_month_revenue` decimal(32,2)
,`mom_growth_pct` decimal(39,2)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_product_details`
-- (See below for the actual view)
--
CREATE TABLE `vw_product_details` (
`product_id` int(11)
,`title` varchar(255)
,`price` decimal(10,2)
,`image_url` varchar(255)
,`description` text
,`stock_quantity` int(11)
,`theme` varchar(50)
,`service_type` enum('delivery','installation')
,`is_active` tinyint(1)
,`created_at` timestamp
,`shop_id` int(11)
,`owner_id` int(11)
,`category_name` varchar(100)
,`category_id` int(11)
,`avg_rating` decimal(14,4)
,`review_count` bigint(21)
,`sold_count` decimal(32,0)
,`sizes` varchar(258)
,`colors` varchar(258)
,`specs` varchar(258)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_product_sales_rank`
-- (See below for the actual view)
--
CREATE TABLE `vw_product_sales_rank` (
`product_id` int(11)
,`title` varchar(255)
,`category_name` varchar(100)
,`category_id` int(11)
,`shop_name` varchar(100)
,`total_units_sold` decimal(32,0)
,`total_revenue` decimal(42,2)
,`rank_in_category` bigint(22)
,`overall_revenue_rank` bigint(22)
,`revenue_quartile` decimal(17,0)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_sales_by_month`
-- (See below for the actual view)
--
CREATE TABLE `vw_sales_by_month` (
`sale_month` varchar(7)
,`total_revenue` decimal(32,2)
,`total_orders` bigint(21)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_seller_dashboard_stats`
-- (See below for the actual view)
--
CREATE TABLE `vw_seller_dashboard_stats` (
`shop_id` int(11)
,`seller_id` int(11)
,`total_revenue` decimal(32,2)
,`pending_orders` bigint(21)
,`total_products` bigint(21)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_seller_monthly_growth`
-- (See below for the actual view)
--
CREATE TABLE `vw_seller_monthly_growth` (
`shop_id` int(11)
,`shop_name` varchar(100)
,`sale_month` varchar(7)
,`current_revenue` decimal(32,2)
,`orders_count` bigint(21)
,`prev_month_revenue` decimal(32,2)
,`prev_month_orders` bigint(21)
,`revenue_growth_pct` decimal(39,2)
,`best_month_rank` bigint(22)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_top_selling_products`
-- (See below for the actual view)
--
CREATE TABLE `vw_top_selling_products` (
`product_id` int(11)
,`title` varchar(255)
,`shop_name` varchar(100)
,`shop_id` int(11)
,`total_units_sold` decimal(32,0)
,`total_revenue_generated` decimal(42,2)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_user_orders`
-- (See below for the actual view)
--
CREATE TABLE `vw_user_orders` (
`order_id` int(11)
,`user_id` int(11)
,`total_amount` decimal(10,2)
,`status` enum('pending','processing','shipped','delivered','cancelled','completed')
,`created_at` timestamp
,`item_count` bigint(21)
,`product_titles` text
);

-- --------------------------------------------------------

--
-- Structure for view `vw_active_handyman_tasks`
--
DROP TABLE IF EXISTS `vw_active_handyman_tasks`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_active_handyman_tasks`  AS SELECT `h`.`handyman_id` AS `handyman_id`, `h`.`name` AS `handyman_name`, `o`.`order_id` AS `order_id`, `o`.`status` AS `order_status`, `u`.`full_name` AS `customer_name`, `o`.`shipping_address` AS `shipping_address`, `o`.`created_at` AS `created_at` FROM ((`handymen` `h` join `orders` `o` on((`h`.`handyman_id` = `o`.`handyman_id`))) join `users` `u` on((`o`.`user_id` = `u`.`user_id`))) WHERE (`o`.`status` not in ('delivered','completed','cancelled'))  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_customer_lifetime_value`
--
DROP TABLE IF EXISTS `vw_customer_lifetime_value`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_customer_lifetime_value`  AS SELECT `u`.`user_id` AS `user_id`, `u`.`full_name` AS `full_name`, `u`.`email` AS `email`, count(`o`.`order_id`) AS `total_orders`, coalesce(sum(`o`.`total_amount`),0) AS `lifetime_spent` FROM (`users` `u` join `orders` `o` on((`u`.`user_id` = `o`.`user_id`))) WHERE ((`o`.`status` = 'delivered') OR (`o`.`status` = 'completed')) GROUP BY `u`.`user_id`, `u`.`full_name`, `u`.`email` ORDER BY `lifetime_spent` AS `DESCdesc` ASC  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_customer_ranking`
--
DROP TABLE IF EXISTS `vw_customer_ranking`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_customer_ranking`  AS SELECT `u`.`user_id` AS `user_id`, `u`.`full_name` AS `full_name`, `u`.`email` AS `email`, `u`.`created_at` AS `member_since`, count(distinct `o`.`order_id`) AS `total_orders`, coalesce(sum(`o`.`total_amount`),0) AS `lifetime_spent`, coalesce(`up`.`balance`,0) AS `current_points`, coalesce(`up`.`lifetime`,0) AS `lifetime_points`, (select (count(distinct `sub`.`spent`) + 1) from (select `u2`.`user_id` AS `user_id`,coalesce(sum(`o2`.`total_amount`),0) AS `spent` from (`users` `u2` left join `orders` `o2` on(((`u2`.`user_id` = `o2`.`user_id`) and (`o2`.`status` in ('delivered','completed'))))) where (`u2`.`role` = 'customer') group by `u2`.`user_id`) `sub` where (`sub`.`spent` > coalesce(sum(`o`.`total_amount`),0))) AS `spend_rank`, round((((select count(0) from (select `u2`.`user_id` AS `user_id`,coalesce(sum(`o2`.`total_amount`),0) AS `spent` from (`users` `u2` left join `orders` `o2` on(((`u2`.`user_id` = `o2`.`user_id`) and (`o2`.`status` in ('delivered','completed'))))) where (`u2`.`role` = 'customer') group by `u2`.`user_id`) `sub2` where (`sub2`.`spent` < coalesce(sum(`o`.`total_amount`),0))) * 100.0) / nullif(((select count(0) from `users` where (`users`.`role` = 'customer')) - 1),0)),1) AS `beats_pct_of_customers` FROM ((`users` `u` left join `orders` `o` on(((`u`.`user_id` = `o`.`user_id`) and (`o`.`status` in ('delivered','completed'))))) left join `user_points` `up` on((`u`.`user_id` = `up`.`user_id`))) WHERE (`u`.`role` = 'customer') GROUP BY `u`.`user_id`, `u`.`full_name`, `u`.`email`, `u`.`created_at`, `up`.`balance`, `up`.`lifetime``lifetime`  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_monthly_revenue_running_total`
--
DROP TABLE IF EXISTS `vw_monthly_revenue_running_total`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_monthly_revenue_running_total`  AS SELECT `m`.`sale_month` AS `sale_month`, `m`.`monthly_revenue` AS `monthly_revenue`, `m`.`order_count` AS `order_count`, (select sum(`m2`.`monthly_revenue`) from (select date_format(`orders`.`created_at`,'%Y-%m') AS `sm`,sum(`orders`.`total_amount`) AS `monthly_revenue` from `orders` where (`orders`.`status` <> 'cancelled') group by date_format(`orders`.`created_at`,'%Y-%m')) `m2` where (`m2`.`sm` <= `m`.`sale_month`)) AS `running_total`, round(((100.0 * `m`.`monthly_revenue`) / nullif((select sum(`orders`.`total_amount`) from `orders` where (`orders`.`status` <> 'cancelled')),0)),2) AS `pct_of_total_revenue`, (select sum(`o2`.`total_amount`) from `orders` `o2` where ((`o2`.`status` <> 'cancelled') and (date_format(`o2`.`created_at`,'%Y-%m') = (select max(date_format(`o3`.`created_at`,'%Y-%m')) from `orders` `o3` where ((`o3`.`status` <> 'cancelled') and (date_format(`o3`.`created_at`,'%Y-%m') < `m`.`sale_month`)))))) AS `prev_month_revenue`, round(((100.0 * (`m`.`monthly_revenue` - coalesce((select sum(`o2`.`total_amount`) from `orders` `o2` where ((`o2`.`status` <> 'cancelled') and (date_format(`o2`.`created_at`,'%Y-%m') = (select max(date_format(`o3`.`created_at`,'%Y-%m')) from `orders` `o3` where ((`o3`.`status` <> 'cancelled') and (date_format(`o3`.`created_at`,'%Y-%m') < `m`.`sale_month`)))))),0))) / nullif((select sum(`o2`.`total_amount`) from `orders` `o2` where ((`o2`.`status` <> 'cancelled') and (date_format(`o2`.`created_at`,'%Y-%m') = (select max(date_format(`o3`.`created_at`,'%Y-%m')) from `orders` `o3` where ((`o3`.`status` <> 'cancelled') and (date_format(`o3`.`created_at`,'%Y-%m') < `m`.`sale_month`)))))),0)),2) AS `mom_growth_pct` FROM (select date_format(`orders`.`created_at`,'%Y-%m') AS `sale_month`,sum(`orders`.`total_amount`) AS `monthly_revenue`,count(`orders`.`order_id`) AS `order_count` from `orders` where (`orders`.`status` <> 'cancelled') group by date_format(`orders`.`created_at`,'%Y-%m')) AS `m``m`  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_product_details`
--
DROP TABLE IF EXISTS `vw_product_details`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_product_details`  AS SELECT `p`.`product_id` AS `product_id`, `p`.`title` AS `title`, `p`.`price` AS `price`, `p`.`image_url` AS `image_url`, `p`.`description` AS `description`, `p`.`stock_quantity` AS `stock_quantity`, `p`.`theme` AS `theme`, `p`.`service_type` AS `service_type`, `p`.`is_active` AS `is_active`, `p`.`created_at` AS `created_at`, `p`.`shop_id` AS `shop_id`, `s`.`user_id` AS `owner_id`, `c`.`name` AS `category_name`, `c`.`category_id` AS `category_id`, coalesce(avg(`r`.`rating`),0) AS `avg_rating`, count(distinct `r`.`review_id`) AS `review_count`, coalesce(sum((case when (`o`.`order_id` is not null) then `oi`.`quantity` else 0 end)),0) AS `sold_count`, (select concat('[',group_concat(concat('"',`ps`.`size`,'"') separator ','),']') from `product_sizes` `ps` where (`ps`.`product_id` = `p`.`product_id`)) AS `sizes`, (select concat('[',group_concat(concat('{"color":"',`pc`.`color`,'","stock":',coalesce(`pc`.`stock`,0),'}') separator ','),']') from `product_colors` `pc` where (`pc`.`product_id` = `p`.`product_id`)) AS `colors`, (select concat('[',group_concat(concat('{"label":"',`psp`.`spec_label`,'","value":"',`psp`.`spec_value`,'"}') separator ','),']') from `product_specs` `psp` where (`psp`.`product_id` = `p`.`product_id`)) AS `specs` FROM (((((`products` `p` join `categories` `c` on((`p`.`category_id` = `c`.`category_id`))) join `shops` `s` on((`p`.`shop_id` = `s`.`shop_id`))) left join `reviews` `r` on((`p`.`product_id` = `r`.`product_id`))) left join `order_items` `oi` on((`p`.`product_id` = `oi`.`product_id`))) left join `orders` `o` on(((`oi`.`order_id` = `o`.`order_id`) and (`o`.`status` <> 'cancelled')))) GROUP BY `p`.`product_id`, `c`.`name`, `c`.`category_id`, `s`.`user_id`, `p`.`service_type``service_type`  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_product_sales_rank`
--
DROP TABLE IF EXISTS `vw_product_sales_rank`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_product_sales_rank`  AS SELECT `base`.`product_id` AS `product_id`, `base`.`title` AS `title`, `base`.`category_name` AS `category_name`, `base`.`category_id` AS `category_id`, `base`.`shop_name` AS `shop_name`, `base`.`total_units_sold` AS `total_units_sold`, `base`.`total_revenue` AS `total_revenue`, (select (count(0) + 1) from (select `p2`.`product_id` AS `product_id`,`p2`.`category_id` AS `category_id`,coalesce(sum(`oi2`.`quantity`),0) AS `qty` from ((`products` `p2` left join `order_items` `oi2` on((`p2`.`product_id` = `oi2`.`product_id`))) left join `orders` `o2` on(((`oi2`.`order_id` = `o2`.`order_id`) and (`o2`.`status` <> 'cancelled')))) group by `p2`.`product_id`,`p2`.`category_id`) `agg` where ((`agg`.`category_id` = `base`.`category_id`) and (`agg`.`qty` > `base`.`total_units_sold`))) AS `rank_in_category`, (select (count(0) + 1) from (select `p2`.`product_id` AS `product_id`,coalesce(sum((`oi2`.`quantity` * `oi2`.`price_at_purchase`)),0) AS `rev` from ((`products` `p2` left join `order_items` `oi2` on((`p2`.`product_id` = `oi2`.`product_id`))) left join `orders` `o2` on(((`oi2`.`order_id` = `o2`.`order_id`) and (`o2`.`status` <> 'cancelled')))) group by `p2`.`product_id`) `agg2` where (`agg2`.`rev` > `base`.`total_revenue`)) AS `overall_revenue_rank`, least(4,(1 + floor((((select count(0) from (select `p2`.`product_id` AS `product_id`,coalesce(sum((`oi2`.`quantity` * `oi2`.`price_at_purchase`)),0) AS `rev` from ((`products` `p2` left join `order_items` `oi2` on((`p2`.`product_id` = `oi2`.`product_id`))) left join `orders` `o2` on(((`oi2`.`order_id` = `o2`.`order_id`) and (`o2`.`status` <> 'cancelled')))) group by `p2`.`product_id`) `agg3` where (`agg3`.`rev` > `base`.`total_revenue`)) * 4.0) / nullif((select count(0) from `products`),0))))) AS `revenue_quartile` FROM (select `p`.`product_id` AS `product_id`,`p`.`title` AS `title`,`c`.`name` AS `category_name`,`p`.`category_id` AS `category_id`,`s`.`shop_name` AS `shop_name`,coalesce(sum(`oi`.`quantity`),0) AS `total_units_sold`,coalesce(sum((`oi`.`quantity` * `oi`.`price_at_purchase`)),0) AS `total_revenue` from ((((`products` `p` join `categories` `c` on((`p`.`category_id` = `c`.`category_id`))) join `shops` `s` on((`p`.`shop_id` = `s`.`shop_id`))) left join `order_items` `oi` on((`p`.`product_id` = `oi`.`product_id`))) left join `orders` `o` on(((`oi`.`order_id` = `o`.`order_id`) and (`o`.`status` <> 'cancelled')))) group by `p`.`product_id`,`p`.`title`,`c`.`name`,`p`.`category_id`,`s`.`shop_name`) AS `base``base`  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_sales_by_month`
--
DROP TABLE IF EXISTS `vw_sales_by_month`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_sales_by_month`  AS SELECT date_format(`orders`.`created_at`,'%Y-%m') AS `sale_month`, sum(`orders`.`total_amount`) AS `total_revenue`, count(`orders`.`order_id`) AS `total_orders` FROM `orders` WHERE (`orders`.`status` <> 'cancelled') GROUP BY `sale_month``sale_month`  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_seller_dashboard_stats`
--
DROP TABLE IF EXISTS `vw_seller_dashboard_stats`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_seller_dashboard_stats`  AS SELECT `s`.`shop_id` AS `shop_id`, `s`.`user_id` AS `seller_id`, coalesce(sum(`o`.`total_amount`),0) AS `total_revenue`, count(distinct (case when (`o`.`status` = 'pending') then `o`.`order_id` end)) AS `pending_orders`, count(distinct `p`.`product_id`) AS `total_products` FROM (((`shops` `s` left join `products` `p` on((`s`.`shop_id` = `p`.`shop_id`))) left join `order_items` `oi` on((`p`.`product_id` = `oi`.`product_id`))) left join `orders` `o` on(((`oi`.`order_id` = `o`.`order_id`) and (`o`.`status` <> 'cancelled')))) GROUP BY `s`.`shop_id`, `s`.`user_id``user_id`  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_seller_monthly_growth`
--
DROP TABLE IF EXISTS `vw_seller_monthly_growth`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_seller_monthly_growth`  AS SELECT `curr`.`shop_id` AS `shop_id`, `curr`.`shop_name` AS `shop_name`, `curr`.`sale_month` AS `sale_month`, `curr`.`revenue` AS `current_revenue`, `curr`.`orders_count` AS `orders_count`, `prev`.`revenue` AS `prev_month_revenue`, `prev`.`orders_count` AS `prev_month_orders`, round(((100.0 * (`curr`.`revenue` - coalesce(`prev`.`revenue`,0))) / nullif(`prev`.`revenue`,0)),2) AS `revenue_growth_pct`, (select (count(0) + 1) from (select `s2`.`shop_id` AS `shop_id`,date_format(`o2`.`created_at`,'%Y-%m') AS `sm`,sum(`o2`.`total_amount`) AS `rev` from (((`shops` `s2` join `products` `p2` on((`s2`.`shop_id` = `p2`.`shop_id`))) join `order_items` `i2` on((`p2`.`product_id` = `i2`.`product_id`))) join `orders` `o2` on(((`i2`.`order_id` = `o2`.`order_id`) and (`o2`.`status` <> 'cancelled')))) group by `s2`.`shop_id`,`sm`) `all_months` where ((`all_months`.`shop_id` = `curr`.`shop_id`) and (`all_months`.`rev` > `curr`.`revenue`))) AS `best_month_rank` FROM (((select `s`.`shop_id` AS `shop_id`,`s`.`shop_name` AS `shop_name`,date_format(`o`.`created_at`,'%Y-%m') AS `sale_month`,sum(`o`.`total_amount`) AS `revenue`,count(distinct `o`.`order_id`) AS `orders_count` from (((`shops` `s` join `products` `p` on((`s`.`shop_id` = `p`.`shop_id`))) join `order_items` `oi` on((`p`.`product_id` = `oi`.`product_id`))) join `orders` `o` on(((`oi`.`order_id` = `o`.`order_id`) and (`o`.`status` <> 'cancelled')))) group by `s`.`shop_id`,`s`.`shop_name`,date_format(`o`.`created_at`,'%Y-%m'))) `curr` left join (select `s`.`shop_id` AS `shop_id`,date_format(`o`.`created_at`,'%Y-%m') AS `sale_month`,sum(`o`.`total_amount`) AS `revenue`,count(distinct `o`.`order_id`) AS `orders_count` from (((`shops` `s` join `products` `p` on((`s`.`shop_id` = `p`.`shop_id`))) join `order_items` `oi` on((`p`.`product_id` = `oi`.`product_id`))) join `orders` `o` on(((`oi`.`order_id` = `o`.`order_id`) and (`o`.`status` <> 'cancelled')))) group by `s`.`shop_id`,date_format(`o`.`created_at`,'%Y-%m')) `prev` on(((`curr`.`shop_id` = `prev`.`shop_id`) and (`prev`.`sale_month` = (select max(date_format(`o2`.`created_at`,'%Y-%m')) from ((`orders` `o2` join `order_items` `i2` on((`o2`.`order_id` = `i2`.`order_id`))) join `products` `p2` on((`i2`.`product_id` = `p2`.`product_id`))) where ((`p2`.`shop_id` = `curr`.`shop_id`) and (`o2`.`status` <> 'cancelled') and (date_format(`o2`.`created_at`,'%Y-%m') < `curr`.`sale_month`)))))))  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_top_selling_products`
--
DROP TABLE IF EXISTS `vw_top_selling_products`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_top_selling_products`  AS SELECT `p`.`product_id` AS `product_id`, `p`.`title` AS `title`, `s`.`shop_name` AS `shop_name`, `s`.`shop_id` AS `shop_id`, coalesce(sum(`oi`.`quantity`),0) AS `total_units_sold`, coalesce(sum((`oi`.`quantity` * `oi`.`price_at_purchase`)),0) AS `total_revenue_generated` FROM ((`products` `p` left join `order_items` `oi` on((`p`.`product_id` = `oi`.`product_id`))) join `shops` `s` on((`p`.`shop_id` = `s`.`shop_id`))) GROUP BY `p`.`product_id`, `p`.`title`, `s`.`shop_name`, `s`.`shop_id` ORDER BY `total_units_sold` AS `DESCdesc` ASC  ;

-- --------------------------------------------------------

--
-- Structure for view `vw_user_orders`
--
DROP TABLE IF EXISTS `vw_user_orders`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_user_orders`  AS SELECT `o`.`order_id` AS `order_id`, `o`.`user_id` AS `user_id`, `o`.`total_amount` AS `total_amount`, `o`.`status` AS `status`, `o`.`created_at` AS `created_at`, count(`oi`.`item_id`) AS `item_count`, group_concat(`p`.`title` separator ', ') AS `product_titles` FROM ((`orders` `o` join `order_items` `oi` on((`o`.`order_id` = `oi`.`order_id`))) join `products` `p` on((`oi`.`product_id` = `p`.`product_id`))) GROUP BY `o`.`order_id``order_id`  ;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user_id` (`user_id`),
  ADD KEY `idx_created_at` (`created_at`);

--
-- Indexes for table `carousel_banners`
--
ALTER TABLE `carousel_banners`
  ADD PRIMARY KEY (`banner_id`);

--
-- Indexes for table `cart_items`
--
ALTER TABLE `cart_items`
  ADD PRIMARY KEY (`cart_item_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `product_id` (`product_id`);

--
-- Indexes for table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`category_id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `custom_requests`
--
ALTER TABLE `custom_requests`
  ADD PRIMARY KEY (`request_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `shop_id` (`shop_id`),
  ADD KEY `product_id` (`product_id`),
  ADD KEY `idx_cr_status` (`status`),
  ADD KEY `idx_cr_user_id` (`user_id`),
  ADD KEY `idx_cr_shop_id` (`shop_id`);

--
-- Indexes for table `custom_request_images`
--
ALTER TABLE `custom_request_images`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_req_img` (`request_id`,`image_url`);

--
-- Indexes for table `disputes`
--
ALTER TABLE `disputes`
  ADD PRIMARY KEY (`dispute_id`),
  ADD KEY `fk_disputes_order` (`order_id`);

--
-- Indexes for table `faqs`
--
ALTER TABLE `faqs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `favorites`
--
ALTER TABLE `favorites`
  ADD PRIMARY KEY (`favorite_id`),
  ADD UNIQUE KEY `unique_favorite` (`user_id`,`product_id`),
  ADD KEY `product_id` (`product_id`);

--
-- Indexes for table `handymen`
--
ALTER TABLE `handymen`
  ADD PRIMARY KEY (`handyman_id`),
  ADD KEY `shop_id` (`shop_id`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`message_id`),
  ADD KEY `sender_id` (`sender_id`),
  ADD KEY `receiver_id` (`receiver_id`),
  ADD KEY `request_id` (`request_id`),
  ADD KEY `idx_msg_sender_receiver` (`sender_id`,`receiver_id`),
  ADD KEY `idx_msg_receiver_sender` (`receiver_id`,`sender_id`),
  ADD KEY `idx_msg_created_at` (`created_at`),
  ADD KEY `idx_msg_unread` (`receiver_id`,`is_read`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`notification_id`),
  ADD KEY `idx_notif_user_id` (`user_id`),
  ADD KEY `idx_notif_unread` (`user_id`,`is_read`),
  ADD KEY `idx_notif_created` (`created_at`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`order_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_ord_user_id` (`user_id`),
  ADD KEY `idx_ord_status` (`status`),
  ADD KEY `idx_ord_user_status` (`user_id`,`status`),
  ADD KEY `idx_ord_created_at` (`created_at`);

--
-- Indexes for table `order_handymen`
--
ALTER TABLE `order_handymen`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_order_handyman` (`order_id`,`handyman_id`),
  ADD KEY `fk_oh_handyman` (`handyman_id`);

--
-- Indexes for table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`item_id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `product_id` (`product_id`),
  ADD KEY `idx_oi_order_id` (`order_id`),
  ADD KEY `idx_oi_product_id` (`product_id`);

--
-- Indexes for table `payment_methods`
--
ALTER TABLE `payment_methods`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `payouts`
--
ALTER TABLE `payouts`
  ADD PRIMARY KEY (`payout_id`),
  ADD KEY `shop_id` (`shop_id`);

--
-- Indexes for table `platform_settings`
--
ALTER TABLE `platform_settings`
  ADD PRIMARY KEY (`key`);

--
-- Indexes for table `points_transactions`
--
ALTER TABLE `points_transactions`
  ADD PRIMARY KEY (`txn_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `order_id` (`order_id`);

--
-- Indexes for table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`product_id`),
  ADD KEY `category_id` (`category_id`),
  ADD KEY `fk_products_shop` (`shop_id`),
  ADD KEY `idx_prod_shop_id` (`shop_id`),
  ADD KEY `idx_prod_price` (`price`),
  ADD KEY `idx_prod_sold_count` (`sold_count`),
  ADD KEY `idx_prod_is_active` (`is_active`),
  ADD KEY `idx_prod_shop_active` (`shop_id`,`is_active`);

--
-- Indexes for table `product_colors`
--
ALTER TABLE `product_colors`
  ADD PRIMARY KEY (`product_id`,`color`),
  ADD KEY `idx_pc_product_id` (`product_id`);

--
-- Indexes for table `product_images`
--
ALTER TABLE `product_images`
  ADD PRIMARY KEY (`image_id`),
  ADD KEY `product_id` (`product_id`);

--
-- Indexes for table `product_sizes`
--
ALTER TABLE `product_sizes`
  ADD PRIMARY KEY (`product_id`,`size`);

--
-- Indexes for table `product_specs`
--
ALTER TABLE `product_specs`
  ADD PRIMARY KEY (`product_id`,`spec_label`);

--
-- Indexes for table `reported_problems`
--
ALTER TABLE `reported_problems`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `reviews`
--
ALTER TABLE `reviews`
  ADD PRIMARY KEY (`review_id`),
  ADD UNIQUE KEY `uq_user_product_order_review` (`user_id`,`product_id`,`order_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `product_id` (`product_id`),
  ADD KEY `idx_rev_product_id` (`product_id`),
  ADD KEY `idx_rev_user_id` (`user_id`),
  ADD KEY `idx_rev_order_id` (`order_id`);

--
-- Indexes for table `review_tags`
--
ALTER TABLE `review_tags`
  ADD PRIMARY KEY (`review_id`,`tag`);

--
-- Indexes for table `shops`
--
ALTER TABLE `shops`
  ADD PRIMARY KEY (`shop_id`),
  ADD UNIQUE KEY `user_id` (`user_id`),
  ADD KEY `idx_shop_user_id` (`user_id`),
  ADD KEY `idx_shop_status` (`status`);

--
-- Indexes for table `stock_alerts`
--
ALTER TABLE `stock_alerts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_alert` (`user_id`,`product_id`),
  ADD KEY `product_id` (`product_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `idx_referral_code` (`referral_code`),
  ADD KEY `idx_user_email` (`email`),
  ADD KEY `idx_user_role` (`role`);

--
-- Indexes for table `user_addresses`
--
ALTER TABLE `user_addresses`
  ADD PRIMARY KEY (`address_id`),
  ADD KEY `fk_ua_user` (`user_id`);

--
-- Indexes for table `user_points`
--
ALTER TABLE `user_points`
  ADD PRIMARY KEY (`user_id`);

--
-- Indexes for table `user_vouchers`
--
ALTER TABLE `user_vouchers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_user_voucher` (`user_id`,`voucher_code`),
  ADD KEY `voucher_code` (`voucher_code`);

--
-- Indexes for table `vouchers`
--
ALTER TABLE `vouchers`
  ADD PRIMARY KEY (`voucher_id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD KEY `idx_voucher_code` (`code`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `activity_logs`
--
ALTER TABLE `activity_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `carousel_banners`
--
ALTER TABLE `carousel_banners`
  MODIFY `banner_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cart_items`
--
ALTER TABLE `cart_items`
  MODIFY `cart_item_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `category_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `custom_requests`
--
ALTER TABLE `custom_requests`
  MODIFY `request_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `custom_request_images`
--
ALTER TABLE `custom_request_images`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `disputes`
--
ALTER TABLE `disputes`
  MODIFY `dispute_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `faqs`
--
ALTER TABLE `faqs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `favorites`
--
ALTER TABLE `favorites`
  MODIFY `favorite_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `handymen`
--
ALTER TABLE `handymen`
  MODIFY `handyman_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `message_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `notification_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=31;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `order_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `order_handymen`
--
ALTER TABLE `order_handymen`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `item_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `payment_methods`
--
ALTER TABLE `payment_methods`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payouts`
--
ALTER TABLE `payouts`
  MODIFY `payout_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `points_transactions`
--
ALTER TABLE `points_transactions`
  MODIFY `txn_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `product_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `product_images`
--
ALTER TABLE `product_images`
  MODIFY `image_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `reported_problems`
--
ALTER TABLE `reported_problems`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reviews`
--
ALTER TABLE `reviews`
  MODIFY `review_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `shops`
--
ALTER TABLE `shops`
  MODIFY `shop_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `stock_alerts`
--
ALTER TABLE `stock_alerts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `user_addresses`
--
ALTER TABLE `user_addresses`
  MODIFY `address_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `user_vouchers`
--
ALTER TABLE `user_vouchers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vouchers`
--
ALTER TABLE `vouchers`
  MODIFY `voucher_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `cart_items`
--
ALTER TABLE `cart_items`
  ADD CONSTRAINT `fk_cart_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_cart_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `custom_requests`
--
ALTER TABLE `custom_requests`
  ADD CONSTRAINT `fk_cr_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_cr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `custom_request_images`
--
ALTER TABLE `custom_request_images`
  ADD CONSTRAINT `fk_cri_request` FOREIGN KEY (`request_id`) REFERENCES `custom_requests` (`request_id`) ON DELETE CASCADE;

--
-- Constraints for table `disputes`
--
ALTER TABLE `disputes`
  ADD CONSTRAINT `disputes_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  ADD CONSTRAINT `fk_disputes_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE;

--
-- Constraints for table `handymen`
--
ALTER TABLE `handymen`
  ADD CONSTRAINT `handymen_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE CASCADE;

--
-- Constraints for table `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `fk_msg_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `order_handymen`
--
ALTER TABLE `order_handymen`
  ADD CONSTRAINT `fk_oh_handyman` FOREIGN KEY (`handyman_id`) REFERENCES `handymen` (`handyman_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_oh_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE;

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `fk_oi_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_oi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`);

--
-- Constraints for table `payment_methods`
--
ALTER TABLE `payment_methods`
  ADD CONSTRAINT `payment_methods_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `payouts`
--
ALTER TABLE `payouts`
  ADD CONSTRAINT `payouts_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`);

--
-- Constraints for table `points_transactions`
--
ALTER TABLE `points_transactions`
  ADD CONSTRAINT `points_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  ADD CONSTRAINT `points_transactions_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`);

--
-- Constraints for table `products`
--
ALTER TABLE `products`
  ADD CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`),
  ADD CONSTRAINT `fk_products_shop_fk` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_products_shop_v2` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE CASCADE;

--
-- Constraints for table `product_colors`
--
ALTER TABLE `product_colors`
  ADD CONSTRAINT `fk_pc_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE;

--
-- Constraints for table `product_images`
--
ALTER TABLE `product_images`
  ADD CONSTRAINT `fk_pi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE;

--
-- Constraints for table `product_sizes`
--
ALTER TABLE `product_sizes`
  ADD CONSTRAINT `fk_ps_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE;

--
-- Constraints for table `product_specs`
--
ALTER TABLE `product_specs`
  ADD CONSTRAINT `fk_psp_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE;

--
-- Constraints for table `reported_problems`
--
ALTER TABLE `reported_problems`
  ADD CONSTRAINT `reported_problems_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

--
-- Constraints for table `reviews`
--
ALTER TABLE `reviews`
  ADD CONSTRAINT `fk_reviews_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `review_tags`
--
ALTER TABLE `review_tags`
  ADD CONSTRAINT `fk_rt_review` FOREIGN KEY (`review_id`) REFERENCES `reviews` (`review_id`) ON DELETE CASCADE;

--
-- Constraints for table `stock_alerts`
--
ALTER TABLE `stock_alerts`
  ADD CONSTRAINT `stock_alerts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `stock_alerts_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE;

--
-- Constraints for table `user_addresses`
--
ALTER TABLE `user_addresses`
  ADD CONSTRAINT `fk_ua_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `user_points`
--
ALTER TABLE `user_points`
  ADD CONSTRAINT `user_points_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `user_vouchers`
--
ALTER TABLE `user_vouchers`
  ADD CONSTRAINT `user_vouchers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `user_vouchers_ibfk_2` FOREIGN KEY (`voucher_code`) REFERENCES `vouchers` (`code`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
