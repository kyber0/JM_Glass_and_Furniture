import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, ActivityIndicator,
    RefreshControl, TouchableOpacity, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import CustomAlert from '../../components/CustomAlert';

const AdminDisputesScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });

    const fetchDisputes = useCallback(async () => {
        try {
            const res = await adminAPI.getDisputes();
            if (res.success) setDisputes(res.data || []);
        } catch (e) {
            console.error(e);
            showAlert('Failed to load disputes.', 'Error', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchDisputes(); }, [fetchDisputes]));

    const showAlert = (message, title = 'Info', type = 'info') => {
        setAlertConfig({ visible: true, title, message, type });
    };

    const handleResolve = (id, action) => {
        const title = action === 'refund_buyer' ? "Refund Buyer" : "Release Funds to Seller";
        const message = action === 'refund_buyer'
            ? "Are you sure you want to refund the buyer? This will change the order status to Refunded."
            : "Are you sure you want to dismiss this dispute and release funds to the seller? This will mark the order as Completed.";

        Alert.alert(title, message, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Confirm",
                style: action === 'refund_buyer' ? "destructive" : "default",
                onPress: async () => {
                    try {
                        const notes = action === 'refund_buyer'
                            ? "Admin decided in favor of buyer. Refund processed."
                            : "Admin decided in favor of seller. Funds released.";

                        const res = await adminAPI.resolveDispute(id, { action, resolution_notes: notes });
                        if (res.success) {
                            showAlert('Dispute resolved successfully', 'Success', 'success');
                            fetchDisputes();
                        } else {
                            showAlert(res.message || 'Failed to resolve dispute', 'Error', 'error');
                        }
                    } catch (error) {
                        showAlert('Server error', 'Error', 'error');
                    }
                }
            }
        ]);
    };

    const renderItem = ({ item }) => {
        return (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>Order #{item.order_id}</Text>
                    <View style={[styles.badge, { backgroundColor: item.status === 'pending' ? '#FF980022' : '#4CAF5022' }]}>
                        <Text style={[styles.badgeText, { color: item.status === 'pending' ? '#FF9800' : '#4CAF50' }]}>
                            {item.status}
                        </Text>
                    </View>
                </View>

                <View style={styles.partiesRow}>
                    <View style={styles.partyBox}>
                        <Text style={[styles.partyLabel, { color: theme.textMuted }]}>Buyer</Text>
                        <Text style={[styles.partyValue, { color: theme.textSecondary }]}>{item.buyer_name}</Text>
                        <Text style={[styles.partySub, { color: theme.textMuted }]}>{item.buyer_email}</Text>
                    </View>
                    <View style={styles.partyBox}>
                        <Text style={[styles.partyLabel, { color: theme.textMuted }]}>Seller / Shop</Text>
                        <Text style={[styles.partyValue, { color: theme.textSecondary }]}>{item.shop_name}</Text>
                        <Text style={[styles.partySub, { color: theme.textMuted }]}>{item.seller_email}</Text>
                    </View>
                </View>

                <View style={[styles.detailsBox, { backgroundColor: theme.background }]}>
                    <Text style={[styles.detailsLabel, { color: theme.textMuted }]}>Reason for Dispute:</Text>
                    <Text style={[styles.detailsText, { color: theme.text }]}>{item.reason}</Text>

                    {item.description && (
                        <>
                            <Text style={[styles.detailsLabel, { color: theme.textMuted, marginTop: 10 }]}>Description:</Text>
                            <Text style={[styles.detailsText, { color: theme.text }]}>{item.description}</Text>
                        </>
                    )}

                    <View style={styles.amountRow}>
                        <Text style={[styles.detailsLabel, { color: theme.textMuted }]}>Disputed Amount:</Text>
                        <Text style={[styles.amountText, { color: theme.accent }]}>₱{parseFloat(item.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
                    </View>
                </View>

                {item.status === 'pending' && (
                    <View style={styles.actionsBox}>
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: theme.border }]}
                            onPress={() => handleResolve(item.dispute_id, 'release_funds')}
                        >
                            <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>Release to Seller</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#e53935' }]}
                            onPress={() => handleResolve(item.dispute_id, 'refund_buyer')}
                        >
                            <Text style={[styles.actionBtnText, { color: '#fff' }]}>Refund Buyer</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {item.status !== 'pending' && item.resolution_notes && (
                    <View style={styles.resolutionBox}>
                        <Text style={[styles.detailsLabel, { color: theme.textMuted }]}>Resolution Notes:</Text>
                        <Text style={[styles.detailsText, { color: theme.textSecondary, fontStyle: 'italic' }]}>{item.resolution_notes}</Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Order Disputes</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={disputes}
                    renderItem={renderItem}
                    keyExtractor={item => item.dispute_id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDisputes(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="shield-half-outline" size={52} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No active disputes</Text>
                        </View>
                    }
                />
            )}
            <CustomAlert
                visible={alertConfig.visible} title={alertConfig.title}
                message={alertConfig.message} type={alertConfig.type}
                onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backButton: { marginRight: 15 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    list: { padding: 16, gap: 16, paddingBottom: 40 },
    card: { padding: 16, borderRadius: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    title: { fontSize: 16, fontWeight: '700', flex: 1 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    partiesRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    partyBox: { flex: 1 },
    partyLabel: { fontSize: 11, textTransform: 'uppercase', marginBottom: 2, fontWeight: '600' },
    partyValue: { fontSize: 14, fontWeight: '600' },
    partySub: { fontSize: 12 },
    detailsBox: { borderRadius: 8, padding: 12, marginBottom: 16 },
    detailsLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
    detailsText: { fontSize: 14, lineHeight: 20 },
    amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#00000015' },
    amountText: { fontSize: 16, fontWeight: '700' },
    actionsBox: { flexDirection: 'row', gap: 10 },
    actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    actionBtnText: { fontSize: 14, fontWeight: '600' },
    resolutionBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#00000010' },
    emptyBox: { alignItems: 'center', marginTop: 60, padding: 20 },
    emptyText: { marginTop: 10, fontSize: 16 }
});

export default AdminDisputesScreen;
