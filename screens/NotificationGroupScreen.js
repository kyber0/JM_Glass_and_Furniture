import React, { useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { notificationsAPI, customRequestsAPI } from '../services/api';

const TYPE_CONFIG = {
    order:          { icon: 'checkmark-circle',    iconColor: '#4CAF50' },
    shop_order:     { icon: 'storefront',          iconColor: '#FF9800' },
    promo:          { icon: 'pricetag',            iconColor: '#E91E63' },
    message:        { icon: 'chatbubble-ellipses', iconColor: '#00BCD4' },
    delivery:       { icon: 'car',                 iconColor: '#2196F3' },
    system:         { icon: 'sparkles',            iconColor: '#8D6E63' },
    custom_request: { icon: 'color-wand',          iconColor: '#8D6E63' },
};

const NotificationGroupScreen = ({ route, navigation }) => {
    const { groupItems, groupTitle, icon, iconColor } = route.params;
    const { theme }        = useTheme();
    const { user }         = useAuth();
    const { refreshCount } = useNotifications();

    // Navigate based on type, mark individual item as read
    const handlePress = useCallback(async (item) => {
        try {
            await notificationsAPI.markAsRead(item.id);
            refreshCount();
        } catch (_) {}

        const stackNav =
            navigation.getParent()?.getParent?.() ||
            navigation.getParent() ||
            navigation;

        switch (item.type) {
            case 'custom_request': {
                if (user?.role === 'seller') {
                    // Seller: deep-link to the specific request
                    const refId = item.reference_id;
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
                    // Buyer: always go to My Orders — custom request updates
                    // are tracked there, not on the seller's RequestDetail screen.
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
                } else if (item.reference_id) {
                    stackNav.navigate(user?.role === 'seller' ? 'SellerRequests' : 'MyRequests');
                } else if (user?.role === 'seller') {
                    stackNav.navigate('MyShop');
                }
                break;
            case 'promo':
                stackNav.navigate('Menu');
                break;
            default:
                if (user?.role === 'handyman') {
                    stackNav.navigate('HandymanDashboard');
                } else if (user?.role === 'delivery_man') {
                    stackNav.navigate('DeliveryManDashboard');
                } else {
                    navigation.goBack();
                }
                break;
        }
    }, [navigation, user, refreshCount]);

    const renderItem = useCallback(({ item }) => {
        const cfg      = TYPE_CONFIG[item.type] || TYPE_CONFIG.system;
        const ic       = item.icon      || cfg.icon;
        const icColor  = item.iconColor || cfg.iconColor;
        const isUnread = !item.read;

        return (
            <TouchableOpacity
                style={[
                    styles.notifCard,
                    { backgroundColor: theme.card },
                    isUnread && { backgroundColor: theme.accentBg },
                ]}
                onPress={() => handlePress(item)}
                activeOpacity={0.7}
            >
                {/* Icon circle — identical to NotificationsScreen */}
                <View style={[styles.iconCircle, { backgroundColor: icColor + '22' }]}>
                    <Ionicons name={ic} size={22} color={icColor} />
                </View>

                {/* Content */}
                <View style={styles.notifContent}>
                    <View style={styles.notifTopRow}>
                        <Text
                            style={[
                                styles.notifTitle,
                                { color: theme.textSecondary },
                                isUnread && { color: theme.text, fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                        >
                            {item.title}
                        </Text>
                        {isUnread && (
                            <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />
                        )}
                    </View>

                    <Text
                        style={[styles.notifMessage, { color: theme.textSecondary }]}
                        numberOfLines={2}
                    >
                        {item.message}
                    </Text>

                    <Text style={[styles.notifTime, { color: theme.textMuted }]}>
                        {item.time}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    }, [handlePress, theme]);

    const unreadCount = groupItems.filter(n => !n.read).length;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={[styles.headerRow, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                        {groupTitle}
                    </Text>
                    {unreadCount > 0 && (
                        <Text style={[styles.headerSub, { color: theme.accent }]}>
                            {unreadCount} unread
                        </Text>
                    )}
                </View>

                {/* Count pill */}
                <View style={[styles.countPill, { backgroundColor: iconColor + '22' }]}>
                    <Ionicons name={icon} size={14} color={iconColor} style={{ marginRight: 4 }} />
                    <Text style={[styles.countPillText, { color: iconColor }]}>
                        {groupItems.length}
                    </Text>
                </View>
            </View>

            <FlatList
                data={groupItems}
                renderItem={renderItem}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => (
                    <View style={[styles.separator, { backgroundColor: theme.border }]} />
                )}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },

    /* ── Header ── */
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        gap: 12,
    },
    backBtn: { padding: 2 },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    headerSub: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 1,
    },
    countPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
    },
    countPillText: {
        fontSize: 13,
        fontWeight: '700',
    },

    /* ── List (mirrors NotificationsScreen exactly) ── */
    listContent: { paddingBottom: 80, paddingTop: 8 },
    separator:   { height: 1, marginLeft: 76 },

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
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginLeft: 8,
    },
    notifMessage: {
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 4,
    },
    notifTime: {
        fontSize: 12,
        fontWeight: '500',
    },
});

export default NotificationGroupScreen;
