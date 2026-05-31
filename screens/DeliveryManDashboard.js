import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Linking, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ordersAPI, workersAPI, notificationsAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import ReceiptModal from '../components/ReceiptModal';

const STATUS_CFG = {
    pending:    { bg: '#FFF8E1', text: '#F57F17', icon: 'time-outline',           label: 'Pending'    },
    processing: { bg: '#E3F2FD', text: '#1565C0', icon: 'cube-outline',           label: 'Processing' },
    shipped:    { bg: '#E8F5E9', text: '#2E7D32', icon: 'car-outline',            label: 'In Transit' },
    delivered:  { bg: '#EDE7F6', text: '#4527A0', icon: 'checkmark-circle-outline',label: 'Delivered' },
    completed:  { bg: '#F3E5F5', text: '#6A1B9A', icon: 'ribbon-outline',         label: 'Completed'  },
};

const DM_STATUS = {
    available:   { label: 'Available',   color: '#2E7D32', bg: '#E8F5E9', icon: 'checkmark-circle' },
    on_delivery: { label: 'On Delivery', color: '#1565C0', bg: '#E3F2FD', icon: 'car'             },
    off:         { label: 'Off Duty',    color: '#546E7A', bg: '#ECEFF1', icon: 'moon'            },
};

const TABS = ['Active', 'History'];

const minutesAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

export default function DeliveryManDashboard({ navigation }) {
    const { user, logout } = useAuth();
    const { theme } = useTheme();

    const [tab,            setTab]            = useState('Active');
    const [deliveryManId,  setDeliveryManId]  = useState(null);
    const [dmStatus,       setDmStatus]       = useState('available');
    const [orders,         setOrders]         = useState([]);
    const [history,        setHistory]        = useState([]);
    const [unreadCount,    setUnreadCount]    = useState(0);
    const [loading,        setLoading]        = useState(true);
    const [refreshing,     setRefreshing]     = useState(false);
    const [trackingOrderId,setTrackingOrderId]= useState(null);
    const locationSub = useRef(null);

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null });
    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) =>
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    const hideAlert = () => setAlertConfig(p => ({ ...p, visible: false }));

    // QR scanner state
    const [scannerVisible, setScannerVisible]   = useState(false);
    const [scanTarget,     setScanTarget]       = useState(null); // { order, action }
    const [scanProcessing, setScanProcessing]   = useState(false);
    const [cameraPermission, requestPermission] = useCameraPermissions();
    const [receipt,        setReceipt]          = useState(null);
    const [receiptVisible, setReceiptVisible]   = useState(false);

    // ── Load ──────────────────────────────────────────────────────────────────
    const load = useCallback(async () => {
        if (!user) return;
        try {
            const dmRes = await workersAPI.getDeliveryManProfile(user.id);
            if (dmRes?.success && dmRes.delivery_man) {
                const dm = dmRes.delivery_man;
                setDeliveryManId(dm.delivery_man_id);
                setDmStatus(dm.status || 'available');

                const [ordersRes, histRes, notifRes] = await Promise.all([
                    ordersAPI.getForDelivery(dm.delivery_man_id),
                    workersAPI.getDeliveryHistory(dm.delivery_man_id),
                    notificationsAPI.getUserNotifications(user.id),
                ]);
                if (ordersRes?.success)  setOrders(ordersRes.orders || []);
                if (histRes?.success)    setHistory(histRes.history || []);
                if (notifRes?.success)   setUnreadCount((notifRes.notifications || []).filter(n => !n.read).length);
            }
        } catch (e) {
            console.error('[DeliveryManDashboard]', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

    // ── GPS ───────────────────────────────────────────────────────────────────
    const startGPS = async (orderId) => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { showAlert('Permission Denied', 'Location permission required.', 'error'); return; }
        setTrackingOrderId(orderId);
        locationSub.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 20 },
            ({ coords }) => ordersAPI.updateLocation(orderId, coords.latitude, coords.longitude).catch(() => {})
        );
    };

    const stopGPS = () => { locationSub.current?.remove(); locationSub.current = null; setTrackingOrderId(null); };

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleStartDelivery = (order) => {
        showAlert('Start Delivery', `Start delivering Order #JM-${order.order_id} to ${order.buyer_name}?\n\nLive GPS tracking will begin.`, 'info', true, async () => {
            await ordersAPI.updateDeliveryStatus(order.order_id, deliveryManId, 'shipped');
            await startGPS(order.order_id);
            load();
        });
    };


    const handleCycleStatus = async () => {
        if (!deliveryManId) return;
        const cycle = ['available', 'on_delivery', 'off'];
        const next  = cycle[(cycle.indexOf(dmStatus) + 1) % cycle.length];
        setDmStatus(next);
        await workersAPI.updateDeliveryMan(deliveryManId, { status: next }).catch(() => {});
    };

    // ── QR Scanner ────────────────────────────────────────────────────────────
    const openScanner = async (order, action) => {
        if (!cameraPermission?.granted) {
            const result = await requestPermission();
            if (!result.granted) { showAlert('Permission Denied', 'Camera access is needed to scan QR codes.', 'error'); return; }
        }
        setScanTarget({ order, action });
        setScannerVisible(true);
    };

    const handleQRScanned = async ({ data: token }) => {
        if (scanProcessing || !scanTarget) return;
        setScanProcessing(true);
        setScannerVisible(false);
        try {
            // Single scan: always complete + deliver in one step
            const res = await workersAPI.scanQR(token, user.id, 'completed');
            if (res?.success) {
                stopGPS();
                setReceipt(res.receipt);
                setReceiptVisible(true);
                load();
            } else {
                showAlert('Scan Failed', res?.message || 'Could not process QR code.', 'error');
            }
        } catch (e) {
            showAlert('Error', 'Failed to process QR scan.', 'error');
        } finally {
            setScanProcessing(false);
            setScanTarget(null);
        }
    };

    const callCustomer = (phone) => { if (phone) Linking.openURL(`tel:${phone}`); };

    // ── Render order card ─────────────────────────────────────────────────────
    const renderOrder = ({ item }) => {
        const cfg       = STATUS_CFG[item.status] || STATUS_CFG.processing;
        const isTracking = trackingOrderId === item.order_id;
        const age       = minutesAgo(item.created_at);
        const urgent    = Date.now() - new Date(item.created_at).getTime() > 2 * 3600000;
        // Delivery man is incharge only if the order has NO installation items
        const isInchargeDM = !(item.items || []).some(i => parseFloat(i.installation_fee || 0) > 0);

        return (
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('WorkerOrderDetail', { order: item })}
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: cfg.text, borderLeftWidth: 4 }]}
            >
                {/* Header */}
                <View style={styles.cardHeader}>
                    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                        <Ionicons name={cfg.icon} size={13} color={cfg.text} />
                        <Text style={[styles.badgeText, { color: cfg.text }]}>{'#JM-' + item.order_id}</Text>
                    </View>
                    <View style={styles.headerRight}>
                        {isTracking && (
                            <View style={styles.liveChip}>
                                <View style={styles.liveDot} />
                                <Text style={styles.liveText}>{'LIVE GPS'}</Text>
                            </View>
                        )}
                        {urgent && (
                            <View style={styles.urgentChip}>
                                <Ionicons name="time-outline" size={11} color="#fff" />
                                <Text style={styles.urgentText}>{age}</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Customer */}
                <Text style={[styles.buyerName, { color: theme.text }]}>{item.buyer_name}</Text>

                {/* Actions row: call + info */}
                <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={13} color={theme.textMuted} />
                    <Text style={[styles.infoText, { color: theme.textMuted }]} numberOfLines={2}>{item.shipping_address}</Text>
                    {!!item.buyer_phone && (
                        <TouchableOpacity onPress={() => callCustomer(item.buyer_phone)} style={[styles.callBtn, { backgroundColor: '#E8F5E9' }]}>
                            <Ionicons name="call" size={15} color="#2E7D32" />
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.infoRow}>
                    <Ionicons name="cube-outline" size={13} color={theme.textMuted} />
                    <Text style={[styles.infoText, { color: theme.textMuted }]} numberOfLines={1}>{item.item_titles}</Text>
                </View>

                {/* Amount */}
                <View style={[styles.amountRow, { borderTopColor: theme.border }]}>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>{'Total'}</Text>
                    <Text style={[styles.amount, { color: theme.accent }]}>
                        {'₱' + parseFloat(item.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Text>
                </View>

                {/* Action buttons */}
                <View style={styles.actionRow}>
                    {item.status === 'processing' && (
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#1565C0' }]} onPress={() => handleStartDelivery(item)}>
                            <Ionicons name="car" size={15} color="#fff" />
                            <Text style={styles.actionBtnText}>{'Start Delivery'}</Text>
                        </TouchableOpacity>
                    )}
                    {item.status === 'shipped' && isInchargeDM && (
                        <>
                            <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: '#6A1B9A', flex: 1 }]}
                                onPress={() => openScanner(item, 'completed')}
                            >
                                <Ionicons name="qr-code-outline" size={15} color="#fff" />
                                <Text style={styles.actionBtnText}>Scan QR — Complete</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.iconBtn, { borderColor: '#1565C0' }]}
                                onPress={() => navigation.navigate('LiveTracking', { order: item, userType: 'seller' })}
                            >
                                <Ionicons name="navigate" size={15} color="#1565C0" />
                            </TouchableOpacity>
                        </>
                    )}
                    {item.status === 'shipped' && !isInchargeDM && (
                        <View style={styles.notInchargeChip}>
                            <Ionicons name="construct-outline" size={12} color="#5D4037" />
                            <Text style={styles.notInchargeChipText}>Handyman handles QR</Text>
                        </View>
                    )}

                </View>
            </TouchableOpacity>
        );
    };

    // ── Render history card ───────────────────────────────────────────────────
    const renderHistory = ({ item }) => (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('WorkerHistoryDetail', { order: item })}
            style={[styles.histCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
            <View style={[styles.histIcon, { backgroundColor: item.status === 'completed' ? '#F3E5F5' : '#EDE7F6' }]}>
                <Ionicons name={item.status === 'completed' ? 'ribbon' : 'checkmark-circle'} size={20} color={item.status === 'completed' ? '#6A1B9A' : '#4527A0'} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.histOrder, { color: theme.text }]}>{'Order #JM-' + item.order_id}</Text>
                <Text style={[styles.histBuyer, { color: theme.textMuted }]}>{item.buyer_name}</Text>
                <Text style={[styles.histDate, { color: theme.textMuted }]}>
                    {new Date(item.updated_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.histAmount, { color: theme.accent }]}>
                    {'₱' + parseFloat(item.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </Text>
                <View style={[styles.histStatus, { backgroundColor: STATUS_CFG[item.status]?.bg || '#f5f5f5' }]}>
                    <Text style={[styles.histStatusText, { color: STATUS_CFG[item.status]?.text || '#555' }]}>
                        {item.status}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    const dmCfg    = DM_STATUS[dmStatus] || DM_STATUS.available;
    const initials = (user?.full_name || 'DM').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const inTransit = orders.filter(o => o.status === 'shipped').length;
    const pending   = orders.filter(o => o.status === 'processing').length;
    const delivered = orders.filter(o => o.status === 'delivered').length;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>

            {/* ── Header ── */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <View style={[styles.avatar, { backgroundColor: '#1565C0' }]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerName, { color: theme.text }]}>{user?.full_name || 'Delivery Man'}</Text>
                    <Text style={[styles.headerRole, { color: theme.textMuted }]}>{'Delivery Personnel'}</Text>
                </View>
                <TouchableOpacity style={[styles.statusChip, { backgroundColor: dmCfg.bg, borderColor: dmCfg.color }]} onPress={handleCycleStatus}>
                    <Ionicons name={dmCfg.icon} size={13} color={dmCfg.color} />
                    <Text style={[styles.statusChipText, { color: dmCfg.color }]}>{dmCfg.label}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.bellBtn}>
                    <Ionicons name="notifications-outline" size={22} color={theme.text} />
                    {unreadCount > 0 && (
                        <View style={styles.bellBadge}>
                            <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                        </View>
                    )}
                </TouchableOpacity>
                <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                    <Ionicons name="log-out-outline" size={20} color="#e53935" />
                </TouchableOpacity>
            </View>

            {/* ── GPS Live Banner ── */}
            {!!trackingOrderId && (
                <View style={styles.gpsBanner}>
                    <View style={styles.gpsDot} />
                    <Text style={styles.gpsBannerText}>{'GPS live tracking active for Order #JM-' + trackingOrderId}</Text>
                    <TouchableOpacity onPress={stopGPS}>
                        <Ionicons name="close-circle" size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}

            {/* ── Stats Bar ── */}
            <View style={[styles.statsBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                {[
                    { label: 'Assigned',   value: orders.length, color: '#1565C0' },
                    { label: 'In Transit', value: inTransit,      color: '#2E7D32' },
                    { label: 'Pending',    value: pending,        color: '#F57F17' },
                    { label: 'Delivered',  value: delivered,      color: '#6A1B9A' },
                ].map(s => (
                    <View key={s.label} style={styles.statItem}>
                        <Text style={[styles.statValue, { color: s.color }]}>{String(s.value)}</Text>
                        <Text style={[styles.statLabel, { color: theme.textMuted }]}>{s.label}</Text>
                    </View>
                ))}
            </View>

            {/* ── Tabs ── */}
            <View style={[styles.tabs, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                {TABS.map(t => (
                    <TouchableOpacity key={t} style={[styles.tabItem, tab === t && { borderBottomColor: '#1565C0', borderBottomWidth: 2.5 }]} onPress={() => setTab(t)}>
                        <Text style={[styles.tabText, { color: tab === t ? '#1565C0' : theme.textMuted }]}>{t}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ── Content ── */}
            {loading ? (
                <ActivityIndicator size="large" color="#1565C0" style={{ marginTop: 60 }} />
            ) : tab === 'Active' ? (
                <FlatList
                    data={orders}
                    keyExtractor={item => String(item.order_id)}
                    renderItem={renderOrder}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1565C0" />}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="car-outline" size={60} color={theme.textMuted} />
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>{'No Active Deliveries'}</Text>
                            <Text style={[styles.emptySub, { color: theme.textMuted }]}>{'Assigned orders will appear here. Check back soon!'}</Text>
                        </View>
                    }
                />
            ) : (
                <FlatList
                    data={history}
                    keyExtractor={item => String(item.order_id)}
                    renderItem={renderHistory}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1565C0" />}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="ribbon-outline" size={60} color={theme.textMuted} />
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>{'No Completed Deliveries'}</Text>
                            <Text style={[styles.emptySub, { color: theme.textMuted }]}>{'Your delivery history will appear here.'}</Text>
                        </View>
                    }
                />
            )}

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                onConfirm={() => { hideAlert(); alertConfig.onConfirm?.(); }}
                onCancel={hideAlert}
                onClose={hideAlert}
            />

            {/* QR Scanner Modal */}
            <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <CameraView
                        style={{ flex: 1 }}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={scanProcessing ? undefined : handleQRScanned}
                    />
                    <View style={styles.scanOverlay}>
                        <View style={styles.scanFrame} />
                        <Text style={styles.scanHint}>
                            {scanTarget?.action === 'completed'
                                ? 'Scan customer QR to confirm payment'
                                : 'Scan customer QR to confirm delivery'}
                        </Text>
                        <TouchableOpacity style={styles.scanCancel} onPress={() => setScannerVisible(false)}>
                            <Ionicons name="close-circle" size={40} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Receipt Modal */}
            <ReceiptModal
                visible={receiptVisible}
                receipt={receipt}
                onClose={() => setReceiptVisible(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:      { flex: 1 },
    header:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1 },
    avatar:         { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
    avatarText:     { color: '#fff', fontSize: 16, fontWeight: '800' },
    headerName:     { fontSize: 15, fontWeight: '800' },
    headerRole:     { fontSize: 11, marginTop: 1 },
    statusChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
    statusChipText: { fontSize: 11, fontWeight: '700' },
    bellBtn:        { padding: 4, position: 'relative' },
    bellBadge:      { position: 'absolute', top: 0, right: 0, backgroundColor: '#e53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
    bellBadgeText:  { color: '#fff', fontSize: 9, fontWeight: '800' },
    logoutBtn:      { padding: 4 },
    gpsBanner:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1565C0', paddingHorizontal: 14, paddingVertical: 10 },
    gpsDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#69F0AE' },
    gpsBannerText:  { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' },
    statsBar:       { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 10 },
    statItem:       { flex: 1, alignItems: 'center' },
    statValue:      { fontSize: 20, fontWeight: '800' },
    statLabel:      { fontSize: 10, fontWeight: '600', marginTop: 2 },
    tabs:           { flexDirection: 'row', borderBottomWidth: 1 },
    tabItem:        { flex: 1, alignItems: 'center', paddingVertical: 13 },
    tabText:        { fontSize: 13, fontWeight: '700' },
    list:           { padding: 14, gap: 14, paddingBottom: 40 },
    card:           { borderRadius: 16, borderWidth: 1, padding: 15, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
    cardHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    badge:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeText:      { fontSize: 12, fontWeight: '700' },
    liveChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e53935', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
    liveDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
    liveText:       { color: '#fff', fontSize: 9, fontWeight: '800' },
    urgentChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E65100', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
    urgentText:     { color: '#fff', fontSize: 9, fontWeight: '700' },
    buyerName:      { fontSize: 15, fontWeight: '700' },
    infoRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoText:       { fontSize: 12, flex: 1 },
    callBtn:        { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    amountRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 9, marginTop: 2 },
    amountLabel:    { fontSize: 12 },
    amount:         { fontSize: 15, fontWeight: '800' },
    actionRow:      { flexDirection: 'row', gap: 8 },
    actionBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, borderRadius: 12 },
    actionBtnText:      { color: '#fff', fontWeight: '700', fontSize: 13 },
    iconBtn:            { width: 42, height: 42, borderRadius: 12, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    notInchargeChip:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: '#EFEBE9', borderWidth: 1, borderColor: '#BCAAA4' },
    notInchargeChipText:{ fontSize: 12, fontWeight: '700', color: '#5D4037' },
    // QR Scanner overlay
    scanOverlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    scanFrame:      { width: 240, height: 240, borderWidth: 3, borderColor: '#fff', borderRadius: 16, marginBottom: 24 },
    scanHint:       { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 32, paddingHorizontal: 40 },
    scanCancel:     { marginTop: 8 },
    histCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
    histIcon:       { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
    histOrder:      { fontSize: 14, fontWeight: '700' },
    histBuyer:      { fontSize: 12, marginTop: 2 },
    histDate:       { fontSize: 11, marginTop: 2 },
    histAmount:     { fontSize: 14, fontWeight: '800' },
    histStatus:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
    histStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
    empty:          { alignItems: 'center', marginTop: 60, gap: 12, paddingHorizontal: 40 },
    emptyTitle:     { fontSize: 18, fontWeight: '800' },
    emptySub:       { fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
