import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList,
    TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { pointsAPI } from '../services/api';

const TYPE_META = {
    earn: { icon: 'add-circle', color: '#4CAF50', label: 'Earned' },
    redeem: { icon: 'remove-circle', color: '#FF9800', label: 'Redeemed' },
    reverse: { icon: 'refresh-circle', color: '#2196F3', label: 'Reversed' },
};

const MyPointsScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const [balance, setBalance] = useState(0);
    const [lifetime, setLifetime] = useState(0);
    const [transactions, setTxns] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await pointsAPI.getBalance(user.id);
            if (res.success) {
                setBalance(res.balance || 0);
                setLifetime(res.lifetime || 0);
                setTxns(res.transactions || []);
            }
        } catch (e) {
            console.error('MyPoints fetch error:', e);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { fetchData(); }, [user]));

    const EARN_RATE = 100;   // ₱100 = 1 pt
    const REDEEM_RATE = 100;  // 100 pts = ₱10

    const renderItem = ({ item }) => {
        const meta = TYPE_META[item.type] || TYPE_META.earn;
        const sign = item.type === 'earn' ? '+' : (item.type === 'reverse' ? '+' : '');
        const absPoints = Math.abs(item.points);
        return (
            <View style={[styles.txnRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[styles.txnIcon, { backgroundColor: meta.color + '20' }]}>
                    <Ionicons name={meta.icon} size={22} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.txnNote, { color: theme.text }]} numberOfLines={1}>
                        {item.note || meta.label}
                    </Text>
                    <Text style={[styles.txnDate, { color: theme.textMuted }]}>
                        {new Date(item.created_at).toLocaleDateString('en-PH', {
                            month: 'short', day: 'numeric', year: 'numeric',
                        })}
                        {item.order_id ? `  ·  #JM-${item.order_id}` : ''}
                    </Text>
                </View>
                <Text style={[styles.txnPoints, { color: meta.color }]}>
                    {sign}{absPoints} pts
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>My Points</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={transactions}
                keyExtractor={(item) => item.txn_id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={() => (
                    <>
                        {/* Balance Card */}
                        <View style={[styles.balanceCard, { backgroundColor: '#FF9800' }]}>
                            <Ionicons name="trophy" size={38} color="rgba(255,255,255,0.35)" style={styles.bgIcon} />
                            <Text style={styles.balanceLabel}>Available Points</Text>
                            <Text style={styles.balanceValue}>{balance.toLocaleString()}</Text>
                            <Text style={styles.balanceSub}>Lifetime earned: {lifetime.toLocaleString()} pts</Text>

                            <View style={styles.rateRow}>
                                <View style={styles.rateChip}>
                                    <Ionicons name="cart-outline" size={13} color="#E65100" />
                                    <Text style={styles.rateText}>₱{EARN_RATE} spent = 1 pt</Text>
                                </View>
                                <View style={styles.rateChip}>
                                    <Ionicons name="pricetag-outline" size={13} color="#E65100" />
                                    <Text style={styles.rateText}>{REDEEM_RATE} pts = ₱10 off</Text>
                                </View>
                            </View>
                        </View>

                        {/* How it works */}
                        <View style={[styles.howCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Text style={[styles.howTitle, { color: theme.text }]}>How Points Work</Text>
                            {[
                                { icon: 'bag-check-outline', text: 'Earn 1 point for every ₱100 spent when an order is completed.' },
                                { icon: 'pricetag-outline', text: 'Redeem 100 points for ₱10 off at checkout (min 100 pts).' },
                                { icon: 'shield-checkmark-outline', text: 'Redeemed points are returned if you cancel the order.' },
                            ].map((step, i) => (
                                <View key={i} style={styles.howRow}>
                                    <Ionicons name={step.icon} size={20} color="#FF9800" />
                                    <Text style={[styles.howText, { color: theme.textSecondary }]}>{step.text}</Text>
                                </View>
                            ))}
                        </View>

                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Transaction History</Text>
                        {loading && <ActivityIndicator color="#FF9800" style={{ marginTop: 20 }} />}
                    </>
                )}
                ListEmptyComponent={!loading ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="receipt-outline" size={48} color={theme.textMuted} />
                        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                            No transactions yet.{'\n'}Complete an order to earn your first points!
                        </Text>
                    </View>
                ) : null}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15, paddingVertical: 12,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    listContent: { padding: 16, paddingBottom: 40 },
    // Balance card
    balanceCard: {
        borderRadius: 18, padding: 22, marginBottom: 14,
        overflow: 'hidden', position: 'relative',
    },
    bgIcon: { position: 'absolute', right: 18, top: 18 },
    balanceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
    balanceValue: {
        color: '#fff', fontSize: 52, fontWeight: '800',
        letterSpacing: -1, marginVertical: 2,
    },
    balanceSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 16 },
    rateRow: { flexDirection: 'row', gap: 8 },
    rateChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    },
    rateText: { color: '#E65100', fontSize: 11, fontWeight: '700' },
    // How it works
    howCard: {
        borderRadius: 14, padding: 16, marginBottom: 20,
        borderWidth: 1,
    },
    howTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
    howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
    howText: { flex: 1, fontSize: 13, lineHeight: 19 },
    // Section
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
    // Transaction
    txnRow: {
        flexDirection: 'row', alignItems: 'center',
        padding: 14, borderRadius: 12, marginBottom: 10,
        borderWidth: 1, gap: 12,
    },
    txnIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    txnNote: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    txnDate: { fontSize: 12 },
    txnPoints: { fontSize: 15, fontWeight: '800' },
    // Empty
    emptyState: { alignItems: 'center', marginTop: 40, gap: 12 },
    emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
});

export default MyPointsScreen;
