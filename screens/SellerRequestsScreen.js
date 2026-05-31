import React, { useState, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    Image,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { customRequestsAPI, shopAPI, BASE_URL } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';

const STATUS_COLORS = {
    pending:     '#FF9800',
    negotiating: '#4A90D9',
    accepted:    '#4CAF50',
    in_progress: '#795548',
    ready:       '#00BCD4',
    rejected:    '#F44336',
    completed:   '#8D6E63',
};

const SellerRequestsScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info',
        showCancel: false,
        onConfirm: null,
        confirmText: 'OK',
        cancelText: 'Cancel'
    });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null, confirmText = 'OK', cancelText = 'Cancel') => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm, confirmText, cancelText });
    };

    const hideAlert = () => {
        setAlertConfig({ ...alertConfig, visible: false });
    };

    const loadRequests = async () => {
        if (!user) return;
        try {
            // First get the seller's shop
            const shopRes = await shopAPI.getMyShop(user.id);
            if (shopRes.success && shopRes.shop) {
                const response = await customRequestsAPI.getShopRequests(shopRes.shop.shop_id);
                if (response.success) {
                    setRequests(response.requests);
                }
            }
        } catch (error) {
            console.error('Failed to load requests', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadRequests();
        }, [user])
    );

    const { socket } = useSocket();
    React.useEffect(() => {
        if (!socket) return;
        socket.on('request:update', loadRequests);
        return () => socket.off('request:update', loadRequests);
    }, [socket]);

    const onRefresh = () => {
        setRefreshing(true);
        loadRequests();
    };

    const handleStatusUpdate = (requestId, newStatus) => {
        showAlert(
            `${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)} Request`,
            `Are you sure you want to ${newStatus} this request?`,
            'info',
            true,
            async () => {
                try {
                    const response = await customRequestsAPI.updateStatus(requestId, newStatus);
                    if (response.success) {
                        loadRequests();
                    }
                } catch (error) {
                    setTimeout(() => showAlert('Error', 'Failed to update status.', 'error'), 500);
                }
            },
            'Yes',
            'Cancel'
        );
    };

    const renderRequest = ({ item }) => {
        let images = [];
        try {
            images = typeof item.images === 'string' ? JSON.parse(item.images) : (item.images || []);
        } catch (e) { images = []; }

        return (
            <TouchableOpacity
                style={[styles.requestCard, { backgroundColor: theme.card }]}
                onPress={() => navigation.navigate('RequestDetail', { request: item, userType: 'seller' })}
                activeOpacity={0.9}
            >
                {/* Header */}
                <View style={styles.cardHeader}>
                    <View style={styles.customerInfo}>
                        {item.user_profile_image ? (
                            <Image
                                source={{ uri: item.user_profile_image.startsWith('http') ? item.user_profile_image : `${BASE_URL}/${item.user_profile_image}` }}
                                style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }}
                            />
                        ) : (
                            <View style={styles.avatarCircle}>
                                <Ionicons name="person" size={18} color="#fff" />
                            </View>
                        )}
                        <View>
                            <Text style={[styles.customerName, { color: theme.text }]}>{item.user_name || 'Customer'}</Text>
                            <Text style={[styles.dateText, { color: theme.textMuted }]}>
                                {new Date(item.created_at).toLocaleDateString()}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#999' }]}>
                        <Text style={styles.statusText}>{item.status?.toUpperCase()}</Text>
                    </View>
                </View>

                {/* Reference Product */}
                {item.product_title && (
                    <View style={[styles.refProduct, { backgroundColor: theme.accentBg }]}>
                        <Ionicons name="cube-outline" size={16} color={theme.accent} />
                        <Text style={[styles.refProductText, { color: theme.accent }]}>Based on: {item.product_title}</Text>
                    </View>
                )}

                {/* Description — capped to 2 lines, full text in RequestDetail */}
                <Text style={[styles.detailsText, { color: theme.textSecondary }]} numberOfLines={2}>{item.details}</Text>

                {/* Budget */}
                {item.budget && (
                    <View style={styles.budgetRow}>
                        <Ionicons name="cash-outline" size={16} color="#4CAF50" />
                        <Text style={styles.budgetText}>Budget: ₱{parseFloat(item.budget).toLocaleString()}</Text>
                    </View>
                )}

                {/* Images */}
                {images.length > 0 && (
                    <View style={styles.imagesRow}>
                        {images.map((imgPath, i) => {
                            const uri = imgPath.startsWith('http') ? imgPath : `${BASE_URL}/${imgPath}`;
                            return <Image key={i} source={{ uri }} style={[styles.designImage, { backgroundColor: theme.inputBg }]} />;
                        })}
                    </View>
                )}

                {/* Compact footer row: quoted price or budget + status hint */}
                <View style={styles.cardFooter}>
                    <Text style={[styles.footerHint, { color: theme.textMuted }]}>
                        {item.quoted_price
                            ? `Quoted: ₱${parseFloat(item.quoted_price).toLocaleString('en-PH')}`
                            : item.budget
                            ? `Budget: ₱${parseFloat(item.budget).toLocaleString('en-PH')}`
                            : 'No budget specified'}
                    </Text>
                    {(item.status === 'pending' || item.status === 'negotiating') && (
                        <View style={[styles.respondChip, { backgroundColor: STATUS_COLORS[item.status] + '22' }]}>
                            <Text style={[styles.respondChipText, { color: STATUS_COLORS[item.status] }]}>
                                {item.status === 'negotiating' ? '💬 Revise quote' : 'Tap to respond'}
                            </Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Custom Requests</Text>
                <View style={{ width: 32 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : (
                <FlatList
                    data={requests}
                    renderItem={renderRequest}
                    keyExtractor={item => item.request_id.toString()}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="color-palette-outline" size={50} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No custom requests yet</Text>
                        </View>
                    }
                />
            )}

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                onConfirm={() => {
                    hideAlert();
                    if (alertConfig.onConfirm) alertConfig.onConfirm();
                }}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText: { marginTop: 12, fontSize: 15 },
    listContent: { padding: 15, paddingBottom: 30 },

    requestCard: {
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    customerInfo: { flexDirection: 'row', alignItems: 'center' },
    avatarCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#8D6E63',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    customerName: { fontSize: 14, fontWeight: '600' },
    dateText: { fontSize: 11, marginTop: 1 },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: { fontSize: 10, fontWeight: '700', color: '#fff' },

    refProduct: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 8,
        marginBottom: 10,
    },
    refProductText: { fontSize: 12, marginLeft: 6, fontWeight: '500' },

    detailsText: { fontSize: 13, lineHeight: 19, marginBottom: 8 },

    budgetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    budgetText: { fontSize: 13, color: '#4CAF50', fontWeight: '600', marginLeft: 6 },

    imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    designImage: { width: 60, height: 60, borderRadius: 8 },

    // Compact card footer
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    footerHint: { fontSize: 12, fontWeight: '600' },
    respondChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    respondChipText: { fontSize: 11, fontWeight: '700' },
});

export default SellerRequestsScreen;
