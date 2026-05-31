import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { shopAPI, BASE_URL } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CustomAlert from '../components/CustomAlert';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';

const SellerOrdersScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('All');
    const [updating, setUpdating] = useState(false);
    const [lastViewedCounts, setLastViewedCounts] = useState({});


    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info',
        showCancel: false,
        onConfirm: null,
        confirmText: 'OK',
        cancelText: 'Cancel'
    });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null, confirmText = 'OK', cancelText = 'Cancel') => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm, confirmText, cancelText });
    };

    const hideAlert = () => {
        setAlertConfig({ ...alertConfig, visible: false });
    };

    // Load last viewed counts on mount
    React.useEffect(() => {
        const loadCounts = async () => {
            try {
                const stored = await AsyncStorage.getItem(`seller_last_viewed_${user.id}`);
                if (stored) setLastViewedCounts(JSON.parse(stored));
            } catch (e) { console.error(e); }
        };
        loadCounts();
    }, [user.id]);

    // Update last viewed count when tab changes
    const handleTabChange = async (tab) => {
        setActiveTab(tab);
        if (tab === 'Delivered' || tab === 'Cancelled') {
            const statusFn = tab.toLowerCase();
            const currentCount = orders.filter(o => o.status === statusFn).length;
            const newCounts = { ...lastViewedCounts, [tab]: currentCount };
            setLastViewedCounts(newCounts);
            try {
                await AsyncStorage.setItem(`seller_last_viewed_${user.id}`, JSON.stringify(newCounts));
            } catch (e) { console.error(e); }
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchOrders();
        }, [])
    );

    const { socket } = useSocket();
    React.useEffect(() => {
        if (!socket) return;
        socket.on('order:update', fetchOrders);
        return () => socket.off('order:update', fetchOrders);
    }, [socket]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const response = await shopAPI.getOrders(user.id);
            if (response.success) {
                setOrders(response.orders);
            }

        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (orderId, newStatus) => {
        setUpdating(true);
        try {
            const response = await shopAPI.updateOrderStatus(orderId, newStatus);
            if (response.success) {
                setTimeout(() => showAlert('Success', 'Order status updated', 'success'), 500);
                fetchOrders(); // Refresh
            } else {
                setTimeout(() => showAlert('Error', response.message, 'error'), 500);
            }
        } catch (error) {
            setTimeout(() => showAlert('Error', 'Failed to update status', 'error'), 500);
        } finally {
            setUpdating(false);
        }
    };

    const confirmStatusChange = (order, currentStatus) => {
        const nextStatusMap = {
            'pending': 'processing',
            'processing': 'shipped',
            'shipped': 'delivered'
        };
        const nextStatus = nextStatusMap[currentStatus];
        if (!nextStatus) return;
        showAlert('Update Status', `Mark order as ${nextStatus}?`, 'info', true,
            () => handleUpdateStatus(order.order_id, nextStatus), 'Confirm', 'Cancel');
    };



    const filteredOrders = activeTab === 'All'
        ? orders
        : orders.filter(o => o.status === activeTab.toLowerCase());

    const orderCounts = orders.reduce((acc, order) => {
        const status = order.status.toLowerCase();
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    const tabs = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

    const renderOrderItem = ({ item }) => {
        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card }]}
                onPress={() => navigation.navigate('OrderDetail', { order: item, userType: 'seller' })}
                activeOpacity={0.9}
            >
                <View style={styles.cardHeader}>
                    <Text style={[styles.orderId, { color: theme.text }]}>Order #{item.order_id}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                        </View>
                    </View>
                </View>

                <Text style={[styles.date, { color: theme.textMuted }]}>{new Date(item.created_at).toLocaleDateString()}</Text>

                <View style={styles.buyerContainer}>
                    {item.buyer_profile_image ? (
                        <Image
                            source={{ uri: item.buyer_profile_image.startsWith('http') ? item.buyer_profile_image : `${BASE_URL}/${item.buyer_profile_image}` }}
                            style={styles.buyerAvatar}
                        />
                    ) : (
                        <View style={[styles.buyerAvatar, styles.buyerAvatarPlaceholder]}>
                            <Ionicons name="person" size={16} color="#fff" />
                        </View>
                    )}
                    <Text style={[styles.buyer, { color: theme.textSecondary }]}>Buyer: {item.buyer_name}</Text>
                </View>

                <View style={[styles.itemsContainer, { backgroundColor: theme.inputBg }]}>
                    {item.items.map((prod, index) => (
                        <View key={index} style={styles.productRow}>
                            <Text style={[styles.quantity, { color: theme.accent }]}>{prod.quantity}x</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.productName, { color: theme.text }]} numberOfLines={1}>{prod.title}</Text>
                                {prod.selected_variant ? (
                                    <Text style={[styles.variantText, { color: theme.accent }]}>{prod.selected_variant}</Text>
                                ) : null}
                            </View>
                        </View>
                    ))}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    {item.payment_method ? (
                        <View style={[styles.paymentRow, { marginBottom: 0 }]}>
                            <Ionicons name="card-outline" size={14} color={theme.accent} />
                            <Text style={[styles.paymentText, { color: theme.accent }]}>{item.payment_method}</Text>
                        </View>
                    ) : <View />}

                    {/* Auto-assigned installer info chip */}
                    {!!item.handyman_name && (
                        <View style={styles.autoAssignChip}>
                            <Ionicons name="hammer-outline" size={12} color="#6C3483" />
                            <Text style={styles.autoAssignText} numberOfLines={1}>{item.handyman_name}</Text>
                        </View>
                    )}
                </View>

                <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                    <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Total: <Text style={[styles.totalValue, { color: theme.text }]}>₱{parseFloat(item.total_amount).toLocaleString()}</Text></Text>

                    <View style={styles.footerRight}>

                        {['pending', 'processing'].includes(item.status) && (
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: theme.accent }]}
                                onPress={() => confirmStatusChange(item, item.status)}
                                disabled={updating}
                            >
                                <Text style={styles.actionText}>
                                    {item.status === 'pending' ? 'Process Order' : 'Mark Shipped'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return '#FF9800';
            case 'processing': return '#2196F3';
            case 'shipped': return '#9C27B0';
            case 'delivered': return '#4CAF50';
            case 'cancelled': return '#F44336';
            default: return '#757575';
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Shop Orders</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={[styles.tabsContainer, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <FlatList
                    data={tabs}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={item => item}
                    renderItem={({ item }) => {
                        const rawCount = item === 'All' ? 0 : orderCounts[item.toLowerCase()] || 0;
                        let displayCount = rawCount;
                        if (item === 'Delivered' || item === 'Cancelled') {
                            const seen = lastViewedCounts[item] || 0;
                            displayCount = Math.max(0, rawCount - seen);
                        }
                        const isActive = activeTab === item;
                        return (
                            <TouchableOpacity
                                style={[styles.tab, { backgroundColor: theme.inputBg }, isActive && [styles.activeTab, { backgroundColor: theme.accent }]]}
                                onPress={() => handleTabChange(item)}
                            >
                                <Text style={[styles.tabText, { color: theme.textSecondary }, isActive && styles.activeTabText]}>{item}</Text>
                                {displayCount > 0 && (
                                    <View style={[styles.tabBadge, isActive && styles.activeTabBadge]}>
                                        <Text style={[styles.tabBadgeText, isActive && styles.activeTabBadgeText]}>
                                            {displayCount}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                    contentContainerStyle={styles.tabsList}
                />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : filteredOrders.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="receipt-outline" size={64} color={theme.textMuted} />
                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>No orders found.</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredOrders}
                    renderItem={renderOrderItem}
                    keyExtractor={item => item.order_id.toString()}
                    contentContainerStyle={styles.list}
                />
            )}



            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                onConfirm={() => {
                    hideAlert();
                    if (alertConfig.onConfirm) alertConfig.onConfirm();
                }}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 15, borderBottomWidth: 1,
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    tabsContainer: { paddingVertical: 10, borderBottomWidth: 1 },
    tabsList: { paddingHorizontal: 15 },
    tab: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
        marginRight: 10,
    },
    tabBadge: {
        backgroundColor: '#e53935', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6,
    },
    activeTabBadge: { backgroundColor: '#fff' },
    tabBadgeText: { fontSize: 10, color: '#fff', fontWeight: 'bold' },
    activeTabBadgeText: { color: '#e53935' },
    activeTab: {},
    tabText: { fontWeight: '600' },
    activeTabText: { color: '#fff' },
    list: { padding: 15 },
    card: {
        borderRadius: 12, padding: 15, marginBottom: 15,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    orderId: { fontSize: 16, fontWeight: 'bold' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    date: { fontSize: 12, marginBottom: 6 },
    buyerContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    buyerAvatar: { width: 24, height: 24, borderRadius: 12, marginRight: 8 },
    buyerAvatarPlaceholder: { backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
    buyer: { fontSize: 14, fontWeight: '500' },
    itemsContainer: { padding: 10, borderRadius: 8, marginBottom: 12 },
    productRow: { flexDirection: 'row', marginBottom: 4 },
    quantity: { fontWeight: 'bold', marginRight: 8, width: 25 },
    productName: { flex: 1 },
    variantText: { fontSize: 11, marginTop: 2 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12 },
    footerRight: { flexDirection: 'row', alignItems: 'center' },
    totalLabel: { fontSize: 14 },
    totalValue: { fontSize: 16, fontWeight: 'bold' },
    actionButton: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
    actionText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    autoAssignChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#EDE7F6' },
    autoAssignText: { fontSize: 11, fontWeight: '600', color: '#6C3483', maxWidth: 120 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { marginTop: 10 },
    paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    paymentText: { fontSize: 13, fontWeight: '500' },
    paymentChip: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        borderWidth: 1, borderRadius: 10,
        paddingHorizontal: 7, paddingVertical: 3,
    },
    paymentChipText: { fontSize: 10, fontWeight: '700' },
});

export default SellerOrdersScreen;
