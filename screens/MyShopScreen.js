import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { shopAPI, messagesAPI, BASE_URL } from '../services/api';
import { useTheme } from '../context/ThemeContext';

const MyShopScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const [shop, setShop]               = useState(null);
    const [shopId, setShopId]           = useState(null);
    const [unreadMessages, setUnreadMessages] = useState(0);

    useEffect(() => {
        if (user?.id) {
            fetchShop();
            fetchUnread();
        }
    }, [user]);

    const fetchUnread = async () => {
        try {
            const res = await messagesAPI.getConversations(user.id);
            if (res.success) {
                const total = (res.conversations || []).reduce((sum, c) => sum + (parseInt(c.unread_count) || 0), 0);
                setUnreadMessages(total);
            }
        } catch (e) { /* silent */ }
    };

    const fetchShop = async () => {
        try {
            const response = await shopAPI.getMyShop(user.id);
            if (response.success) {
                setShop(response.shop);
                setShopId(response.shop.shop_id);
            }
        } catch (error) {
            console.error('Error fetching shop:', error);
        }
    };

    const handlePress = (item) => {
        if (item.id === '1') {
            navigation.navigate('SellerProducts');
        } else if (item.id === '2') {
            navigation.navigate('CatalogBrowser', { shopId: shopId || shop?.shop_id });
        } else if (item.id === '3') {
            navigation.navigate('SellerOrders');
        } else if (item.id === '4') {
            navigation.navigate('SellerEarnings');
        } else if (item.id === '5') {
            navigation.navigate('ShopSettings');
        } else if (item.id === '6') {
            navigation.navigate('SellerAnalytics');
        } else if (item.id === '7') {
            navigation.navigate('SellerRequests');
        } else if (item.id === '8') {
            navigation.navigate('Handymen');
        } else if (item.id === '9') {
            navigation.navigate('DeliveryMen');
        } else if (item.id === '10') {
            navigation.navigate('Staff');
        } else if (item.id === '11') {
            navigation.navigate('Messages', { mode: 'shop' });
        }
    };

    const dashboardItems = [
        { id: '1', title: 'My Products',      icon: 'cube-outline',          color: '#4CAF50' },
        { id: '2', title: 'Browse Catalog',    icon: 'grid-outline',          color: '#2196F3' },
        { id: '3', title: 'Orders',            icon: 'receipt-outline',       color: '#FF9800' },
        { id: '4', title: 'My Earnings',      icon: 'cash-outline',          color: '#9C27B0' },
        { id: '5', title: 'Shop Settings',     icon: 'settings-outline',      color: '#607D8B' },
        { id: '6', title: 'Analytics',         icon: 'bar-chart-outline',     color: '#F44336' },
        { id: '7', title: 'Custom Requests',   icon: 'color-palette-outline', color: '#8D6E63' },
        { id: '8',  title: 'Handymen',       icon: 'hammer-outline',      color: '#009688' },
        { id: '9',  title: 'Delivery Men',    icon: 'car-outline',          color: '#1565C0' },
        { id: '10', title: 'My Staff',        icon: 'people-outline',       color: '#E65100' },
        { id: '11', title: 'Messages',        icon: 'chatbubbles-outline',  color: '#1976D2', badge: unreadMessages },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>My Shop</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Shop Header */}
                <View style={[styles.shopHeader, { backgroundColor: theme.accent }]}>
                    <View style={styles.shopIcon}>
                        {shop?.logo_url ? (
                            <Image source={{ uri: shop.logo_url.startsWith('http') ? shop.logo_url : `${BASE_URL}/${shop.logo_url}` }} style={styles.avatarImage} />
                        ) : (
                            <Image
                                source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(shop?.shop_name || user?.full_name || 'Shop')}&background=random&color=fff&size=128` }}
                                style={styles.avatarImage}
                            />
                        )}
                    </View>
                    <View style={styles.shopInfo}>
                        <Text style={styles.shopName}>{shop ? shop.shop_name : `${user?.full_name}'s Shop`}</Text>
                        <Text style={styles.shopStatus}>
                            {shop?.is_verified ? 'Verified Seller' : 'Seller'} • {shop?.avg_rating ? parseFloat(shop.avg_rating).toFixed(1) : '0.0'} ⭐
                        </Text>
                    </View>
                </View>

                {/* Dashboard Grid */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Seller Dashboard</Text>
                <View style={styles.grid}>
                    {dashboardItems.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={[styles.card, { backgroundColor: theme.card }]}
                            activeOpacity={0.8}
                            onPress={() => handlePress(item)}
                        >
                            <View style={[styles.iconContainer, { backgroundColor: item.color + '20' }]}>
                                <Ionicons name={item.icon} size={28} color={item.color} />
                                {item.badge > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>{item.title}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 15, paddingVertical: 15,
        borderBottomWidth: 1,
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    content: { padding: 20 },
    shopHeader: {
        flexDirection: 'row', alignItems: 'center',
        padding: 20, borderRadius: 16, marginBottom: 25,
        shadowColor: '#8D6E63', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    shopIcon: {
        width: 70, height: 70, borderRadius: 35,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center', alignItems: 'center',
        marginRight: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden',
    },
    avatarImage: { width: '100%', height: '100%' },
    shopInfo: { flex: 1 },
    shopName: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
    shopStatus: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    card: {
        width: '48%', padding: 20, borderRadius: 16, marginBottom: 15,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    iconContainer: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    cardTitle: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
    badge: {
        position: 'absolute', top: -4, right: -4,
        backgroundColor: '#e53935', borderRadius: 10,
        minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff',
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});

export default MyShopScreen;
