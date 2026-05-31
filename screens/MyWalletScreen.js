import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, RefreshControl, TextInput, FlatList, Modal,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { pointsAPI, vouchersAPI, ordersAPI } from '../services/api';

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function MyWalletScreen({ navigation }) {
    const { user } = useAuth();
    const { theme } = useTheme();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pointsBalance, setPointsBalance] = useState(0);
    const [vouchers, setVouchers] = useState([]);
    const [recentOrders, setRecentOrders] = useState([]);
    const [claimCode, setClaimCode] = useState('');
    const [claiming, setClaiming] = useState(false);
    const [voucherModal, setVoucherModal] = useState(false);

    const load = useCallback(async () => {
        if (!user) return;
        try {
            const [ptsRes, vchRes, ordRes] = await Promise.all([
                pointsAPI.getBalance(user.id),
                vouchersAPI.getMyVouchers(user.id),
                ordersAPI.getUserOrders(user.id),
            ]);
            if (ptsRes?.success) setPointsBalance(ptsRes.balance || 0);
            if (vchRes?.success) setVouchers(vchRes.data || []);
            if (ordRes?.success) {
                const completed = (ordRes.data || [])
                    .filter(o => o.status === 'completed')
                    .slice(0, 8);
                setRecentOrders(completed);
            }
        } catch (e) {
            console.error('[MyWallet]', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

    const handleClaim = async () => {
        if (!claimCode.trim() || !user) return;
        setClaiming(true);
        try {
            const res = await vouchersAPI.claimVoucher(user.id, claimCode.trim());
            if (res?.success) {
                setClaimCode('');
                load();
            }
        } catch (_) {}
        finally { setClaiming(false); }
    };


    if (loading) {
        return (
            <SafeAreaView style={[st.root, { backgroundColor: theme.background }]} edges={['top']}>
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 100 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[st.root, { backgroundColor: theme.background }]} edges={['top']}>

            {/* Header */}
            <View style={[st.header, { backgroundColor: theme.accent }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
                    <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={st.headerTitle}>My Wallet</Text>
                <View style={{ width: 30 }} />
            </View>

            <KeyboardAwareWrapper>
            <ScrollView
                contentContainerStyle={st.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
            >

                {/* ── Hero Points Card ── */}
                <View style={[st.heroCard, { backgroundColor: theme.accent }]}>
                    <View style={st.heroGlow} />
                    <Ionicons name="trophy" size={32} color="#FFD54F" style={{ marginBottom: 6 }} />
                    <Text style={st.heroLabel}>Loyalty Points</Text>
                    <Text style={st.heroValue}>{pointsBalance.toLocaleString()}</Text>
                    <Text style={st.heroSub}>Earn points on every completed order</Text>

                    <View style={st.heroRow}>
                        <TouchableOpacity style={st.heroPill} onPress={() => setVoucherModal(true)}>
                            <Ionicons name="ticket" size={18} color="#81D4FA" />
                            <View>
                                <Text style={st.heroPillValue}>{vouchers.length}</Text>
                                <Text style={st.heroPillLabel}>Vouchers</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.heroPill} onPress={() => navigation.navigate('MyOrders')}>
                            <Ionicons name="bag-check" size={18} color="#A5D6A7" />
                            <View>
                                <Text style={st.heroPillValue}>{recentOrders.length}</Text>
                                <Text style={st.heroPillLabel}>Completed</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Quick Actions ── */}
                <View style={st.quickRow}>
                    <TouchableOpacity style={[st.quickBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => navigation.navigate('MyPoints')}>
                        <View style={[st.quickIcon, { backgroundColor: '#FFF8E1' }]}>
                            <Ionicons name="trophy-outline" size={22} color="#FF9800" />
                        </View>
                        <Text style={[st.quickLabel, { color: theme.text }]}>My Points</Text>
                        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.quickBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setVoucherModal(true)}>
                        <View style={[st.quickIcon, { backgroundColor: '#E3F2FD' }]}>
                            <Ionicons name="ticket-outline" size={22} color="#1565C0" />
                        </View>
                        <Text style={[st.quickLabel, { color: theme.text }]}>Vouchers</Text>
                        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
                    </TouchableOpacity>
                </View>

                {/* ── Claim Voucher ── */}
                <View style={[st.claimCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={st.claimHeader}>
                        <Ionicons name="gift-outline" size={18} color={theme.accent} />
                        <Text style={[st.claimTitle, { color: theme.text }]}>Redeem Voucher Code</Text>
                    </View>
                    <View style={st.claimRow}>
                        <TextInput
                            style={[st.claimInput, { backgroundColor: theme.inputBg || theme.background, borderColor: theme.border, color: theme.text }]}
                            placeholder="Enter code (e.g. WELCOME10)"
                            placeholderTextColor={theme.textMuted}
                            value={claimCode}
                            onChangeText={setClaimCode}
                            autoCapitalize="characters"
                        />
                        <TouchableOpacity
                            style={[st.claimBtn, { backgroundColor: claimCode.trim() ? theme.accent : theme.border }]}
                            onPress={handleClaim}
                            disabled={!claimCode.trim() || claiming}
                        >
                            {claiming
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Ionicons name="checkmark-circle" size={22} color="#fff" />
                            }
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Recent Transactions ── */}
                <View style={[st.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={st.sectionHeader}>
                        <Text style={[st.sectionTitle, { color: theme.text }]}>Recent Purchases</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('MyOrders')}>
                            <Text style={[st.seeAll, { color: theme.accent }]}>View All</Text>
                        </TouchableOpacity>
                    </View>
                    {recentOrders.length === 0 ? (
                        <View style={st.emptyState}>
                            <Ionicons name="receipt-outline" size={40} color={theme.textMuted} />
                            <Text style={[st.emptyText, { color: theme.textMuted }]}>No completed orders yet</Text>
                        </View>
                    ) : (
                        recentOrders.map((order, idx) => (
                            <TouchableOpacity
                                key={order.order_id}
                                style={[st.txRow, idx < recentOrders.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
                                onPress={() => navigation.navigate('OrderDetail', { order: order })}
                                activeOpacity={0.7}
                            >
                                <View style={[st.txIcon, { backgroundColor: '#E8F5E9' }]}>
                                    <Ionicons name="bag-check-outline" size={18} color="#2E7D32" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[st.txTitle, { color: theme.text }]} numberOfLines={1}>
                                        Order #JM-{order.order_id}
                                    </Text>
                                    <Text style={[st.txDate, { color: theme.textMuted }]}>
                                        {new Date(order.updated_at || order.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[st.txAmount, { color: '#2E7D32' }]}>{fmt(order.total_amount)}</Text>
                                    {order.points_earned > 0 && (
                                        <View style={st.ptsBadge}>
                                            <Ionicons name="trophy" size={10} color="#FF9800" />
                                            <Text style={st.ptsBadgeText}>+{order.points_earned} pts</Text>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>

            </ScrollView>
            </KeyboardAwareWrapper>

            {/* ── Voucher Modal ── */}
            <Modal visible={voucherModal} transparent animationType="slide" onRequestClose={() => setVoucherModal(false)}>
                <View style={st.modalOverlay}>
                    <View style={[st.modalSheet, { backgroundColor: theme.background }]}>
                        <View style={[st.modalHeader, { borderBottomColor: theme.border }]}>
                            <TouchableOpacity onPress={() => setVoucherModal(false)}>
                                <Ionicons name="close" size={24} color={theme.text} />
                            </TouchableOpacity>
                            <Text style={[st.modalTitle, { color: theme.text }]}>My Vouchers</Text>
                            <View style={{ width: 24 }} />
                        </View>
                        <FlatList
                            data={vouchers}
                            keyExtractor={(item) => item.claim_id.toString()}
                            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                            ListEmptyComponent={
                                <View style={st.emptyState}>
                                    <Ionicons name="ticket-outline" size={48} color={theme.textMuted} />
                                    <Text style={[st.emptyText, { color: theme.textMuted }]}>No vouchers yet</Text>
                                </View>
                            }
                            renderItem={({ item }) => (
                                <View style={[st.voucherCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                    <View style={[st.voucherStrip, { backgroundColor: theme.accent }]}>
                                        <Text style={st.voucherStripValue}>
                                            {item.discount_type === 'percentage' ? `${item.discount_value}%` : `₱${item.discount_value}`}
                                        </Text>
                                        <Text style={st.voucherStripSub}>OFF</Text>
                                    </View>
                                    <View style={st.voucherBody}>
                                        <View style={[st.voucherCodeBox, { backgroundColor: theme.accent + '18' }]}>
                                            <Text style={[st.voucherCode, { color: theme.accent }]}>{item.code}</Text>
                                        </View>
                                        <Text style={[st.voucherDetail, { color: theme.textMuted }]}>Min spend: ₱{item.min_spend}</Text>
                                        {item.end_date && (
                                            <Text style={[st.voucherExpiry, { color: '#E53935' }]}>
                                                Expires {new Date(item.end_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const st = StyleSheet.create({
    root: { flex: 1 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },

    scroll: { paddingBottom: 40 },

    // Hero
    heroCard: {
        marginHorizontal: 16, marginTop: 16, borderRadius: 24, padding: 24,
        alignItems: 'center', overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
    },
    heroGlow: {
        position: 'absolute', top: -40, right: -40, width: 120, height: 120,
        borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)',
    },
    heroLabel: { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginBottom: 4 },
    heroValue: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
    heroSub: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, marginBottom: 20 },
    heroRow: { flexDirection: 'row', gap: 10, width: '100%' },
    heroPill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
    },
    heroPillValue: { fontSize: 15, fontWeight: '800', color: '#fff' },
    heroPillLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },

    // Quick Actions
    quickRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 16 },
    quickBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
        borderRadius: 16, borderWidth: 1, padding: 14,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    quickIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    quickLabel: { fontSize: 13, fontWeight: '700', flex: 1 },

    // Claim
    claimCard: {
        marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, padding: 16,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    claimHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    claimTitle: { fontSize: 14, fontWeight: '700' },
    claimRow: { flexDirection: 'row', gap: 10 },
    claimInput: {
        flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
        fontSize: 14, fontWeight: '600',
    },
    claimBtn: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

    // Section
    section: {
        marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
    },
    sectionTitle: { fontSize: 15, fontWeight: '800' },
    seeAll: { fontSize: 13, fontWeight: '600' },

    // Transaction rows
    txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    txIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    txTitle: { fontSize: 13, fontWeight: '700' },
    txDate: { fontSize: 11, marginTop: 2 },
    txAmount: { fontSize: 14, fontWeight: '800' },
    ptsBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
    ptsBadgeText: { fontSize: 10, fontWeight: '700', color: '#FF9800' },

    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 30, gap: 8 },
    emptyText: { fontSize: 14, fontWeight: '500' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalSheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
    },
    modalTitle: { fontSize: 17, fontWeight: '800' },

    // Voucher cards
    voucherCard: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
    voucherStrip: { width: 72, justifyContent: 'center', alignItems: 'center', paddingVertical: 14 },
    voucherStripValue: { fontSize: 18, fontWeight: '900', color: '#fff' },
    voucherStripSub: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.75)' },
    voucherBody: { flex: 1, padding: 12, justifyContent: 'center', gap: 4 },
    voucherCodeBox: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    voucherCode: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
    voucherDetail: { fontSize: 11, fontWeight: '500' },
    voucherExpiry: { fontSize: 10, fontWeight: '600' },
});
