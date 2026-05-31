import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, ScrollView,
    ActivityIndicator, RefreshControl, TouchableOpacity,
    Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');

const STATUS_COLOR = {
    pending: '#FF9800', processing: '#4A90D9', shipped: '#9C27B0',
    delivered: '#4CAF50', cancelled: '#e53935', completed: '#00BCD4',
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Reusable Monthly Revenue Chart ────────────────────────────────────────────
const MonthlyRevenueChart = ({ data, theme, accentColor = theme.accent }) => {
    const [selected, setSelected] = useState(null);

    if (!data || data.length === 0) {
        return (
            <View style={chartStyles.empty}>
                <Ionicons name="bar-chart-outline" size={40} color={theme.textMuted} />
                <Text style={[chartStyles.emptyText, { color: theme.textMuted }]}>No revenue data yet</Text>
            </View>
        );
    }

    const maxRev = Math.max(...data.map(m => parseFloat(m.revenue || 0)), 1);
    const totalRev = data.reduce((s, m) => s + parseFloat(m.revenue || 0), 0);
    const totalOrds = data.reduce((s, m) => s + parseInt(m.orders || 0), 0);
    const avgRev = data.length > 0 ? totalRev / data.length : 0;

    // Summary cards
    const summary = [
        { label: 'Total Revenue', val: `₱${totalRev >= 1000 ? (totalRev / 1000).toFixed(1) + 'k' : totalRev.toFixed(0)}`, color: '#4CAF50', icon: 'cash' },
        { label: 'Total Orders', val: String(totalOrds), color: '#4A90D9', icon: 'receipt' },
        { label: 'Monthly Avg', val: `₱${avgRev >= 1000 ? (avgRev / 1000).toFixed(1) + 'k' : avgRev.toFixed(0)}`, color: '#FF9800', icon: 'trending-up' },
    ];

    const selectedItem = selected !== null ? data[selected] : null;

    return (
        <View>
            {/* Summary Row */}
            <View style={chartStyles.summaryRow}>
                {summary.map(s => (
                    <View key={s.label} style={[chartStyles.summaryChip, { backgroundColor: s.color + '15', borderColor: s.color + '40' }]}>
                        <Ionicons name={s.icon} size={13} color={s.color} />
                        <Text style={[chartStyles.summaryVal, { color: s.color }]}>{s.val}</Text>
                        <Text style={[chartStyles.summaryLabel, { color: theme.textMuted }]}>{s.label}</Text>
                    </View>
                ))}
            </View>

            {/* Selected bar tooltip */}
            {selectedItem ? (
                <View style={[chartStyles.tooltip, { backgroundColor: accentColor + '15', borderColor: accentColor + '40' }]}>
                    <Text style={[chartStyles.tooltipMonth, { color: accentColor }]}>
                        {MONTH_NAMES[parseInt(selectedItem.month.substring(5, 7)) - 1]} {selectedItem.month.substring(0, 4)}
                    </Text>
                    <Text style={[chartStyles.tooltipRev, { color: theme.text }]}>
                        ₱{parseFloat(selectedItem.revenue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Text>
                    <Text style={[chartStyles.tooltipOrders, { color: theme.textMuted }]}>
                        {selectedItem.orders} order{selectedItem.orders !== 1 ? 's' : ''}
                    </Text>
                </View>
            ) : (
                <Text style={[chartStyles.tapHint, { color: theme.textMuted }]}>Tap a bar for details</Text>
            )}

            {/* Bar Chart */}
            <View style={chartStyles.chartWrap}>
                {/* Y-axis labels */}
                <View style={chartStyles.yAxis}>
                    {[100, 75, 50, 25, 0].map(pct => (
                        <Text key={pct} style={[chartStyles.yLabel, { color: theme.textMuted }]}>
                            {pct === 0 ? '0' : `${Math.round((maxRev * pct) / 100 / 1000)}k`}
                        </Text>
                    ))}
                </View>
                {/* Bars */}
                <View style={chartStyles.barsArea}>
                    {/* Grid lines */}
                    {[75, 50, 25].map(pct => (
                        <View key={pct} style={[chartStyles.gridLine, { bottom: `${pct}%`, borderColor: theme.border }]} />
                    ))}
                    <View style={chartStyles.barsRow}>
                        {data.map((m, i) => {
                            const rev = parseFloat(m.revenue || 0);
                            const h = maxRev > 0 ? (rev / maxRev) * 100 : 0;
                            const monthLabel = MONTH_NAMES[parseInt(m.month.substring(5, 7)) - 1];
                            const isSelected = selected === i;
                            return (
                                <TouchableOpacity
                                    key={i}
                                    style={chartStyles.barCol}
                                    onPress={() => setSelected(isSelected ? null : i)}
                                    activeOpacity={0.7}
                                >
                                    <View style={chartStyles.barWrapper}>
                                        <View
                                            style={[
                                                chartStyles.bar,
                                                {
                                                    height: `${Math.max(h, 2)}%`,
                                                    backgroundColor: isSelected ? accentColor : accentColor + '88',
                                                    borderRadius: 4,
                                                }
                                            ]}
                                        />
                                        {isSelected && <View style={[chartStyles.barHighlight, { borderColor: accentColor }]} />}
                                    </View>
                                    <Text style={[chartStyles.barLabel, { color: isSelected ? accentColor : theme.textMuted, fontWeight: isSelected ? '800' : '500' }]}>
                                        {monthLabel}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </View>

            {/* Month-by-month list */}
            <View style={[chartStyles.table, { borderColor: theme.border }]}>
                <View style={[chartStyles.tableHeader, { borderBottomColor: theme.border }]}>
                    <Text style={[chartStyles.tableHeaderText, { color: theme.textMuted, flex: 2 }]}>Month</Text>
                    <Text style={[chartStyles.tableHeaderText, { color: theme.textMuted, flex: 2, textAlign: 'right' }]}>Revenue</Text>
                    <Text style={[chartStyles.tableHeaderText, { color: theme.textMuted, flex: 1, textAlign: 'right' }]}>Orders</Text>
                </View>
                {[...data].reverse().map((m, i) => {
                    const rev = parseFloat(m.revenue || 0);
                    const barW = maxRev > 0 ? (rev / maxRev) * 100 : 0;
                    const label = `${MONTH_NAMES[parseInt(m.month.substring(5, 7)) - 1]} ${m.month.substring(0, 4)}`;
                    return (
                        <View key={i} style={[chartStyles.tableRow, i < data.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                            <Text style={[chartStyles.tableCell, { color: theme.text, flex: 2, fontWeight: '600' }]}>{label}</Text>
                            <View style={{ flex: 2, alignItems: 'flex-end' }}>
                                <Text style={[chartStyles.tableCell, { color: accentColor, fontWeight: '700' }]}>
                                    ₱{rev.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                                </Text>
                                <View style={[chartStyles.miniBar, { backgroundColor: theme.border }]}>
                                    <View style={[chartStyles.miniBarFill, { width: `${barW}%`, backgroundColor: accentColor }]} />
                                </View>
                            </View>
                            <Text style={[chartStyles.tableCell, { color: theme.textSecondary, flex: 1, textAlign: 'right' }]}>{m.orders}</Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

const chartStyles = StyleSheet.create({
    empty: { alignItems: 'center', padding: 30, gap: 10 },
    emptyText: { fontSize: 14 },
    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    summaryChip: { flex: 1, alignItems: 'center', borderRadius: 10, padding: 10, borderWidth: 1, gap: 3 },
    summaryVal: { fontSize: 15, fontWeight: '800' },
    summaryLabel: { fontSize: 10, textAlign: 'center' },
    tooltip: { borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, alignItems: 'center' },
    tooltipMonth: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    tooltipRev: { fontSize: 22, fontWeight: '800', marginTop: 2 },
    tooltipOrders: { fontSize: 12, marginTop: 2 },
    tapHint: { fontSize: 11, textAlign: 'center', marginBottom: 10 },
    chartWrap: { flexDirection: 'row', height: 160, marginBottom: 16 },
    yAxis: { width: 36, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, paddingBottom: 20 },
    yLabel: { fontSize: 9 },
    barsArea: { flex: 1, position: 'relative', paddingBottom: 20 },
    gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
    barsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%' },
    barCol: { alignItems: 'center', flex: 1 },
    barWrapper: { width: '60%', height: 120, justifyContent: 'flex-end', position: 'relative' },
    bar: { width: '100%' },
    barHighlight: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderRadius: 4 },
    barLabel: { fontSize: 9, marginTop: 4 },
    table: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
    tableHeader: { flexDirection: 'row', padding: 10, borderBottomWidth: 1 },
    tableHeaderText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 },
    tableCell: { fontSize: 13 },
    miniBar: { height: 3, width: 70, borderRadius: 2, marginTop: 3, overflow: 'hidden' },
    miniBarFill: { height: '100%', borderRadius: 2 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
const AdminAnalyticsScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [data, setData] = useState(null);
    const [monthly, setMonthly] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [res, mRes] = await Promise.all([
                adminAPI.getAnalytics(),
                adminAPI.getMonthlyAnalytics()
            ]);
            if (res.success) setData(res.data);
            if (mRes.success) setMonthly(mRes.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

    const sanitizeVal = (v) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v).replace(/"/g, "'");
        return String(v).replace(/"/g, "'");
    };

    const handleExport = async (type) => {
        setExporting(true);
        try {
            let csvData = '';
            const filename = `JM_${type}_${Date.now()}.csv`;

            if (type === 'users') {
                const res = await adminAPI.getUsers();
                if (res.success && res.data && res.data.length > 0) {
                    // Only export safe flat fields
                    const safeKeys = ['user_id', 'full_name', 'email', 'phone', 'role', 'created_at'];
                    csvData = safeKeys.join(',') + '\n';
                    csvData += res.data.map(u =>
                        safeKeys.map(k => `"${sanitizeVal(u[k])}"`).join(',')
                    ).join('\n');
                }
            } else if (type === 'orders') {
                const res = await adminAPI.getOrders();
                if (res.success && res.data && res.data.length > 0) {
                    const safeKeys = ['order_id', 'status', 'total_amount', 'payment_method', 'created_at'];
                    csvData = safeKeys.join(',') + '\n';
                    csvData += res.data.map(o =>
                        safeKeys.map(k => `"${sanitizeVal(o[k])}"`).join(',')
                    ).join('\n');
                }
            } else if (type === 'revenue') {
                if (monthly.length > 0) {
                    csvData = 'Month,Revenue,Orders\n';
                    csvData += monthly.map(m =>
                        `"${m.month}","${parseFloat(m.revenue || 0).toFixed(2)}","${m.orders}"`
                    ).join('\n');
                }
            }

            if (!csvData.trim()) {
                Alert.alert('No Data', 'There is no data available to export.');
                return;
            }

            // Use cacheDirectory — works reliably on both Android & iOS
            const fileUri = FileSystem.cacheDirectory + filename;
            await FileSystem.writeAsStringAsync(fileUri, csvData, {
                encoding: 'utf8',
            });

            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'text/csv',
                    dialogTitle: `Export ${type} data`,
                    UTI: 'public.comma-separated-values-text',
                });
            } else {
                Alert.alert('Saved', `File exported to:\n${fileUri}`);
            }
        } catch (e) {
            console.error('Export error:', e);
            Alert.alert('Export Failed', e?.message || 'Something went wrong. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const totalRevenue7d = data?.revenueByDay?.reduce((s, r) => s + parseFloat(r.revenue || 0), 0) || 0;
    const totalOrders7d = data?.revenueByDay?.reduce((s, r) => s + parseInt(r.orders || 0), 0) || 0;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Analytics & Reports</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={theme.accent} />}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Exports */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Data Exports (CSV)</Text>
                    <View style={styles.exportRow}>
                        {[
                            { id: 'users', icon: 'people', label: 'Users', color: '#4A90D9' },
                            { id: 'orders', icon: 'receipt', label: 'Orders', color: '#FF9800' },
                            { id: 'revenue', icon: 'cash', label: 'Revenue', color: '#4CAF50' },
                        ].map(exp => (
                            <TouchableOpacity
                                key={exp.id}
                                style={[styles.exportCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                                onPress={() => handleExport(exp.id)}
                                disabled={exporting}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.exportIcon, { backgroundColor: exp.color + '22' }]}>
                                    <Ionicons name={exp.icon} size={20} color={exp.color} />
                                </View>
                                <Text style={[styles.exportLabel, { color: theme.text }]}>{exp.label}</Text>
                                <Ionicons name="download-outline" size={14} color={theme.textMuted} style={{ marginTop: 4 }} />
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* 7-day summary */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Last 7 Days</Text>
                    <View style={styles.summaryRow}>
                        <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: '#4CAF50' }]}>
                            <Ionicons name="cash-outline" size={18} color="#4CAF50" style={{ marginBottom: 6 }} />
                            <Text style={[styles.summaryValue, { color: theme.text }]}>₱{totalRevenue7d.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</Text>
                            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Revenue</Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: '#4A90D9' }]}>
                            <Ionicons name="receipt-outline" size={18} color="#4A90D9" style={{ marginBottom: 6 }} />
                            <Text style={[styles.summaryValue, { color: theme.text }]}>{totalOrders7d}</Text>
                            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Orders</Text>
                        </View>
                    </View>

                    {/* Monthly Revenue */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Monthly Revenue (Last 12 Months)</Text>
                    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, padding: 14 }]}>
                        <MonthlyRevenueChart data={monthly} theme={theme} accentColor="#4CAF50" />
                    </View>

                    {/* Orders by Status */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Orders by Status</Text>
                    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {/* Stacked progress bar */}
                        {data?.ordersByStatus && data.ordersByStatus.length > 0 && (
                            <View>
                                <View style={styles.stackedBar}>
                                    {(() => {
                                        const total = data.ordersByStatus.reduce((s, r) => s + parseInt(r.count), 0);
                                        return data.ordersByStatus.map((s, i) => (
                                            <View key={i} style={{ flex: parseInt(s.count) / total, backgroundColor: STATUS_COLOR[s.status] || theme.accent, height: '100%' }} />
                                        ));
                                    })()}
                                </View>
                            </View>
                        )}
                        {data?.ordersByStatus?.map((s, i) => {
                            const total = data.ordersByStatus.reduce((sum, r) => sum + parseInt(r.count), 0);
                            const pct = total > 0 ? ((parseInt(s.count) / total) * 100).toFixed(1) : 0;
                            return (
                                <View key={i} style={[styles.statusRow, i < data.ordersByStatus.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[s.status] || theme.accent }]} />
                                    <Text style={[styles.statusLabel, { color: theme.text }]}>{s.status.charAt(0).toUpperCase() + s.status.slice(1)}</Text>
                                    <Text style={[styles.statusPct, { color: theme.textMuted }]}>{pct}%</Text>
                                    <Text style={[styles.statusCount, { color: STATUS_COLOR[s.status] || theme.accent }]}>{s.count}</Text>
                                </View>
                            );
                        })}
                    </View>

                    {/* Top Products */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Top 5 Products</Text>
                    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {data?.topProducts?.map((p, i) => (
                            <View key={i} style={[styles.rankRow, i < data.topProducts.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                                <View style={[styles.rankBadge, { backgroundColor: i === 0 ? '#FFD70022' : theme.inputBg }]}>
                                    <Text style={[styles.rankNum, { color: i === 0 ? '#FFD700' : theme.accent }]}>#{i + 1}</Text>
                                </View>
                                <View style={styles.rankInfo}>
                                    <Text style={[styles.rankName, { color: theme.text }]} numberOfLines={1}>{p.title}</Text>
                                    <Text style={[styles.rankSub, { color: theme.textMuted }]}>{p.shop_name} · ₱{parseFloat(p.price).toFixed(0)}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[styles.rankStat, { color: '#4CAF50' }]}>{p.sold_count}</Text>
                                    <Text style={[styles.rankSub, { color: theme.textMuted }]}>sold</Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* Top Sellers */}
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Top 5 Sellers</Text>
                    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {data?.topSellers?.map((s, i) => (
                            <View key={i} style={[styles.rankRow, i < data.topSellers.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                                <View style={[styles.rankBadge, { backgroundColor: i === 0 ? '#FFD70022' : theme.inputBg }]}>
                                    <Text style={[styles.rankNum, { color: i === 0 ? '#FFD700' : theme.accent }]}>#{i + 1}</Text>
                                </View>
                                <View style={styles.rankInfo}>
                                    <Text style={[styles.rankName, { color: theme.text }]} numberOfLines={1}>{s.shop_name}</Text>
                                    <Text style={[styles.rankSub, { color: theme.textMuted }]}>{s.full_name} · {s.orders} orders</Text>
                                </View>
                                <Text style={[styles.rankStat, { color: '#4CAF50' }]}>₱{parseFloat(s.revenue || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={{ height: 30 }} />
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backBtn: { padding: 4, marginRight: 12 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    scroll: { padding: 16 },
    sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
    exportRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    exportCard: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
    exportIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    exportLabel: { fontSize: 12, fontWeight: '600' },
    summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    summaryCard: { flex: 1, borderRadius: 14, padding: 16, borderWidth: 1, borderLeftWidth: 4 },
    summaryValue: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
    summaryLabel: { fontSize: 12 },
    section: { borderRadius: 14, marginBottom: 20, borderWidth: 1, overflow: 'hidden' },
    stackedBar: { flexDirection: 'row', height: 8, marginBottom: 4, overflow: 'hidden' },
    statusRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    statusLabel: { flex: 1, fontSize: 14 },
    statusPct: { fontSize: 12, marginRight: 12 },
    statusCount: { fontSize: 15, fontWeight: '700' },
    rankRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
    rankBadge: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    rankNum: { fontSize: 13, fontWeight: '800' },
    rankInfo: { flex: 1, marginRight: 8 },
    rankName: { fontSize: 14, fontWeight: '700' },
    rankSub: { fontSize: 12, marginTop: 1 },
    rankStat: { fontSize: 14, fontWeight: '700' },
});

export default AdminAnalyticsScreen;
