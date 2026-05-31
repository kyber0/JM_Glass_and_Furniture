import React, { useState, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    Image,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import CustomAlert from '../components/CustomAlert';
import EDDBanner from '../components/EDDBanner';

import { ordersAPI, customRequestsAPI, cartAPI, BASE_URL } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';


const tabs = ['All', 'Requests', 'pending', 'processing', 'shipped', 'delivered', 'To Review', 'cancelled'];
const tabLabels = {
    'All': 'All',
    'Requests': 'Requests',
    'pending': 'Pending',
    'processing': 'Processing',
    'shipped': 'Shipped',
    'delivered': 'Delivered',
    'To Review': 'To Review',
    'cancelled': 'Cancelled',
};

const statusColors = {
    'pending': '#FF9800',
    'processing': '#2196F3',
    'shipped': '#9C27B0',
    'delivered': '#4CAF50',
    'cancelled': '#e53935',
};

const MyOrdersScreen = ({ route, navigation }) => {
    const initialTab = route?.params?.initialTab || 'All';
    const [activeTab, setActiveTab] = useState(initialTab);
    const [orders, setOrders] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { theme } = useTheme();
    const [lastViewed, setLastViewed] = useState({ delivered: 0, cancelled: 0 });

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

    useFocusEffect(
        useCallback(() => {
            if (activeTab === 'Requests') {
                loadRequests();
            } else {
                loadOrders();
            }
            loadLastViewed();
        }, [activeTab])
    );

    const { socket } = useSocket();
    React.useEffect(() => {
        if (!socket) return;
        socket.on('order:update', loadOrders);
        socket.on('request:update', loadRequests);
        return () => {
            socket.off('order:update', loadOrders);
            socket.off('request:update', loadRequests);
        };
    }, [socket]);

    const loadLastViewed = async () => {
        try {
            const d = await AsyncStorage.getItem('lastViewed_delivered');
            const c = await AsyncStorage.getItem('lastViewed_cancelled');
            setLastViewed({
                delivered: d ? parseInt(d) : 0,
                cancelled: c ? parseInt(c) : 0
            });
        } catch (error) {
            console.error('Error loading last viewed:', error);
        }
    };

    const updateLastViewed = async (tab) => {
        if (tab === 'delivered' || tab === 'cancelled') {
            const now = Date.now();
            setLastViewed(prev => ({ ...prev, [tab]: now }));
            await AsyncStorage.setItem(`lastViewed_${tab}`, now.toString());
        }
    };

    const loadOrders = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const response = await ordersAPI.getUserOrders(user.id);
            if (response.success) {
                setOrders(processOrders(response.data));
            }
        } catch (error) {
            console.error('Failed to load orders:', error);
        } finally {
            setLoading(false);
        }
    };

    // Merge custom order downpayment + final balance into one card
    const processOrders = (rawOrders) => {
        const customGroups = {}; // request_id → { downpayment, final_balance }
        const regular = [];

        for (const order of rawOrders) {
            const customItem = order.items?.find(i => i.request_id && !i.listing_id);
            if (customItem) {
                const reqId = customItem.request_id;
                if (!customGroups[reqId]) customGroups[reqId] = { _isCustomGroup: true, request_id: reqId, phases: [] };
                customGroups[reqId].phases.push(order);
            } else {
                regular.push(order);
            }
        }

        // Sort phases: downpayment first (lower order_id = placed first)
        const groups = Object.values(customGroups).map(g => ({
            ...g,
            phases: g.phases.sort((a, b) => a.order_id - b.order_id),
        }));

        // Merge: put groups where the most recent phase would be, preserve date order
        const result = [...regular, ...groups].sort((a, b) => {
            const dateA = new Date(a.created_at || a.phases?.[0]?.created_at || 0);
            const dateB = new Date(b.created_at || b.phases?.[0]?.created_at || 0);
            return dateB - dateA;
        });
        return result;
    };

    const loadRequests = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const response = await customRequestsAPI.getUserRequests(user.id);
            if (response.success) {
                setRequests(response.requests);
            }
        } catch (error) {
            console.error('Failed to load requests:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelOrder = (orderId) => {
        showAlert(
            'Cancel Order',
            'Are you sure you want to cancel this order?',
            'warning',
            true,
            async () => {
                try {
                    const response = await ordersAPI.cancelOrder(orderId);
                    if (response.success) {
                        setTimeout(() => showAlert('Success', 'Order cancelled successfully', 'success'), 500);
                        loadOrders(); // Refresh list
                    } else {
                        setTimeout(() => showAlert('Error', response.message || 'Failed to cancel order', 'error'), 500);
                    }
                } catch (error) {
                    setTimeout(() => showAlert('Error', 'An error occurred while cancelling the order', 'error'), 500);
                }
            },
            'Yes, Cancel',
            'No'
        );
    };

    const handleReorder = async (order) => {
        try {
            if (!order.items || order.items.length === 0) return;
            await Promise.all(order.items.map(item =>
                cartAPI.addToCart({
                    user_id: user.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                })
            ));
            showAlert('Reorder Placed', `${order.items.length} item(s) added to your cart! 🛒`, 'success');
        } catch (error) {
            showAlert('Error', 'Could not reorder. Some items may be unavailable.', 'error');
        }
    };

    const getBadgeCount = (tab) => {
        if (tab === 'All') return 0;
        if (tab === 'To Review') {
            return orders.filter(o => (o.status === 'delivered' || o.status === 'completed') && o.review_count < (o.items ? o.items.length : 0)).length;
        }
        if (tab === 'delivered') {
            return orders.filter(o => o.status === 'delivered' && new Date(o.updated_at).getTime() > lastViewed.delivered).length;
        }
        if (tab === 'cancelled') {
            return orders.filter(o => o.status === 'cancelled' && new Date(o.updated_at).getTime() > lastViewed.cancelled).length;
        }
        return orders.filter(o => o.status === tab).length;
    };

    const filteredOrders = activeTab === 'All'
        ? orders
        : activeTab === 'Requests'
            ? requests
            : activeTab === 'To Review'
                ? orders.filter(order => (order.status === 'delivered' || order.status === 'completed') && order.review_count < (order.items ? order.items.length : 0))
                : orders.filter(order => order.status === activeTab);

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const renderOrderItem = ({ item }) => {
        // Custom order group (downpayment + final balance merged)
        if (item._isCustomGroup) return renderCustomOrderCard(item);

        const firstItem = item.items && item.items[0];
        const statusColor = statusColors[item.status] || '#999';

        return (
            <TouchableOpacity
                style={[styles.orderCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => navigation.navigate('OrderDetail', { order: item, userType: 'buyer' })}
                activeOpacity={0.9}
            >
                {/* Order Header */}
                <View style={styles.orderHeader}>
                    <Text style={[styles.orderId, { color: theme.textSecondary }]}>ORD-{item.order_id}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                            <Text style={[styles.statusText, { color: statusColor }]}>
                                {tabLabels[item.status] || item.status}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Order Items */}
                {item.items && item.items.map((orderItem, index) => (
                    <View key={index} style={styles.orderItemRow}>
                        <Image
                            source={{ uri: orderItem.image_url || 'https://via.placeholder.com/100' }}
                            style={styles.orderImage}
                        />
                        <View style={styles.orderItemInfo}>
                            <Text style={[styles.orderItemTitle, { color: theme.text }]} numberOfLines={2}>{orderItem.title}</Text>
                            {orderItem.selected_variant ? (
                                <Text style={[styles.orderVariant, { color: theme.textSecondary }]}>{orderItem.selected_variant}</Text>
                            ) : null}
                            <Text style={[styles.orderQty, { color: theme.textSecondary }]}>x{orderItem.quantity}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.orderItemPrice, { color: theme.accent }]}>
                                ₱{parseFloat(orderItem.price_at_purchase).toLocaleString()}
                            </Text>
                            {(item.status === 'delivered' || item.status === 'completed' || activeTab === 'To Review') && (
                                orderItem.is_reviewed ? (
                                    <View style={styles.ratedBadge}>
                                        <Ionicons name="checkmark-circle" size={11} color="#4CAF50" />
                                        <Text style={styles.ratedText}> Rated</Text>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={styles.rateButton}
                                        onPress={() => navigation.navigate('RateProduct', { product: orderItem, orderId: item.order_id })}
                                    >
                                        <Text style={styles.rateButtonText}>Rate</Text>
                                    </TouchableOpacity>
                                )
                            )}
                        </View>
                    </View>
                ))}

                {/* Divider */}
                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                {/* EDD on card — show for active orders */}
                {item.estimated_delivery_date && !['completed','cancelled','delivered'].includes(item.status) && (
                    <EDDBanner
                        eddMin={item.estimated_delivery_date}
                        delayed={!!item.edd_extended}
                        compact
                        style={{ marginBottom: 10 }}
                    />
                )}

                {/* Order Footer */}
                <View style={styles.orderFooter}>
                    <View>
                        <Text style={[styles.dateText, { color: theme.textMuted }]}>{formatDate(item.created_at)}</Text>
                        <Text style={[styles.totalText, { color: theme.textSecondary }]}>
                            Total: <Text style={[styles.totalAmount, { color: theme.text }]}>₱{parseFloat(item.total_amount).toLocaleString()}</Text>
                        </Text>
                    </View>
                    <View style={styles.actionButtons}>
                        {(item.status === 'delivered' || item.status === 'completed') && (
                            <TouchableOpacity
                                style={[styles.buyAgainButton, { backgroundColor: theme.accent }]}
                                onPress={() => handleReorder(item)}
                            >
                                <Ionicons name="refresh-outline" size={13} color="#fff" style={{ marginRight: 4 }} />
                                <Text style={styles.buyAgainText}>Reorder</Text>
                            </TouchableOpacity>
                        )}
                        {item.status === 'shipped' && (
                            <TouchableOpacity style={[styles.trackButton, { borderColor: theme.accent }]}>
                                <Text style={[styles.trackText, { color: theme.accent }]}>Track</Text>
                            </TouchableOpacity>
                        )}
                        {item.status === 'pending' && (
                            <TouchableOpacity
                                style={[styles.cancelButton, { borderColor: theme.danger }]}
                                onPress={() => handleCancelOrder(item.order_id)}
                            >
                                <Text style={[styles.cancelText, { color: theme.danger }]}>Cancel Order</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const renderCustomOrderCard = (group) => {
        const reqId = group.request_id;
        const [phase1, phase2] = group.phases;
        const totalPaid = group.phases.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        const isComplete = group.phases.length >= 2;

        const statusColor = isComplete ? '#9C27B0' : '#4A90D9';
        const statusLabel = isComplete ? 'Fully Paid' : 'Downpayment Paid';

        return (
            <TouchableOpacity
                key={`custom-group-${reqId}`}
                style={[styles.orderCard, { backgroundColor: theme.card, borderColor: theme.border, borderLeftWidth: 4, borderLeftColor: statusColor }]}
                onPress={() => navigation.navigate('MyRequests')}
                activeOpacity={0.9}
            >
                {/* Header */}
                <View style={styles.orderHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="color-wand" size={15} color={statusColor} />
                        <Text style={[styles.orderId, { color: theme.textSecondary }]}>REQ-{reqId}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                </View>

                {/* Phase rows */}
                {group.phases.map((order, idx) => (
                    <View key={order.order_id} style={[styles.orderItemRow, { marginBottom: 6 }]}>
                        <View style={[styles.phaseIcon, { backgroundColor: idx === 0 ? '#4A90D920' : '#9C27B020' }]}>
                            <Ionicons name={idx === 0 ? 'arrow-down-circle' : 'checkmark-done-circle'} size={20} color={idx === 0 ? '#4A90D9' : '#9C27B0'} />
                        </View>
                        <View style={styles.orderItemInfo}>
                            <Text style={[styles.orderItemTitle, { color: theme.text }]}>
                                {idx === 0 ? '50% Downpayment' : 'Final Balance'}
                            </Text>
                            <Text style={[styles.orderVariant, { color: theme.textMuted }]}>ORD-{order.order_id}</Text>
                        </View>
                        <Text style={[styles.orderItemPrice, { color: theme.accent }]}>
                            ₱{parseFloat(order.total_amount).toLocaleString()}
                        </Text>
                    </View>
                ))}

                {!isComplete && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, padding: 8, backgroundColor: '#FFF3E0', borderRadius: 8 }}>
                        <Ionicons name="information-circle-outline" size={14} color="#FF9800" />
                        <Text style={{ fontSize: 12, color: '#FF9800', fontWeight: '600' }}>Final balance payment pending</Text>
                    </View>
                )}

                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <View style={styles.orderFooter}>
                    <Text style={[styles.dateText, { color: theme.textMuted }]}>
                        {formatDate(phase1.created_at)}
                    </Text>
                    <Text style={[styles.totalAmount, { color: theme.text }]}>
                        Total Paid: ₱{totalPaid.toLocaleString()}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderRequestItem = ({ item }) => {
        let requestImage = item.product_image;
        if (!requestImage) {
            try {
                const raw = item.images;
                let images = [];
                if (Array.isArray(raw)) {
                    images = raw;
                } else if (typeof raw === 'string' && raw.length > 0) {
                    images = JSON.parse(raw);
                }
                if (images.length > 0) {
                    const firstImage = images[0];
                    requestImage = firstImage.startsWith('http') ? firstImage : `${BASE_URL}/${firstImage}`;
                }
            } catch (e) {
                // ignore
            }
        }

        return (
            <TouchableOpacity
                style={[styles.orderCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => navigation.navigate('RequestDetail', { request: item, userType: 'buyer' })}
                activeOpacity={0.9}
            >
                <View style={styles.orderHeader}>
                    <Text style={[styles.orderId, { color: theme.textSecondary }]}>REQ-{item.request_id}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getRequestStatusColor(item.status) + '20' }]}>
                        <Text style={[styles.statusText, { color: getRequestStatusColor(item.status) }]}>{item.status.toUpperCase()}</Text>
                    </View>
                </View>

                <View style={styles.orderItemRow}>
                    <Image source={{ uri: requestImage || 'https://via.placeholder.com/100' }} style={styles.orderImage} />
                    <View style={styles.orderItemInfo}>
                        <Text style={[styles.orderItemTitle, { color: theme.text }]}>{item.product_title || 'Completely Custom Design'}</Text>
                        <Text style={[styles.orderVariant, { color: theme.textSecondary }]}>Service: {item.service_type || 'Delivery'}</Text>
                        <Text style={[styles.orderQty, { color: theme.textSecondary }]} numberOfLines={2}>Details: {item.details}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.orderItemPrice, { color: theme.accent }]}>
                            {item.budget ? `Budget: ₱${parseFloat(item.budget).toLocaleString()}` : ''}
                        </Text>
                    </View>
                </View>

                <View style={styles.orderFooter}>
                    <Text style={[styles.dateText, { color: theme.textMuted }]}>{new Date(item.created_at).toLocaleDateString()}</Text>
                    {item.status === 'accepted' && (
                        <Text style={[styles.statusText, { color: '#4CAF50', marginTop: 5 }]}>Order Created</Text>
                    )}
                </View>

            </TouchableOpacity >
        );
    };

    const getRequestStatusColor = (status) => {
        switch (status) {
            case 'pending': return '#FF9800';
            case 'accepted': return '#4CAF50';
            case 'rejected': return '#F44336';
            default: return '#999';
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>My Orders</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Tabs */}
            <View style={[styles.tabsWrapper, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabsContainer}
                >
                    {tabs.map(tab => (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.tab, { backgroundColor: theme.sectionBg }, activeTab === tab && [styles.activeTab, { backgroundColor: theme.accent }]]}
                            onPress={() => {
                                setActiveTab(tab);
                                updateLastViewed(tab);
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={[styles.tabText, { color: theme.textSecondary }, activeTab === tab && styles.activeTabText]}>
                                    {tabLabels[tab]}
                                </Text>
                                {getBadgeCount(tab) > 0 && (
                                    <View style={[styles.tabBadge, { backgroundColor: theme.danger }, activeTab === tab && [styles.activeTabBadge, { backgroundColor: theme.card }]]}>
                                        <Text style={[styles.tabBadgeText, activeTab === tab && [styles.activeTabBadgeText, { color: theme.accent }]]}>
                                            {getBadgeCount(tab)}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Orders List */}
            {loading ? (
                <View style={styles.emptyContainer}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : filteredOrders.length > 0 ? (
                <FlatList
                    data={filteredOrders}
                    renderItem={activeTab === 'Requests' ? renderRequestItem : renderOrderItem}
                    keyExtractor={(item) =>
                        activeTab === 'Requests'
                            ? `req-${item.request_id}`
                            : item._isCustomGroup
                                ? `custom-group-${item.request_id}`
                                : item.order_id.toString()
                    }
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Ionicons name="receipt-outline" size={64} color={theme.icon} />
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No orders yet</Text>
                </View>
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
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#3e2723',
    },
    tabsWrapper: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    tabsContainer: {
        paddingHorizontal: 10,
        paddingVertical: 10,
    },
    tab: {
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        marginRight: 8,
    },
    activeTab: {
        backgroundColor: '#3e2723',
    },
    tabText: {
        fontSize: 13,
        color: '#777',
        fontWeight: '500',
    },
    activeTabText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    listContent: {
        padding: 15,
        paddingBottom: 30,
    },
    orderCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 15,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    orderId: {
        fontSize: 13,
        fontWeight: '600',
        color: '#555',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    orderItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    orderImage: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
    },
    orderItemInfo: {
        flex: 1,
        marginLeft: 12,
    },
    orderItemTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 2,
    },
    orderVariant: {
        fontSize: 12,
        color: '#888',
    },
    orderQty: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },
    orderItemPrice: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#8D6E63',
    },
    divider: {
        height: 1,
        backgroundColor: '#f0f0f0',
        marginVertical: 10,
    },
    orderFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateText: {
        fontSize: 11,
        color: '#999',
        marginBottom: 4,
    },
    totalText: {
        fontSize: 13,
        color: '#555',
    },
    totalAmount: {
        fontWeight: 'bold',
        color: '#3e2723',
        fontSize: 15,
    },
    actionButtons: {
        flexDirection: 'row',
    },
    phaseIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    buyAgainButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    buyAgainText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    trackButton: {
        borderWidth: 1,
        borderColor: '#8D6E63',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    trackText: {
        color: '#8D6E63',
        fontSize: 13,
        fontWeight: '600',
    },
    cancelButton: {
        borderWidth: 1,
        borderColor: '#e53935',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginLeft: 8,
    },
    cancelText: {
        color: '#e53935',
        fontSize: 13,
        fontWeight: '600',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
        marginTop: 12,
    },
    rateButton: {
        marginTop: 6,
        backgroundColor: '#FF9800',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    rateButtonText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    ratedBadge: {
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E8F5E9',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    ratedText: {
        color: '#4CAF50',
        fontSize: 11,
        fontWeight: 'bold',
    },
    tabBadge: {
        backgroundColor: '#e53935',
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 6,
    },
    activeTabBadge: {
        backgroundColor: '#fff',
    },
    tabBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    activeTabBadgeText: {
        color: '#3e2723',
    },
    paymentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    paymentChipText: {
        fontSize: 10,
        fontWeight: '700',
    },
});

export default MyOrdersScreen;
