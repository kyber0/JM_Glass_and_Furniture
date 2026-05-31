import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const AdminHandymenScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [handymen, setHandymen] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');

    const fetchHandymen = useCallback(async () => {
        try {
            const res = await adminAPI.getHandymen();
            if (res.success) { setHandymen(res.data); applyFilter(res.data, search); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchHandymen(); }, [fetchHandymen]));

    const applyFilter = (data, q) => {
        if (!q.trim()) { setFiltered(data); return; }
        setFiltered(data.filter(h =>
            h.name.toLowerCase().includes(q.toLowerCase()) ||
            h.shop_name?.toLowerCase().includes(q.toLowerCase()) ||
            h.specialization?.toLowerCase().includes(q.toLowerCase())
        ));
    };

    const handleSearch = (q) => { setSearch(q); applyFilter(handymen, q); };

    const renderHandyman = ({ item }) => (
        <View style={[styles.card, { borderBottomColor: theme.border }]}>
            <View style={[styles.avatar, { backgroundColor: theme.accent + '22' }]}>
                <Ionicons name="construct" size={22} color={theme.accent} />
            </View>
            <View style={styles.info}>
                <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
                <Text style={[styles.spec, { color: theme.textMuted }]}>{item.specialization || 'General'}</Text>
                <View style={styles.metaRow}>
                    <Ionicons name="storefront-outline" size={12} color={theme.textMuted} style={{ marginRight: 4 }} />
                    <Text style={[styles.meta, { color: theme.textMuted }]}>{item.shop_name}</Text>
                    {item.phone && <>
                        <Text style={[styles.dot, { color: theme.textMuted }]}>·</Text>
                        <Ionicons name="call-outline" size={12} color={theme.textMuted} style={{ marginRight: 4 }} />
                        <Text style={[styles.meta, { color: theme.textMuted }]}>{item.phone}</Text>
                    </>}
                </View>
            </View>
            {parseInt(item.active_orders) > 0 && (
                <View style={[styles.activeBadge, { backgroundColor: '#FF9800' + '22' }]}>
                    <Text style={[styles.activeText, { color: '#FF9800' }]}>{item.active_orders} active</Text>
                </View>
            )}
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <Ionicons name="construct" size={20} color={theme.accent} style={{ marginRight: 10 }} />
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Handymen</Text>
                <View style={[styles.countBadge, { backgroundColor: theme.accent + '22' }]}>
                    <Text style={[styles.countText, { color: theme.accent }]}>{filtered.length}</Text>
                </View>
            </View>

            <View style={[styles.searchBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <Ionicons name="search" size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    placeholder="Search name, shop, specialization..."
                    placeholderTextColor={theme.textMuted}
                    value={search}
                    onChangeText={handleSearch}
                />
            </View>

            {loading ? <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} /> : (
                <FlatList
                    data={filtered}
                    renderItem={renderHandyman}
                    keyExtractor={item => item.handyman_id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchHandymen(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="construct-outline" size={52} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No handymen registered</Text>
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
    searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 14, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
    searchInput: { flex: 1, fontSize: 14 },
    list: { paddingHorizontal: 16, paddingBottom: 30 },
    card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
    avatar: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '700' },
    spec: { fontSize: 13, marginTop: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
    meta: { fontSize: 12 },
    dot: { marginHorizontal: 6, fontSize: 12 },
    activeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    activeText: { fontSize: 12, fontWeight: '700' },
    emptyBox: { alignItems: 'center', marginTop: 60, gap: 12 },
    emptyText: { fontSize: 15 },
});

export default AdminHandymenScreen;
