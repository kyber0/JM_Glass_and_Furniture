import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminAnalyticsScreen from '../screens/admin/AdminAnalyticsScreen';
import AdminOrdersScreen from '../screens/admin/AdminOrdersScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminSellerApplicationsScreen from '../screens/admin/AdminSellerApplicationsScreen';
import AdminShopsScreen from '../screens/admin/AdminShopsScreen';
import AdminLogsScreen from '../screens/admin/AdminLogsScreen';
import AdminReportsScreen from '../screens/admin/AdminReportsScreen';
import AdminProductsScreen from '../screens/admin/AdminProductsScreen';
import AdminBroadcastScreen from '../screens/admin/AdminBroadcastScreen';
import AdminHandymenScreen from '../screens/admin/AdminHandymenScreen';
import AdminDeliveryMenScreen from '../screens/admin/AdminDeliveryMenScreen';
import AdminCustomRequestsScreen from '../screens/admin/AdminCustomRequestsScreen';
import AdminPayoutsScreen from '../screens/admin/AdminPayoutsScreen';
import AdminDisputesScreen from '../screens/admin/AdminDisputesScreen';
import AdminCMSScreen from '../screens/admin/AdminCMSScreen';
import AdminVouchersScreen from '../screens/admin/AdminVouchersScreen';
import AdminPayoutDetailScreen from '../screens/admin/AdminPayoutDetailScreen';
import AdminUserDetailScreen from '../screens/admin/AdminUserDetailScreen';
import AdminShopDetailScreen from '../screens/admin/AdminShopDetailScreen';
import AdminLogDetailScreen from '../screens/admin/AdminLogDetailScreen';
import AdminProfitScreen from '../screens/admin/AdminProfitScreen';
import AdminGatewayFeesScreen from '../screens/admin/AdminGatewayFeesScreen';
import AdminProductCatalogScreen from '../screens/admin/AdminProductCatalogScreen';
import AddProductScreen from '../screens/AddProductScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// All non-tab screens reachable via Dashboard quick actions
function DashboardStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
            <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
            <Stack.Screen name="AdminApplications" component={AdminSellerApplicationsScreen} />
            <Stack.Screen name="AdminLogs" component={AdminLogsScreen} />
            <Stack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} />
            <Stack.Screen name="AdminShops" component={AdminShopsScreen} />
            <Stack.Screen name="AdminOrders" component={AdminOrdersScreen} />
            <Stack.Screen name="AdminReports" component={AdminReportsScreen} />
            <Stack.Screen name="AdminProducts" component={AdminProductsScreen} />
            <Stack.Screen name="AdminProductCatalog" component={AdminProductCatalogScreen} />
            <Stack.Screen name="AdminAddProduct" component={AddProductScreen} />
            <Stack.Screen name="AdminBroadcast" component={AdminBroadcastScreen} />
            <Stack.Screen name="AdminHandymen" component={AdminHandymenScreen} />
            <Stack.Screen name="AdminDeliveryMen" component={AdminDeliveryMenScreen} />
            <Stack.Screen name="AdminCustomRequests" component={AdminCustomRequestsScreen} />
            <Stack.Screen name="AdminPayouts" component={AdminPayoutsScreen} />
            <Stack.Screen name="AdminPayoutDetail" component={AdminPayoutDetailScreen} />
            <Stack.Screen name="AdminDisputes" component={AdminDisputesScreen} />
            <Stack.Screen name="AdminCMS" component={AdminCMSScreen} />
            <Stack.Screen name="AdminVouchers" component={AdminVouchersScreen} />
            <Stack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} />
            <Stack.Screen name="AdminShopDetail" component={AdminShopDetailScreen} />
            <Stack.Screen name="AdminLogDetail" component={AdminLogDetailScreen} />
            <Stack.Screen name="AdminProfit" component={AdminProfitScreen} />
            <Stack.Screen name="AdminGatewayFees" component={AdminGatewayFeesScreen} />
        </Stack.Navigator>
    );
}

function UsersStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
            <Stack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} />
        </Stack.Navigator>
    );
}

function OrdersStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="AdminOrdersList" component={AdminOrdersScreen} />
        </Stack.Navigator>
    );
}

function ApplicationsStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="AdminApplicationsList" component={AdminSellerApplicationsScreen} />
        </Stack.Navigator>
    );
}

const TAB_ICONS = {
    Home: ['grid', 'grid-outline'],
    Analytics: ['bar-chart', 'bar-chart-outline'],
    Orders: ['receipt', 'receipt-outline'],
    Users: ['people', 'people-outline'],
    Applications: ['document-text', 'document-text-outline'],
    More: ['ellipsis-horizontal', 'ellipsis-horizontal-outline'],
};

// "More" stack for Reports, Products, Broadcast, Handymen, Custom Requests
function MoreStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MoreMenu" component={MoreMenuScreen} />
            <Stack.Screen name="AdminShops" component={AdminShopsScreen} />
            <Stack.Screen name="AdminReports" component={AdminReportsScreen} />
            <Stack.Screen name="AdminProducts" component={AdminProductsScreen} />
            <Stack.Screen name="AdminProductCatalog" component={AdminProductCatalogScreen} />
            <Stack.Screen name="AdminAddProduct" component={AddProductScreen} />
            <Stack.Screen name="AdminBroadcast" component={AdminBroadcastScreen} />
            <Stack.Screen name="AdminHandymen" component={AdminHandymenScreen} />
            <Stack.Screen name="AdminDeliveryMen" component={AdminDeliveryMenScreen} />
            <Stack.Screen name="AdminCustomRequests" component={AdminCustomRequestsScreen} />
            <Stack.Screen name="AdminPayouts" component={AdminPayoutsScreen} />
            <Stack.Screen name="AdminPayoutDetail" component={AdminPayoutDetailScreen} />
            <Stack.Screen name="AdminDisputes" component={AdminDisputesScreen} />
            <Stack.Screen name="AdminCMS" component={AdminCMSScreen} />
            <Stack.Screen name="AdminVouchers" component={AdminVouchersScreen} />
            <Stack.Screen name="AdminLogs" component={AdminLogsScreen} />
            <Stack.Screen name="AdminLogDetail" component={AdminLogDetailScreen} />
            <Stack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} />
            <Stack.Screen name="AdminShopDetail" component={AdminShopDetailScreen} />
        </Stack.Navigator>
    );
}

// Simple "More" menu screen
import React_native from 'react-native';
const { View, Text, TouchableOpacity, StyleSheet, ScrollView } = React_native;
import { SafeAreaView } from 'react-native-safe-area-context';

function MoreMenuScreen({ navigation }) {
    const { theme } = useTheme();
    const items = [
        { label: 'Manage Shops', icon: 'storefront', screen: 'AdminShops', color: '#ffb300' },
        { label: 'Reports', icon: 'flag', screen: 'AdminReports', color: '#e53935' },
        { label: 'Product Catalog', icon: 'cube', screen: 'AdminProductCatalog', color: '#4A90D9' },
        { label: 'Payouts', icon: 'wallet', screen: 'AdminPayouts', color: '#8BC34A' },
        { label: 'Order Disputes', icon: 'shield-half', screen: 'AdminDisputes', color: '#E91E63' },
        { label: 'Platform Content', icon: 'images', screen: 'AdminCMS', color: '#FF9800' },
        { label: 'Promotions / Vouchers', icon: 'ticket', screen: 'AdminVouchers', color: '#673AB7' },
        { label: 'Communications', icon: 'megaphone', screen: 'AdminBroadcast', color: '#00BCD4' },
        { label: 'Handymen', icon: 'construct', screen: 'AdminHandymen', color: '#9C27B0' },
        { label: 'Delivery Men', icon: 'car', screen: 'AdminDeliveryMen', color: '#1565C0' },
        { label: 'Custom Requests', icon: 'hammer', screen: 'AdminCustomRequests', color: '#00BCD4' },
        { label: 'Activity Logs', icon: 'list', screen: 'AdminLogs', color: '#4CAF50' },
    ];
    return (
        <SafeAreaView style={[moreStyles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[moreStyles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <Text style={[moreStyles.headerTitle, { color: theme.headerText }]}>More</Text>
            </View>
            <ScrollView contentContainerStyle={moreStyles.list}>
                {items.map(item => (
                    <TouchableOpacity
                        key={item.label}
                        style={[moreStyles.row, { borderBottomColor: theme.border }]}
                        onPress={() => navigation.navigate(item.screen)}
                        activeOpacity={0.75}
                    >
                        <View style={[moreStyles.iconBox, { backgroundColor: item.color + '22' }]}>
                            <Ionicons name={item.icon} size={22} color={item.color} />
                        </View>
                        <Text style={[moreStyles.label, { color: theme.text }]}>{item.label}</Text>
                        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const moreStyles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
    headerTitle: { fontSize: 22, fontWeight: '800' },
    list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 30 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, gap: 14 },
    iconBox: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    label: { flex: 1, fontSize: 16, fontWeight: '600' },
});

export default function AdminTabs() {
    const { theme } = useTheme();

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarIcon: ({ focused, color, size }) => {
                    const [active, inactive] = TAB_ICONS[route.name] || ['ellipse', 'ellipse-outline'];
                    return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
                },
                tabBarActiveTintColor: theme.accent,
                tabBarInactiveTintColor: theme.textSecondary,
                tabBarStyle: {
                    backgroundColor: theme.tabBar,
                    borderTopColor: theme.border,
                    height: 60,
                    paddingBottom: 10,
                    paddingTop: 5,
                },
                tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
            })}
        >
            <Tab.Screen name="Home" component={DashboardStack} />
            <Tab.Screen name="Analytics" component={AdminAnalyticsScreen} />
            <Tab.Screen name="Orders" component={OrdersStack} />
            <Tab.Screen name="Users" component={UsersStack} />
            <Tab.Screen name="Applications" component={ApplicationsStack} />
            <Tab.Screen name="More" component={MoreStack} />
        </Tab.Navigator>
    );
}
