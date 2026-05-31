import React from 'react';
import 'react-native-gesture-handler';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';

import { FavoritesProvider, useFavorites } from './context/FavoritesContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import GetStartedScreen from './screens/GetStartedScreen';
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import HomeScreen from './screens/HomeScreen';
import FavoritesScreen from './screens/FavoritesScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import MenuScreen from './screens/MenuScreen';
import CartScreen from './screens/CartScreen';
import ProductDetailScreen from './screens/ProductDetailScreen';
import MessagesScreen from './screens/MessagesScreen';
import ChatScreen from './screens/ChatScreen';
import MyOrdersScreen from './screens/MyOrdersScreen';
import BecomeSellerScreen from './screens/BecomeSellerScreen';
import AboutUsScreen from './screens/AboutUsScreen';
import SettingsScreen from './screens/SettingsScreen';
import DesignThemeScreen from './screens/DesignThemeScreen';
import ProfileScreen from './screens/ProfileScreen';
import MyShopScreen from './screens/MyShopScreen';
import SellerProductsScreen from './screens/SellerProductsScreen';
import AddProductScreen from './screens/AddProductScreen';
import CatalogBrowserScreen from './screens/CatalogBrowserScreen';
import AdminProductCatalogScreen from './screens/admin/AdminProductCatalogScreen';
import SellerOrdersScreen from './screens/SellerOrdersScreen';
import SellerEarningsScreen from './screens/SellerEarningsScreen';
import MyWalletScreen from './screens/MyWalletScreen';
import SellerAnalyticsScreen from './screens/SellerAnalyticsScreen';
import ShopSettingsScreen from './screens/ShopSettingsScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import RateProductScreen from './screens/RateProductScreen';
import FileDisputeScreen from './screens/FileDisputeScreen';
import ShopScreen from './screens/ShopScreen';
import AllReviewsScreen from './screens/AllReviewsScreen';
import RequestCustomizationScreen from './screens/RequestCustomizationScreen';
import SellerRequestsScreen from './screens/SellerRequestsScreen';
import RequestDetailScreen from './screens/RequestDetailScreen';
import OrderDetailScreen from './screens/OrderDetailScreen';
import MyRequestsScreen from './screens/MyRequestsScreen';
import HandymenScreen from './screens/HandymenScreen';
import HelpCenterScreen from './screens/HelpCenterScreen';
import SearchResultsScreen from './screens/SearchResultsScreen';
import ReportProblemScreen from './screens/ReportProblemScreen';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './screens/TermsOfServiceScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import ShippingAddressesScreen from './screens/ShippingAddressesScreen';
import PaymentMethodsScreen from './screens/PaymentMethodsScreen';
import LiveTrackingScreen from './screens/LiveTrackingScreen';
import MyPointsScreen from './screens/MyPointsScreen';
import NotificationGroupScreen from './screens/NotificationGroupScreen';
import DeliveryManDashboard from './screens/DeliveryManDashboard';
import HandymanDashboard from './screens/HandymanDashboard';
import WorkerOrderDetailScreen from './screens/WorkerOrderDetailScreen';
import WorkerHistoryDetailScreen from './screens/WorkerHistoryDetailScreen';
import StaffScreen from './screens/StaffScreen';
import DeliveryMenScreen from './screens/DeliveryMenScreen';
import AdminTabs from './navigation/AdminTabs';
import { CartProvider } from './context/CartContext';
import { FeesProvider } from './context/FeesContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import { SocketProvider } from './context/SocketContext';
import { ActivityIndicator, View } from 'react-native';
import MaintenanceScreen from './screens/MaintenanceScreen';
import AdminLoginScreen from './screens/AdminLoginScreen';
import { publicAPI } from './services/api';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { favorites } = useFavorites();
  const { unreadCount } = useNotifications();
  const { theme, darkMode } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Favorites') {
            iconName = focused ? 'heart' : 'heart-outline';
          } else if (route.name === 'Notifications') {
            iconName = focused ? 'notifications' : 'notifications-outline';
          } else if (route.name === 'Menu') {
            iconName = focused ? 'menu' : 'menu-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarBadge: route.name === 'Favorites' && favorites.length > 0
          ? favorites.length
          : route.name === 'Notifications' && unreadCount > 0
            ? unreadCount
            : null,
        tabBarBadgeStyle: { backgroundColor: '#e53935', fontSize: 10, height: 18, minWidth: 18, borderRadius: 9, lineHeight: 18, paddingHorizontal: 2 },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
          height: 60,
          paddingBottom: 10,
          paddingTop: 5,
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Favorites" component={FavoritesScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Menu" component={MenuScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();
  const { navigationTheme, theme } = useTheme();
  const navigationRef = React.useRef(null);
  const [maintenanceActive, setMaintenanceActive] = React.useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = React.useState('');
  const [maintenanceChecking, setMaintenanceChecking] = React.useState(false);
  const [showAdminLogin, setShowAdminLogin] = React.useState(false);

  // Check maintenance mode on load and whenever the user changes
  const checkMaintenance = React.useCallback(async () => {
    // Admins are never blocked — also close admin login screen once they log in
    if (user?.role === 'admin') { setMaintenanceActive(false); setShowAdminLogin(false); return; }
    setMaintenanceChecking(true);
    try {
      const res = await publicAPI.getMaintenanceStatus();
      if (res.success) {
        const isOn = res.data?.maintenance_mode === 'true';
        setMaintenanceActive(isOn);
        setMaintenanceMsg(res.data?.maintenance_message || '');
        // Re-engage the gate if a non-admin logged in through the admin login screen
        if (isOn) setShowAdminLogin(false);
      }
    } catch (e) {
      // If we can't reach the server, don't block the user
      setMaintenanceActive(false);
    } finally {
      setMaintenanceChecking(false);
    }
  }, [user]);

  React.useEffect(() => { checkMaintenance(); }, [checkMaintenance]);

  // When auth state changes, navigate to the right screen
  React.useEffect(() => {
    if (loading) return;
    if (!navigationRef.current) return;

    if (user) {
      if (user.role === 'admin') {
        navigationRef.current.reset({ index: 0, routes: [{ name: 'AdminMain' }] });
      } else if (user.role === 'delivery_man') {
        navigationRef.current.reset({ index: 0, routes: [{ name: 'DeliveryManDashboard' }] });
      } else if (user.role === 'handyman') {
        navigationRef.current.reset({ index: 0, routes: [{ name: 'HandymanDashboard' }] });
      } else {
        // customer / seller / guest → normal app
        navigationRef.current.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
    } else {
      // Logged out — go to GetStarted
      navigationRef.current.reset({
        index: 0,
        routes: [{ name: 'GetStarted' }],
      });
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#8D6E63" />
      </View>
    );
  }

  // Show maintenance screen to non-admin users when maintenance is on
  if (maintenanceActive && user?.role !== 'admin') {
    // Show the admin-only login screen
    if (showAdminLogin) {
      return (
        <AdminLoginScreen
          onCancel={() => setShowAdminLogin(false)}
        />
      );
    }
    // Show the public maintenance screen
    return (
      <MaintenanceScreen
        message={maintenanceMsg}
        onRetry={checkMaintenance}
        isRetrying={maintenanceChecking}
        onAdminLogin={() => setShowAdminLogin(true)}
      />
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={
          user?.role === 'admin'        ? 'AdminMain' :
          user?.role === 'delivery_man' ? 'DeliveryManDashboard' :
          user?.role === 'handyman'     ? 'HandymanDashboard' :
          user                          ? 'Main' : 'GetStarted'
        }>
        <Stack.Screen name="GetStarted" component={GetStartedScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="AdminMain" component={AdminTabs} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <Stack.Screen name="Messages" component={MessagesScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="MyOrders" component={MyOrdersScreen} />
        <Stack.Screen name="BecomeSeller" component={BecomeSellerScreen} />
        <Stack.Screen name="AboutUs" component={AboutUsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="DesignTheme" component={DesignThemeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="MyShop" component={MyShopScreen} />
        <Stack.Screen name="SellerProducts" component={SellerProductsScreen} />
        <Stack.Screen name="AddProduct" component={AddProductScreen} />
        <Stack.Screen name="CatalogBrowser" component={CatalogBrowserScreen} />
        <Stack.Screen name="AdminAddProduct" component={AddProductScreen} />
        <Stack.Screen name="AdminProductCatalog" component={AdminProductCatalogScreen} />
        <Stack.Screen name="SellerOrders" component={SellerOrdersScreen} />
        <Stack.Screen name="SellerEarnings" component={SellerEarningsScreen} />
        <Stack.Screen name="MyWallet" component={MyWalletScreen} />
        <Stack.Screen name="SellerAnalytics" component={SellerAnalyticsScreen} />
        <Stack.Screen name="ShopSettings" component={ShopSettingsScreen} />
        <Stack.Screen name="Cart" component={CartScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="RateProduct" component={RateProductScreen} />
        <Stack.Screen name="FileDispute" component={FileDisputeScreen} />
        <Stack.Screen name="Shop" component={ShopScreen} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
        <Stack.Screen name="MyRequests" component={MyRequestsScreen} />
        <Stack.Screen name="AllReviews" component={AllReviewsScreen} />
        <Stack.Screen name="RequestCustomization" component={RequestCustomizationScreen} />
        <Stack.Screen name="SellerRequests" component={SellerRequestsScreen} />
        <Stack.Screen name="RequestDetail" component={RequestDetailScreen} />
        <Stack.Screen name="Handymen" component={HandymenScreen} />
        <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
        <Stack.Screen name="SearchResults" component={SearchResultsScreen} />
        <Stack.Screen name="ReportProblem" component={ReportProblemScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="ShippingAddresses" component={ShippingAddressesScreen} />
        <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
        <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
        <Stack.Screen name="MyPoints" component={MyPointsScreen} />
        <Stack.Screen name="NotificationGroup" component={NotificationGroupScreen} />
        {/* ── Worker Panels ─────────────────────────────────────────── */}
        <Stack.Screen name="DeliveryManDashboard" component={DeliveryManDashboard} />
        <Stack.Screen name="HandymanDashboard" component={HandymanDashboard} />
        <Stack.Screen name="WorkerOrderDetail" component={WorkerOrderDetailScreen} />
        <Stack.Screen name="WorkerHistoryDetail" component={WorkerHistoryDetailScreen} />
        <Stack.Screen name="Staff" component={StaffScreen} />
        <Stack.Screen name="DeliveryMen" component={DeliveryMenScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
      </Stack.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FavoritesProvider>
          <CartProvider>
            <FeesProvider>
              <NotificationProvider>
                <SocketProvider>
                  <AppNavigator />
                </SocketProvider>
              </NotificationProvider>
            </FeesProvider>
          </CartProvider>
        </FavoritesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
