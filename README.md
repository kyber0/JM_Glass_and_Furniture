# JM Glass and Furniture Mobile Application

A premium, full-stack mobile application and backend API platform built for **JM Glass & Furniture**. The application serves as an all-in-one e-commerce ecosystem, coordinating buyers, sellers, administrators, handymen, and delivery personnel in real-time.

## 🚀 Project Overview

The project is divided into two primary components:
1. **Frontend App**: Built with **React Native (Expo)**, targeting iOS, Android, and Web platforms.
2. **Backend Services**: Built with **Node.js, Express, MySQL, and Socket.io** for real-time operations, tracking, and messaging.

---

## 🛠️ Tech Stack

### Frontend Mobile App
*   **Core**: React Native, Expo (SDK 54)
*   **Navigation**: React Navigation (Bottom Tabs, Native Stack)
*   **State Management**: Context API (Auth, Cart, Favorites, Fees, Notifications, Socket, Theme)
*   **Maps & Geolocation**: React Native Maps, Expo Location
*   **Hardware APIs**: Expo Camera, Image Picker, Print, Sharing, Secure Store, Local Authentication (Biometrics)
*   **Real-time Connection**: Socket.io-client

### Backend REST & Real-time API
*   **Runtime**: Node.js, Express
*   **Database**: MySQL (using `mysql2`)
*   **Real-time Server**: Socket.io
*   **Authentication**: JSON Web Tokens (JWT) & bcryptjs
*   **Testing & Tunnels**: Ngrok & Local Tunnel integrations
*   **Utilities**: Multer (file uploads), Lodash, Auto-Assign Algorithms

---

## 📱 Key Features

### 👤 Buyer & Customer Portal
*   Browse catalog and search products with intelligent suggestions.
*   Configure custom customization requests for bespoke glass or furniture.
*   Add items to Cart/Favorites, manage shipping addresses, and checkout using integrated gateway configurations.
*   Live order tracking with real-time map geolocation updates.
*   Wallet and loyalty points modules.

### 🏪 Seller Portal
*   Create a virtual shop and manage product catalogs.
*   View sales analytics, earnings logs, and payout histories.
*   Manage seller order statuses, custom requests, and reviews.

### 🛠️ Handymen & Delivery Modules
*   **Handyman Portal**: View assigned requests, mark progress, and manage maintenance/installation history.
*   **Delivery Portal**: Live routing, delivery tracking, dashboard for orders, and real-time updates for customers.

### 🛡️ Administrator Panel
*   Comprehensive CMS and gateway fees configurations.
*   Dashboard tracking profits, user statistics, shop status, and custom disputes.
*   System audit logging and broadcast notifications.

---

## 📁 Repository Structure

```
├── .antigravity/         # IDE configuration files
├── assets/               # Splash icons, application logos, and images
├── backend/              # Node.js Express server, routes, and DB helper scripts
├── components/           # Reusable UI component library (Alerts, Autocomplete, Modals)
├── context/              # Context definitions for global application state
├── db_backup/            # SQL schema dumps and migration files
├── documents/            # Project reports, database diagrams, and PDFs
├── navigation/           # Tab and stack navigation setups
├── screens/              # All application pages categorized by user role
├── scripts/              # Setup, migration, and update utilities
├── utils/                # Helper functions and search history utilities
```

---

## 🏁 Getting Started

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v18+ recommended)
*   [MySQL Server](https://www.mysql.com/)
*   [Expo Go app](https://expo.dev/client) installed on your mobile device (for testing)

### 2. Backend Setup
1. Navigate to the `backend/` directory.
2. Create a `.env` file based on the local environment template.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run migrations/setup to seed the database:
   ```bash
   npm run reset
   ```
5. Start the backend developer server:
   ```bash
   npm run dev
   ```

### 3. Frontend App Setup
1. Navigate back to the root directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Expo server:
   ```bash
   npm run start
   ```
4. Scan the QR code using the **Expo Go** app to run the application on your device.
