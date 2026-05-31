import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList,
    ActivityIndicator, RefreshControl, TouchableOpacity,
    Modal, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI, BASE_URL } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const STATUS_COLOR = {
    pending: '#FF9800',
    processing: '#4A90D9',
    shipped: '#9C27B0',
    delivered: '#4CAF50',
    cancelled: '#e53935',
};

const resolveImg = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${BASE_URL}/${url}`;
};

const AdminOrdersScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [modalOrder, setModalOrder] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);

    const fetchOrders = useCallback(async () => {
        try {
            const res = await adminAPI.getOrders();
            if (res.success) setOrders(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchOrders(); }, [fetchOrders]));

    const openOrder = async (order) => {
        setShowModal(true);
        setModalOrder(null);
        setModalLoading(true);
        try {
            const res = await adminAPI.getOrderDetail(order.order_id);
            if (res.success) setModalOrder(res.data);
        } catch (e) { console.error(e); }
        finally { setModalLoading(false); }
    };

    const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

    const renderOrder = ({ item }) => {
        const color = STATUS_COLOR[item.status] || theme.accent;
        return (
            <TouchableOpacity
                style={[styles.card, { borderBottomColor: theme.border }]}
                onPress={() => openOrder(item)}
                activeOpacity={0.75}
            >
                <View style={styles.cardTop}>
                    <View>
                        <Text style={[styles.orderId, { color: theme.text }]}>Order #JM-{item.order_id}</Text>
                        <Text style={[styles.buyerName, { color: theme.textMuted }]}>{item.buyer_name}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: color + '22' }]}>
                        <Text style={[styles.statusText, { color }]}>{item.status}</Text>
                    </View>
                </View>
                <View style={styles.cardBottom}>
                    <Text style={[styles.amount, { color: theme.accent }]}>₱{parseFloat(item.total_amount).toLocaleString('en-PH')}</Text>
                    <View style={styles.cardMeta}>
                        <Text style={[styles.date, { color: theme.textMuted }]}>
                            {new Date(item.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 6 }} />
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>All Orders</Text>
                <View style={[styles.countBadge, { backgroundColor: theme.accent + '22' }]}>
                    <Text style={[styles.countText, { color: theme.accent }]}>{filtered.length}</Text>
                </View>
            </View>

            {/* Status filters */}
            <View style={styles.filterWrap}>
                {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => (
                    <TouchableOpacity
                        key={s}
                        style={[styles.chip, { backgroundColor: theme.inputBg, borderColor: theme.border },
                        filter === s && { backgroundColor: STATUS_COLOR[s] || theme.accent, borderColor: STATUS_COLOR[s] || theme.accent }]}
                        onPress={() => setFilter(s)}
                    >
                        <Text style={[styles.chipText, { color: theme.textSecondary }, filter === s && { color: '#fff' }]}>
                            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={filtered}
                    renderItem={renderOrder}
                    keyExtractor={item => item.order_id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.textMuted }]}>No orders found</Text>}
                />
            )}

            {/* Order Detail Modal */}
            <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
                <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                    <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                        <TouchableOpacity onPress={() => setShowModal(false)} style={styles.backBtn}>
                            <Ionicons name="close" size={24} color={theme.headerText} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: theme.headerText }]}>
                            {modalOrder ? `Order #JM-${modalOrder.order_id}` : 'Loading...'}
                        </Text>
                        {modalOrder && (
                            <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLOR[modalOrder.status] || theme.accent) + '22' }]}>
                                <Text style={[styles.statusText, { color: STATUS_COLOR[modalOrder.status] || theme.accent }]}>{modalOrder.status}</Text>
                            </View>
                        )}
                    </View>

                    {modalLoading ? (
                        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
                    ) : modalOrder ? (
                        <ScrollView contentContainerStyle={{ padding: 18 }}>
                            {/* Buyer info */}
                            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <Text style={[styles.sectionLabel, { color: theme.accent }]}>Buyer</Text>
                                <DetailRow label="Name" value={modalOrder.buyer_name} theme={theme} />
                                <DetailRow label="Email" value={modalOrder.email} theme={theme} />
                                <DetailRow label="Address" value={modalOrder.shipping_address || '—'} theme={theme} />
                                <DetailRow label="Payment" value={modalOrder.payment_method} theme={theme} />
                                <DetailRow label="Date" value={new Date(modalOrder.created_at).toLocaleString('en-PH')} theme={theme} />
                            </View>

                            {/* Order items */}
                            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Items ({modalOrder.items?.length || 0})</Text>
                            {modalOrder.items?.map((item, i) => (
                                <View key={i} style={[styles.itemCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                    {resolveImg(item.image_url) && (
                                        <Image source={{ uri: resolveImg(item.image_url) }} style={styles.itemImg} />
                                    )}
                                    <View style={styles.itemInfo}>
                                        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                                        <Text style={[styles.itemShop, { color: theme.textMuted }]}>{item.shop_name}</Text>
                                        {item.selected_variant ? (
                                            <Text style={[styles.itemVariant, { color: theme.textMuted }]}>Variant: {item.selected_variant}</Text>
                                        ) : null}
                                    </View>
                                    <View style={styles.itemRight}>
                                        <Text style={[styles.itemQty, { color: theme.text }]}>×{item.quantity}</Text>
                                        <Text style={[styles.itemPrice, { color: theme.accent }]}>₱{(item.price_at_purchase * item.quantity).toLocaleString('en-PH')}</Text>
                                    </View>
                                </View>
                            ))}

                            {/* Total */}
                            <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
                                <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Total Amount</Text>
                                <Text style={[styles.totalValue, { color: theme.accent }]}>
                                    ₱{parseFloat(modalOrder.total_amount).toLocaleString('en-PH')}
                                </Text>
                            </View>

                            <View style={{ height: 40 }} />
                        </ScrollView>
                    ) : null}
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
};

const DetailRow = ({ label, value, theme }) => (
    <View style={styles.detailRow}>
        <Text style={[styles.detailLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: theme.text }]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backBtn: { padding: 4, marginRight: 12 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
    countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    countText: { fontSize: 13, fontWeight: '700' },
    filterWrap: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    chipText: { fontSize: 12, fontWeight: '600' },
    list: { paddingHorizontal: 16, paddingBottom: 30 },
    card: { paddingVertical: 14, borderBottomWidth: 1 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
    orderId: { fontSize: 15, fontWeight: '700' },
    buyerName: { fontSize: 12, marginTop: 3 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    amount: { fontSize: 16, fontWeight: '800' },
    cardMeta: { flexDirection: 'row', alignItems: 'center' },
    date: { fontSize: 12 },
    emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15 },
    // modal
    section: { borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1 },
    sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
    sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    detailLabel: { fontSize: 13, flex: 1 },
    detailValue: { fontSize: 13, fontWeight: '600', flex: 2, textAlign: 'right' },
    itemCard: { flexDirection: 'row', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1 },
    itemImg: { width: 56, height: 56, borderRadius: 8, marginRight: 12 },
    itemInfo: { flex: 1 },
    itemTitle: { fontSize: 14, fontWeight: '600' },
    itemShop: { fontSize: 12, marginTop: 3 },
    itemVariant: { fontSize: 11, marginTop: 2 },
    itemRight: { alignItems: 'flex-end', marginLeft: 8 },
    itemQty: { fontSize: 13, fontWeight: '600' },
    itemPrice: { fontSize: 14, fontWeight: '700', marginTop: 4 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, marginTop: 4, borderTopWidth: 1 },
    totalLabel: { fontSize: 15, fontWeight: '600' },
    totalValue: { fontSize: 20, fontWeight: '800' },
});

export default AdminOrdersScreen;
