import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList,
    TouchableOpacity, ActivityIndicator, Image, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { useSocket } from '../context/SocketContext';
import { customRequestsAPI, BASE_URL } from '../services/api';

const STATUS_CONFIG = {
    pending:     { color: '#FF9800', icon: 'time-outline',         label: 'Pending' },
    negotiating: { color: '#4A90D9', icon: 'chatbubbles-outline',  label: 'Negotiating' },
    accepted:    { color: '#4CAF50', icon: 'checkmark-circle-outline', label: 'Accepted' },
    in_progress: { color: '#795548', icon: 'hammer-outline',       label: 'In Progress' },
    ready:       { color: '#00BCD4', icon: 'cube-outline',         label: 'Ready' },
    rejected:    { color: '#F44336', icon: 'close-circle-outline', label: 'Rejected' },
    completed:   { color: '#9C27B0', icon: 'ribbon-outline',       label: 'Completed' },
};

const MyRequestsScreen = ({ navigation }) => {
    const { user }    = useAuth();
    const { theme }   = useTheme();
    const [requests, setRequests]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchRequests = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await customRequestsAPI.getUserRequests(user.id);
            if (res.success) setRequests(res.requests || []);
        } catch (error) {
            console.error('MyRequestsScreen fetch error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => {
        setLoading(true);
        fetchRequests();
    }, [fetchRequests]));

    const { socket } = useSocket();
    React.useEffect(() => {
        if (!socket) return;
        socket.on('request:update', fetchRequests);
        return () => socket.off('request:update', fetchRequests);
    }, [socket, fetchRequests]);

    const onRefresh = () => { setRefreshing(true); fetchRequests(); };

    const handlePress = (item) => {
        navigation.navigate('RequestDetail', {
            request:  item,
            userType: 'buyer',
        });
    };

    const renderItem = ({ item }) => {
        const cfg    = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
        const images = (() => {
            try { return typeof item.images === 'string' ? JSON.parse(item.images) : (item.images || []); }
            catch { return []; }
        })();
        const thumb = images[0]
            ? (images[0].startsWith('http') ? images[0] : `${BASE_URL}/${images[0]}`)
            : null;

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card }]}
                onPress={() => handlePress(item)}
                activeOpacity={0.82}
            >
                {/* Left: thumbnail or icon */}
                <View style={[styles.thumbBox, { backgroundColor: theme.accentBg }]}>
                    {thumb
                        ? <Image source={{ uri: thumb }} style={styles.thumb} />
                        : <Ionicons name="color-wand-outline" size={28} color={theme.accent} />
                    }
                </View>

                {/* Middle: details */}
                <View style={styles.info}>
                    <Text style={[styles.reqId, { color: theme.textMuted }]}>
                        REQ-{item.request_id}
                    </Text>
                    <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={1}>
                        {item.shop_name || 'Custom Request'}
                    </Text>
                    <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
                        {item.details || item.description || '—'}
                    </Text>
                    {item.quoted_price ? (
                        <Text style={[styles.price, { color: theme.accent }]}>
                            Quoted: ₱{parseFloat(item.quoted_price).toLocaleString('en-PH')}
                        </Text>
                    ) : item.budget ? (
                        <Text style={[styles.price, { color: theme.textMuted }]}>
                            Budget: ₱{parseFloat(item.budget).toLocaleString('en-PH')}
                        </Text>
                    ) : null}
                </View>

                {/* Right: status badge + chevron */}
                <View style={styles.rightCol}>
                    <View style={[styles.badge, { backgroundColor: cfg.color + '22' }]}>
                        <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                        <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    <Text style={[styles.date, { color: theme.textMuted }]}>
                        {new Date(item.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginTop: 4 }} />
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.headerBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>My Custom Requests</Text>
                <View style={{ width: 24 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : requests.length === 0 ? (
                <View style={styles.center}>
                    <View style={[styles.emptyIcon, { backgroundColor: theme.accentBg }]}>
                        <Ionicons name="color-wand-outline" size={52} color={theme.accent} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>No requests yet</Text>
                    <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                        Visit a shop and submit a custom order request.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={requests}
                    renderItem={renderItem}
                    keyExtractor={item => item.request_id.toString()}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />
                    }
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container:   { flex: 1 },
    headerBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1,
    },
    backButton:  { padding: 2 },
    headerTitle: { fontSize: 18, fontWeight: '700' },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    emptyIcon: {
        width: 100, height: 100, borderRadius: 50,
        justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    emptyTitle:    { fontSize: 18, fontWeight: '700', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

    list: { padding: 16, paddingBottom: 80 },

    card: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 14, padding: 12, marginBottom: 12,
        elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    thumbBox: {
        width: 56, height: 56, borderRadius: 10,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 12, overflow: 'hidden',
    },
    thumb: { width: 56, height: 56, borderRadius: 10 },

    info:        { flex: 1, marginRight: 8 },
    reqId:       { fontSize: 11, fontWeight: '500', marginBottom: 2 },
    shopName:    { fontSize: 14, fontWeight: '700', marginBottom: 3 },
    description: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
    price:       { fontSize: 13, fontWeight: '600' },

    rightCol:    { alignItems: 'flex-end', justifyContent: 'center', minWidth: 80 },
    badge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 20, marginBottom: 6,
    },
    badgeText:   { fontSize: 10, fontWeight: '700' },
    date:        { fontSize: 11 },
});

export default MyRequestsScreen;
