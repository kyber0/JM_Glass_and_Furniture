import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, ScrollView,
    TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const STAT_CARDS = [
    { key: 'totalUsers', label: 'Total Users', icon: 'people', color: '#4A90D9', screen: 'AdminUsers' },
    { key: 'totalSellers', label: 'Sellers', icon: 'storefront', color: '#FF9800', screen: 'AdminShops' },
    { key: 'totalOrders', label: 'Orders', icon: 'receipt', color: '#4CAF50', screen: 'AdminOrders' },
    { key: 'totalRevenue', label: 'Gross Volume(₱)', icon: 'swap-horizontal', color: '#607D8B', screen: 'AdminProfit' },
    { key: 'totalCommissionEarned', label: 'Admin Profit(₱)', icon: 'cash', color: '#9C27B0', screen: 'AdminProfit' },
    { key: 'totalGatewayCosts', label: 'Gateway Fees(₱)', icon: 'card', color: '#F44336', screen: 'AdminGatewayFees' },
    { key: 'pendingApplications', label: 'Pending Apps', icon: 'time', color: '#e53935', screen: 'AdminApplications' },
    { key: 'totalProducts', label: 'Products', icon: 'cube', color: '#00BCD4', screen: 'AdminProducts' },
];

const AdminDashboardScreen = ({ navigation }) => {
    const { user, logout } = useAuth();
    const { theme } = useTheme();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchStats = useCallback(async () => {
        try {
            const res = await adminAPI.getStats();
            if (res.success) setStats(res.stats);
        } catch (e) { console.error('Stats error:', e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchStats(); }, [fetchStats]));

    const formatValue = (key, val) => {
        if (key === 'totalRevenue' || key === 'totalCommissionEarned' || key === 'totalGatewayCosts') return `₱${parseFloat(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
        return String(val ?? 0);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <View>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>Admin Panel</Text>
                    <Text style={[styles.headerSub, { color: theme.textMuted }]}>JM Glass & Furniture</Text>
                </View>
                <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: '#e53935' }]} onPress={logout}>
                    <Ionicons name="log-out-outline" size={20} color="#fff" />
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStats(); }} tintColor={theme.accent} />}
                showsVerticalScrollIndicator={false}
            >
                {/* Welcome Card */}
                <View style={[styles.welcomeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.adminAvatar, { backgroundColor: theme.accent }]}>
                        <Ionicons name="shield-checkmark" size={28} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.welcomeText, { color: theme.textMuted }]}>Welcome back,</Text>
                        <Text style={[styles.adminName, { color: theme.text }]}>{user?.full_name || 'Administrator'}</Text>
                        <View style={styles.adminBadgeRow}>
                            <View style={[styles.adminBadge, { backgroundColor: theme.accent + '22' }]}>
                                <Ionicons name="ellipse" size={8} color="#4CAF50" style={{ marginRight: 4 }} />
                                <Text style={[styles.adminBadgeText, { color: theme.accent }]}>System Administrator</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Stats */}
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Platform Overview</Text>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 30 }} />
                ) : (
                    <View style={styles.statsGrid}>
                        {STAT_CARDS.map(card => (
                            <TouchableOpacity
                                key={card.key}
                                style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: card.color }]}
                                onPress={() => navigation.navigate(card.screen)}
                                activeOpacity={0.75}
                            >
                                <View style={styles.statCardTop}>
                                    <View style={[styles.statIcon, { backgroundColor: card.color + '22' }]}>
                                        <Ionicons name={card.icon} size={20} color={card.color} />
                                    </View>
                                    <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
                                </View>
                                <Text style={[styles.statValue, { color: theme.text }]}>{formatValue(card.key, stats?.[card.key])}</Text>
                                <Text style={[styles.statLabel, { color: theme.textMuted }]}>{card.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Quick Actions */}
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Quick Actions</Text>
                <View style={styles.actionsRow}>
                    {[
                        { label: 'Analytics', icon: 'bar-chart-outline', screen: 'AdminAnalytics', color: '#9C27B0' },
                        { label: 'Orders', icon: 'receipt-outline', screen: 'AdminOrders', color: '#4CAF50' },
                        { label: 'Users', icon: 'people-outline', screen: 'AdminUsers', color: '#4A90D9' },
                    ].map(a => (
                        <TouchableOpacity
                            key={a.label}
                            style={[styles.actionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                            onPress={() => navigation.navigate(a.screen)}
                            activeOpacity={0.8}
                        >
                            <View style={[styles.actionIcon, { backgroundColor: a.color }]}>
                                <Ionicons name={a.icon} size={22} color="#fff" />
                            </View>
                            <Text style={[styles.actionLabel, { color: theme.text }]}>{a.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.actionsRow}>
                    {[
                        { label: 'Apps', icon: 'document-text-outline', screen: 'AdminApplications', color: '#FF9800' },
                        { label: 'Reports', icon: 'flag-outline', screen: 'AdminReports', color: '#e53935' },
                        { label: 'Payouts', icon: 'wallet-outline', screen: 'AdminPayouts', color: '#8BC34A' },
                        { label: 'Products', icon: 'cube-outline', screen: 'AdminProducts', color: '#00BCD4' },
                    ].map(a => (
                        <TouchableOpacity
                            key={a.label}
                            style={[styles.actionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                            onPress={() => navigation.navigate(a.screen)}
                            activeOpacity={0.8}
                        >
                            <View style={[styles.actionIcon, { backgroundColor: a.color }]}>
                                <Ionicons name={a.icon} size={22} color="#fff" />
                            </View>
                            <Text style={[styles.actionLabel, { color: theme.text }]} numberOfLines={1}>{a.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Pending alert */}
                {!loading && stats?.pendingApplications > 0 && (
                    <TouchableOpacity
                        style={styles.alertBanner}
                        onPress={() => navigation.navigate('AdminApplications')}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="alert-circle" size={20} color="#fff" style={{ marginRight: 10 }} />
                        <Text style={styles.alertText}>
                            {stats.pendingApplications} seller application{stats.pendingApplications > 1 ? 's' : ''} awaiting review
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color="#fff" />
                    </TouchableOpacity>
                )}

                <View style={{ height: 30 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1,
    },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    headerSub: { fontSize: 12, marginTop: 2 },
    logoutBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    },
    logoutText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    scroll: { padding: 18 },
    welcomeCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderRadius: 16, padding: 18, marginBottom: 22,
        borderWidth: 1,
    },
    adminAvatar: {
        width: 54, height: 54, borderRadius: 27,
        justifyContent: 'center', alignItems: 'center',
    },
    welcomeText: { fontSize: 12 },
    adminName: { fontSize: 17, fontWeight: '700', marginTop: 2 },
    adminBadgeRow: { marginTop: 6 },
    adminBadge: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
        alignSelf: 'flex-start',
    },
    adminBadgeText: { fontSize: 11, fontWeight: '600' },
    sectionTitle: {
        fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: 1, marginBottom: 12,
    },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 },
    statCard: {
        width: '48%', borderRadius: 14, padding: 14, marginBottom: 12,
        borderLeftWidth: 4, borderWidth: 1,
    },
    statCardTop: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
    },
    statIcon: {
        width: 36, height: 36, borderRadius: 10,
        justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    },
    statValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
    statLabel: { fontSize: 11, fontWeight: '500' },
    actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    actionCard: {
        flex: 1, borderRadius: 14, padding: 16, alignItems: 'center',
        borderWidth: 1,
    },
    actionIcon: {
        width: 46, height: 46, borderRadius: 13,
        justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    },
    actionLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
    alertBanner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#e53935', borderRadius: 12, padding: 14,
    },
    alertText: { flex: 1, color: '#fff', fontWeight: '600', fontSize: 14 },
});

export default AdminDashboardScreen;
