import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, ActivityIndicator,
    RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const STATUS_COLOR = {
    pending:     '#FF9800',
    negotiating: '#4A90D9',
    accepted:    '#4CAF50',
    in_progress: '#795548',
    ready:       '#00BCD4',
    rejected:    '#e53935',
    completed:   '#9C27B0',
};

const FRAGILITY_ICON = { low: '🟡', medium: '🟠', high: '🔴' };
const COMPLEXITY_ICON = { basic: '🔧', standard: '⚙️', complex: '🏗️' };

const ALL_STATUSES = ['all', 'pending', 'negotiating', 'accepted', 'in_progress', 'ready', 'completed', 'rejected'];

const AdminCustomRequestsScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');

    const fetchRequests = useCallback(async () => {
        try {
            const res = await adminAPI.getCustomRequests();
            if (res.success) setRequests(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchRequests(); }, [fetchRequests]));

    const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

    const renderRequest = ({ item }) => {
        const color = STATUS_COLOR[item.status] || theme.accent;
        const statusLabel = item.status?.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
                onPress={() => navigation.navigate('RequestDetail', { requestId: item.id, userType: 'admin' })}
                activeOpacity={0.8}
            >
                <View style={styles.cardTop}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                        REQ-{item.id} {item.product_title ? `· ${item.product_title}` : '· Custom Design'}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
                        <Text style={[styles.badgeText, { color }]}>{statusLabel}</Text>
                    </View>
                </View>

                <Text style={[styles.desc, { color: theme.textMuted }]} numberOfLines={2}>{item.description || item.details}</Text>

                {/* Fragility & Complexity chips */}
                {(item.fragility_level && item.fragility_level !== 'none') || item.installation_complexity ? (
                    <View style={styles.chipRow}>
                        {item.fragility_level && item.fragility_level !== 'none' && (
                            <View style={[styles.metaChip, { backgroundColor: '#FFF3E0' }]}>
                                <Text style={{ fontSize: 11, color: '#E65100' }}>
                                    {FRAGILITY_ICON[item.fragility_level]} {item.fragility_level} fragility
                                </Text>
                            </View>
                        )}
                        {item.installation_complexity && (
                            <View style={[styles.metaChip, { backgroundColor: '#E8F5E9' }]}>
                                <Text style={{ fontSize: 11, color: '#2E7D32' }}>
                                    {COMPLEXITY_ICON[item.installation_complexity]} {item.installation_complexity}
                                </Text>
                            </View>
                        )}
                    </View>
                ) : null}

                <View style={styles.cardMeta}>
                    <View style={styles.party}>
                        <Ionicons name="person" size={12} color={theme.textMuted} style={{ marginRight: 4 }} />
                        <Text style={[styles.partyText, { color: theme.textMuted }]}>{item.buyer_name}</Text>
                    </View>
                    <Text style={[styles.arrow, { color: theme.textMuted }]}>→</Text>
                    <View style={styles.party}>
                        <Ionicons name="storefront" size={12} color={theme.textMuted} style={{ marginRight: 4 }} />
                        <Text style={[styles.partyText, { color: theme.textMuted }]}>{item.shop_name || '—'}</Text>
                    </View>
                    {(item.quoted_price || item.budget) && (
                        <Text style={[styles.budget, { color: theme.accent }]}>
                            ₱{parseFloat(item.quoted_price || item.budget).toLocaleString('en-PH')}
                            {item.quoted_price && item.budget && item.quoted_price !== item.budget ? ' (quoted)' : ''}
                        </Text>
                    )}
                </View>
                <Text style={[styles.date, { color: theme.textMuted }]}>
                    {new Date(item.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <Ionicons name="hammer" size={20} color={theme.accent} style={{ marginRight: 10 }} />
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Custom Requests</Text>
                <View style={[styles.countBadge, { backgroundColor: theme.accent + '22' }]}>
                    <Text style={[styles.countText, { color: theme.accent }]}>{filtered.length}</Text>
                </View>
            </View>

            {/* Status filter chips — horizontal scroll */}
            <FlatList
                horizontal
                data={ALL_STATUSES}
                keyExtractor={f => f}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterWrap}
                renderItem={({ item: f }) => (
                    <TouchableOpacity
                        style={[styles.chip,
                            { backgroundColor: theme.inputBg, borderColor: theme.border },
                            filter === f && { backgroundColor: STATUS_COLOR[f] || theme.accent, borderColor: STATUS_COLOR[f] || theme.accent }
                        ]}
                        onPress={() => setFilter(f)}
                    >
                        <Text style={[styles.chipText, { color: theme.textSecondary }, filter === f && { color: '#fff' }]}>
                            {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </Text>
                    </TouchableOpacity>
                )}
            />

            {loading ? <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} /> : (
                <FlatList
                    data={filtered}
                    renderItem={renderRequest}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRequests(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="hammer-outline" size={52} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No custom requests</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
    countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    countText: { fontSize: 13, fontWeight: '700' },
    filterWrap: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    chipText: { fontSize: 12, fontWeight: '600' },
    list: { paddingHorizontal: 16, paddingBottom: 30 },
    card: { paddingVertical: 14, borderBottomWidth: 1, marginBottom: 4 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    title: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
    badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
    badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    desc: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
    chipRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
    metaChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    party: { flexDirection: 'row', alignItems: 'center' },
    partyText: { fontSize: 12 },
    arrow: { fontSize: 12 },
    budget: { marginLeft: 'auto', fontSize: 13, fontWeight: '700' },
    date: { fontSize: 11 },
    emptyBox: { alignItems: 'center', marginTop: 60, gap: 12 },
    emptyText: { fontSize: 15 },
});

export default AdminCustomRequestsScreen;
