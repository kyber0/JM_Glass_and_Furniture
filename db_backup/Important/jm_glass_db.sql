-- phpMyAdmin SQL Dump
-- version 5.1.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:8889
-- Generation Time: May 31, 2026 at 10:32 AM
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

CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_create_order_header` (IN `p_user_id` INT, IN `p_total_amount` DECIMAL(10,2), IN `p_delivery_fee` DECIMAL(10,2), IN `p_shipping_address` TEXT, IN `p_payment_method` VARCHAR(50), IN `p_voucher_code` VARCHAR(50), IN `p_discount_amount` DECIMAL(10,2))   BEGIN
                INSERT INTO orders (user_id, total_amount, delivery_fee, shipping_address, payment_method, status, voucher_code, discount_amount)
                VALUES (p_user_id, p_total_amount, p_delivery_fee, p_shipping_address, p_payment_method, 'pending', p_voucher_code, p_discount_amount);
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
(1, 18, 'review_submitted', 'Rating: 4 on product_id=1', '2026-05-06 05:47:42'),
(2, NULL, 'report_resolved', 'Report #1 marked resolved', '2026-05-06 06:16:26');

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
  `listing_id` int(11) DEFAULT NULL,
  `quantity` int(11) DEFAULT '1',
  `selected_size` varchar(50) DEFAULT NULL,
  `selected_color` varchar(50) DEFAULT NULL,
  `service_type` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

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
  `status` enum('pending','negotiating','accepted','in_progress','ready','completed','rejected') NOT NULL DEFAULT 'pending',
  `details` text,
  `budget` decimal(10,2) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `service_type` enum('Delivery','Installation') NOT NULL DEFAULT 'Delivery',
  `fragility_level` enum('none','low','medium','high') NOT NULL DEFAULT 'none',
  `installation_complexity` enum('basic','standard','complex') NOT NULL DEFAULT 'standard',
  `quoted_price` decimal(10,2) DEFAULT NULL,
  `negotiation_notes` text,
  `images` json DEFAULT NULL,
  `estimated_completion_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

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
-- Table structure for table `delivery_men`
--

CREATE TABLE `delivery_men` (
  `delivery_man_id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `plate_number` varchar(20) DEFAULT NULL,
  `status` enum('available','on_delivery','off') DEFAULT 'available',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `delivery_men`
--

INSERT INTO `delivery_men` (`delivery_man_id`, `shop_id`, `user_id`, `plate_number`, `status`, `created_at`) VALUES
(1, 1, 21, '123321', 'available', '2026-05-03 03:23:22'),
(2, 2, 22, 'UFC 320', 'available', '2026-05-03 03:28:17'),
(3, 3, 23, 'EFG 456', 'on_delivery', '2026-05-03 03:28:47');

-- --------------------------------------------------------

--
-- Table structure for table `disputes`
--

CREATE TABLE `disputes` (
  `dispute_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `buyer_id` int(11) DEFAULT NULL,
  `reason` varchar(255) NOT NULL,
  `description` text,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `resolution_notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `distance_cache`
--

CREATE TABLE `distance_cache` (
  `id` int(11) NOT NULL,
  `coord_hash` char(64) NOT NULL,
  `distance_km` decimal(8,2) NOT NULL,
  `calculated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `distance_cache`
--

INSERT INTO `distance_cache` (`id`, `coord_hash`, `distance_km`, `calculated_at`) VALUES
(1, '13.4408,123.3894,13.3065,123.3086', '27.81', '2026-05-20 00:57:16'),
(2, '13.4408,123.3894,13.4402,123.3907', '0.15', '2026-05-20 00:57:24'),
(3, '13.3065,123.3086,13.4408,123.3894', '27.81', '2026-05-06 04:29:18'),
(4, '13.4402,123.3907,13.4408,123.3894', '0.15', '2026-05-19 11:13:18'),
(5, '13.3065,123.3086,13.4532,123.3664', '27.56', '2026-05-06 04:54:11'),
(6, '13.4532,123.3664,13.4402,123.3907', '4.05', '2026-05-06 05:05:50'),
(7, '13.4532,123.3664,13.3065,123.3086', '27.56', '2026-05-06 05:05:50'),
(9, '13.4402,123.3907,13.3065,123.3086', '27.66', '2026-05-19 11:14:23'),
(10, '13.3065,123.3086,13.3065,123.3086', '0.00', '2026-05-19 12:24:00'),
(11, '13.3065,123.3086,13.4402,123.3907', '27.66', '2026-05-19 12:24:00');

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

-- --------------------------------------------------------

--
-- Table structure for table `fee_config`
--

CREATE TABLE `fee_config` (
  `id` int(11) NOT NULL,
  `key_name` varchar(80) NOT NULL,
  `value` decimal(10,2) NOT NULL,
  `label` varchar(120) DEFAULT NULL,
  `description` text,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `fee_config`
--

INSERT INTO `fee_config` (`id`, `key_name`, `value`, `label`, `description`, `updated_at`) VALUES
(1, 'default_shipping_base', '500.00', 'Default Base Shipping Fee', NULL, '2026-04-29 06:54:45'),
(2, 'free_shipping_threshold', '150000.00', 'Free Shipping Order Minimum (commercial bulk orders only)', NULL, '2026-04-29 08:05:08'),
(3, 'fragile_surcharge_min', '100.00', 'Glass/Fragile Surcharge (Minimum)', NULL, '2026-04-29 06:54:45'),
(4, 'fragile_surcharge_max', '500.00', 'Glass/Fragile Surcharge (Maximum)', NULL, '2026-04-29 06:54:45'),
(5, 'installation_basic_min', '300.00', 'Basic Installation — Min', NULL, '2026-04-29 06:54:45'),
(6, 'installation_basic_max', '500.00', 'Basic Installation — Max', NULL, '2026-04-29 06:54:45'),
(7, 'installation_standard_min', '800.00', 'Standard Installation — Min', NULL, '2026-04-29 06:54:45'),
(8, 'installation_standard_max', '1500.00', 'Standard Installation — Max', NULL, '2026-04-29 06:54:45'),
(9, 'installation_complex_min', '1500.00', 'Complex Installation — Min', NULL, '2026-04-29 06:54:45'),
(10, 'installation_complex_max', '5000.00', 'Complex Installation — Max', NULL, '2026-04-29 06:54:45'),
(21, 'rate_per_km', '30.00', 'Delivery Rate per KM (₱)', 'Added to base fee per kilometer of distance', '2026-04-30 01:46:26'),
(22, 'fragile_surcharge_medium', '300.00', 'Medium Fragility Surcharge', 'Surcharge for medium-fragility items (padded packaging)', '2026-04-30 02:44:02');

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
  `specialty` varchar(100) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `handymen`
--

INSERT INTO `handymen` (`handyman_id`, `shop_id`, `name`, `phone`, `status`, `created_at`, `specialty`, `user_id`) VALUES
(1, 2, 'Volkanovski', '09776714630', 'available', '2026-05-03 03:24:47', NULL, NULL),
(2, 3, 'Glenn Angelo', '09123456789', 'available', '2026-05-03 03:26:03', NULL, 24),
(3, 3, 'Jade', '09987654321', 'available', '2026-05-03 03:34:31', NULL, 25);

-- --------------------------------------------------------

--
-- Table structure for table `listing_colors`
--

CREATE TABLE `listing_colors` (
  `listing_id` int(11) NOT NULL,
  `color` varchar(50) NOT NULL,
  `stock` int(11) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `listing_colors`
--

INSERT INTO `listing_colors` (`listing_id`, `color`, `stock`) VALUES
(1, 'Natural Oak', 18),
(2, 'Natural Oak', 29),
(3, 'Matte Black', 2),
(3, 'Walnut Brown', 6),
(3, 'Wood Grain Brown', 2);

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
  `image_url` text,
  `shop_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `messages`
--

INSERT INTO `messages` (`message_id`, `sender_id`, `receiver_id`, `message`, `is_read`, `created_at`, `request_id`, `image_url`, `shop_id`) VALUES
(1, 18, 17, '..', 1, '2026-05-06 13:05:58', NULL, NULL, NULL),
(2, 17, 18, 'hello', 1, '2026-05-06 13:59:43', NULL, NULL, NULL),
(3, 18, 17, 'uno yan', 1, '2026-05-06 13:59:53', NULL, NULL, NULL),
(4, 18, 17, 'ud man', 1, '2026-05-06 13:59:58', NULL, NULL, NULL),
(5, 17, 18, 'uda man', 1, '2026-05-06 14:00:06', NULL, NULL, NULL),
(6, 18, 17, 'hi', 1, '2026-05-06 14:07:40', NULL, NULL, NULL),
(7, 18, 17, 'vb', 1, '2026-05-06 14:08:41', NULL, NULL, NULL),
(8, 17, 18, 'hellooo', 0, '2026-05-20 09:03:59', NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `notification_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('order','promo','message','delivery','system','handyman_assigned','customization_request','shop_order','review','cancelled','custom_request') NOT NULL DEFAULT 'system',
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
(1, 18, 'order', 'Order Confirmed! 🎉', 'Your order #JM-1 for item has been placed successfully.', 1, 'checkmark-circle', '#4CAF50', '2026-05-06 04:54:25', 1),
(2, 17, 'shop_order', 'New Order Received! 🛒', 'Jaika Mae Bañaria ordered: Modern Panel Luxe Door. Order #JM-1.', 1, 'storefront', '#FF9800', '2026-05-06 04:54:25', 1),
(3, 18, 'delivery', 'Order Being Processed 🏭', 'Your order #JM-1 is now being processed by the seller.', 1, 'car', '#2196F3', '2026-05-06 04:54:53', 1),
(4, 17, 'message', 'New message from Jaika Mae Bañaria', '..', 1, 'chatbubble-ellipses', '#00BCD4', '2026-05-06 05:05:58', 18),
(5, 21, 'order', '🚚 New Delivery Assigned', 'Order #JM-1 has been assigned to you for delivery. Check your dashboard.', 0, 'checkmark-circle', '#4CAF50', '2026-05-06 05:11:14', 1),
(6, 18, 'delivery', 'Order Out for Delivery 🚚', 'Great news! Your order #JM-1 is on its way to you.', 1, 'car', '#2196F3', '2026-05-06 05:11:14', 1),
(7, 18, 'system', '⭐ Loyalty Points Earned!', 'You earned 276 points from Order #JM-1. View your balance in the Rewards section!', 1, 'star', '#FFC107', '2026-05-06 05:14:23', NULL),
(8, 18, 'delivery', '📦 Order Delivered!', 'Order #JM-1 has arrived. Please confirm receipt.', 1, NULL, NULL, '2026-05-06 05:14:23', NULL),
(9, 18, 'review', '⭐ New Product Review!', '★★★★ (4/5) on \"Modern Panel Luxe Door\": \"ganda neto mga kuya ate\"', 1, 'star', '#FF9800', '2026-05-06 05:47:42', 4),
(10, 18, 'system', 'New 4⭐ Review on \"Modern Panel Luxe Door\"', 'Jaika Mae Bañaria left a 4-star review on your product.', 1, 'sparkles', '#8D6E63', '2026-05-06 05:47:42', NULL),
(11, 18, 'system', 'Review Submitted ✅', 'Thank you for your feedback! Your review has been submitted successfully.', 1, 'sparkles', '#8D6E63', '2026-05-06 05:47:42', NULL),
(12, 18, 'message', 'New message from Keaneth Dave Berido', 'hello', 1, 'chatbubble-ellipses', '#00BCD4', '2026-05-06 05:59:43', 17),
(13, 17, 'message', 'New message from Jaika Mae Bañaria', 'uno yan', 1, 'chatbubble-ellipses', '#00BCD4', '2026-05-06 05:59:53', 18),
(14, 17, 'message', 'New message from Jaika Mae Bañaria', 'ud man', 1, 'chatbubble-ellipses', '#00BCD4', '2026-05-06 05:59:58', 18),
(15, 18, 'message', 'New message from Keaneth Dave Berido', 'uda man', 1, 'chatbubble-ellipses', '#00BCD4', '2026-05-06 06:00:06', 17),
(16, 17, 'message', 'New message from Jaika Mae Bañaria', 'hi', 1, 'chatbubble-ellipses', '#00BCD4', '2026-05-06 06:07:40', 18),
(17, 17, 'message', 'New message from Jaika Mae Bañaria', 'vb', 1, 'chatbubble-ellipses', '#00BCD4', '2026-05-06 06:08:41', 18),
(18, 17, 'order', 'Order Confirmed! 🎉', 'Your order #JM-2 for item has been placed successfully.', 1, 'checkmark-circle', '#4CAF50', '2026-05-19 11:14:58', 2),
(19, 18, 'shop_order', 'New Order Received! 🛒', 'Keaneth Dave Berido ordered: Modern Panel Luxe Door. Order #JM-2.', 1, 'storefront', '#FF9800', '2026-05-19 11:14:58', 2),
(20, 17, 'delivery', 'Order Being Processed 🏭', 'Your order #JM-2 is now being processed by the seller.', 1, 'car', '#2196F3', '2026-05-19 11:16:27', 2),
(21, 23, 'order', '🚚 New Delivery Assigned', 'Order #JM-2 has been assigned to you for delivery. Check your dashboard.', 0, 'checkmark-circle', '#4CAF50', '2026-05-19 11:16:40', 2),
(22, 17, 'delivery', 'Order Out for Delivery 🚚', 'Great news! Your order #JM-2 is on its way to you.', 1, 'car', '#2196F3', '2026-05-19 11:16:40', 2),
(23, 17, 'order', 'Order Confirmed! 🎉', 'Your order #JM-3 for item has been placed successfully.', 0, 'checkmark-circle', '#4CAF50', '2026-05-20 00:17:17', 3),
(24, 18, 'shop_order', 'New Order Received! 🛒', 'Keaneth Dave Berido ordered: Modern Panel Luxe Door. Order #JM-3.', 0, 'storefront', '#FF9800', '2026-05-20 00:17:17', 3),
(25, 18, 'shop_order', '⚠️ No Workers Available', 'Order #JM-3 was placed but no delivery man is available. Please check worker assignments.', 0, 'storefront', '#FF9800', '2026-05-20 00:17:17', 3),
(26, 17, 'order', 'Order Confirmed! 🎉', 'Your order #JM-4 for item has been placed successfully.', 0, 'checkmark-circle', '#4CAF50', '2026-05-20 01:02:07', 4),
(27, 18, 'shop_order', 'New Order Received! 🛒', 'Keaneth Dave Berido ordered: Modern Panel Luxe Door. Order #JM-4.', 0, 'storefront', '#FF9800', '2026-05-20 01:02:07', 4),
(28, 18, 'shop_order', '⚠️ No Workers Available', 'Order #JM-4 was placed but no delivery man is available. Please check worker assignments.', 0, 'storefront', '#FF9800', '2026-05-20 01:02:07', 4),
(29, 17, 'order', '❌ Order Cancelled', 'Order #JM-3 cancelled. Stock restored.', 0, 'close-circle', '#F44336', '2026-05-20 01:02:41', NULL),
(30, 17, 'order', 'Order Cancelled', 'Your order #JM-3 has been cancelled and your stock has been restored.', 0, 'checkmark-circle', '#4CAF50', '2026-05-20 01:02:41', 3),
(31, 18, 'message', 'New message from Keaneth Dave Berido', 'hellooo', 0, 'chatbubble-ellipses', '#00BCD4', '2026-05-20 01:03:59', 17);

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `order_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `delivery_fee` decimal(10,2) DEFAULT '0.00',
  `status` enum('pending','processing','shipped','delivered','cancelled','completed') NOT NULL DEFAULT 'pending',
  `payment_status` enum('unpaid','partial','submitted','paid','verified') NOT NULL DEFAULT 'unpaid',
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
  `seller_net` decimal(10,2) DEFAULT NULL,
  `payment_verified_at` timestamp NULL DEFAULT NULL,
  `payment_proof_url` varchar(255) DEFAULT NULL,
  `delivery_man_id` int(11) DEFAULT NULL,
  `processed_at` datetime DEFAULT NULL,
  `shipped_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `estimated_delivery_date` date DEFAULT NULL,
  `edd_extended` tinyint(1) NOT NULL DEFAULT '0',
  `qr_confirmed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`order_id`, `user_id`, `total_amount`, `delivery_fee`, `status`, `payment_status`, `shipping_address`, `payment_method`, `created_at`, `updated_at`, `current_lat`, `current_lng`, `last_location_update`, `voucher_code`, `discount_amount`, `points_redeemed`, `points_earned`, `commission_rate`, `commission_amount`, `transaction_fee_pct`, `transaction_fee_fixed`, `transaction_fee_amount`, `seller_net`, `payment_verified_at`, `payment_proof_url`, `delivery_man_id`, `processed_at`, `shipped_at`, `delivered_at`, `completed_at`, `estimated_delivery_date`, `edd_extended`, `qr_confirmed_at`) VALUES
(1, 18, '27690.00', '1690.00', 'delivered', 'unpaid', 'Jaika Mae Bañaria, 0912345679, Baao, Camarines Sur, Bicol Region — Sagrada, Baao, Living Water | Vehicle: Pickup Truck', 'Cash on Delivery', '2026-05-06 04:54:25', '2026-05-06 05:14:23', '13.44079630', '123.38941220', '2026-05-06 05:14:10', NULL, '0.00', 0, 0, '0.00', '0.00', '0.00', '0.00', '0.00', NULL, NULL, NULL, 1, '2026-05-06 12:54:53', '2026-05-06 13:11:14', '2026-05-06 13:14:23', NULL, '2026-05-08', 0, NULL),
(2, 17, '25692.50', '1692.50', 'shipped', 'unpaid', 'Keaneth Dave Berido, 09702697048, Cristo Rey, Bato, Camarines Sur, Bicol Region — Leysambi Milktea  | Vehicle: Pickup Truck', 'Cash on Delivery', '2026-05-19 11:14:58', '2026-05-19 11:16:40', NULL, NULL, NULL, NULL, '0.00', 0, 0, '0.00', '0.00', '0.00', '0.00', '0.00', NULL, NULL, NULL, 3, '2026-05-19 19:16:27', '2026-05-19 19:16:40', NULL, NULL, '2026-05-21', 0, NULL),
(3, 17, '25692.50', '1692.50', 'cancelled', 'unpaid', 'Keaneth Dave Berido, 09702697048, Cristo Rey, Bato, Camarines Sur, Bicol Region — Leysambi Milktea  | Vehicle: Pickup Truck', 'Cash on Delivery', '2026-05-20 00:17:17', '2026-05-20 01:02:41', NULL, NULL, NULL, NULL, '0.00', 0, 0, '0.00', '0.00', '0.00', '0.00', '0.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26', 0, NULL),
(4, 17, '25692.50', '1692.50', 'pending', 'unpaid', 'Keaneth Dave Berido, 09702697048, Cristo Rey, Bato, Camarines Sur, Bicol Region — Leysambi Milktea  | Vehicle: Pickup Truck', 'Cash on Delivery', '2026-05-20 01:02:07', '2026-05-20 01:02:07', NULL, NULL, NULL, NULL, '0.00', 0, 0, '0.00', '0.00', '0.00', '0.00', '0.00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26', 0, NULL);

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
  `installation_fee` decimal(10,2) DEFAULT '0.00',
  `base_price` decimal(10,2) DEFAULT '0.00',
  `selected_variant` varchar(100) DEFAULT NULL,
  `request_id` int(11) DEFAULT NULL,
  `selected_size` varchar(50) DEFAULT NULL,
  `selected_color` varchar(50) DEFAULT NULL,
  `selected_service` varchar(50) DEFAULT NULL,
  `listing_id` int(11) DEFAULT NULL COMMENT 'shop_listings.listing_id — which shop sold this item'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `order_items`
--

INSERT INTO `order_items` (`item_id`, `order_id`, `product_id`, `quantity`, `price_at_purchase`, `installation_fee`, `base_price`, `selected_variant`, `request_id`, `selected_size`, `selected_color`, `selected_service`, `listing_id`) VALUES
(1, 1, 1, 1, '26000.00', '0.00', '26000.00', '80 cm x 210 cm (Standard Single Door) - Natural Oak - Delivery - standard', NULL, NULL, NULL, NULL, 2),
(2, 2, 1, 1, '24000.00', '0.00', '24000.00', '100 cm x 210 cm (Extra Wide) - Natural Oak - Delivery - standard', NULL, NULL, NULL, NULL, 1),
(3, 3, 1, 1, '24000.00', '0.00', '24000.00', '100 cm x 210 cm (Extra Wide) - Natural Oak - Delivery - standard', NULL, NULL, NULL, NULL, 1),
(4, 4, 1, 1, '24000.00', '0.00', '24000.00', '100 cm x 210 cm (Extra Wide) - Natural Oak - Delivery - standard', NULL, NULL, NULL, NULL, 1);

-- --------------------------------------------------------

--
-- Table structure for table `payment_installments`
--

CREATE TABLE `payment_installments` (
  `installment_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `request_id` int(11) DEFAULT NULL,
  `phase` varchar(50) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `due_date` date DEFAULT NULL,
  `payment_status` enum('pending','submitted','verified','rejected') NOT NULL DEFAULT 'pending',
  `proof_url` varchar(255) DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `verified_by` int(11) DEFAULT NULL,
  `rejection_reason` text,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
('price_deviation_pct', '20', '2026-04-27 13:46:40'),
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

--
-- Dumping data for table `points_transactions`
--

INSERT INTO `points_transactions` (`txn_id`, `user_id`, `order_id`, `type`, `points`, `note`, `created_at`) VALUES
(1, 18, 1, 'earn', 276, 'Earned from Order #JM-1', '2026-05-06 05:14:23');

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `product_id` int(11) NOT NULL,
  `category_id` int(11) NOT NULL,
  `theme` varchar(50) DEFAULT NULL,
  `service_type` enum('delivery','installation') NOT NULL DEFAULT 'delivery',
  `installation_complexity` enum('basic','standard','complex') DEFAULT 'standard',
  `title` varchar(255) NOT NULL,
  `description` text,
  `price` decimal(10,2) NOT NULL,
  `stock_quantity` int(11) DEFAULT '0',
  `image_url` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sold_count` int(11) DEFAULT '0',
  `is_hidden` tinyint(1) NOT NULL DEFAULT '0',
  `base_price` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Admin-set reference price used for seller deviation check',
  `created_by` int(11) DEFAULT NULL COMMENT 'admin user_id who added this to the catalog',
  `is_catalog_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 = hidden from seller catalog by admin',
  `is_fragile` tinyint(1) DEFAULT '0',
  `fragility_level` enum('none','low','medium','high') NOT NULL DEFAULT 'none'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`product_id`, `category_id`, `theme`, `service_type`, `installation_complexity`, `title`, `description`, `price`, `stock_quantity`, `image_url`, `is_active`, `created_at`, `sold_count`, `is_hidden`, `base_price`, `created_by`, `is_catalog_active`, `is_fragile`, `fragility_level`) VALUES
(1, 2, 'Modern', 'delivery', 'standard', 'Modern Panel Luxe Door', 'Modern Wooden Door with Glass Panel – Includes tempered glass insert, premium wood finish, and stainless vertical handle. Installation not included.', '25000.00', 7, 'uploads/products/1777332075942.jpeg', 1, '2026-04-27 23:21:17', 12, 0, '25000.00', 5, 1, 1, 'high'),
(2, 2, 'Minimalist', 'delivery', 'standard', 'French Style Sliding Door ', 'French-style sliding door with wooden framing and clear glass panels. Features a grid-pattern design that gives a classic yet modern appearance while allowing natural light to enter the space.', '50000.00', 0, 'uploads/products/1779204140197.jpeg', 1, '2026-05-19 15:22:20', 0, 0, '50000.00', 5, 1, 0, 'medium'),
(3, 3, 'Modern', 'delivery', 'standard', 'Modern White Modular Cabinet', 'Modern modular kitchen cabinet with a clean white finish and minimalist panel design. Built for organized storage, functionality, and a sleek contemporary kitchen appearance.', '49000.00', 0, 'uploads/products/1779204528872.jpeg', 1, '2026-05-19 15:28:49', 0, 0, '49000.00', 5, 1, 0, 'low'),
(4, 3, 'Modern', 'delivery', 'standard', 'Aluminum Glass Kitchen Cabinet ', 'Modern aluminum kitchen cabinet with sliding glass doors and open shelving. Designed for organized kitchen storage with a clean, lightweight, and space-saving appearance.', '23000.00', 0, 'uploads/products/1779206399406.jpeg', 1, '2026-05-19 15:59:59', 0, 0, '23000.00', 5, 1, 0, 'medium'),
(5, 1, 'Modern', 'delivery', 'standard', 'Awning Window', 'Modern awning window with aluminum framing and glass panels designed for ventilation, natural lighting, and weather protection. The outward-opening design provides airflow even during light rain.', '20000.00', 0, 'uploads/products/1779207165355.jpeg', 1, '2026-05-19 16:12:48', 0, 0, '20000.00', 5, 1, 0, 'medium'),
(6, 2, 'Minimalist', 'delivery', 'standard', 'Bath Sliding Door', 'Modern bathroom sliding door with black aluminum framing and frosted glass panels for privacy and a sleek minimalist appearance. Designed to save space while maintaining a clean and elegant look.', '25000.00', 0, 'uploads/products/1779209405199.jpeg', 1, '2026-05-19 16:50:05', 0, 0, '25000.00', 5, 1, 0, 'medium'),
(7, 1, 'Modern', 'delivery', 'basic', 'Steel Window Grill', 'Modern steel window grill with horizontal bar design for added security and ventilation. Combined with aluminum sliding windows for a clean and durable exterior appearance.', '12000.00', 0, 'uploads/products/1779210531206.jpeg', 1, '2026-05-19 17:08:52', 0, 0, '12000.00', 5, 1, 0, 'low'),
(8, 1, 'Minimalist', 'delivery', 'standard', 'Fixed Vertical Window', 'Modern fixed vertical window with slim aluminum framing and dark tinted glass. Designed to provide natural light, privacy, and a sleek architectural appearance.', '20000.00', 0, 'uploads/products/1779212309921.jpeg', 1, '2026-05-19 17:38:32', 0, 0, '20000.00', 5, 1, 0, 'medium'),
(9, 1, 'Modern', 'delivery', 'basic', 'Flush Steel Door', 'Modern flush steel door with horizontal embossed panel design and matte black finish. Built for security, durability, and a clean industrial-modern appearance.', '22000.00', 0, 'uploads/products/1779213003804.jpeg', 1, '2026-05-19 17:50:05', 0, 0, '22000.00', 5, 1, 0, 'low'),
(10, 3, 'Modern', 'delivery', 'standard', 'Modular Hanging Cabinet ', 'Modern modular hanging cabinet with wood-grain panels and black aluminum framing. Designed for space-saving storage with a sleek contemporary look.', '15000.00', 0, 'uploads/products/1779213416632.jpeg', 1, '2026-05-19 17:56:57', 0, 0, '15000.00', 5, 1, 0, 'low');

-- --------------------------------------------------------

--
-- Table structure for table `product_colors`
--

CREATE TABLE `product_colors` (
  `product_id` int(11) NOT NULL,
  `color` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `product_colors`
--

INSERT INTO `product_colors` (`product_id`, `color`) VALUES
(1, 'Natural Oak'),
(2, 'Clear Glass'),
(2, 'Teak Brown'),
(2, 'Walnut Brown'),
(2, 'White & Neutral Tone Combination'),
(3, 'White'),
(4, 'Clear Glass'),
(4, 'Frosted White'),
(4, 'Light Gray Accent'),
(4, 'White'),
(5, 'Matte Black'),
(5, 'Matte White'),
(6, 'Frosted White Glass'),
(6, 'Gray'),
(6, 'Matte Black'),
(6, 'White Tile Combination'),
(7, 'Black'),
(7, 'No Color'),
(7, 'White'),
(8, 'Black'),
(8, 'Matte Black'),
(8, 'White'),
(9, 'Black'),
(9, 'White'),
(10, 'Matte Black'),
(10, 'Walnut Brown'),
(10, 'Wood Grain Brown');

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
(1, 1, 'uploads/products/1777332075942.jpeg'),
(2, 1, 'uploads/products/1777332076862.jpeg'),
(3, 2, 'uploads/products/1779204140197.jpeg'),
(4, 2, 'uploads/products/1779204140394.jpeg'),
(5, 3, 'uploads/products/1779204528872.jpeg'),
(6, 3, 'uploads/products/1779204528872.jpeg'),
(7, 3, 'uploads/products/1779204529009.jpeg'),
(8, 3, 'uploads/products/1779204529074.jpeg'),
(9, 4, 'uploads/products/1779206399406.jpeg'),
(10, 4, 'uploads/products/1779206399713.jpeg'),
(11, 5, 'uploads/products/1779207165355.jpeg'),
(12, 5, 'uploads/products/1779207166614.jpeg'),
(13, 5, 'uploads/products/1779207167174.jpeg'),
(14, 5, 'uploads/products/1779207167608.jpeg'),
(15, 5, 'uploads/products/1779207167913.jpeg'),
(16, 6, 'uploads/products/1779209405199.jpeg'),
(17, 7, 'uploads/products/1779210531206.jpeg'),
(18, 8, 'uploads/products/1779212309921.jpeg'),
(19, 9, 'uploads/products/1779213003804.jpeg'),
(20, 10, 'uploads/products/1779213416632.jpeg');

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
(1, '100 cm x 210 cm (Extra Wide)'),
(1, '80 cm x 210 cm (Standard Single Door)'),
(1, '90 cm x 210 cm (Wide Single Door)'),
(2, 'Custom'),
(2, 'Large Unit: Approx. 3.5m–4m (W) × 2.8m–3m (H)'),
(2, 'Small Unit: Approx. 2m–2.5m (W) × 2.4m–2.7m (H)'),
(3, 'Custom'),
(4, 'Custom'),
(5, 'Large Window Panel: Approx. 2m – 3m Width × 2m – 3'),
(5, 'Small Window: Approx. 0.6m × 1.5m'),
(6, 'Aluminum Frosted - 1.2m'),
(6, 'Aluminum Frosted - 2.2m'),
(7, '1.3m'),
(7, '1.8m'),
(7, '2.0m'),
(8, 'Large - \n0.60m × 1.80m'),
(8, 'Medium - \n0.45m × 1.50m'),
(8, 'Small - 0.30m × 1.20m'),
(9, 'Large - \n0.90m × 2.10m'),
(9, 'Medium - \n0.80m × 2.10m'),
(9, 'Small\n- 0.70m × 2.00m'),
(10, 'Large - \n1.5m × 1.0m × 0.45m'),
(10, 'Small - \n1.0m × 0.6m × 0.35m');

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
(1, 'Finish', 'Laminated / Veneer / Painted finish'),
(1, 'Glass Type', 'Clear glass, Frosted glass, Tinted glass'),
(1, 'Handle Material', 'Stainless steel / Powder-coated metal'),
(1, 'Handle Type', 'Vertical pull handle'),
(1, 'Lock Type', 'Standard mortise lock'),
(1, 'Material', 'Engineered wood / Solid wood'),
(1, 'Thickness', '35 mm – 45 mm'),
(1, 'Usage', 'Main door / Interior door / Office door'),
(2, 'Door Type', 'Sliding Door'),
(2, 'Glass Type', 'Clear tempered glass'),
(2, 'Material', 'Wood frame'),
(2, 'Use', 'Interior partition, patio, or balcony access'),
(3, 'Cabinet Type', 'Modular kitchen cabinet'),
(3, 'Finish', 'Glossy white laminate'),
(3, 'Material', 'Marine plywood / laminated board'),
(4, 'Door Type', 'Sliding glass doors'),
(4, 'Features', 'Rust-resistant, termite-proof, easy maintenance'),
(4, 'Material', 'Powder-coated aluminum frame'),
(5, 'Glass Type', 'Clear / tinted glass'),
(5, 'Material', 'Powder-coated aluminum'),
(5, 'Opening Style', 'Top-hinged outward opening'),
(6, 'Door Type', 'Sliding bathroom door'),
(6, 'Glass Type', 'Frosted glass'),
(6, 'Material', 'Powder-coated aluminum'),
(6, 'Opening Style', 'Sliding track system'),
(7, 'Design', 'Horizontal security grill'),
(7, 'Features', 'Rust-resistant, durable, low maintenance'),
(7, 'Material', 'Highly durable steel'),
(7, 'Window Type', 'Sliding window with steel grill'),
(8, 'Features', 'Rust-resistant, low maintenance, modern look'),
(8, 'Glass Type', 'Dark tinted glass'),
(8, 'Material', 'Powder coated aluminum'),
(8, 'Window Type', 'Fixed vertical window'),
(9, 'Design', 'Horizontal line embossed pattern'),
(9, 'Door Type', 'Flush steel door'),
(9, 'Features', 'Rust-resistant, durable, low maintenance'),
(9, 'Lock Type', 'Barrel bolt / latch lock compatible'),
(9, 'Materials', 'Steel door panel with steel frame'),
(10, 'Cabinet Type', 'Wall-mounted hanging cabinet'),
(10, 'Door Type', 'Swing doors'),
(10, 'Features', 'Lightweight, durable, easy maintenance'),
(10, 'Materials', 'Laminated board with aluminum frame');

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

--
-- Dumping data for table `reported_problems`
--

INSERT INTO `reported_problems` (`id`, `user_id`, `issue_type`, `description`, `status`, `created_at`) VALUES
(1, NULL, 'Bug/Glitch', 'bug', 'resolved', '2026-05-06 06:14:37');

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
-- Dumping data for table `reviews`
--

INSERT INTO `reviews` (`review_id`, `user_id`, `product_id`, `order_id`, `rating`, `comment`, `created_at`, `image_url`, `seller_reply`, `replied_at`) VALUES
(4, 18, 1, 1, 4, 'ganda neto mga kuya ate', '2026-05-06 05:47:42', 'uploads/reviews/review-1778046462518.jpg', NULL, NULL);

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
  JOIN shop_listings sl ON sl.product_id = p.product_id
  JOIN shops s ON sl.shop_id = s.shop_id
  WHERE p.product_id = NEW.product_id
  LIMIT 1;

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
    CONCAT('Rating: ', NEW.rating, ' on product_id=', NEW.product_id)
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

--
-- Dumping data for table `review_tags`
--

INSERT INTO `review_tags` (`review_id`, `tag`) VALUES
(4, 'Affordable'),
(4, 'Fast Delivery'),
(4, 'Good Quality');

-- --------------------------------------------------------

--
-- Table structure for table `shipping_zones`
--

CREATE TABLE `shipping_zones` (
  `zone_id` int(11) NOT NULL,
  `label` varchar(100) NOT NULL,
  `keywords` text NOT NULL,
  `override_fee` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

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
  `address_details` varchar(255) DEFAULT NULL,
  `tin_number` varchar(255) DEFAULT NULL,
  `is_verified` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `logo_url` varchar(255) DEFAULT NULL,
  `id_image` varchar(255) DEFAULT NULL,
  `permit_image` varchar(255) DEFAULT NULL,
  `status` enum('pending','active','rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` varchar(255) DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `shops`
--

INSERT INTO `shops` (`shop_id`, `user_id`, `shop_name`, `description`, `address`, `address_details`, `tin_number`, `is_verified`, `created_at`, `logo_url`, `id_image`, `permit_image`, `status`, `rejection_reason`, `latitude`, `longitude`) VALUES
(1, 17, 'Cristo Rey Branch Shop', 'Cristo Rey Branch Shop offers quality doors, furniture, and glass products with delivery and installation services. It specializes in customizable designs, reliable service, and safe handling of materials, providing practical and modern solutions for residential and commercial needs.', 'Cristo Rey, Bato, Camarines Sur, Bicol Region, Philippines', NULL, '95afee6fb4dcef4af8cb8f5a:f9710ebf92b822573fd7c6892022c1fd:245433df14', 0, '2026-05-01 12:08:51', NULL, 'uploads/shop-ids/id_image-1777637331525.jpeg', 'uploads/shop-ids/permit_image-1777637331640.jpeg', 'active', NULL, '13.3065252', '123.3086371'),
(2, 19, 'Buluang Bato Branch Shop', 'Buluang Bato Branch Shop provides quality doors, furniture, and glass products with reliable delivery and installation services. It offers customizable designs, durable materials, and efficient service, catering to both residential and commercial needs.', 'Buluang, Bato, Camarines Sur, Bicol Region, Philippines', NULL, '4723737538e54e24a7c56d3f:7595b894ac21cfd57fd10bae141fe7df:db876fed5d', 0, '2026-05-01 12:11:44', NULL, 'uploads/shop-ids/id_image-1777637504281.jpeg', 'uploads/shop-ids/permit_image-1777637504282.jpeg', 'active', NULL, '13.3084219', '123.3433254'),
(3, 18, 'Sagrada Baao Branch Shop', 'Sagrada Baao Branch Shop offers high-quality doors, furniture, and glass products with dependable delivery and installation services. It focuses on customizable designs, durable materials, and efficient service for residential and commercial customers.', 'Sagrada, Baao, Camarines Sur, Bicol Region, Philippines', NULL, '20579c23196b1b46a533ccd6:993f598637562cb9222fffc4fd58a5b5:e98441e67b', 0, '2026-05-01 12:13:33', 'uploads/shops/logo-1778043792376.jpg', 'uploads/shop-ids/id_image-1777637612376.jpeg', 'uploads/shop-ids/permit_image-1777637612626.jpeg', 'active', NULL, '13.4401886', '123.3907247');

-- --------------------------------------------------------

--
-- Table structure for table `shop_listings`
--

CREATE TABLE `shop_listings` (
  `listing_id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `custom_price` decimal(10,2) NOT NULL COMMENT 'Seller-set price (must be within platform deviation % of base_price)',
  `stock_quantity` int(11) NOT NULL DEFAULT '0' COMMENT 'Per-shop stock managed by seller',
  `service_types` varchar(100) NOT NULL DEFAULT 'delivery',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `listed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `shop_listings`
--

INSERT INTO `shop_listings` (`listing_id`, `shop_id`, `product_id`, `custom_price`, `stock_quantity`, `service_types`, `is_active`, `listed_at`, `updated_at`) VALUES
(1, 3, 1, '24000.00', 18, 'delivery,delivery_installation', 1, '2026-05-06 04:24:01', '2026-05-20 01:02:41'),
(2, 1, 1, '26000.00', 29, 'delivery', 1, '2026-05-06 04:24:01', '2026-05-06 04:54:25'),
(3, 1, 10, '16000.00', 10, 'delivery', 1, '2026-05-20 00:22:05', '2026-05-20 00:22:05');

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
  `role` enum('customer','admin','seller','delivery_man','handyman') DEFAULT 'customer',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `referral_code` varchar(20) DEFAULT NULL,
  `referred_by_code` varchar(20) DEFAULT NULL,
  `referral_rewarded` tinyint(1) DEFAULT '0',
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`user_id`, `email`, `password_hash`, `full_name`, `phone`, `profile_image`, `address`, `role`, `created_at`, `is_active`, `referral_code`, `referred_by_code`, `referral_rewarded`, `must_change_password`) VALUES
(5, 'admin123@gmail.com', '$2a$10$UZh3NrOpBEbuh.tbwzAfOuI2GCeQSQpXRV9SnAts7pPezWEhGSnz2', 'Administrator', NULL, NULL, NULL, 'admin', '2026-02-27 15:48:54', 1, 'JM-E4DA3B', NULL, 0, 0),
(17, 'keberido@my.cspc.edu.ph', '$2a$10$Jk483lcv0vf74ZPvjOGBPuPKx4qdR/P8fBzjJGijgwEqqehroJgrq', 'Keaneth Dave Berido', '09702697048', NULL, 'Cristo Rey, Bato, Camarines Sur, Bicol Region, Philippines', 'seller', '2026-05-01 11:51:40', 1, 'JM-0000H', NULL, 0, 0),
(18, 'jaibanaria@my.cspc.edu.ph', '$2a$10$LYDhlCWc.fk2BzHpn6melOiLfZD4hEOSn9M5kIwpAZ6iKQ.OVrA5q', 'Jaika Mae Bañaria', '0912345679', 'uploads/profiles/profile-1778043887650.jpg', 'Sagrada, Baao, Camarines Sur, Bicol Region, Philippines', 'seller', '2026-05-01 11:53:08', 1, 'JM-0000I', NULL, 0, 0),
(19, 'sacanonce@my.cspc.edu.ph', '$2a$10$SJjnO6E4xnQDtvZmP.EPduYvtsOZdfHcSAv.Ca/OZO1quRdC9QXk.', 'Sam Canonce', '09926225483', NULL, 'Buluang, Bato, Camarines Sur, Bicol Region, Philippines', 'seller', '2026-05-01 11:54:11', 1, 'JM-0000J', NULL, 0, 0),
(20, 'anmiranda@my.cspc.edu.ph', '$2a$10$ZGmXapNnCkJRaj6hsrReduvfFZ6IPJynuWE7cu/T57uZVoEZqjXDm', 'Anna Beatrice Miranda ', '', NULL, 'Cristo Rey, Bato, Camarines Sur, Bicol Region, Philippines', 'customer', '2026-05-01 11:55:17', 1, 'JM-0000K', NULL, 0, 0),
(21, 'edrianesamar@gmail.com', '$2a$10$2BcSg70uCt4G1Sn4c33YAuTvwcKx7NiAkPBTt/UOQY9qMoCiUezcW', 'Edriane Samar', '09123456789', NULL, NULL, 'delivery_man', '2026-05-03 03:23:22', 1, NULL, NULL, 0, 1),
(22, 'ilia@gmail.com', '$2a$10$f670e.icYiw5rYadLBsiuOf7GQNJKt4FxM.vaBs0/jqa4s927hAeG', 'Ilia ', '09457223816', NULL, NULL, 'delivery_man', '2026-05-03 03:28:17', 1, NULL, NULL, 0, 1),
(23, 'johnrey@gmail.com', '$2a$10$OF1PIWnG0Wr0jdoxz5NfieclQTRDWb6T4op2Emoy4rq5/GhoeZbC.', 'John Rey', '09112233445', NULL, NULL, 'delivery_man', '2026-05-03 03:28:47', 1, NULL, NULL, 0, 1),
(24, 'glennangelo@gmail.com', '$2a$10$2TJBTloLn1JPACIuGr9Hsu/nVKvYfTLCr3iVCZQlHUb.FF5dZi.Ze', 'Glenn Angelo', '09123456789', NULL, NULL, 'handyman', '2026-05-03 03:30:12', 1, NULL, NULL, 0, 1),
(25, 'jade@gmail.com', '$2a$10$0WpEm5zFW1T6yiKJw.fbMer225WeMpLG6n1kOg5F0kKUsv5GwRkWe', 'Jade', '09987654321', NULL, NULL, 'handyman', '2026-05-03 03:39:28', 1, NULL, NULL, 0, 1);

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
  `additional_details` varchar(255) DEFAULT NULL,
  `label` varchar(50) DEFAULT 'Home',
  `is_default` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `user_addresses`
--

INSERT INTO `user_addresses` (`address_id`, `user_id`, `full_name`, `phone`, `address`, `additional_details`, `label`, `is_default`, `created_at`, `latitude`, `longitude`) VALUES
(1, 18, 'Jaika Mae Bañaria', '0912345679', 'Baao, Camarines Sur, Bicol Region', 'Sagrada, Baao, Living Water', 'Home', 1, '2026-05-06 04:54:10', '13.4531948', '123.3663867'),
(2, 17, 'Keaneth Dave Berido', '09702697048', 'Cristo Rey, Bato, Camarines Sur, Bicol Region', 'Leysambi Milktea ', 'Home', 1, '2026-05-19 11:14:21', '13.3065252', '123.3086371');

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
(17, 0, 0, '2026-05-06 05:59:20'),
(18, 276, 276, '2026-05-06 05:14:23');

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
-- Table structure for table `vehicle_tiers`
--

CREATE TABLE `vehicle_tiers` (
  `id` int(11) NOT NULL,
  `name` varchar(60) NOT NULL,
  `base_fee` decimal(10,2) NOT NULL,
  `rate_per_km` decimal(10,2) NOT NULL,
  `max_load_desc` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `vehicle_tiers`
--

INSERT INTO `vehicle_tiers` (`id`, `name`, `base_fee`, `rate_per_km`, `max_load_desc`, `is_active`) VALUES
(1, 'Motorcycle', '200.00', '15.00', 'Small items (up to 20kg)', 1),
(2, 'Pickup Truck', '500.00', '25.00', 'Medium items (up to 300kg)', 1),
(3, 'Truck', '800.00', '40.00', 'Large/bulk items (300kg+)', 1);

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
,`base_price` decimal(10,2)
,`image_url` varchar(255)
,`description` text
,`theme` varchar(50)
,`service_type` enum('delivery','installation')
,`is_active` tinyint(1)
,`is_catalog_active` tinyint(1)
,`sold_count` int(11)
,`created_at` timestamp
,`category_name` varchar(100)
,`category_id` int(11)
,`avg_rating` decimal(14,4)
,`review_count` bigint(21)
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
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_top_selling_products`
-- (See below for the actual view)
--
CREATE TABLE `vw_top_selling_products` (
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

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_product_details`  AS SELECT `p`.`product_id` AS `product_id`, `p`.`title` AS `title`, `p`.`price` AS `price`, `p`.`base_price` AS `base_price`, `p`.`image_url` AS `image_url`, `p`.`description` AS `description`, `p`.`theme` AS `theme`, `p`.`service_type` AS `service_type`, `p`.`is_active` AS `is_active`, `p`.`is_catalog_active` AS `is_catalog_active`, `p`.`sold_count` AS `sold_count`, `p`.`created_at` AS `created_at`, `c`.`name` AS `category_name`, `c`.`category_id` AS `category_id`, coalesce(avg(`r`.`rating`),0) AS `avg_rating`, count(distinct `r`.`review_id`) AS `review_count`, coalesce((select concat('[',group_concat(concat('"',`ps`.`size`,'"') separator ','),']') from `product_sizes` `ps` where (`ps`.`product_id` = `p`.`product_id`)),'[]') AS `sizes`, coalesce((select concat('[',group_concat(concat('{"color":"',`pc`.`color`,'"}') separator ','),']') from `product_colors` `pc` where (`pc`.`product_id` = `p`.`product_id`)),'[]') AS `colors`, coalesce((select concat('[',group_concat(concat('{"label":"',`psp`.`spec_label`,'","value":"',`psp`.`spec_value`,'"}') separator ','),']') from `product_specs` `psp` where (`psp`.`product_id` = `p`.`product_id`)),'[]') AS `specs` FROM ((`products` `p` join `categories` `c` on((`p`.`category_id` = `c`.`category_id`))) left join `reviews` `r` on((`p`.`product_id` = `r`.`product_id`))) GROUP BY `p`.`product_id`, `c`.`name`, `c`.`category_id`, `p`.`service_type``service_type`  ;

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

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_seller_dashboard_stats`  AS SELECT `s`.`shop_id` AS `shop_id`, `s`.`user_id` AS `seller_id`, coalesce(sum(`o`.`total_amount`),0) AS `total_revenue`, count(distinct (case when (`o`.`status` = 'pending') then `o`.`order_id` end)) AS `pending_orders`, count(distinct `sl`.`listing_id`) AS `total_products` FROM (((`shops` `s` left join `shop_listings` `sl` on((`sl`.`shop_id` = `s`.`shop_id`))) left join `order_items` `oi` on((`oi`.`listing_id` = `sl`.`listing_id`))) left join `orders` `o` on(((`o`.`order_id` = `oi`.`order_id`) and (`o`.`status` <> 'cancelled')))) GROUP BY `s`.`shop_id`, `s`.`user_id``user_id`  ;

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
  ADD KEY `product_id` (`product_id`),
  ADD KEY `idx_cart_listing_id` (`listing_id`);

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
-- Indexes for table `delivery_men`
--
ALTER TABLE `delivery_men`
  ADD PRIMARY KEY (`delivery_man_id`),
  ADD UNIQUE KEY `user_id` (`user_id`),
  ADD KEY `shop_id` (`shop_id`);

--
-- Indexes for table `disputes`
--
ALTER TABLE `disputes`
  ADD PRIMARY KEY (`dispute_id`),
  ADD KEY `fk_disputes_order` (`order_id`);

--
-- Indexes for table `distance_cache`
--
ALTER TABLE `distance_cache`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_coord_hash` (`coord_hash`);

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
-- Indexes for table `fee_config`
--
ALTER TABLE `fee_config`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `key_name` (`key_name`);

--
-- Indexes for table `handymen`
--
ALTER TABLE `handymen`
  ADD PRIMARY KEY (`handyman_id`),
  ADD KEY `shop_id` (`shop_id`);

--
-- Indexes for table `listing_colors`
--
ALTER TABLE `listing_colors`
  ADD PRIMARY KEY (`listing_id`,`color`);

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
  ADD KEY `idx_msg_unread` (`receiver_id`,`is_read`),
  ADD KEY `fk_messages_shop` (`shop_id`);

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
  ADD KEY `idx_oi_product_id` (`product_id`),
  ADD KEY `listing_id` (`listing_id`);

--
-- Indexes for table `payment_installments`
--
ALTER TABLE `payment_installments`
  ADD PRIMARY KEY (`installment_id`),
  ADD KEY `idx_order_id` (`order_id`);

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
  ADD KEY `idx_prod_price` (`price`),
  ADD KEY `idx_prod_sold_count` (`sold_count`),
  ADD KEY `idx_prod_is_active` (`is_active`),
  ADD KEY `idx_prod_shop_active` (`is_active`);

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
-- Indexes for table `shipping_zones`
--
ALTER TABLE `shipping_zones`
  ADD PRIMARY KEY (`zone_id`);

--
-- Indexes for table `shops`
--
ALTER TABLE `shops`
  ADD PRIMARY KEY (`shop_id`),
  ADD UNIQUE KEY `user_id` (`user_id`),
  ADD KEY `idx_shop_user_id` (`user_id`),
  ADD KEY `idx_shop_status` (`status`);

--
-- Indexes for table `shop_listings`
--
ALTER TABLE `shop_listings`
  ADD PRIMARY KEY (`listing_id`),
  ADD UNIQUE KEY `uq_shop_product` (`shop_id`,`product_id`),
  ADD KEY `idx_product_id` (`product_id`);

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
-- Indexes for table `vehicle_tiers`
--
ALTER TABLE `vehicle_tiers`
  ADD PRIMARY KEY (`id`);

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `carousel_banners`
--
ALTER TABLE `carousel_banners`
  MODIFY `banner_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cart_items`
--
ALTER TABLE `cart_items`
  MODIFY `cart_item_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `category_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `custom_requests`
--
ALTER TABLE `custom_requests`
  MODIFY `request_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `custom_request_images`
--
ALTER TABLE `custom_request_images`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `delivery_men`
--
ALTER TABLE `delivery_men`
  MODIFY `delivery_man_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `disputes`
--
ALTER TABLE `disputes`
  MODIFY `dispute_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `distance_cache`
--
ALTER TABLE `distance_cache`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `faqs`
--
ALTER TABLE `faqs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `favorites`
--
ALTER TABLE `favorites`
  MODIFY `favorite_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `fee_config`
--
ALTER TABLE `fee_config`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- AUTO_INCREMENT for table `handymen`
--
ALTER TABLE `handymen`
  MODIFY `handyman_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `message_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `notification_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `order_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `order_handymen`
--
ALTER TABLE `order_handymen`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `item_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `payment_installments`
--
ALTER TABLE `payment_installments`
  MODIFY `installment_id` int(11) NOT NULL AUTO_INCREMENT;

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
  MODIFY `txn_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `product_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `product_images`
--
ALTER TABLE `product_images`
  MODIFY `image_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `reported_problems`
--
ALTER TABLE `reported_problems`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `reviews`
--
ALTER TABLE `reviews`
  MODIFY `review_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `shipping_zones`
--
ALTER TABLE `shipping_zones`
  MODIFY `zone_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `shops`
--
ALTER TABLE `shops`
  MODIFY `shop_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `shop_listings`
--
ALTER TABLE `shop_listings`
  MODIFY `listing_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `stock_alerts`
--
ALTER TABLE `stock_alerts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=26;

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
-- AUTO_INCREMENT for table `vehicle_tiers`
--
ALTER TABLE `vehicle_tiers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

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
-- Constraints for table `delivery_men`
--
ALTER TABLE `delivery_men`
  ADD CONSTRAINT `delivery_men_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `delivery_men_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

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
-- Constraints for table `listing_colors`
--
ALTER TABLE `listing_colors`
  ADD CONSTRAINT `listing_colors_ibfk_1` FOREIGN KEY (`listing_id`) REFERENCES `shop_listings` (`listing_id`) ON DELETE CASCADE;

--
-- Constraints for table `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `fk_messages_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE SET NULL,
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
  ADD CONSTRAINT `fk_oi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`),
  ADD CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`listing_id`) REFERENCES `shop_listings` (`listing_id`) ON DELETE SET NULL;

--
-- Constraints for table `payment_installments`
--
ALTER TABLE `payment_installments`
  ADD CONSTRAINT `payment_installments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE;

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
  ADD CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`);

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
-- Constraints for table `shop_listings`
--
ALTER TABLE `shop_listings`
  ADD CONSTRAINT `shop_listings_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `shop_listings_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE;

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
