import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    ActivityIndicator, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const ROLE_COLOR = { buyer: '#4A90D9', seller: '#FF9800', admin: '#9C27B0' };

const AdminUsersScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [users, setUsers] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [selectedUser, setSelectedUser] = useState(null);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await adminAPI.getUsers();
            if (res.success) { setUsers(res.data); applyFilter(res.data, search, roleFilter); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchUsers(); }, [fetchUsers]));

    const applyFilter = (data, q, role) => {
        let r = data;
        if (role !== 'all') r = r.filter(u => u.role === role);
        if (q.trim()) r = r.filter(u =>
            u.full_name?.toLowerCase().includes(q.toLowerCase()) ||
            u.email?.toLowerCase().includes(q.toLowerCase())
        );
        setFiltered(r);
    };

    const handleSearch = (q) => { setSearch(q); applyFilter(users, q, roleFilter); };
    const handleRoleFilter = (r) => { setRoleFilter(r); applyFilter(users, search, r); };

    const renderUser = ({ item }) => {
        const color = ROLE_COLOR[item.role] || '#888';
        const isBlocked = !item.is_active;
        return (
            <TouchableOpacity
                style={[styles.userCard, { borderBottomColor: theme.border }]}
                onPress={() => navigation.navigate('AdminUserDetail', { user: item })}
                activeOpacity={0.75}
            >
                <View style={[styles.avatar, { backgroundColor: color + '22' }]}>
                    <Text style={[styles.avatarLetter, { color }]}>{item.full_name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <View style={styles.userInfo}>
                    <View style={styles.nameRow}>
                        <Text style={[styles.userName, { color: theme.text }]}>{item.full_name}</Text>
                        {isBlocked && (
                            <View style={styles.blockedBadge}>
                                <Ionicons name="ban" size={11} color="#e53935" style={{ marginRight: 3 }} />
                                <Text style={styles.blockedText}>Blocked</Text>
                            </View>
                        )}
                    </View>
                    <Text style={[styles.userEmail, { color: theme.textMuted }]}>{item.email}</Text>
                    <View style={styles.metaRow}>
                        <View style={[styles.roleBadge, { backgroundColor: color + '22' }]}>
                            <Text style={[styles.roleText, { color }]}>{item.role}</Text>
                        </View>
                        {item.shop_name && <Text style={[styles.shopLabel, { color: theme.textMuted }]}>🏪 {item.shop_name}</Text>}
                    </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Manage Users</Text>
                <View style={[styles.countBadge, { backgroundColor: theme.accent + '22' }]}>
                    <Text style={[styles.countText, { color: theme.accent }]}>{filtered.length}</Text>
                </View>
            </View>

            <View style={[styles.searchBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <Ionicons name="search" size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    placeholder="Search name or email..."
                    placeholderTextColor={theme.textMuted}
                    value={search}
                    onChangeText={handleSearch}
                />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => handleSearch('')}>
                        <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.filterRow}>
                {['all', 'buyer', 'seller'].map(r => (
                    <TouchableOpacity
                        key={r}
                        style={[styles.chip, { backgroundColor: theme.inputBg, borderColor: theme.border },
                        roleFilter === r && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                        onPress={() => handleRoleFilter(r)}
                    >
                        <Text style={[styles.chipText, { color: theme.textSecondary }, roleFilter === r && { color: '#fff' }]}>
                            {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={filtered}
                    renderItem={renderUser}
                    keyExtractor={item => item.user_id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchUsers(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.textMuted }]}>No users found</Text>}
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backBtn: { padding: 4, marginRight: 12 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
    countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    countText: { fontSize: 13, fontWeight: '700' },
    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: 16, marginTop: 14,
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 14 },
    filterRow: { flexDirection: 'row', padding: 14, gap: 8 },
    chip: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center', borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },
    list: { paddingHorizontal: 16, paddingBottom: 30 },
    userCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    avatarLetter: { fontSize: 18, fontWeight: '800' },
    userInfo: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    userName: { fontSize: 15, fontWeight: '700' },
    blockedBadge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#e5393520', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
    },
    blockedText: { fontSize: 10, color: '#e53935', fontWeight: '700' },
    userEmail: { fontSize: 12, marginTop: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 8 },
    roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
    roleText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    shopLabel: { fontSize: 11 },
    emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15 },
    // Bottom sheet modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30, overflow: 'hidden' },
    sheetUser: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 20, borderBottomWidth: 1,
    },
    sheetAvatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
    sheetAvatarLetter: { fontSize: 20, fontWeight: '800' },
    sheetName: { fontSize: 16, fontWeight: '700' },
    sheetEmail: { fontSize: 13, marginTop: 2 },
    sheetAction: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 18, borderBottomWidth: 1,
    },
    sheetActionIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    sheetActionLabel: { fontSize: 15, fontWeight: '700' },
    sheetActionSub: { fontSize: 12, marginTop: 2 },
    sheetCancel: { alignItems: 'center', paddingVertical: 16 },
    sheetCancelText: { fontSize: 15, fontWeight: '600' },
});

export default AdminUsersScreen;
