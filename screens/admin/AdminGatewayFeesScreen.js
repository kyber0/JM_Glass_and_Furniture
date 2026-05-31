import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, ScrollView, FlatList,
    TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (n) => `\u20b1${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
const fmtF = (n) => `\u20b1${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const PAYMENT_COLORS = {
    gcash: '#00B0FF',
    cod: '#4CAF50',
    cash: '#4CAF50',
    card: '#FF9800',
    stripe: '#635BFF',
    paypal: '#003087',
    maya: '#39B54A',
    Unknown: '#9E9E9E',
};
const getPaymentColor = (method) => {
    if (!method) return PAYMENT_COLORS.Unknown;
    const key = method.toLowerCase();
    return Object.entries(PAYMENT_COLORS).find(([k]) => key.includes(k))?.[1] || '#9E9E9E';
};

// ── Monthly Fee Bar Chart ─────────────────────────────────────────────────────
const FeeChart = ({ data, theme }) => {
    const [selected, setSelected] = useState(null);
    if (!data || data.length === 0) {
        return (
            <View style={{ alignItems: 'center', padding: 30 }}>
                <Ionicons name="bar-chart-outline" size={36} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, marginTop: 8 }}>No fee data yet</Text>
            </View>
        );
    }
    const maxVal = Math.max(...data.map(d => parseFloat(d.revenue) || 0), 1);
    const selectedItem = selected !== null ? data[selected] : null;
    const accent = '#F44336';
    return (
        <View>
            {selectedItem ? (
                <View style={[chartSt.tooltip, { backgroundColor: '#F4433615', borderColor: '#F4433640' }]}>
                    <Text style={[chartSt.tooltipMonth, { color: accent }]}>
                        {MONTH_NAMES[parseInt(selectedItem.month.substring(5, 7)) - 1]} {selectedItem.month.substring(0, 4)}
                    </Text>
                    <Text style={[chartSt.tooltipVal, { color: theme.text }]}>{fmtF(selectedItem.revenue)}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>{selectedItem.orders} orders · avg {fmtF(selectedItem.avgFee)}</Text>
                </View>
            ) : (
                <Text style={[chartSt.tapHint, { color: theme.textMuted }]}>Tap a bar for details</Text>
            )}
            <View style={chartSt.chartWrap}>
                <View style={chartSt.barsRow}>
                    {data.map((m, i) => {
                        const h = maxVal > 0 ? (parseFloat(m.revenue) / maxVal) * 100 : 0;
                        const isSel = selected === i;
                        return (
                            <TouchableOpacity key={i} style={chartSt.barCol} onPress={() => setSelected(isSel ? null : i)} activeOpacity={0.7}>
                                <View style={chartSt.barWrapper}>
                                    <View style={[chartSt.bar, { height: `${Math.max(h, 2)}%`, backgroundColor: isSel ? accent : accent + '88' }]} />
                                </View>
                                <Text style={[chartSt.barLabel, { color: isSel ? accent : theme.textMuted }]}>
                                    {MONTH_NAMES[parseInt(m.month.substring(5, 7)) - 1]}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </View>
    );
};
const chartSt = StyleSheet.create({
    tooltip: { borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, alignItems: 'center' },
    tooltipMonth: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    tooltipVal: { fontSize: 22, fontWeight: '800', marginTop: 2 },
    tapHint: { fontSize: 11, textAlign: 'center', marginBottom: 10 },
    chartWrap: { height: 130, paddingBottom: 20 },
    barsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%' },
    barCol: { alignItems: 'center', flex: 1 },
    barWrapper: { width: '60%', height: 100, justifyContent: 'flex-end' },
    bar: { width: '100%', borderRadius: 4 },
    barLabel: { fontSize: 8, marginTop: 3 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
const AdminGatewayFeesScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const res = await adminAPI.getGatewayFees();
            if (res.success) setData(res);
        } catch (e) { console.error('Gateway fees error:', e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

    const handleExport = async () => {
        if (!data?.transactions?.length) { Alert.alert('No Data', 'No transactions to export.'); return; }
        setExporting(true);
        try {
            const headers = ['Order ID', 'Date', 'Buyer', 'Shop', 'Total', 'Fee %', 'Fixed Fee', 'Fee Amount', 'Payment'];
            const rows = data.transactions.map(t => [
                t.order_id,
                new Date(t.created_at).toLocaleDateString(),
                `"${t.buyer_name}"`,
                `"${t.shop_name || ''}"`,
                parseFloat(t.total_amount).toFixed(2),
                parseFloat(t.transaction_fee_pct || 0).toFixed(2),
                parseFloat(t.transaction_fee_fixed || 0).toFixed(2),
                parseFloat(t.transaction_fee_amount).toFixed(2),
                t.payment_method,
            ].join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            const fileUri = FileSystem.cacheDirectory + `JM_GatewayFees_${Date.now()}.csv`;
            await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Gateway Fees' });
            } else {
                Alert.alert('Saved', `Exported to:\n${fileUri}`);
            }
        } catch (e) { Alert.alert('Export Failed', e?.message || 'Something went wrong.'); }
        finally { setExporting(false); }
    };

    const s = data?.summary;

    const renderTransaction = ({ item }) => {
        const color = getPaymentColor(item.payment_method);
        return (
            <View style={[txSt.row, { borderBottomColor: theme.border }]}>
                <View style={txSt.left}>
                    <Text style={[txSt.orderId, { color: theme.accent }]}>#{item.order_id}</Text>
                    <Text style={[txSt.buyer, { color: theme.text }]} numberOfLines={1}>{item.buyer_name}</Text>
                    <Text style={[txSt.meta, { color: theme.textMuted }]} numberOfLines={1}>{item.shop_name || '—'}</Text>
                    <View style={txSt.methodRow}>
                        <View style={[txSt.methodBadge, { backgroundColor: color + '20' }]}>
                            <Text style={[txSt.methodText, { color }]}>{item.payment_method || 'Unknown'}</Text>
                        </View>
                        <Text style={[txSt.date, { color: theme.textMuted }]}>{new Date(item.created_at).toLocaleDateString()}</Text>
                    </View>
                </View>
                <View style={txSt.right}>
                    <Text style={[txSt.total, { color: theme.text }]}>{fmtF(item.total_amount)}</Text>
                    <Text style={[txSt.feeLabel, { color: theme.textMuted }]}>{parseFloat(item.transaction_fee_pct || 0).toFixed(1)}% + {fmtF(item.transaction_fee_fixed)}</Text>
                    <Text style={[txSt.feeAmount, { color: '#F44336' }]}>-{fmtF(item.transaction_fee_amount)}</Text>
                </View>
            </View>
        );
    };

    // Calculate payment method bar widths
    const maxMethodFee = data?.byPaymentMethod?.length
        ? Math.max(...data.byPaymentMethod.map(m => parseFloat(m.totalFees) || 0), 1) : 1;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>Gateway Fees</Text>
                    <Text style={[styles.headerSub, { color: theme.textMuted }]}>Payment Processing Costs</Text>
                </View>
                <TouchableOpacity
                    style={[styles.exportBtn, exporting && { opacity: 0.5 }]}
                    onPress={handleExport}
                    disabled={exporting}
                >
                    <Ionicons name="download-outline" size={16} color="#F44336" />
                    <Text style={[styles.exportBtnText, { color: '#F44336' }]}>CSV</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#F44336" style={{ marginTop: 50 }} />
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#F44336" />}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Summary Cards */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Summary</Text>
                    <View style={styles.heroGrid}>
                        {s && [
                            { label: 'Total Fees Paid', value: fmt(s.totalFees), icon: 'card', color: '#F44336', sub: `${s.totalOrders} orders` },
                            { label: 'Avg Fee / Order', value: fmtF(s.avgFeePerOrder), icon: 'analytics', color: '#FF9800', sub: 'Per completed order' },
                            { label: 'Avg Fee Rate', value: `${parseFloat(s.avgFeeRatePct).toFixed(2)}%`, icon: 'pie-chart', color: '#9C27B0', sub: 'Of order value' },
                            { label: 'Total Orders', value: s.totalOrders.toLocaleString(), icon: 'receipt', color: '#607D8B', sub: 'Completed' },
                        ].map(card => (
                            <View key={card.label} style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: card.color }]}>
                                <View style={[styles.heroIcon, { backgroundColor: card.color + '20' }]}>
                                    <Ionicons name={card.icon} size={18} color={card.color} />
                                </View>
                                <Text style={[styles.heroValue, { color: theme.text }]}>{card.value}</Text>
                                <Text style={[styles.heroLabel, { color: theme.textMuted }]}>{card.label}</Text>
                                <Text style={[styles.heroSub, { color: theme.textMuted }]}>{card.sub}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Fees by Payment Method */}
                    {data?.byPaymentMethod?.length > 0 && (
                        <>
                            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Fees by Payment Method</Text>
                            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, padding: 14 }]}>
                                {data.byPaymentMethod.map((m, i) => {
                                    const color = getPaymentColor(m.payment_method);
                                    const barW = maxMethodFee > 0 ? (parseFloat(m.totalFees) / maxMethodFee) * 100 : 0;
                                    return (
                                        <View key={i} style={[pmSt.row, i < data.byPaymentMethod.length - 1 && { marginBottom: 14 }]}>
                                            <View style={pmSt.topRow}>
                                                <View style={[pmSt.badge, { backgroundColor: color + '20' }]}>
                                                    <Text style={[pmSt.badgeText, { color }]}>{m.payment_method || 'Unknown'}</Text>
                                                </View>
                                                <Text style={[pmSt.feeVal, { color: '#F44336' }]}>{fmtF(m.totalFees)}</Text>
                                            </View>
                                            <View style={[pmSt.track, { backgroundColor: theme.border }]}>
                                                <View style={[pmSt.fill, { width: `${barW}%`, backgroundColor: color }]} />
                                            </View>
                                            <Text style={[pmSt.sub, { color: theme.textMuted }]}>
                                                {m.orderCount} orders · avg {fmtF(m.avgFee)} / order
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {/* Monthly Trend */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Monthly Fee Trend (Last 12 Months)</Text>
                    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, padding: 14 }]}>
                        <FeeChart data={data?.monthly} theme={theme} />
                    </View>

                    {/* Transaction Log */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Fee Transaction Log (Last 100)</Text>
                    {data?.transactions?.length > 0 ? (
                        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <FlatList
                                data={data.transactions}
                                renderItem={renderTransaction}
                                keyExtractor={item => item.order_id.toString()}
                                scrollEnabled={false}
                            />
                        </View>
                    ) : (
                        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, alignItems: 'center', padding: 30 }]}>
                            <Ionicons name="receipt-outline" size={36} color={theme.textMuted} />
                            <Text style={{ color: theme.textMuted, marginTop: 8 }}>No completed transactions yet</Text>
                        </View>
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

const pmSt = StyleSheet.create({
    row: {},
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
    feeVal: { fontSize: 14, fontWeight: '800' },
    track: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
    fill: { height: '100%', borderRadius: 4 },
    sub: { fontSize: 11 },
});

const txSt = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
    left: { flex: 1, marginRight: 12 },
    right: { alignItems: 'flex-end' },
    orderId: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
    buyer: { fontSize: 13, fontWeight: '600' },
    meta: { fontSize: 11, marginTop: 1 },
    methodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    methodBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
    methodText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
    date: { fontSize: 10 },
    total: { fontSize: 13, fontWeight: '700' },
    feeLabel: { fontSize: 10, marginTop: 2 },
    feeAmount: { fontSize: 13, fontWeight: '800', marginTop: 2 },
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: '800' },
    headerSub: { fontSize: 11, marginTop: 1 },
    exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: '#F44336', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
    exportBtnText: { fontWeight: '700', fontSize: 12 },
    scroll: { padding: 16, paddingTop: 14 },
    sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
    heroGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
    heroCard: { width: '48%', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderLeftWidth: 4 },
    heroIcon: { width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    heroValue: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
    heroLabel: { fontSize: 11, fontWeight: '700' },
    heroSub: { fontSize: 10, marginTop: 2 },
    section: { borderRadius: 14, marginBottom: 20, borderWidth: 1, overflow: 'hidden' },
});

export default AdminGatewayFeesScreen;
