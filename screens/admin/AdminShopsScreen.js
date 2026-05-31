import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    ActivityIndicator, Alert, TextInput, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META = {
    active: { label: 'Active', color: '#4CAF50', icon: 'checkmark-circle' },
    pending: { label: 'Pending', color: '#FF9800', icon: 'time' },
    banned: { label: 'Banned', color: '#e53935', icon: 'ban' },
    rejected: { label: 'Rejected', color: '#9E9E9E', icon: 'close-circle' },
};

const initials = (name = '') =>
    name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const ACCENT_COLORS = ['#6C63FF', '#FF6584', '#43C6AC', '#F7971E', '#2196F3', '#E91E63'];
const avatarColor = (id) => ACCENT_COLORS[id % ACCENT_COLORS.length];

const FILTERS = ['all', 'active', 'pending', 'banned'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminShopsScreen({ navigation }) {
    const { theme } = useTheme();
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState('all');

    // ── Fetch ──────────────────────────────────────────────────────────────────
    const fetchShops = useCallback(async () => {
        try {
            const res = await adminAPI.getShops();
            if (res.success) setShops(res.data || []);
        } catch {
            Alert.alert('Error', 'Failed to fetch shops');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchShops(); }, [fetchShops]));

    // ── Filter & Search ────────────────────────────────────────────────────────
    const displayed = shops
        .filter(s => filter === 'all' || s.status === filter)
        .filter(s => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return s.shop_name?.toLowerCase().includes(q) || s.owner_name?.toLowerCase().includes(q);
        });

    // ── Stats ──────────────────────────────────────────────────────────────────
    const counts = {
        all: shops.length,
        active: shops.filter(s => s.status === 'active').length,
        pending: shops.filter(s => s.status === 'pending').length,
        banned: shops.filter(s => s.status === 'banned').length,
    };

    // ── Actions ────────────────────────────────────────────────────────────────
    const confirmToggle = (shop) => {
        const isBanning = shop.status === 'active';
        const newStatus = isBanning ? 'banned' : 'active';
        Alert.alert(
            `${isBanning ? 'Ban' : 'Activate'} Shop`,
            `Are you sure you want to ${isBanning ? 'ban' : 'activate'} "${shop.shop_name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    style: isBanning ? 'destructive' : 'default',
                    onPress: async () => {
                        const res = await adminAPI.updateShopStatus(shop.shop_id, newStatus);
                        if (res.success) fetchShops();
                        else Alert.alert('Error', res.message || 'Failed to update shop status');
                    }
                }
            ]
        );
    };

    // ── Render Card ────────────────────────────────────────────────────────────
    const renderItem = ({ item }) => {
        const meta = STATUS_META[item.status] || STATUS_META.pending;
        const color = avatarColor(item.shop_id);

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => navigation.navigate('AdminShopDetail', { shop: item })}
                activeOpacity={0.8}
            >
                {/* Card Header */}
                <View style={styles.cardHeader}>
                    {/* Avatar */}
                    <View style={[styles.avatar, { backgroundColor: color }]}>
                        <Text style={styles.avatarText}>{initials(item.shop_name)}</Text>
                    </View>

                    {/* Name + Owner */}
                    <View style={styles.cardTitles}>
                        <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={1}>{item.shop_name}</Text>
                        <View style={styles.ownerRow}>
                            <Ionicons name="person-outline" size={12} color={theme.textMuted} />
                            <Text style={[styles.ownerName, { color: theme.textSecondary }]} numberOfLines={1}>
                                {' '}{item.owner_name}
                            </Text>
                        </View>
                    </View>

                    {/* Status Badge */}
                    <View style={[styles.statusBadge, { backgroundColor: meta.color + '22' }]}>
                        <Ionicons name={meta.icon} size={11} color={meta.color} />
                        <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 4 }} />
                </View>

                {/* Info Rows */}
                <View style={[styles.infoGrid, { borderColor: theme.border }]}>
                    <View style={styles.infoRow}>
                        <Ionicons name="mail-outline" size={13} color={theme.textMuted} />
                        <Text style={[styles.infoText, { color: theme.textSecondary }]} numberOfLines={1}>
                            {item.owner_email}
                        </Text>
                    </View>
                    {item.address ? (
                        <View style={styles.infoRow}>
                            <Ionicons name="location-outline" size={13} color={theme.textMuted} />
                            <Text style={[styles.infoText, { color: theme.textSecondary }]} numberOfLines={2}>
                                {item.address}
                            </Text>
                        </View>
                    ) : null}
                    <View style={styles.infoRow}>
                        <Ionicons name="calendar-outline" size={13} color={theme.textMuted} />
                        <Text style={[styles.infoText, { color: theme.textMuted }]}>
                            Joined {new Date(item.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>All Shops</Text>
                <View style={styles.totalBadge}>
                    <Text style={[styles.totalBadgeText, { color: theme.textMuted }]}>{counts.all} shops</Text>
                </View>
            </View>

            {/* Search Bar */}
            <View style={[styles.searchWrap, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <View style={[styles.searchBar, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                    <Ionicons name="search" size={17} color={theme.textMuted} />
                    <TextInput
                        style={[styles.searchInput, { color: theme.text }]}
                        placeholder="Search shops or owners..."
                        placeholderTextColor={theme.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={17} color={theme.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Stats + Filter Tabs */}
            <View style={[styles.filterRow, { borderBottomColor: theme.border }]}>
                {FILTERS.map(f => {
                    const active = filter === f;
                    const fMeta = STATUS_META[f];
                    const fColor = fMeta?.color || theme.accent;
                    return (
                        <TouchableOpacity
                            key={f}
                            style={[styles.filterTab, active && { borderBottomColor: fColor, borderBottomWidth: 2 }]}
                            onPress={() => setFilter(f)}
                        >
                            <Text style={[styles.filterTabText, { color: active ? fColor : theme.textMuted }]}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </Text>
                            <View style={[styles.filterCount, { backgroundColor: active ? fColor + '22' : theme.inputBg }]}>
                                <Text style={[styles.filterCountText, { color: active ? fColor : theme.textMuted }]}>
                                    {counts[f] ?? 0}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* List */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : (
                <FlatList
                    data={displayed}
                    keyExtractor={item => item.shop_id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.list, displayed.length === 0 && styles.listEmpty]}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchShops(); }} tintColor={theme.accent} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="storefront-outline" size={56} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                                {searchQuery ? 'No results found' : 'No shops in this category'}
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, gap: 12 },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
    totalBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#8884' },
    totalBadgeText: { fontSize: 12, fontWeight: '600' },

    // Search
    searchWrap: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
    searchInput: { flex: 1, fontSize: 14 },

    // Filter Tabs
    filterRow: { flexDirection: 'row', borderBottomWidth: 1 },
    filterTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
    filterTabText: { fontSize: 12, fontWeight: '700' },
    filterCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    filterCountText: { fontSize: 11, fontWeight: '700' },

    // List
    list: { padding: 14, gap: 12, paddingBottom: 40 },
    listEmpty: { flex: 1, justifyContent: 'center' },

    // Card
    card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
    avatar: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    cardTitles: { flex: 1 },
    shopName: { fontSize: 15, fontWeight: '700' },
    ownerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    ownerName: { fontSize: 12 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 11, fontWeight: '700' },

    // Info Grid
    infoGrid: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 7 },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    infoText: { fontSize: 13, flex: 1 },

    // Actions
    cardActions: { borderTopWidth: 1, padding: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, borderRadius: 9, borderWidth: 1 },
    actionBtnText: { fontSize: 13, fontWeight: '700' },

    // Empty / Center
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 15 },
});
