import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, ScrollView, TouchableOpacity,
    ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { shopAPI } from '../services/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_COLORS = { pending: '#FF9800', processing: '#2196F3', shipped: '#9C27B0', delivered: '#4CAF50', cancelled: '#F44336', completed: '#00BCD4' };

// ── Monthly Revenue Chart (identical logic to admin) ──────────────────────────
const MonthlyRevenueChart = ({ data, theme, accentColor }) => {
    const [selected, setSelected] = useState(null);

    if (!data || data.length === 0) {
        return (
            <View style={cStyles.empty}>
                <Ionicons name="bar-chart-outline" size={36} color={theme.textMuted} />
                <Text style={[cStyles.emptyText, { color: theme.textMuted }]}>No monthly data yet — start selling!</Text>
            </View>
        );
    }

    const maxRev = Math.max(...data.map(m => parseFloat(m.revenue || 0)), 1);
    const totalRev = data.reduce((s, m) => s + parseFloat(m.revenue || 0), 0);
    const totalOrds = data.reduce((s, m) => s + parseInt(m.orders || 0), 0);
    const avgRev = data.length > 0 ? totalRev / data.length : 0;
    const selectedItem = selected !== null ? data[selected] : null;

    return (
        <View>
            {/* Summary chips */}
            <View style={cStyles.summaryRow}>
                {[
                    { label: 'Total', val: `₱${totalRev >= 1000 ? (totalRev / 1000).toFixed(1) + 'k' : totalRev.toFixed(0)}`, color: accentColor, icon: 'cash' },
                    { label: 'Orders', val: String(totalOrds), color: '#4A90D9', icon: 'receipt' },
                    { label: 'Avg/Mo', val: `₱${avgRev >= 1000 ? (avgRev / 1000).toFixed(1) + 'k' : avgRev.toFixed(0)}`, color: '#FF9800', icon: 'trending-up' },
                ].map(s => (
                    <View key={s.label} style={[cStyles.summaryChip, { backgroundColor: s.color + '15', borderColor: s.color + '40' }]}>
                        <Ionicons name={s.icon} size={12} color={s.color} />
                        <Text style={[cStyles.summaryVal, { color: s.color }]}>{s.val}</Text>
                        <Text style={[cStyles.summaryLabel, { color: theme.textMuted }]}>{s.label}</Text>
                    </View>
                ))}
            </View>

            {/* Tooltip / hint */}
            {selectedItem ? (
                <View style={[cStyles.tooltip, { backgroundColor: accentColor + '15', borderColor: accentColor + '40' }]}>
                    <Text style={[cStyles.tooltipMonth, { color: accentColor }]}>
                        {MONTH_NAMES[parseInt(selectedItem.month.substring(5, 7)) - 1]} {selectedItem.month.substring(0, 4)}
                    </Text>
                    <Text style={[cStyles.tooltipRev, { color: theme.text }]}>
                        ₱{parseFloat(selectedItem.revenue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Text>
                    <Text style={[cStyles.tooltipOrders, { color: theme.textMuted }]}>
                        {selectedItem.orders} order{selectedItem.orders !== 1 ? 's' : ''}
                    </Text>
                </View>
            ) : (
                <Text style={[cStyles.tapHint, { color: theme.textMuted }]}>Tap a bar to see details</Text>
            )}

            {/* Bars */}
            <View style={cStyles.chartWrap}>
                <View style={cStyles.yAxis}>
                    {[100, 75, 50, 25, 0].map(pct => (
                        <Text key={pct} style={[cStyles.yLabel, { color: theme.textMuted }]}>
                            {pct === 0 ? '0' : `${Math.round((maxRev * pct) / 100 / 1000)}k`}
                        </Text>
                    ))}
                </View>
                <View style={cStyles.barsArea}>
                    {[75, 50, 25].map(pct => (
                        <View key={pct} style={[cStyles.gridLine, { bottom: `${pct}%`, borderColor: theme.border }]} />
                    ))}
                    <View style={cStyles.barsRow}>
                        {data.map((m, i) => {
                            const rev = parseFloat(m.revenue || 0);
                            const h = maxRev > 0 ? (rev / maxRev) * 100 : 0;
                            const isSelected = selected === i;
                            const label = MONTH_NAMES[parseInt(m.month.substring(5, 7)) - 1];
                            return (
                                <TouchableOpacity key={i} style={cStyles.barCol} onPress={() => setSelected(isSelected ? null : i)} activeOpacity={0.7}>
                                    <View style={cStyles.barWrapper}>
                                        <LinearGradient
                                            colors={isSelected ? [accentColor, accentColor + 'BB'] : [accentColor + 'AA', accentColor + '44']}
                                            style={[cStyles.bar, { height: `${Math.max(h, 2)}%` }]}
                                        />
                                        {isSelected && <View style={[cStyles.barHighlight, { borderColor: accentColor }]} />}
                                    </View>
                                    <Text style={[cStyles.barLabel, { color: isSelected ? accentColor : theme.textMuted, fontWeight: isSelected ? '800' : '500' }]}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </View>

            {/* Table breakdown */}
            <View style={[cStyles.table, { borderColor: theme.border }]}>
                <View style={[cStyles.tableHeader, { borderBottomColor: theme.border }]}>
                    <Text style={[cStyles.tableHd, { color: theme.textMuted, flex: 2 }]}>Month</Text>
                    <Text style={[cStyles.tableHd, { color: theme.textMuted, flex: 2, textAlign: 'right' }]}>Revenue</Text>
                    <Text style={[cStyles.tableHd, { color: theme.textMuted, flex: 1, textAlign: 'right' }]}>Orders</Text>
                </View>
                {[...data].reverse().map((m, i) => {
                    const rev = parseFloat(m.revenue || 0);
                    const barW = maxRev > 0 ? (rev / maxRev) * 100 : 0;
                    const label = `${MONTH_NAMES[parseInt(m.month.substring(5, 7)) - 1]} ${m.month.substring(0, 4)}`;
                    return (
                        <View key={i} style={[cStyles.tableRow, i < data.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                            <Text style={[cStyles.tableCell, { color: theme.text, flex: 2, fontWeight: '600' }]}>{label}</Text>
                            <View style={{ flex: 2, alignItems: 'flex-end' }}>
                                <Text style={[cStyles.tableCell, { color: accentColor, fontWeight: '700' }]}>
                                    ₱{rev.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                                </Text>
                                <View style={[cStyles.miniBar, { backgroundColor: theme.border }]}>
                                    <View style={[cStyles.miniBarFill, { width: `${barW}%`, backgroundColor: accentColor }]} />
                                </View>
                            </View>
                            <Text style={[cStyles.tableCell, { color: theme.textSecondary, flex: 1, textAlign: 'right' }]}>{m.orders}</Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

const cStyles = StyleSheet.create({
    empty: { alignItems: 'center', paddingVertical: 30, gap: 10 },
    emptyText: { fontSize: 13, textAlign: 'center' },
    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    summaryChip: { flex: 1, alignItems: 'center', borderRadius: 10, padding: 8, borderWidth: 1, gap: 2 },
    summaryVal: { fontSize: 14, fontWeight: '800' },
    summaryLabel: { fontSize: 10 },
    tooltip: { borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, alignItems: 'center' },
    tooltipMonth: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    tooltipRev: { fontSize: 20, fontWeight: '800', marginTop: 2 },
    tooltipOrders: { fontSize: 12, marginTop: 2 },
    tapHint: { fontSize: 11, textAlign: 'center', marginBottom: 10 },
    chartWrap: { flexDirection: 'row', height: 150, marginBottom: 14 },
    yAxis: { width: 34, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, paddingBottom: 18 },
    yLabel: { fontSize: 9 },
    barsArea: { flex: 1, position: 'relative', paddingBottom: 18 },
    gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
    barsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: '100%' },
    barCol: { alignItems: 'center', flex: 1 },
    barWrapper: { width: '55%', height: 110, justifyContent: 'flex-end', position: 'relative' },
    bar: { width: '100%', borderRadius: 4 },
    barHighlight: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderRadius: 4 },
    barLabel: { fontSize: 9, marginTop: 3 },
    table: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
    tableHeader: { flexDirection: 'row', padding: 10, borderBottomWidth: 1 },
    tableHd: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9 },
    tableCell: { fontSize: 13 },
    miniBar: { height: 3, width: 60, borderRadius: 2, marginTop: 3, overflow: 'hidden' },
    miniBarFill: { height: '100%', borderRadius: 2 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
const SellerAnalyticsScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchStats = useCallback(async () => {
        try {
            const response = await shopAPI.getShopStats(user.id);
            if (response.success) setStats(response.stats);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user.id]);

    useFocusEffect(useCallback(() => { setLoading(true); fetchStats(); }, [fetchStats]));

    const accentColor = '#8D6E63';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Analytics</Text>
                <TouchableOpacity onPress={() => { setRefreshing(true); fetchStats(); }} style={styles.refreshBtn}>
                    <Ionicons name="refresh" size={20} color={theme.headerText} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={accentColor} />
                    <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading your analytics...</Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStats(); }} tintColor={accentColor} />}
                    showsVerticalScrollIndicator={false}
                >
                    {/* KPI Grid */}
                    <View style={styles.kpiGrid}>
                        {[
                            { label: 'Total Revenue', val: `₱${parseFloat(stats?.total_revenue || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`, icon: 'cash', color: '#4CAF50' },
                            { label: 'Total Orders', val: String(stats?.total_orders || 0), icon: 'receipt', color: '#4A90D9' },
                            { label: 'Products', val: String(stats?.total_products || 0), icon: 'cube', color: '#FF9800' },
                            { label: 'Avg Rating', val: `${stats?.avg_rating || '—'} ⭐`, icon: 'star', color: '#FFD700' },
                        ].map(kpi => (
                            <View key={kpi.label} style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '20' }]}>
                                    <Ionicons name={kpi.icon} size={18} color={kpi.color} />
                                </View>
                                <Text style={[styles.kpiVal, { color: theme.text }]}>{kpi.val}</Text>
                                <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>{kpi.label}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Low Stock Alerts */}
                    {stats?.low_stock_products?.length > 0 && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Ionicons name="warning" size={16} color="#D32F2F" />
                                <Text style={[styles.sectionTitle, { color: '#D32F2F' }]}>Low Stock Alerts</Text>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {stats.low_stock_products.map((prod, index) => (
                                    <View key={index} style={styles.lowStockCard}>
                                        <Ionicons name="alert-circle" size={14} color="#B71C1C" style={{ marginBottom: 4 }} />
                                        <Text style={styles.lowStockTitle} numberOfLines={1}>{prod.title}</Text>
                                        <Text style={styles.lowStockValue}>Only {prod.stock_quantity} left!</Text>
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Monthly Revenue */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="trending-up" size={16} color={accentColor} />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Monthly Revenue (12 Months)</Text>
                        </View>
                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <MonthlyRevenueChart data={stats?.monthly_revenue || []} theme={theme} accentColor={accentColor} />
                        </View>
                    </View>

                    {/* 7-day Sales History */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="calendar" size={16} color="#4A90D9" />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Sales – Last 7 Days</Text>
                        </View>
                        <View style={[styles.barChart, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            {stats?.sales_history?.map((item, index) => {
                                const maxSales = Math.max(...(stats.sales_history.map(s => s.total) || [0]), 1);
                                const heightPercent = (item.total / maxSales) * 70;
                                const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(item.date).getDay()];
                                return (
                                    <View key={index} style={styles.barColumn}>
                                        <Text style={[styles.barValue, { color: theme.textMuted }]}>
                                            {item.total > 0 ? (item.total >= 1000 ? `${(item.total / 1000).toFixed(1)}k` : item.total) : ''}
                                        </Text>
                                        <View style={[styles.barVisualContainer, { height: `${Math.max(heightPercent, 2)}%`, backgroundColor: theme.inputBg }]}>
                                            <LinearGradient colors={['#8D6E63', '#D7CCC8']} style={styles.barGradient} />
                                        </View>
                                        <Text style={[styles.barLabel, { color: theme.textSecondary }]}>{dayName}</Text>
                                    </View>
                                );
                            })}
                            {(!stats?.sales_history || stats.sales_history.length === 0) && (
                                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No sales this week.</Text>
                            )}
                        </View>
                    </View>

                    {/* Order Status */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="pie-chart" size={16} color="#9C27B0" />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Order Status Breakdown</Text>
                        </View>
                        {stats?.status_distribution && stats.status_distribution.length > 0 ? (
                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, padding: 0, overflow: 'hidden' }]}>
                                {/* Stacked bar */}
                                <View style={styles.stackedBar}>
                                    {(() => {
                                        const total = stats.status_distribution.reduce((a, c) => a + c.count, 0);
                                        return stats.status_distribution.map((item, i) => (
                                            <View key={i} style={{ flex: item.count / total, backgroundColor: STATUS_COLORS[item.status] || '#ccc', height: '100%' }} />
                                        ));
                                    })()}
                                </View>
                                {stats.status_distribution.map((item, index) => {
                                    const total = stats.status_distribution.reduce((a, c) => a + c.count, 0);
                                    const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
                                    return (
                                        <View key={index} style={[styles.statusRow, index < stats.status_distribution.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                                            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] || '#ccc' }]} />
                                            <Text style={[styles.statusLabel, { color: theme.text }]}>
                                                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                            </Text>
                                            <Text style={[styles.statusPct, { color: theme.textMuted }]}>{pct}%</Text>
                                            <Text style={[styles.statusCount, { color: STATUS_COLORS[item.status] || '#ccc' }]}>{item.count}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        ) : <Text style={[styles.emptyText, { color: theme.textMuted }]}>No order data</Text>}
                    </View>

                    {/* Top Products */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="trophy" size={16} color="#FFD700" />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Top Selling Products</Text>
                        </View>
                        {stats?.top_products?.map((prod, index) => (
                            <View key={index} style={[styles.rankCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <View style={[styles.rankBadge, { backgroundColor: index === 0 ? '#FFD70022' : theme.inputBg }]}>
                                    <Text style={[styles.rankNumber, { color: index === 0 ? '#FFD700' : theme.textMuted }]}>#{index + 1}</Text>
                                </View>
                                <View style={styles.rankInfo}>
                                    <Text style={[styles.rankTitle, { color: theme.text }]}>{prod.title}</Text>
                                    <Text style={[styles.rankSub, { color: theme.textMuted }]}>{prod.sold_count} sold</Text>
                                </View>
                                <Text style={styles.rankRevenue}>₱{parseFloat(prod.revenue).toLocaleString('en-PH', { minimumFractionDigits: 0 })}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Customer Feedback */}
                    {stats?.tag_stats && stats.tag_stats.length > 0 && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Ionicons name="chatbubble-ellipses" size={16} color="#4CAF50" />
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Customer Feedback Tags</Text>
                            </View>
                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                {stats.tag_stats.map((item, index) => {
                                    const maxVal = Math.max(...stats.tag_stats.map(t => t.count));
                                    const widthPct = (item.count / maxVal) * 100;
                                    return (
                                        <View key={index} style={styles.chartRow}>
                                            <Text style={[styles.chartLabel, { color: theme.textSecondary }]} numberOfLines={1}>{item.tag}</Text>
                                            <View style={[styles.barContainer, { backgroundColor: theme.inputBg }]}>
                                                <LinearGradient colors={['#4CAF50', '#81C784']} style={[styles.barFill, { width: `${widthPct}%` }]} />
                                            </View>
                                            <Text style={[styles.chartValue, { color: theme.text }]}>{item.count}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    <View style={{ height: 30 }} />
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 14, borderBottomWidth: 1 },
    backButton: { padding: 4 },
    refreshBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    loadingText: { marginTop: 10, fontSize: 14 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
    content: { padding: 16 },
    // KPI
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    kpiCard: { width: '47%', padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 6 },
    kpiIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    kpiVal: { fontSize: 18, fontWeight: '800' },
    kpiLabel: { fontSize: 11 },
    // Sections
    section: { marginBottom: 20 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    sectionTitle: { fontSize: 15, fontWeight: '700' },
    card: { borderRadius: 14, borderWidth: 1, padding: 14 },
    // Low stock
    lowStockCard: { backgroundColor: '#FFEBEE', padding: 10, borderRadius: 10, marginRight: 10, width: 140, borderWidth: 1, borderColor: '#FFCDD2' },
    lowStockTitle: { fontWeight: '700', color: '#B71C1C', marginBottom: 4, fontSize: 13 },
    lowStockValue: { color: '#B71C1C', fontSize: 12 },
    // 7-day bar chart
    barChart: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 160, padding: 14, borderRadius: 14, borderWidth: 1 },
    barColumn: { alignItems: 'center', width: 28, height: '100%', justifyContent: 'flex-end' },
    barVisualContainer: { width: 14, borderRadius: 4, overflow: 'hidden' },
    barGradient: { flex: 1 },
    barLabel: { fontSize: 11, marginTop: 6, fontWeight: '500' },
    barValue: { fontSize: 9, marginBottom: 4 },
    // Status
    stackedBar: { flexDirection: 'row', height: 6, overflow: 'hidden' },
    statusRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    statusLabel: { flex: 1, fontSize: 14 },
    statusPct: { fontSize: 12, marginRight: 10 },
    statusCount: { fontSize: 15, fontWeight: '700' },
    // Rank cards
    rankCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1 },
    rankBadge: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    rankNumber: { fontSize: 13, fontWeight: '800' },
    rankInfo: { flex: 1 },
    rankTitle: { fontSize: 14, fontWeight: '600' },
    rankSub: { fontSize: 12, marginTop: 2 },
    rankRevenue: { fontSize: 14, fontWeight: '700', color: '#4CAF50' },
    // Feedback chart
    chartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    chartLabel: { width: 100, fontSize: 12, marginRight: 10 },
    barContainer: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', marginRight: 10 },
    barFill: { height: '100%', borderRadius: 4 },
    chartValue: { width: 28, fontSize: 13, fontWeight: '700', textAlign: 'right' },
    emptyText: { textAlign: 'center', marginTop: 10, padding: 10, fontSize: 13 },
});

export default SellerAnalyticsScreen;
