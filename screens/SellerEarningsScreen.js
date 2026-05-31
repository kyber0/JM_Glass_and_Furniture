import React, { useState, useEffect } from 'react';
import {
    StyleSheet, Text, View, ScrollView, ActivityIndicator,
    TouchableOpacity, Modal, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { shopAPI } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const SellerEarningsScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Withdrawal Modal State
    const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountName, setAccountName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Alert
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });
    const showAlert = (title, message, type = 'info') => setAlertConfig({ visible: true, title, message, type });
    const hideAlert = () => setAlertConfig({ ...alertConfig, visible: false });

    useEffect(() => { fetchStats(); }, []);

    const fetchStats = async () => {
        try {
            const response = await shopAPI.getShopStats(user.id);
            if (response.success) setStats(response.stats);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRequestWithdrawal = async () => {
        const amountNum = parseFloat(withdrawAmount);
        if (!amountNum || amountNum <= 0) return showAlert('Invalid Amount', 'Please enter a valid amount.', 'warning');
        if (amountNum > (stats?.wallet_available || 0)) return showAlert('Insufficient Balance', 'You cannot withdraw more than your available balance.', 'warning');
        if (!bankName || !accountName || !accountNumber) return showAlert('Missing Details', 'Please fill in all bank details.', 'warning');

        setIsSubmitting(true);
        try {
            const res = await shopAPI.requestPayout({
                user_id: user.id,
                amount: amountNum,
                bank_name: bankName,
                account_name: accountName,
                account_number: accountNumber,
            });
            if (res.success) {
                showAlert('Success', 'Withdrawal request submitted successfully.', 'success');
                setWithdrawModalVisible(false);
                setWithdrawAmount('');
                setAccountNumber('');
                fetchStats();
            } else {
                showAlert('Error', res.message || 'Failed to request withdrawal.', 'error');
            }
        } catch (error) {
            showAlert('Error', 'An error occurred.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const available = parseFloat(stats?.wallet_available || 0);
    const pending   = parseFloat(stats?.wallet_pending || 0);
    const withdrawn = parseFloat(stats?.wallet_withdrawn || 0);
    const totalEarned = available + pending + withdrawn;

    return (
        <SafeAreaView style={[st.root, { backgroundColor: '#7B1FA2' }]} edges={['top']}>

            {/* Header */}
            <View style={st.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
                    <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={st.headerTitle}>My Earnings</Text>
                <View style={{ width: 30 }} />
            </View>

            {loading ? (
                <View style={st.center}><ActivityIndicator size="large" color="#fff" /></View>
            ) : (
                <View style={[st.body, { backgroundColor: theme.background }]}>
                    <ScrollView
                        contentContainerStyle={st.scroll}
                        showsVerticalScrollIndicator={false}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStats(); }} tintColor="#7B1FA2" />}
                    >

                        {/* ── Balance Hero ── */}
                        <View style={st.heroCard}>
                            <View style={st.heroGlow} />
                            <View style={st.heroGlow2} />
                            <Ionicons name="storefront" size={28} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', top: 20, right: 24 }} />
                            <Text style={st.heroLabel}>Available to Withdraw</Text>
                            <Text style={st.heroValue}>{fmt(available)}</Text>

                            <View style={st.statRow}>
                                <View style={st.statPill}>
                                    <View style={[st.statDot, { backgroundColor: '#FFD54F' }]} />
                                    <View>
                                        <Text style={st.statPillValue}>{fmt(pending)}</Text>
                                        <Text style={st.statPillLabel}>Pending</Text>
                                    </View>
                                </View>
                                <View style={st.statPill}>
                                    <View style={[st.statDot, { backgroundColor: '#81C784' }]} />
                                    <View>
                                        <Text style={st.statPillValue}>{fmt(withdrawn)}</Text>
                                        <Text style={st.statPillLabel}>Withdrawn</Text>
                                    </View>
                                </View>
                                <View style={st.statPill}>
                                    <View style={[st.statDot, { backgroundColor: '#CE93D8' }]} />
                                    <View>
                                        <Text style={st.statPillValue}>{fmt(totalEarned)}</Text>
                                        <Text style={st.statPillLabel}>Lifetime</Text>
                                    </View>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[st.withdrawBtn, available <= 0 && { opacity: 0.5 }]}
                                onPress={() => setWithdrawModalVisible(true)}
                                disabled={available <= 0}
                            >
                                <Ionicons name="wallet-outline" size={18} color="#7B1FA2" />
                                <Text style={st.withdrawBtnText}>Withdraw Funds</Text>
                            </TouchableOpacity>

                            <Text style={st.disclaimer}>
                                *Platform commissions and transaction fees are automatically deducted from completed orders.
                            </Text>
                        </View>

                        {/* ── Recent Sales ── */}
                        <View style={[st.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={st.sectionHeader}>
                                <Text style={[st.sectionTitle, { color: theme.text }]}>Recent Sales</Text>
                                <View style={[st.salesBadge, { backgroundColor: '#E8F5E9' }]}>
                                    <Text style={[st.salesBadgeText, { color: '#2E7D32' }]}>{stats?.recent_sales?.length || 0} transactions</Text>
                                </View>
                            </View>

                            {stats?.recent_sales?.length > 0 ? (
                                stats.recent_sales.map((sale, idx) => (
                                    <View
                                        key={idx}
                                        style={[st.txRow, idx < stats.recent_sales.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
                                    >
                                        <View style={[st.txIcon, { backgroundColor: '#F3E5F5' }]}>
                                            <Ionicons name="cash-outline" size={18} color="#7B1FA2" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[st.txTitle, { color: theme.text }]} numberOfLines={1}>
                                                {sale.buyer || 'Customer Purchase'}
                                            </Text>
                                            <Text style={[st.txDate, { color: theme.textMuted }]}>
                                                {new Date(sale.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </Text>
                                        </View>
                                        <Text style={st.txAmount}>+{fmt(parseFloat(sale.price) * sale.quantity)}</Text>
                                    </View>
                                ))
                            ) : (
                                <View style={st.emptyState}>
                                    <Ionicons name="receipt-outline" size={40} color={theme.textMuted} />
                                    <Text style={[st.emptyText, { color: theme.textMuted }]}>No transactions yet</Text>
                                </View>
                            )}
                        </View>

                    </ScrollView>
                </View>
            )}

            {/* Withdrawal Modal */}
            <Modal visible={withdrawModalVisible} animationType="slide" transparent>
                <View style={st.modalOverlay}>
                    <View style={[st.modalContent, { backgroundColor: theme.card }]}>
                        <View style={st.modalHeader}>
                            <Text style={[st.modalTitle, { color: theme.text }]}>Withdraw Funds</Text>
                            <TouchableOpacity onPress={() => setWithdrawModalVisible(false)}>
                                <Ionicons name="close" size={24} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={[st.modalBalanceChip, { backgroundColor: '#F3E5F5' }]}>
                            <Ionicons name="wallet" size={16} color="#7B1FA2" />
                            <Text style={st.modalBalanceText}>Available: {fmt(available)}</Text>
                        </View>

                        <View style={st.inputGroup}>
                            <Text style={[st.inputLabel, { color: theme.textMuted }]}>Amount to Withdraw (₱)</Text>
                            <TextInput
                                style={[st.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.inputBg || theme.background }]}
                                placeholder="0.00"
                                placeholderTextColor={theme.textMuted}
                                keyboardType="numeric"
                                value={withdrawAmount}
                                onChangeText={setWithdrawAmount}
                            />
                        </View>
                        <View style={st.inputGroup}>
                            <Text style={[st.inputLabel, { color: theme.textMuted }]}>Bank Name / E-Wallet</Text>
                            <TextInput
                                style={[st.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.inputBg || theme.background }]}
                                placeholder="e.g. GCash, BDO"
                                placeholderTextColor={theme.textMuted}
                                value={bankName}
                                onChangeText={setBankName}
                            />
                        </View>
                        <View style={st.inputGroup}>
                            <Text style={[st.inputLabel, { color: theme.textMuted }]}>Account Name</Text>
                            <TextInput
                                style={[st.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.inputBg || theme.background }]}
                                placeholder="Juan Dela Cruz"
                                placeholderTextColor={theme.textMuted}
                                value={accountName}
                                onChangeText={setAccountName}
                            />
                        </View>
                        <View style={st.inputGroup}>
                            <Text style={[st.inputLabel, { color: theme.textMuted }]}>Account Number</Text>
                            <TextInput
                                style={[st.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.inputBg || theme.background }]}
                                placeholder="09123456789"
                                placeholderTextColor={theme.textMuted}
                                keyboardType="numeric"
                                value={accountNumber}
                                onChangeText={setAccountNumber}
                            />
                        </View>

                        <TouchableOpacity
                            style={[st.submitBtn, { backgroundColor: '#7B1FA2' }]}
                            onPress={handleRequestWithdrawal}
                            disabled={isSubmitting}
                        >
                            {isSubmitting
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={st.submitBtnText}>Submit Request</Text>
                            }
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const st = StyleSheet.create({
    root: { flex: 1 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    body: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: 4 },
    scroll: { paddingBottom: 40 },

    // Hero
    heroCard: {
        marginHorizontal: 16, marginTop: -4, borderRadius: 24, padding: 24,
        alignItems: 'center', backgroundColor: '#7B1FA2', overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, elevation: 8,
    },
    heroGlow: {
        position: 'absolute', top: -50, left: -30, width: 140, height: 140,
        borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.06)',
    },
    heroGlow2: {
        position: 'absolute', bottom: -30, right: -20, width: 100, height: 100,
        borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.04)',
    },
    heroLabel: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 4 },
    heroValue: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginBottom: 20 },

    statRow: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 20 },
    statPill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10,
    },
    statDot: { width: 8, height: 8, borderRadius: 4 },
    statPillValue: { fontSize: 12, fontWeight: '800', color: '#fff' },
    statPillLabel: { fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

    withdrawBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 25, width: '100%',
    },
    withdrawBtnText: { color: '#7B1FA2', fontSize: 15, fontWeight: '800' },
    disclaimer: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 16, textAlign: 'center', lineHeight: 16 },

    // Section
    section: {
        marginHorizontal: 16, marginTop: 20, borderRadius: 16, borderWidth: 1, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
    },
    sectionTitle: { fontSize: 15, fontWeight: '800' },
    salesBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    salesBadgeText: { fontSize: 11, fontWeight: '700' },

    txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    txIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    txTitle: { fontSize: 13, fontWeight: '700' },
    txDate: { fontSize: 11, marginTop: 2 },
    txAmount: { fontSize: 14, fontWeight: '800', color: '#2E7D32' },

    emptyState: { alignItems: 'center', paddingVertical: 30, gap: 8 },
    emptyText: { fontSize: 14, fontWeight: '500' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    modalBalanceChip: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginBottom: 20 },
    modalBalanceText: { fontSize: 14, fontWeight: '700', color: '#7B1FA2' },

    inputGroup: { marginBottom: 14 },
    inputLabel: { fontSize: 13, marginBottom: 5, marginLeft: 4, fontWeight: '600' },
    input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, fontWeight: '600' },
    submitBtn: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8, marginBottom: 20 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

export default SellerEarningsScreen;
