import React, { useState, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { notificationsAPI, customRequestsAPI } from '../services/api';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';

// ── Per-type icon config (type is already role-specific for most cases) ──────
// order      → only ever sent to buyers    (purchase updates)
// shop_order → only ever sent to sellers   (new order received)
// custom_request → sent to both sides; role is the only tiebreaker
const TYPE_CONFIG = {
    order:          { icon: 'bag-handle',           iconColor: '#00897B' }, // teal  — buyer purchase
    shop_order:     { icon: 'storefront',            iconColor: '#FF9800' }, // orange — seller received order
    promo:          { icon: 'pricetag',              iconColor: '#E91E63' },
    message:        { icon: 'chatbubble-ellipses',   iconColor: '#00BCD4' },
    delivery:       { icon: 'bicycle-outline',       iconColor: '#2196F3' }, // rider coming to buyer
    system:         { icon: 'sparkles',              iconColor: '#8D6E63' },
};

// custom_request is the ONLY type sent to both buyer and seller
const getTypeConfig = (type, role) => {
    if (type === 'custom_request') {
        return role === 'seller'
            ? { icon: 'color-wand',            iconColor: '#8D6E63' } // seller: bespoke work
            : { icon: 'document-text-outline', iconColor: '#F57C00' }; // buyer: my submitted request
    }
    return TYPE_CONFIG[type] || { icon: 'sparkles', iconColor: '#8D6E63' };
};

// ─── Group redundant notifications ───────────────────────────────────────────
// Notifications are grouped by (type + title). Multiple "New Message" cards
// collapse into one compound card showing a count badge.
// Each group keeps track of all member IDs so mark-as-read works correctly.
const groupNotifications = (notifs) => {
    const orderMap = [];
    const keyMap   = {};

    notifs.forEach((n) => {
        // Force ALL custom_request notifications into one group regardless of title
        const key = n.type === 'custom_request'
            ? 'custom_request__Custom Requests'
            : `${n.type}__${n.title}`;

        if (!keyMap[key]) {
            const group = {
                ...n,
                // Override title for the grouped card
                title:       n.type === 'custom_request' ? 'Custom Requests' : n.title,
                _groupKey:   key,
                _count:      1,
                _unread:     n.read ? 0 : 1,
                _ids:        [n.id],
                _groupItems: [n],
                _latestTime: n.time,
            };
            keyMap[key] = group;
            orderMap.push(key);
        } else {
            const g = keyMap[key];
            g._count++;
            g._ids.push(n.id);
            g._groupItems.push(n);
            if (!n.read) g._unread++;
        }
    });

    return orderMap.map((k) => keyMap[k]);
};


// Pluralise helper
const typeLabel = {
    message:        (n) => `${n} new message${n > 1 ? 's' : ''}`,
    order:          (n) => `${n} order update${n > 1 ? 's' : ''}`,
    shop_order:     (n) => `${n} new order${n > 1 ? 's' : ''}`,
    delivery:       (n) => `${n} delivery update${n > 1 ? 's' : ''}`,
    promo:          (n) => `${n} new promo${n > 1 ? 's' : ''}`,
    system:         (n) => `${n} system notification${n > 1 ? 's' : ''}`,
    custom_request: (n) => `${n} custom request update${n > 1 ? 's' : ''}`,
};

// ─────────────────────────────────────────────────────────────────────────────

const NotificationsScreen = ({ navigation }) => {
    const { user }               = useAuth();
    const { refreshCount }       = useNotifications();
    const { theme }              = useTheme();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading]             = useState(true);
    const [refreshing, setRefreshing]       = useState(false);

    // ── Fetch & enrich ────────────────────────────────────────────────────────
    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        try {
            const response = await notificationsAPI.getUserNotifications(user.id);
            if (response.success) {
                const enriched = response.notifications.map((n) => {
                    const cfg = getTypeConfig(n.type, user?.role);
                    return {
                        ...n,
                        icon:      n.icon      || cfg.icon,
                        iconColor: n.iconColor || cfg.iconColor,
                    };
                });
                setNotifications(enriched);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    // ── Auto-refresh while screen focused ─────────────────────────────────────
    useFocusEffect(
        useCallback(() => {
            // Show full spinner only on first load (no data yet)
            if (notifications.length === 0) setLoading(true);
            fetchNotifications();
        }, [fetchNotifications])
    );

    // ── Real-time Socket Updates ─────────────────────────────────────────────
    const { socket } = useSocket();
    React.useEffect(() => {
        if (!socket) return;
        socket.on('notification:new', fetchNotifications);
        return () => socket.off('notification:new', fetchNotifications);
    }, [socket, fetchNotifications]);

    const onRefresh = () => { setRefreshing(true); fetchNotifications(); };

    // ── Mark helpers ─────────────────────────────────────────────────────────
    // Mark every id in the group as read (optimistic + API)
    const markGroupRead = useCallback(async (ids) => {
        setNotifications((prev) =>
            prev.map((n) => (ids.includes(n.id) ? { ...n, read: 1 } : n))
        );
        try {
            await Promise.all(ids.map((id) => notificationsAPI.markAsRead(id)));
            refreshCount();
        } catch (err) {
            console.error('Failed to mark group as read:', err);
        }
    }, [refreshCount]);

    const markAllRead = useCallback(async () => {
        if (!user) return;
        setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
        try {
            await notificationsAPI.markAllAsRead(user.id);
            refreshCount();
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    }, [user, refreshCount]);

    // ── Navigation ────────────────────────────────────────────────────────────
    const handlePress = useCallback(async (item) => {
        // ── Grouped card → open detail list screen ──────────────────────────
        if (item._count > 1) {
            const stackNav = navigation.getParent() || navigation;
            stackNav.navigate('NotificationGroup', {
                groupTitle: item.type === 'custom_request' ? 'Custom Requests' : item.title,
                groupItems: item._groupItems,
                icon:       item.icon,
                iconColor:  item.iconColor,
            });
            return;
        }

        // ── Single notification → mark read + navigate ───────────────────────
        markGroupRead(item._ids);
        const stackNav = navigation.getParent() || navigation;
        const refId    = item.reference_id;

        switch (item.type) {
            case 'custom_request': {
                if (user?.role === 'seller') {
                    // Seller: deep-link to the specific request detail
                    if (refId) {
                        try {
                            const res = await customRequestsAPI.getRequest(refId);
                            if (res.success && res.request) {
                                stackNav.navigate('RequestDetail', {
                                    request:  res.request,
                                    userType: 'seller',
                                });
                                return;
                            }
                        } catch (_) {}
                    }
                    // Seller fallback
                    stackNav.navigate('SellerRequests');
                } else {
                    // Buyer: "Your custom order..." notifications always go to My Orders.
                    // Custom requests placed by buyers are tracked under their orders,
                    // NOT the seller's RequestDetail screen.
                    stackNav.navigate('MyOrders');
                }
                break;
            }
            case 'order':
            case 'delivery':
                if (user?.role === 'handyman') {
                    stackNav.navigate('HandymanDashboard');
                } else if (user?.role === 'delivery_man') {
                    stackNav.navigate('DeliveryManDashboard');
                } else if (/points|loyalty/i.test(item.title || '') || /points|loyalty/i.test(item.message || '')) {
                    stackNav.navigate('MyPoints');
                } else {
                    stackNav.navigate('MyOrders');
                }
                break;
            case 'shop_order':
                stackNav.navigate('SellerOrders');
                break;
            case 'message':
                stackNav.navigate('Messages');
                break;
            case 'system':
                if (user?.role === 'handyman') {
                    stackNav.navigate('HandymanDashboard');
                } else if (user?.role === 'delivery_man') {
                    stackNav.navigate('DeliveryManDashboard');
                } else if (user?.role === 'seller') {
                    stackNav.navigate('MyShop');
                }
                break;
            case 'promo':
                navigation.navigate('Menu');
                break;
            default:
                // Workers: fallback to their dashboard
                if (user?.role === 'handyman') {
                    stackNav.navigate('HandymanDashboard');
                } else if (user?.role === 'delivery_man') {
                    stackNav.navigate('DeliveryManDashboard');
                }
                break;
        }
    }, [markGroupRead, navigation, user]);


    // ── Derived display data ──────────────────────────────────────────────────
    const grouped     = groupNotifications(notifications);
    const unreadCount = notifications.filter((n) => !n.read).length;

    // ── Render a single grouped card ──────────────────────────────────────────
    const renderItem = useCallback(({ item }) => {
        const isGroup  = item._count > 1;
        const hasUnread = item._unread > 0;

        // For grouped items, override the display message
        const displayMessage = isGroup
            ? (typeLabel[item.type]?.(item._count) ?? `${item._count} notifications`)
            : item.message;

        return (
            <TouchableOpacity
                style={[
                    styles.notifCard,
                    { backgroundColor: theme.card },
                    hasUnread && { backgroundColor: theme.accentBg },
                ]}
                onPress={() => handlePress(item)}
                activeOpacity={0.75}
            >
                {/* Icon */}
                <View style={[styles.iconCircle, { backgroundColor: item.iconColor + '22' }]}>
                    <Ionicons name={item.icon} size={22} color={item.iconColor} />
                </View>

                {/* Content */}
                <View style={styles.notifContent}>
                    <View style={styles.notifTopRow}>
                        <Text
                            style={[
                                styles.notifTitle,
                                { color: theme.textSecondary },
                                hasUnread && { color: theme.text, fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                        >
                            {item.title}
                        </Text>

                        <View style={styles.badgeRow}>
                            {/* Group count badge */}
                            {isGroup && (
                                <View style={[styles.countBadge, { backgroundColor: item.iconColor }]}>
                                    <Text style={styles.countBadgeText}>{item._count}</Text>
                                </View>
                            )}
                            {/* Unread dot */}
                            {hasUnread && !isGroup && (
                                <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />
                            )}
                        </View>
                    </View>

                    <Text
                        style={[styles.notifMessage, { color: theme.textSecondary }]}
                        numberOfLines={2}
                    >
                        {displayMessage}
                    </Text>

                    <View style={styles.notifBottomRow}>
                        <Text style={[styles.notifTime, { color: theme.textMuted }]}>
                            {item._latestTime || item.time}
                        </Text>
                        {/* Unread count for groups */}
                        {isGroup && item._unread > 0 && (
                            <Text style={[styles.unreadLabel, { color: theme.accent }]}>
                                {item._unread} unread
                            </Text>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    }, [handlePress, theme]);

    // ── States ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <Text style={[styles.header, { color: theme.text }]}>Notifications</Text>
                <View style={styles.emptyContainer}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            </SafeAreaView>
        );
    }

    if (!loading && notifications.length === 0) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <Text style={[styles.header, { color: theme.text }]}>Notifications</Text>
                <View style={styles.emptyContainer}>
                    <View style={[styles.emptyIconCircle, { backgroundColor: theme.accentBg }]}>
                        <Ionicons name="notifications-off-outline" size={64} color={theme.accent} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>No notifications</Text>
                    <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                        You're all caught up! We'll notify you when something new arrives.
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.headerRow}>
                <Text style={[styles.header, { color: theme.text }]}>Notifications</Text>
                {unreadCount > 0 && (
                    <TouchableOpacity
                        onPress={markAllRead}
                        style={[styles.markAllButton, { backgroundColor: theme.accentBg }]}
                    >
                        <Text style={[styles.markAllText, { color: theme.accent }]}>Mark all read</Text>
                    </TouchableOpacity>
                )}
            </View>
            {unreadCount > 0 && (
                <Text style={[styles.countText, { color: theme.accent }]}>{unreadCount} unread</Text>
            )}

            <FlatList
                data={grouped}
                renderItem={renderItem}
                keyExtractor={(item) => item._groupKey}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => (
                    <View style={[styles.separator, { backgroundColor: theme.border }]} />
                )}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} />
                }
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 15,
    },
    header: {
        fontSize: 26,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    markAllButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
    },
    markAllText: { fontSize: 13, fontWeight: '600' },
    countText: {
        fontSize: 14,
        paddingHorizontal: 20,
        marginTop: 4,
        marginBottom: 6,
        fontWeight: '500',
    },

    /* ── Empty / Loading ── */
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 80,
    },
    emptyIconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyTitle:    { fontSize: 20, fontWeight: '700', marginBottom: 8 },
    emptySubtitle: {
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 60,
        lineHeight: 20,
    },

    /* ── List ── */
    listContent:  { paddingBottom: 80, paddingTop: 8 },
    separator:    { height: 1, marginLeft: 76 },
    notifCard: {
        flexDirection: 'row',
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: 'flex-start',
    },
    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        marginTop: 2,
    },
    notifContent: { flex: 1 },
    notifTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 3,
    },
    notifTitle: {
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
    },

    /* Badge row (count + unread dot sit side-by-side) */
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginLeft: 6,
    },
    countBadge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    countBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },

    /* Bottom row: time + unread label */
    notifBottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 2,
    },
    notifMessage: {
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 2,
    },
    notifTime: {
        fontSize: 12,
        fontWeight: '500',
    },
    unreadLabel: {
        fontSize: 11,
        fontWeight: '600',
    },
});

export default NotificationsScreen;
