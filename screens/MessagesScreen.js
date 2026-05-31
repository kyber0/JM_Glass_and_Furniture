import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, Image,
    TouchableOpacity, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import { messagesAPI, BASE_URL } from '../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#6C63FF','#FF6B6B','#43C6AC','#F7971E','#2196F3','#E91E63','#00BCD4','#8BC34A'];
const avatarColor   = (str = '') => AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length];
const initials      = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const formatTime = (ts) => {
    if (!ts) return '';
    const d   = new Date(ts);
    const now  = new Date();
    const diff = now - d;
    if (diff < 60000)       return 'now';
    if (diff < 3600000)     return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000)    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000)   return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// ── Component ─────────────────────────────────────────────────────────────────
const MessagesScreen = ({ navigation, route }) => {
    const { user }  = useAuth();
    const { theme } = useTheme();
    const mode = route?.params?.mode || 'personal';   // 'personal' | 'shop'

    const [conversations, setConversations] = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search,    setSearch]    = useState('');

    const loadConversations = async () => {
        if (!user) return;
        // Tell the backend which identity to return for each conversation partner:
        // 'shop'     → we are a seller; return customer full names (never shop names)
        // 'customer' → we are a customer; return shop names / logos
        const perspective = mode === 'shop' ? 'shop' : 'customer';
        try {
            const res = await messagesAPI.getConversations(user.id, perspective);
            if (res.success) setConversations(res.conversations || []);
        } catch (e) {
            console.error('load conversations', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { loadConversations(); }, [user]));

    const { socket } = useSocket();
    React.useEffect(() => {
        if (!socket) return;
        socket.on('conversations:update', loadConversations);
        return () => socket.off('conversations:update', loadConversations);
    }, [socket]);

    const onRefresh = () => { setRefreshing(true); loadConversations(); };

    // In shop mode (seller's customer inbox) → always show the customer's real full name.
    // In personal mode (customer's inbox)    → prefer the shop name so the customer recognises
    //                                          who they chatted with (e.g. "JM Glass & Furniture").
    const getName = (c) =>
        mode === 'shop'
            ? c.full_name || 'Customer'
            : c.shop_name || c.full_name || 'User';

    const getAvatar = (c) => {
        // Shop mode: show the customer's personal profile photo.
        // Personal mode: prefer the shop logo so customers see the store branding.
        const raw = mode === 'shop'
            ? c.profile_image || null
            : c.shop_logo || c.logo_url || c.profile_image || null;
        if (!raw) return null;
        return raw.startsWith('http') ? raw : `${BASE_URL}/${raw}`;
    };

    // No longer filter by shop_name presence — the backend now returns only
    // the correct conversation set for the given perspective.
    const filtered = conversations
        .filter(c => !search || getName(c).toLowerCase().includes(search.toLowerCase()));

    // ── Render conversation item ──────────────────────────────────────────────
    const renderItem = ({ item }) => {
        const name    = getName(item);
        const avatar  = getAvatar(item);
        const unread  = parseInt(item.unread_count) || 0;
        const ac      = avatarColor(name);

        return (
            <TouchableOpacity
                style={[styles.item, { backgroundColor: theme.card }]}
                onPress={() => navigation.navigate('Chat', {
                    conversation: item,
                    otherUserId: item.other_user_id,
                    mode,
                    shopId: item.shop_id ?? null,   // channel anchor — keeps personal/shop threads separate
                })}
                activeOpacity={0.8}
            >
                {/* Avatar */}
                <View style={styles.avatarWrap}>
                    {avatar ? (
                        <Image source={{ uri: avatar }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatarFallback, { backgroundColor: ac }]}>
                            <Text style={styles.avatarInitials}>{initials(name)}</Text>
                        </View>
                    )}
                    {unread > 0 && <View style={[styles.onlineDot, { borderColor: theme.card }]} />}
                </View>

                {/* Content */}
                <View style={styles.itemBody}>
                    <View style={styles.itemTop}>
                        <Text style={[styles.itemName, { color: theme.text }, unread > 0 && styles.itemNameUnread]} numberOfLines={1}>
                            {name}
                        </Text>
                        <Text style={[styles.itemTime, { color: unread > 0 ? theme.accent : theme.textMuted }]}>
                            {formatTime(item.last_message_time)}
                        </Text>
                    </View>
                    <View style={styles.itemBottom}>
                        <Text
                            style={[styles.itemPreview, { color: unread > 0 ? theme.text : theme.textMuted }, unread > 0 && styles.itemPreviewUnread]}
                            numberOfLines={1}
                        >
                            {item.last_message || 'No messages yet'}
                        </Text>
                        {unread > 0 && (
                            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>
                        {mode === 'shop' ? 'Customer Messages' : 'Messages'}
                    </Text>
                    {filtered.length > 0 && (
                        <Text style={[styles.headerSub, { color: theme.accent }]}>
                            {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
                        </Text>
                    )}
                </View>
                <View style={{ width: 36 }} />
            </View>

            {/* Seller → My Shop banner */}
            {user?.role === 'seller' && mode !== 'shop' && (
                <TouchableOpacity
                    style={[styles.shopBanner, { backgroundColor: theme.accentBg || '#efebe9', borderColor: theme.accent }]}
                    onPress={() => navigation.navigate('MyShop')}
                    activeOpacity={0.8}
                >
                    <Ionicons name="storefront-outline" size={18} color={theme.accent} />
                    <Text style={[styles.shopBannerText, { color: theme.accent }]}>View customer messages in My Shop</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.accent} />
                </TouchableOpacity>
            )}

            {/* Search */}
            <View style={[styles.searchWrap, { backgroundColor: theme.inputBg }]}>
                <Ionicons name="search-outline" size={18} color={theme.textMuted} />
                <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    placeholder="Search conversations…"
                    placeholderTextColor={theme.textMuted}
                    value={search}
                    onChangeText={setSearch}
                />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                        <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {/* List */}
            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
            ) : (
                <FlatList
                    data={filtered}
                    renderItem={renderItem}
                    keyExtractor={item => item.other_user_id.toString()}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
                    ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <View style={[styles.emptyIcon, { backgroundColor: theme.inputBg }]}>
                                <Ionicons name="chatbubbles-outline" size={52} color={theme.textMuted} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>No conversations yet</Text>
                            <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                                {mode === 'shop'
                                    ? 'When customers message you about a product, they\'ll show up here.'
                                    : 'Browse products and tap the Chat button to start a conversation with a seller.'
                                }
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1 },

    /* Header */
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
    },
    headerBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    headerSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },

    /* Seller banner */
    shopBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 16, marginTop: 12,
        paddingHorizontal: 14, paddingVertical: 10,
        borderRadius: 12, borderWidth: 1,
    },
    shopBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },

    /* Search */
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 16, marginTop: 14, marginBottom: 6,
        paddingHorizontal: 14, paddingVertical: 10,
        borderRadius: 14,
    },
    searchInput: { flex: 1, fontSize: 14 },

    /* List */
    list: { paddingBottom: 40, paddingTop: 6 },
    separator: { height: 1, marginLeft: 84 },

    /* Item */
    item: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14, gap: 14,
    },
    avatarWrap: { position: 'relative' },
    avatar: { width: 54, height: 54, borderRadius: 27 },
    avatarFallback: {
        width: 54, height: 54, borderRadius: 27,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarInitials: { color: '#fff', fontSize: 20, fontWeight: '800' },
    onlineDot: {
        position: 'absolute', bottom: 1, right: 1,
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: '#2e7d32', borderWidth: 2,
    },

    itemBody: { flex: 1 },
    itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    itemName: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
    itemNameUnread: { fontWeight: '800' },
    itemTime: { fontSize: 12 },
    itemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    itemPreview: { flex: 1, fontSize: 13, marginRight: 8 },
    itemPreviewUnread: { fontWeight: '600' },
    badge: {
        borderRadius: 10, minWidth: 20, height: 20,
        justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
    },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

    /* Empty */
    empty: { alignItems: 'center', marginTop: 70, paddingHorizontal: 40 },
    emptyIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
    emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

export default MessagesScreen;
