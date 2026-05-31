import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, ActivityIndicator,
    RefreshControl, TouchableOpacity, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import CustomAlert from '../../components/CustomAlert';

const STATUS_COLOR = {
    pending: '#FF9800',
    completed: '#4CAF50',
    rejected: '#e53935'
};

const AdminPayoutsScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [payouts, setPayouts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('pending');

    // Alert state
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });

    const fetchPayouts = useCallback(async () => {
        try {
            const res = await adminAPI.getPayouts();
            if (res.success) setPayouts(res.data);
        } catch (e) {
            console.error(e);
            showAlert('Failed to load payouts. Try again later.', 'Error', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchPayouts(); }, [fetchPayouts]));

    const showAlert = (message, title = 'Info', type = 'info') => {
        setAlertConfig({ visible: true, title, message, type });
    };

    const handleApprove = (id) => {
        Alert.alert(
            "Confirm Payout",
            "Are you sure you want to mark this payout as completed? This implies you have already manually transferred the funds.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Confirm",
                    onPress: async () => {
                        try {
                            const res = await adminAPI.approvePayout(id, { status: 'completed' });
                            if (res.success) {
                                showAlert('Payout marked as complete', 'Success', 'success');
                                fetchPayouts();
                            } else {
                                showAlert(res.message || 'Failed to approve payout', 'Error', 'error');
                            }
                        } catch (error) {
                            showAlert('Server error', 'Error', 'error');
                        }
                    }
                }
            ]
        );
    };

    const filtered = filter === 'all' ? payouts : payouts.filter(p => p.status === filter);

    const renderItem = ({ item }) => {
        const color = STATUS_COLOR[item.status] || theme.textMuted;
        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => navigation.navigate('AdminPayoutDetail', { payout: item })}
                activeOpacity={0.8}
            >
                <View style={styles.cardHeader}>
                    <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={1}>{item.shop_name}</Text>
                    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
                        <Text style={[styles.badgeText, { color }]}>{item.status}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 4 }} />
                </View>

                <View style={styles.amountRow}>
                    <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>Requested Amount</Text>
                    <Text style={[styles.amount, { color: theme.accent }]}>₱{parseFloat(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
                </View>

                <View style={[styles.bankDetails, { backgroundColor: theme.background }]}>
                    <View style={styles.bankRow}>
                        <Text style={[styles.bankLabel, { color: theme.textMuted }]}>Bank/E-Wallet:</Text>
                        <Text style={[styles.bankValue, { color: theme.textSecondary }]}>{item.bank_name || 'N/A'}</Text>
                    </View>
                    <View style={styles.bankRow}>
                        <Text style={[styles.bankLabel, { color: theme.textMuted }]}>Account Name:</Text>
                        <Text style={[styles.bankValue, { color: theme.textSecondary }]}>{item.account_name || 'N/A'}</Text>
                    </View>
                    <View style={styles.bankRow}>
                        <Text style={[styles.bankLabel, { color: theme.textMuted }]}>Account No.:</Text>
                        <Text style={[styles.bankValue, { color: theme.textSecondary }]}>{item.account_number || 'N/A'}</Text>
                    </View>
                </View>

                <Text style={[styles.date, { color: theme.textMuted }]}>
                    Requested: {new Date(item.created_at).toLocaleString('en-PH')}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Seller Payouts</Text>
            </View>

            <View style={[styles.filterWrap, { borderBottomColor: theme.border }]}>
                {['pending', 'completed', 'all'].map(f => (
                    <TouchableOpacity key={f}
                        style={[styles.chip, { backgroundColor: theme.inputBg, borderColor: theme.border },
                        filter === f && { backgroundColor: STATUS_COLOR[f] || theme.accent, borderColor: STATUS_COLOR[f] || theme.accent }]}
                        onPress={() => setFilter(f)}
                    >
                        <Text style={[styles.chipText, { color: theme.textSecondary }, filter === f && { color: '#fff' }]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)} ({payouts.filter(p => f === 'all' || p.status === f).length})
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={filtered}
                    renderItem={renderItem}
                    keyExtractor={item => item.payout_id.toString()}
                    contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty]}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPayouts(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="wallet-outline" size={52} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No payouts found</Text>
                        </View>
                    }
                />
            )}
            <CustomAlert
                visible={alertConfig.visible} title={alertConfig.title}
                message={alertConfig.message} type={alertConfig.type}
                onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backButton: { marginRight: 15 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    filterWrap: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1 },
    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },
    list: { padding: 16, gap: 16, paddingBottom: 40 },
    listEmpty: { flex: 1, justifyContent: 'center' },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 15 },
    card: { padding: 16, borderRadius: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    shopName: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 10 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    amountLabel: { fontSize: 14 },
    amount: { fontSize: 20, fontWeight: '800' },
    bankDetails: { borderRadius: 8, padding: 12, gap: 6, marginBottom: 12 },
    bankRow: { flexDirection: 'row', justifyContent: 'space-between' },
    bankLabel: { fontSize: 13 },
    bankValue: { fontSize: 13, fontWeight: '600' },
    date: { fontSize: 12, marginBottom: 12 },
    approveBtn: { flexDirection: 'row', padding: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center', gap: 6 },
    approveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' }
});

export default AdminPayoutsScreen;
