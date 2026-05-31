import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Linking, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { workersAPI, notificationsAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import ReceiptModal from '../components/ReceiptModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const MY_STATUS = {
    available: { label: 'Available', color: '#2E7D32', bg: '#E8F5E9', icon: 'checkmark-circle' },
    busy:      { label: 'Busy',      color: '#E65100', bg: '#FFF3E0', icon: 'time'            },
    off:       { label: 'Off Duty',  color: '#546E7A', bg: '#ECEFF1', icon: 'moon'           },
};

const ORDER_STATUS = {
    pending:    { bg: '#FFF8E1', text: '#F57F17', label: 'Pending',     icon: 'time-outline'            },
    processing: { bg: '#E3F2FD', text: '#1565C0', label: 'In Progress', icon: 'construct-outline'       },
    shipped:    { bg: '#E8F5E9', text: '#2E7D32', label: 'Shipped',     icon: 'checkmark-circle-outline'},
    delivered:  { bg: '#EDE7F6', text: '#4527A0', label: 'Delivered',   icon: 'ribbon-outline'          },
    completed:  { bg: '#F3E5F5', text: '#6A1B9A', label: 'Completed',   icon: 'ribbon'                  },
};



const TABS = ['Active', 'History'];

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const minutesAgo = (d) => {
    const m = Math.floor((Date.now() - new Date(d)) / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function HandymanDashboard({ navigation }) {
    const { user, logout } = useAuth();
    const { theme } = useTheme();

    const [tab,         setTab]         = useState('Active');
    const [tasks,       setTasks]       = useState([]);
    const [history,     setHistory]     = useState([]);
    const [myStatus,    setMyStatus]    = useState('available');
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [handymanId,  setHandymanId]  = useState(null);
    const [unreadCount, setUnreadCount] = useState(0);


    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null });
    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) =>
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    const hideAlert = () => setAlertConfig(p => ({ ...p, visible: false }));

    // QR scanner state
    const [scannerVisible, setScannerVisible]   = useState(false);
    const [scanTarget,     setScanTarget]       = useState(null); // { item, action: 'delivered'|'completed' }
    const [scanProcessing, setScanProcessing]   = useState(false);
    const [cameraPermission, requestPermission] = useCameraPermissions();
    const [receipt,        setReceipt]          = useState(null);
    const [receiptVisible, setReceiptVisible]   = useState(false);

    // ── Load ──────────────────────────────────────────────────────────────────
    const load = useCallback(async () => {
        if (!user) return;
        try {
            const [tasksRes, histRes, notifRes] = await Promise.all([
                workersAPI.getMyTasks(user.id),
                workersAPI.getHandymanHistory(user.id),
                notificationsAPI.getUserNotifications(user.id),
            ]);
            if (tasksRes?.success) {
                setHandymanId(tasksRes.handyman_id);
                setTasks(tasksRes.tasks || []);
                setMyStatus(tasksRes.status || 'available');

            }
            if (histRes?.success)  setHistory(histRes.history || []);
            if (notifRes?.success) setUnreadCount((notifRes.notifications || []).filter(n => !n.read).length);
        } catch (e) {
            console.error('[HandymanDashboard]', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

    // ── Status cycle ──────────────────────────────────────────────────────────
    const handleCycleStatus = async () => {
        const cycle = ['available', 'busy', 'off'];
        const next  = cycle[(cycle.indexOf(myStatus) + 1) % cycle.length];
        setMyStatus(next);
        await workersAPI.updateMyStatus(user.id, next).catch(() => {});
    };

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleStartJob = (item) => {
        showAlert('Start Job', `Mark Order #JM-${item.order_id} as "In Progress"?`, 'info', true, async () => {
            // Re-uses the shop status endpoint via workersAPI — status: processing
            await workersAPI.updateMyStatus(user.id, 'busy').catch(() => {});
            setMyStatus('busy');
            load();
        });
    };


    // ── QR Scanner ────────────────────────────────────────────────────────────
    const openScanner = async (item, action) => {
        if (!cameraPermission?.granted) {
            const result = await requestPermission();
            if (!result.granted) { showAlert('Permission Denied', 'Camera access is needed to scan QR codes.', 'error'); return; }
        }
        setScanTarget({ item, action });
        setScannerVisible(true);
    };

    const handleQRScanned = async ({ data: token }) => {
        if (scanProcessing || !scanTarget) return;
        setScanProcessing(true);
        setScannerVisible(false);
        try {
            const res = await workersAPI.scanQR(token, user.id, scanTarget.action);
            if (res?.success) {
                if (scanTarget.action === 'delivered') {
                    showAlert('📦 Delivered!', `Order #JM-${scanTarget.item.order_id} marked as delivered.\n\nNow collect payment and scan again to complete.`, 'success', true, () => {
                        load();
                        openScanner(scanTarget.item, 'completed');
                    });
                } else {
                    setReceipt(res.receipt);
                    setReceiptVisible(true);
                    load();
                }
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

    // ── Render Task Card ──────────────────────────────────────────────────────
    const renderTask = ({ item }) => {
        const cfg         = ORDER_STATUS[item.status] || ORDER_STATUS.processing;
        const urgent      = Date.now() - new Date(item.created_at).getTime() > 2 * 3600000;
        // Handymen always deal with installation, but derive icon from items just in case
        const hasInstall  = (item.items || []).some(i => parseFloat(i.installation_fee || 0) > 0);
        const specIcon    = hasInstall ? 'construct-outline' : 'car-outline';

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
                        <View style={[styles.statusTag, { backgroundColor: cfg.bg }]}>
                            <Text style={[styles.statusTagText, { color: cfg.text }]}>{cfg.label}</Text>
                        </View>
                        {urgent && (
                            <View style={styles.urgentChip}>
                                <Ionicons name="time-outline" size={11} color="#fff" />
                                <Text style={styles.urgentText}>{minutesAgo(item.created_at)}</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Customer */}
                <Text style={[styles.buyerName, { color: theme.text }]}>{item.buyer_name}</Text>

                {/* Call + Address */}
                <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={13} color={theme.textMuted} />
                    <Text style={[styles.infoText, { color: theme.textMuted }]} numberOfLines={2}>{item.shipping_address}</Text>
                    {!!item.buyer_phone && (
                        <TouchableOpacity onPress={() => callCustomer(item.buyer_phone)} style={[styles.callBtn, { backgroundColor: '#E8F5E9' }]}>
                            <Ionicons name="call" size={15} color="#2E7D32" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Items */}
                <View style={styles.infoRow}>
                    <Ionicons name={specIcon} size={13} color={theme.textMuted} />
                    <Text style={[styles.infoText, { color: theme.textMuted }]} numberOfLines={1}>{item.item_titles}</Text>
                </View>



                {/* Date + Total */}
                <View style={[styles.dateRow, { borderTopColor: theme.border }]}>
                    <Ionicons name="calendar-outline" size={12} color={theme.textMuted} />
                    <Text style={[styles.dateText, { color: theme.textMuted }]}>{'Assigned ' + formatDate(item.created_at)}</Text>
                    {!!item.total_amount && (
                        <Text style={[styles.dateText, { color: theme.accent, fontWeight: '800', marginLeft: 'auto' }]}>
                            {'₱' + parseFloat(item.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </Text>
                    )}
                </View>

                {/* Action buttons */}
                <View style={styles.actionRow}>
                    {(item.status === 'processing' || item.status === 'shipped') && (
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#6C3483' }]}
                            onPress={() => openScanner(item, 'delivered')}
                        >
                            <Ionicons name="qr-code-outline" size={15} color="#fff" />
                            <Text style={styles.actionBtnText}>Scan QR — Confirm Delivery</Text>
                        </TouchableOpacity>
                    )}
                    {item.status === 'delivered' && (
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#2E7D32' }]}
                            onPress={() => openScanner(item, 'completed')}
                        >
                            <Ionicons name="qr-code-outline" size={15} color="#fff" />
                            <Text style={styles.actionBtnText}>Scan QR — Confirm Payment</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    // ── Render History Card ───────────────────────────────────────────────────
    const renderHistory = ({ item }) => (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('WorkerHistoryDetail', { order: item })}
            style={[styles.histCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
            <View style={[styles.histIcon, { backgroundColor: '#F3E5F5' }]}>
                <Ionicons name="ribbon" size={20} color="#6A1B9A" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.histOrder, { color: theme.text }]}>{'Order #JM-' + item.order_id}</Text>
                <Text style={[styles.histBuyer, { color: theme.textMuted }]}>{item.buyer_name}</Text>
                <Text style={[styles.histDate, { color: theme.textMuted }]}>{formatDate(item.updated_at)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.histAmount, { color: theme.accent }]}>
                    {'₱' + parseFloat(item.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </Text>
                <View style={[styles.histStatus, { backgroundColor: ORDER_STATUS[item.status]?.bg || '#f5f5f5' }]}>
                    <Text style={[styles.histStatusText, { color: ORDER_STATUS[item.status]?.text || '#555' }]}>{item.status}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    const statusCfg  = MY_STATUS[myStatus] || MY_STATUS.available;
    const initials   = (user?.full_name || 'HM').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const specIcon   = 'construct-outline';

    const totalTasks   = tasks.length;
    const pendingCount = tasks.filter(t => t.status === 'pending').length;
    const inProgress   = tasks.filter(t => t.status === 'processing').length;
    const doneToday    = history.filter(h => {
        const d = new Date(h.updated_at);
        const now = new Date();
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
    }).length;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>

            {/* ── Header ── */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <View style={[styles.avatar, { backgroundColor: '#6C3483' }]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerName, { color: theme.text }]}>{user?.full_name || 'Handyman'}</Text>
                    <View style={styles.infoRow}>
                        <Ionicons name={specIcon} size={11} color={theme.textMuted} />
                        <Text style={[styles.headerRole, { color: theme.textMuted }]}>{'Installation Technician'}</Text>
                    </View>
                </View>
                <TouchableOpacity style={[styles.statusChip, { backgroundColor: statusCfg.bg, borderColor: statusCfg.color }]} onPress={handleCycleStatus}>
                    <Ionicons name={statusCfg.icon} size={13} color={statusCfg.color} />
                    <Text style={[styles.statusChipText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
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

            {/* ── Stats Bar ── */}
            <View style={[styles.statsBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                {[
                    { label: 'Assigned',    value: totalTasks,   color: '#6C3483' },
                    { label: 'Pending',     value: pendingCount, color: '#F57F17' },
                    { label: 'In Progress', value: inProgress,   color: '#1565C0' },
                    { label: 'Done Today',  value: doneToday,    color: '#2E7D32' },
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
                    <TouchableOpacity key={t} style={[styles.tabItem, tab === t && { borderBottomColor: '#6C3483', borderBottomWidth: 2.5 }]} onPress={() => setTab(t)}>
                        <Text style={[styles.tabText, { color: tab === t ? '#6C3483' : theme.textMuted }]}>{t}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ── Content ── */}
            {loading ? (
                <ActivityIndicator size="large" color="#6C3483" style={{ marginTop: 60 }} />
            ) : tab === 'Active' ? (
                <FlatList
                    data={tasks}
                    keyExtractor={item => String(item.order_id)}
                    renderItem={renderTask}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#6C3483" />}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="construct-outline" size={60} color={theme.textMuted} />
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>{'No Tasks Yet'}</Text>
                            <Text style={[styles.emptySub, { color: theme.textMuted }]}>{'Installation jobs assigned to you will appear here.'}</Text>
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
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#6C3483" />}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="ribbon-outline" size={60} color={theme.textMuted} />
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>{'No Completed Jobs'}</Text>
                            <Text style={[styles.emptySub, { color: theme.textMuted }]}>{'Your completed installation history will appear here.'}</Text>
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

// ── Styles ────────────────────────────────────────────────────────────────────
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
    statusTag:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    statusTagText:  { fontSize: 11, fontWeight: '700' },
    urgentChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E65100', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
    urgentText:     { color: '#fff', fontSize: 9, fontWeight: '700' },
    buyerName:      { fontSize: 15, fontWeight: '700' },
    infoRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoText:       { fontSize: 12, flex: 1 },
    callBtn:        { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

    dateRow:        { flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: 1, paddingTop: 9, marginTop: 2 },
    dateText:       { fontSize: 11 },
    actionRow:      { flexDirection: 'row', gap: 8 },
    actionBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, borderRadius: 12 },
    actionBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },
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
