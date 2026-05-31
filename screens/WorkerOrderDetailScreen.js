import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Linking, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { workersAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import ReceiptModal from '../components/ReceiptModal';
import EDDBanner from '../components/EDDBanner';


const STATUS_CFG = {
    pending:    { color: '#F57F17', bg: '#FFF8E1', icon: 'time-outline',              label: 'Pending'       },
    processing: { color: '#1565C0', bg: '#E3F2FD', icon: 'construct-outline',         label: 'Processing'    },
    shipped:    { color: '#2E7D32', bg: '#E8F5E9', icon: 'car-outline',               label: 'In Transit'    },
    delivered:  { color: '#4527A0', bg: '#EDE7F6', icon: 'checkmark-circle-outline',  label: 'Delivered'     },
    completed:  { color: '#6A1B9A', bg: '#F3E5F5', icon: 'ribbon',                    label: 'Completed'     },
    cancelled:  { color: '#B71C1C', bg: '#FFEBEE', icon: 'close-circle-outline',      label: 'Cancelled'     },
};

const fmt   = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fmtDt = (d) => d ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

export default function WorkerOrderDetailScreen({ route, navigation }) {
    const { order } = route.params;
    const { user }  = useAuth();
    const { theme } = useTheme();

    const [currentStatus, setCurrentStatus] = useState(order.status);

    // QR scanner
    const [scannerVisible, setScannerVisible] = useState(false);
    const scanActionRef  = useRef(null);          // useRef avoids stale-closure in camera callback
    const [scanProcessing, setScanProcessing]  = useState(false);
    const [cameraPermission, requestPermission] = useCameraPermissions();

    // Receipt
    const [receipt,        setReceipt]          = useState(null);
    const [receiptVisible, setReceiptVisible]   = useState(false);

    // Alert
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null });
    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) =>
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    const hideAlert = () => setAlertConfig(p => ({ ...p, visible: false }));

    // ── QR Scanner ─────────────────────────────────────────────────────────────
    const openScanner = async (action) => {
        if (!cameraPermission?.granted) {
            const result = await requestPermission();
            if (!result.granted) { showAlert('Permission Denied', 'Camera access is needed to scan QR codes.', 'error'); return; }
        }
        scanActionRef.current = action;   // ref update is synchronous — no stale closure
        setScannerVisible(true);
    };

    const isCOD = (order.payment_method || '').toLowerCase() === 'cod';

    const handleQRScanned = async ({ data: token }) => {
        if (scanProcessing) return;
        setScanProcessing(true);
        setScannerVisible(false);
        try {
            // Single scan always completes the order (delivered + completed in one step)
            const res = await workersAPI.scanQR(token, user.id, 'completed');
            if (res?.success) {
                setCurrentStatus('completed');
                setReceipt(res.receipt);
                setReceiptVisible(true);
            } else {
                showAlert('Scan Failed', res?.message || 'Could not process QR code.', 'error');
            }
        } catch (e) {
            showAlert('Error', 'Failed to process QR scan.', 'error');
        } finally {
            setScanProcessing(false);
            scanActionRef.current = null;
        }
    };

    const cfg      = STATUS_CFG[currentStatus] || STATUS_CFG.processing;
    const items    = order.items || [];

    // ── Incharge determination ──────────────────────────────────────────────────
    // If any item has an installation fee → handyman is incharge of QR scan.
    // Otherwise → delivery man is incharge.
    // Must also match the SPECIFIC assigned worker's user_id — not just the role.
    const hasInstallation = items.some(i => parseFloat(i.installation_fee || 0) > 0);
    const assignedHandymanUserId    = order.handyman_user_id      ?? null;
    const assignedDeliveryManUserId = order.delivery_man_user_id  ?? null;

    const isIncharge = hasInstallation
        ? user?.role === 'handyman'      && String(user.id) === String(assignedHandymanUserId)
        : user?.role === 'delivery_man'  && String(user.id) === String(assignedDeliveryManUserId);

    const subtotal = items.reduce((s, i) => {
        const base = i.base_price > 0 ? i.base_price : parseFloat(i.price_at_purchase || 0);
        return s + base * (i.quantity || 1);
    }, 0);

    // Single scan completes the order from any active status
    const canScan    = ['processing', 'shipped', 'delivered'].includes(currentStatus);
    const isFinished = ['completed', 'cancelled'].includes(currentStatus);

    return (
        <SafeAreaView style={[s.root, { backgroundColor: theme.background }]} edges={['top']}>

            {/* ── Header ── */}
            <View style={[s.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[s.headerTitle, { color: theme.text }]}>Order #JM-{order.order_id}</Text>
                    <Text style={[s.headerSub, { color: theme.textMuted }]}>Worker Order Details</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg.icon} size={13} color={cfg.color} />
                    <Text style={[s.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* ── QR Action Banner ── */}
                {!isFinished && isIncharge && (
                    <View style={s.qrBanner}>
                        <View style={s.qrBannerIcon}>
                            <Ionicons name="qr-code-outline" size={28} color="#5D4037" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.qrBannerTitle}>
                                {isCOD ? 'Scan QR to Complete Order' : canScanDelivery ? 'Confirm Delivery via QR' : 'Confirm Payment via QR'}
                            </Text>
                            <Text style={s.qrBannerSub}>
                                {isCOD
                                    ? 'COD order — collect payment then scan the customer\'s QR to complete.'
                                    : canScanDelivery
                                        ? 'Ask the customer to show their QR code. Scan it to confirm delivery.'
                                        : 'Collect payment, then scan the customer\'s QR to complete the order.'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* ── Not Incharge Banner ── */}
                {!isFinished && !isIncharge && (
                    <View style={s.notInchargeBanner}>
                        <Ionicons name="information-circle-outline" size={26} color="#1565C0" />
                        <View style={{ flex: 1 }}>
                            <Text style={s.notInchargeTitle}>
                                {hasInstallation ? '🔧 Handyman is Incharge' : '🚚 Delivery Man is Incharge'}
                            </Text>
                            <Text style={s.notInchargeSub}>
                                {hasInstallation
                                    ? 'This order includes installation. The assigned handyman handles QR scanning and payment confirmation.'
                                    : 'This is a delivery-only order. The assigned delivery man handles QR scanning and payment confirmation.'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* ── QR Button (incharge only) — single scan completes the order ── */}
                {canScan && isIncharge && (
                    <TouchableOpacity
                        style={[s.qrBtn, { backgroundColor: '#6A1B9A' }]}
                        onPress={() => openScanner('completed')}
                    >
                        <Ionicons name="qr-code-outline" size={20} color="#fff" />
                        <Text style={s.qrBtnText}>Scan QR — Complete &amp; Confirm</Text>
                    </TouchableOpacity>
                )}
                {currentStatus === 'completed' && (
                    <View style={s.completedBanner}>
                        <Ionicons name="checkmark-done-circle" size={24} color="#2E7D32" />
                        <Text style={s.completedText}>Order Completed & Payment Confirmed</Text>
                    </View>
                )}

                {/* ── Customer Info ── */}
                <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[s.cardTitle, { color: theme.text }]}>Customer</Text>

                    {/* EDD inside customer card so worker knows the deadline */}
                    {order.estimated_delivery_date && !['completed','cancelled'].includes(order.status) && (
                        <EDDBanner
                            eddMin={order.estimated_delivery_date}
                            delayed={!!order.edd_extended}
                            compact
                            style={{ marginBottom: 10 }}
                        />
                    )}

                    <View style={s.infoRow}>
                        <Ionicons name="person-outline" size={15} color={theme.textMuted} />
                        <Text style={[s.infoText, { color: theme.text }]}>{order.buyer_name || '—'}</Text>
                    </View>
                    {!!order.buyer_phone && (
                        <TouchableOpacity style={s.infoRow} onPress={() => Linking.openURL(`tel:${order.buyer_phone}`)}>
                            <Ionicons name="call-outline" size={15} color="#2E7D32" />
                            <Text style={[s.infoText, { color: '#2E7D32', fontWeight: '700' }]}>{order.buyer_phone}</Text>
                            <View style={s.callChip}><Text style={s.callChipText}>Call</Text></View>
                        </TouchableOpacity>
                    )}
                    <View style={s.infoRow}>
                        <Ionicons name="location-outline" size={15} color={theme.textMuted} />
                        <Text style={[s.infoText, { color: theme.textMuted }]}>{order.shipping_address || '—'}</Text>
                    </View>
                </View>

                {/* ── Payment Info ── */}
                <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[s.cardTitle, { color: theme.text }]}>Payment</Text>
                    <View style={s.infoRow}>
                        <Ionicons name="wallet-outline" size={15} color={theme.textMuted} />
                        <Text style={[s.infoText, { color: theme.text }]}>Method:</Text>
                        <View style={[s.payBadge, { backgroundColor: order.payment_method?.toLowerCase() === 'cod' ? '#FFF8E1' : '#E3F2FD' }]}>
                            <Text style={[s.payBadgeText, { color: order.payment_method?.toLowerCase() === 'cod' ? '#F57F17' : '#1565C0' }]}>
                                {(order.payment_method || 'N/A').toUpperCase()}
                            </Text>
                        </View>
                    </View>
                    {order.payment_method?.toLowerCase() === 'cod' && (
                        <View style={s.codNote}>
                            <Ionicons name="cash-outline" size={14} color="#E65100" />
                            <Text style={s.codNoteText}>Collect cash from customer upon delivery</Text>
                        </View>
                    )}
                </View>

                {/* ── Order Items ── */}
                {items.length > 0 && (
                    <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[s.cardTitle, { color: theme.text }]}>Items</Text>
                        {items.map((item, idx) => {
                            const base = item.base_price > 0 ? item.base_price : parseFloat(item.price_at_purchase || 0);
                            return (
                                <View key={idx} style={[s.itemRow, idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.itemName, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                                        {!!item.service_type && (
                                            <View style={s.serviceTag}>
                                                <Ionicons name={item.service_type === 'installation' ? 'construct-outline' : 'car-outline'} size={11} color="#1565C0" />
                                                <Text style={s.serviceTagText}>{item.service_type}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={[s.itemQty, { color: theme.textMuted }]}>×{item.quantity || 1}</Text>
                                    <Text style={[s.itemAmt, { color: theme.accent }]}>{fmt(base * (item.quantity || 1))}</Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* ── Order Total ── */}
                <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[s.cardTitle, { color: theme.text }]}>Summary</Text>
                    {subtotal > 0 && (
                        <View style={s.summaryRow}>
                            <Text style={[s.summaryLabel, { color: theme.textMuted }]}>Subtotal</Text>
                            <Text style={[s.summaryValue, { color: theme.text }]}>{fmt(subtotal)}</Text>
                        </View>
                    )}
                    {parseFloat(order.delivery_fee || 0) > 0 && (
                        <View style={s.summaryRow}>
                            <Text style={[s.summaryLabel, { color: theme.textMuted }]}>Delivery Fee</Text>
                            <Text style={[s.summaryValue, { color: theme.text }]}>{fmt(order.delivery_fee)}</Text>
                        </View>
                    )}
                    {parseFloat(order.discount_amount || 0) > 0 && (
                        <View style={s.summaryRow}>
                            <Text style={[s.summaryLabel, { color: '#E91E63' }]}>Discount</Text>
                            <Text style={[s.summaryValue, { color: '#E91E63' }]}>-{fmt(order.discount_amount)}</Text>
                        </View>
                    )}
                    <View style={[s.summaryRow, s.totalRow]}>
                        <Text style={s.totalLabel}>Total</Text>
                        <Text style={s.totalValue}>{fmt(order.total_amount)}</Text>
                    </View>
                </View>

                {/* ── Order Dates ── */}
                <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[s.cardTitle, { color: theme.text }]}>Timeline</Text>
                    {[
                        { label: 'Placed',     ts: order.created_at,   icon: 'time-outline'             },
                        { label: 'Processed',  ts: order.processed_at, icon: 'construct-outline'        },
                        { label: 'Shipped',    ts: order.shipped_at,   icon: 'car-outline'              },
                        { label: 'Delivered',  ts: order.delivered_at, icon: 'checkmark-circle-outline' },
                        { label: 'Completed',  ts: order.completed_at, icon: 'ribbon'                  },
                    ].filter(e => e.ts).map((e, idx) => (
                        <View key={idx} style={s.infoRow}>
                            <Ionicons name={e.icon} size={14} color="#8D6E63" />
                            <Text style={[s.infoText, { color: theme.textMuted }]}>{e.label}:</Text>
                            <Text style={[s.infoText, { color: theme.text, fontWeight: '600' }]}>{fmtDt(e.ts)}</Text>
                        </View>
                    ))}
                </View>

            </ScrollView>

            {/* ── QR Scanner Modal ── */}
            <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <CameraView
                        style={{ flex: 1 }}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={scanProcessing ? undefined : handleQRScanned}
                    />
                    <View style={s.scanOverlay}>
                        <View style={s.scanFrame} />
                        <Text style={s.scanHint}>
                            {scanAction === 'completed'
                                ? 'Scan customer QR to confirm payment'
                                : 'Scan customer QR to confirm delivery'}
                        </Text>
                        {scanProcessing && <ActivityIndicator size="large" color="#fff" style={{ marginTop: 16 }} />}
                        <TouchableOpacity style={s.scanClose} onPress={() => setScannerVisible(false)}>
                            <Ionicons name="close-circle" size={44} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Receipt Modal ── */}
            <ReceiptModal
                visible={receiptVisible}
                receipt={receipt}
                onClose={() => setReceiptVisible(false)}
            />

            {/* ── Alert ── */}
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
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root:               { flex: 1 },
    header:             { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backBtn:            { padding: 4 },
    headerTitle:        { fontSize: 16, fontWeight: '800' },
    headerSub:          { fontSize: 11, marginTop: 1 },
    statusBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    statusBadgeText:    { fontSize: 11, fontWeight: '800' },

    scroll:             { padding: 16, gap: 14, paddingBottom: 40 },

    // QR banner
    qrBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 14,
        backgroundColor: '#FFF8F0', borderWidth: 1.5, borderColor: '#D7CCC8',
        borderRadius: 16, padding: 16,
    },
    qrBannerIcon:       { width: 52, height: 52, borderRadius: 16, backgroundColor: '#EFEBE9', justifyContent: 'center', alignItems: 'center' },
    qrBannerTitle:      { fontSize: 14, fontWeight: '800', color: '#3e2723', marginBottom: 4 },
    qrBannerSub:        { fontSize: 12, color: '#8D6E63', lineHeight: 18 },

    // QR scan buttons
    qrBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, paddingVertical: 16, borderRadius: 16,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
    },
    qrBtnText:          { color: '#fff', fontSize: 15, fontWeight: '800' },

    completedBanner:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E8F5E9', borderRadius: 14, padding: 14 },
    completedText:      { fontSize: 14, fontWeight: '700', color: '#2E7D32', flex: 1 },

    // Card
    card: {
        borderRadius: 16, borderWidth: 1, padding: 16, gap: 10,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    cardTitle:          { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },

    infoRow:            { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    infoText:           { fontSize: 13, flex: 1 },
    callChip:           { backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    callChipText:       { fontSize: 11, fontWeight: '700', color: '#2E7D32' },

    payBadge:           { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    payBadgeText:       { fontSize: 11, fontWeight: '800' },
    codNote:            { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF3E0', borderRadius: 10, padding: 10 },
    codNoteText:        { fontSize: 12, fontWeight: '600', color: '#E65100', flex: 1 },

    itemRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
    itemName:           { fontSize: 13, fontWeight: '600', flex: 1 },
    serviceTag:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E3F2FD', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
    serviceTagText:     { fontSize: 10, fontWeight: '700', color: '#1565C0', textTransform: 'capitalize' },
    itemQty:            { fontSize: 12, minWidth: 28, textAlign: 'center' },
    itemAmt:            { fontSize: 13, fontWeight: '700', minWidth: 72, textAlign: 'right' },

    summaryRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    summaryLabel:       { fontSize: 13 },
    summaryValue:       { fontSize: 13, fontWeight: '600' },
    totalRow:           { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 4 },
    totalLabel:         { fontSize: 16, fontWeight: '800', color: '#3e2723' },
    totalValue:         { fontSize: 18, fontWeight: '800', color: '#5D4037' },

    // QR scanner overlay
    scanOverlay:        { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    scanFrame:          { width: 240, height: 240, borderWidth: 3, borderColor: '#fff', borderRadius: 18, marginBottom: 28 },
    scanHint:           { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingHorizontal: 40, marginBottom: 8 },
    scanClose:          { marginTop: 32 },

    // Not-incharge info banner
    notInchargeBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        backgroundColor: '#E3F2FD', borderWidth: 1.5, borderColor: '#90CAF9',
        borderRadius: 16, padding: 16,
    },
    notInchargeTitle:   { fontSize: 14, fontWeight: '800', color: '#0D47A1', marginBottom: 4 },
    notInchargeSub:     { fontSize: 12, color: '#1565C0', lineHeight: 18 },
});
