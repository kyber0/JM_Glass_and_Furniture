import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, ScrollView, FlatList,
    TouchableOpacity, ActivityIndicator, RefreshControl,
    Alert, TextInput,
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
const fmtFull = (n) => `\u20b1${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

// ── Monthly Profit Chart ──────────────────────────────────────────────────────
const ProfitChart = ({ data, theme }) => {
    const [selected, setSelected] = useState(null);
    const [mode, setMode] = useState('commission');

    if (!data || data.length === 0) {
        return (
            <View style={{ alignItems: 'center', padding: 30 }}>
                <Ionicons name="bar-chart-outline" size={36} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, marginTop: 8 }}>No profit data yet</Text>
            </View>
        );
    }

    const COLOR = { commission: '#9C27B0', fees: '#F44336', net: '#4CAF50' };
    const LABEL = { commission: 'Commission', fees: 'Gateway Fees', net: 'Net Profit' };
    const getValue = (m) => parseFloat(
        mode === 'commission' ? m.revenue : mode === 'fees' ? m.fees : m.net
    ) || 0;
    const maxVal = Math.max(...data.map(getValue), 1);
    const selectedItem = selected !== null ? data[selected] : null;
    const accentColor = COLOR[mode];

    return (
        <View>
            <View style={chartSt.toggleRow}>
                {['commission', 'fees', 'net'].map(m => (
                    <TouchableOpacity
                        key={m}
                        style={[chartSt.toggleBtn, { borderColor: mode === m ? COLOR[m] : 'transparent', backgroundColor: mode === m ? COLOR[m] + '22' : 'transparent' }]}
                        onPress={() => { setMode(m); setSelected(null); }}
                    >
                        <Text style={[chartSt.toggleText, { color: mode === m ? COLOR[m] : theme.textMuted }]}>{LABEL[m]}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {selectedItem ? (
                <View style={[chartSt.tooltip, { backgroundColor: accentColor + '15', borderColor: accentColor + '40' }]}>
                    <Text style={[chartSt.tooltipMonth, { color: accentColor }]}>
                        {MONTH_NAMES[parseInt(selectedItem.month.substring(5, 7)) - 1]} {selectedItem.month.substring(0, 4)}
                    </Text>
                    <Text style={[chartSt.tooltipVal, { color: theme.text }]}>{fmtFull(getValue(selectedItem))}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>{selectedItem.orders} orders</Text>
                </View>
            ) : (
                <Text style={[chartSt.tapHint, { color: theme.textMuted }]}>Tap a bar for details</Text>
            )}

            <View style={chartSt.chartWrap}>
                <View style={chartSt.barsRow}>
                    {data.map((m, i) => {
                        const val = getValue(m);
                        const h = maxVal > 0 ? (val / maxVal) * 100 : 0;
                        const isSelected = selected === i;
                        return (
                            <TouchableOpacity key={i} style={chartSt.barCol} onPress={() => setSelected(isSelected ? null : i)} activeOpacity={0.7}>
                                <View style={chartSt.barWrapper}>
                                    <View style={[chartSt.bar, { height: `${Math.max(h, 2)}%`, backgroundColor: isSelected ? accentColor : accentColor + '88' }]} />
                                </View>
                                <Text style={[chartSt.barLabel, { color: isSelected ? accentColor : theme.textMuted }]}>
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
    toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    toggleBtn: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 6, alignItems: 'center' },
    toggleText: { fontSize: 11, fontWeight: '700' },
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

// ── Fee Settings Editor ───────────────────────────────────────────────────────
const FeeSettingsEditor = ({ feeSettings, onSave, theme }) => {
    const [commRate, setCommRate] = useState(String(feeSettings?.commission_rate || '3.00'));
    const [feePct, setFeePct] = useState(String(feeSettings?.transaction_fee_pct || '2.00'));
    const [feeFixed, setFeeFixed] = useState(String(feeSettings?.transaction_fee_fixed || '15.00'));
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await adminAPI.updatePlatformSettings({
                commission_rate: commRate,
                transaction_fee_pct: feePct,
                transaction_fee_fixed: feeFixed,
            });
            if (res.success) {
                Alert.alert('Saved', 'Fee settings updated.');
                onSave({ commission_rate: commRate, transaction_fee_pct: feePct, transaction_fee_fixed: feeFixed });
            }
        } catch { Alert.alert('Error', 'Failed to save settings.'); }
        finally { setSaving(false); }
    };

    return (
        <View style={{ gap: 12 }}>
            <View style={feeSt.row}>
                {[
                    { label: 'Commission %', val: commRate, set: setCommRate, suffix: '%' },
                    { label: 'TX Fee %', val: feePct, set: setFeePct, suffix: '%' },
                    { label: 'TX Fixed', val: feeFixed, set: setFeeFixed, suffix: '\u20b1' },
                ].map(f => (
                    <View key={f.label} style={feeSt.field}>
                        <Text style={[feeSt.label, { color: theme.textMuted }]}>{f.label}</Text>
                        <View style={[feeSt.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                            <TextInput
                                style={[feeSt.input, { color: theme.text }]}
                                value={f.val}
                                onChangeText={f.set}
                                keyboardType="decimal-pad"
                                selectTextOnFocus
                            />
                            <Text style={[feeSt.suffix, { color: theme.textMuted }]}>{f.suffix}</Text>
                        </View>
                    </View>
                ))}
            </View>
            <TouchableOpacity
                style={[feeSt.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
            >
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={feeSt.saveBtnText}>{saving ? 'Saving...' : 'Save Fee Settings'}</Text>
            </TouchableOpacity>
        </View>
    );
};

const feeSt = StyleSheet.create({
    row: { flexDirection: 'row', gap: 8 },
    field: { flex: 1 },
    label: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
    inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, height: 42 },
    input: { flex: 1, fontSize: 15, fontWeight: '700' },
    suffix: { fontSize: 13, marginLeft: 4 },
    saveBtn: { backgroundColor: '#9C27B0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
const AdminProfitScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const res = await adminAPI.getProfitReport();
            if (res.success) setData(res);
        } catch (e) { console.error('Profit report error:', e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

    const handleExport = async () => {
        if (!data?.transactions?.length) { Alert.alert('No Data', 'No completed transactions to export.'); return; }
        setExporting(true);
        try {
            const headers = ['Order ID', 'Date', 'Buyer', 'Shop', 'Total', 'Commission', 'Gateway Fee', 'Net Profit', 'Payment'];
            const rows = data.transactions.map(t => [
                t.order_id,
                new Date(t.created_at).toLocaleDateString(),
                `"${t.buyer_name}"`,
                `"${t.shop_name || ''}"`,
                parseFloat(t.total_amount).toFixed(2),
                parseFloat(t.commission_amount).toFixed(2),
                parseFloat(t.transaction_fee_amount).toFixed(2),
                parseFloat(t.net_profit).toFixed(2),
                t.payment_method,
            ].join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            const fileUri = FileSystem.cacheDirectory + `JM_Profit_${Date.now()}.csv`;
            await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Profit Report' });
            } else {
                Alert.alert('Saved', `Exported to:\n${fileUri}`);
            }
        } catch (e) { Alert.alert('Export Failed', e?.message || 'Something went wrong.'); }
        finally { setExporting(false); }
    };

    const s = data?.summary;
    const margin = s && s.totalCommission > 0 ? (s.netProfit / s.totalCommission) * 100 : 0;
    const gaugeColor = margin >= 60 ? '#4CAF50' : margin >= 30 ? '#FF9800' : '#F44336';

    const HERO = s ? [
        { label: 'Gross Volume', value: fmt(s.grossVolume), icon: 'swap-horizontal', color: '#607D8B', sub: `${s.totalCompletedOrders} completed orders` },
        { label: 'Commission', value: fmt(s.totalCommission), icon: 'cash', color: '#9C27B0', sub: 'Total earned' },
        { label: 'Gateway Fees', value: fmt(s.totalGatewayFees), icon: 'card', color: '#F44336', sub: 'Total cost' },
        { label: 'Net Profit', value: fmt(s.netProfit), icon: 'trending-up', color: '#4CAF50', sub: 'Commission minus fees' },
        { label: 'Pending Payouts', value: fmt(s.pendingPayouts), icon: 'wallet', color: '#FF9800', sub: 'Committed funds' },
        { label: 'Margin', value: `${margin.toFixed(1)}%`, icon: 'pie-chart', color: '#00BCD4', sub: 'Net / Commission' },
    ] : [];

    const renderTransaction = ({ item, index }) => {
        const net = parseFloat(item.net_profit);
        return (
            <View style={[txSt.row, { borderBottomColor: theme.border }]}>
                <View style={txSt.left}>
                    <Text style={[txSt.orderId, { color: theme.accent }]}>#{item.order_id}</Text>
                    <Text style={[txSt.buyer, { color: theme.text }]} numberOfLines={1}>{item.buyer_name}</Text>
                    <Text style={[txSt.meta, { color: theme.textMuted }]} numberOfLines={1}>{item.shop_name || '—'}</Text>
                    <Text style={[txSt.meta, { color: theme.textMuted }]}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={txSt.right}>
                    <Text style={[txSt.total, { color: theme.text }]}>{fmtFull(item.total_amount)}</Text>
                    <Text style={[txSt.comm, { color: '#9C27B0' }]}>+{fmtFull(item.commission_amount)} comm</Text>
                    <Text style={[txSt.fee, { color: '#F44336' }]}>-{fmtFull(item.transaction_fee_amount)} fee</Text>
                    <Text style={[txSt.net, { color: net >= 0 ? '#4CAF50' : '#F44336' }]}>{net >= 0 ? '+' : ''}{fmtFull(net)} net</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>Admin Profit</Text>
                    <Text style={[styles.headerSub, { color: theme.textMuted }]}>Commission & Revenue Breakdown</Text>
                </View>
                <TouchableOpacity
                    style={[styles.exportBtn, exporting && { opacity: 0.5 }]}
                    onPress={handleExport}
                    disabled={exporting}
                >
                    <Ionicons name="download-outline" size={16} color="#9C27B0" />
                    <Text style={styles.exportBtnText}>CSV</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#9C27B0" style={{ marginTop: 50 }} />
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#9C27B0" />}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Summary Hero Cards */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Summary</Text>
                    <View style={styles.heroGrid}>
                        {HERO.map(card => (
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

                    {/* Net Profit Gauge */}
                    {s && (
                        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={styles.gaugeHeader}>
                                <Text style={[styles.gaugeTitle, { color: theme.text }]}>Net Profit Margin</Text>
                                <Text style={[styles.gaugeValue, { color: gaugeColor }]}>{margin.toFixed(1)}%</Text>
                            </View>
                            <View style={[styles.gaugeTrack, { backgroundColor: theme.border }]}>
                                <View style={[styles.gaugeFill, { width: `${Math.min(margin, 100)}%`, backgroundColor: gaugeColor }]} />
                            </View>
                            <View style={styles.gaugeLabels}>
                                <Text style={[styles.gaugeLabelTxt, { color: '#F44336' }]}>Poor</Text>
                                <Text style={[styles.gaugeLabelTxt, { color: '#FF9800' }]}>Fair</Text>
                                <Text style={[styles.gaugeLabelTxt, { color: '#4CAF50' }]}>Good</Text>
                            </View>
                            {s.pendingPayouts > 0 && (
                                <View style={[styles.payoutAlert, { backgroundColor: '#FF980015', borderColor: '#FF980040' }]}>
                                    <Ionicons name="warning-outline" size={14} color="#FF9800" />
                                    <Text style={[styles.payoutAlertText, { color: '#FF9800' }]}>
                                        {fmt(s.pendingPayouts)} in pending payouts — available net: {fmt(Math.max(0, s.netProfit - s.pendingPayouts))}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Monthly Breakdown Chart */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Monthly Breakdown (Last 12 Months)</Text>
                    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, padding: 14 }]}>
                        <ProfitChart data={data?.monthly} theme={theme} />
                    </View>

                    {/* Platform Fee Settings */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Platform Fee Settings</Text>
                    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, padding: 14 }]}>
                        <Text style={[styles.feeNote, { color: theme.textMuted }]}>
                            Applied to new orders only. Existing orders are unaffected.
                        </Text>
                        <FeeSettingsEditor
                            feeSettings={data?.feeSettings}
                            onSave={(updated) => setData(prev => ({ ...prev, feeSettings: updated }))}
                            theme={theme}
                        />
                    </View>

                    {/* Top Earning Shops */}
                    {data?.topShops?.length > 0 && (
                        <>
                            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Top Earning Shops</Text>
                            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                {data.topShops.map((shop, i) => (
                                    <View key={i} style={[styles.shopRow, i < data.topShops.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                                        <View style={[styles.rankBadge, { backgroundColor: i === 0 ? '#FFD70020' : theme.inputBg }]}>
                                            <Text style={[styles.rankNum, { color: i === 0 ? '#FFD700' : '#9C27B0' }]}>#{i + 1}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={1}>{shop.shop_name}</Text>
                                            <Text style={[styles.shopSeller, { color: theme.textMuted }]}>{shop.seller_name} · {shop.orderCount} orders</Text>
                                        </View>
                                        <Text style={[styles.shopComm, { color: '#9C27B0' }]}>{fmt(shop.totalCommission)}</Text>
                                    </View>
                                ))}
                            </View>
                        </>
                    )}

                    {/* Transaction Log */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Transaction Log (Last 100)</Text>
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

const txSt = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
    left: { flex: 1, marginRight: 12 },
    right: { alignItems: 'flex-end' },
    orderId: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
    buyer: { fontSize: 13, fontWeight: '600' },
    meta: { fontSize: 11, marginTop: 1 },
    total: { fontSize: 13, fontWeight: '700' },
    comm: { fontSize: 11, marginTop: 2 },
    fee: { fontSize: 11 },
    net: { fontSize: 12, fontWeight: '800', marginTop: 2 },
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: '800' },
    headerSub: { fontSize: 11, marginTop: 1 },
    exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: '#9C27B0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
    exportBtnText: { color: '#9C27B0', fontWeight: '700', fontSize: 12 },
    scroll: { padding: 16, paddingTop: 14 },
    sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
    heroGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
    heroCard: { width: '48%', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderLeftWidth: 4 },
    heroIcon: { width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    heroValue: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
    heroLabel: { fontSize: 11, fontWeight: '700' },
    heroSub: { fontSize: 10, marginTop: 2 },
    section: { borderRadius: 14, marginBottom: 20, borderWidth: 1, overflow: 'hidden' },
    gaugeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14 },
    gaugeTitle: { fontSize: 14, fontWeight: '700' },
    gaugeValue: { fontSize: 18, fontWeight: '800' },
    gaugeTrack: { height: 10, borderRadius: 5, margin: 14, marginTop: 10, overflow: 'hidden' },
    gaugeFill: { height: '100%', borderRadius: 5 },
    gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, marginBottom: 10 },
    gaugeLabelTxt: { fontSize: 10, fontWeight: '600' },
    payoutAlert: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 14, marginTop: 0, borderRadius: 10, padding: 10, borderWidth: 1 },
    payoutAlertText: { flex: 1, fontSize: 12 },
    feeNote: { fontSize: 12, marginBottom: 14, lineHeight: 18 },
    shopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
    rankBadge: { width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
    rankNum: { fontSize: 12, fontWeight: '800' },
    shopName: { fontSize: 14, fontWeight: '700' },
    shopSeller: { fontSize: 12, marginTop: 1 },
    shopComm: { fontSize: 14, fontWeight: '800' },
});

export default AdminProfitScreen;
