import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const STATUS_CFG = {
    pending:    { color: '#F57F17', bg: '#FFF8E1', icon: 'time-outline',              label: 'Pending'    },
    processing: { color: '#1565C0', bg: '#E3F2FD', icon: 'construct-outline',         label: 'Processing' },
    shipped:    { color: '#2E7D32', bg: '#E8F5E9', icon: 'car-outline',               label: 'In Transit' },
    delivered:  { color: '#4527A0', bg: '#EDE7F6', icon: 'checkmark-circle-outline',  label: 'Delivered'  },
    completed:  { color: '#6A1B9A', bg: '#F3E5F5', icon: 'ribbon',                    label: 'Completed'  },
    cancelled:  { color: '#B71C1C', bg: '#FFEBEE', icon: 'close-circle-outline',      label: 'Cancelled'  },
};

const fmt   = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fmtDt = (d) => d ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

export default function WorkerHistoryDetailScreen({ route, navigation }) {
    const { order } = route.params;
    const { theme } = useTheme();

    const cfg   = STATUS_CFG[order.status] || STATUS_CFG.completed;
    const items = order.items || [];

    const subtotal = items.reduce((s, i) => {
        const base = i.base_price > 0 ? i.base_price : parseFloat(i.price_at_purchase || 0);
        return s + base * (i.quantity || 1);
    }, 0);

    return (
        <SafeAreaView style={[st.root, { backgroundColor: theme.background }]} edges={['top']}>

            {/* ── Header ── */}
            <View style={[st.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[st.headerTitle, { color: theme.text }]}>Order #JM-{order.order_id}</Text>
                    <Text style={[st.headerSub, { color: theme.textMuted }]}>Completed Order</Text>
                </View>
                <View style={[st.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg.icon} size={13} color={cfg.color} />
                    <Text style={[st.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Completed Banner ── */}
                <View style={st.completedBanner}>
                    <Ionicons name="checkmark-done-circle" size={28} color="#2E7D32" />
                    <View style={{ flex: 1 }}>
                        <Text style={st.completedTitle}>Order Completed</Text>
                        <Text style={st.completedSub}>This order has been successfully delivered and confirmed.</Text>
                    </View>
                </View>

                {/* ── Customer Info ── */}
                <View style={[st.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[st.cardTitle, { color: theme.text }]}>Customer</Text>
                    <View style={st.infoRow}>
                        <Ionicons name="person-outline" size={15} color={theme.textMuted} />
                        <Text style={[st.infoText, { color: theme.text }]}>{order.buyer_name || '—'}</Text>
                    </View>
                    {!!order.buyer_phone && (
                        <TouchableOpacity style={st.infoRow} onPress={() => Linking.openURL(`tel:${order.buyer_phone}`)}>
                            <Ionicons name="call-outline" size={15} color="#2E7D32" />
                            <Text style={[st.infoText, { color: '#2E7D32', fontWeight: '700' }]}>{order.buyer_phone}</Text>
                            <View style={st.callChip}><Text style={st.callChipText}>Call</Text></View>
                        </TouchableOpacity>
                    )}
                    <View style={st.infoRow}>
                        <Ionicons name="location-outline" size={15} color={theme.textMuted} />
                        <Text style={[st.infoText, { color: theme.textMuted }]}>{order.shipping_address || '—'}</Text>
                    </View>
                </View>

                {/* ── Payment Info ── */}
                <View style={[st.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[st.cardTitle, { color: theme.text }]}>Payment</Text>
                    <View style={st.infoRow}>
                        <Ionicons name="wallet-outline" size={15} color={theme.textMuted} />
                        <Text style={[st.infoText, { color: theme.text }]}>Method:</Text>
                        <View style={[st.payBadge, { backgroundColor: order.payment_method?.toLowerCase() === 'cod' ? '#FFF8E1' : '#E3F2FD' }]}>
                            <Text style={[st.payBadgeText, { color: order.payment_method?.toLowerCase() === 'cod' ? '#F57F17' : '#1565C0' }]}>
                                {(order.payment_method || 'N/A').toUpperCase()}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── Order Items ── */}
                {items.length > 0 && (
                    <View style={[st.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[st.cardTitle, { color: theme.text }]}>Items</Text>
                        {items.map((item, idx) => {
                            const base = item.base_price > 0 ? item.base_price : parseFloat(item.price_at_purchase || 0);
                            return (
                                <View key={idx} style={[st.itemRow, idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[st.itemName, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                                        {!!item.service_type && (
                                            <View style={st.serviceTag}>
                                                <Ionicons name={item.service_type === 'installation' ? 'construct-outline' : 'car-outline'} size={11} color="#1565C0" />
                                                <Text style={st.serviceTagText}>{item.service_type}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={[st.itemQty, { color: theme.textMuted }]}>×{item.quantity || 1}</Text>
                                    <Text style={[st.itemAmt, { color: theme.accent }]}>{fmt(base * (item.quantity || 1))}</Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* ── Order Summary ── */}
                <View style={[st.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[st.cardTitle, { color: theme.text }]}>Summary</Text>
                    {subtotal > 0 && (
                        <View style={st.summaryRow}>
                            <Text style={[st.summaryLabel, { color: theme.textMuted }]}>Subtotal</Text>
                            <Text style={[st.summaryValue, { color: theme.text }]}>{fmt(subtotal)}</Text>
                        </View>
                    )}
                    {parseFloat(order.delivery_fee || 0) > 0 && (
                        <View style={st.summaryRow}>
                            <Text style={[st.summaryLabel, { color: theme.textMuted }]}>Delivery Fee</Text>
                            <Text style={[st.summaryValue, { color: theme.text }]}>{fmt(order.delivery_fee)}</Text>
                        </View>
                    )}
                    {parseFloat(order.discount_amount || 0) > 0 && (
                        <View style={st.summaryRow}>
                            <Text style={[st.summaryLabel, { color: '#E91E63' }]}>Discount</Text>
                            <Text style={[st.summaryValue, { color: '#E91E63' }]}>-{fmt(order.discount_amount)}</Text>
                        </View>
                    )}
                    <View style={[st.summaryRow, st.totalRow]}>
                        <Text style={st.totalLabel}>Total</Text>
                        <Text style={st.totalValue}>{fmt(order.total_amount)}</Text>
                    </View>
                </View>

                {/* ── Timeline ── */}
                <View style={[st.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[st.cardTitle, { color: theme.text }]}>Timeline</Text>
                    {[
                        { label: 'Placed',    ts: order.created_at,   icon: 'time-outline'             },
                        { label: 'Processed', ts: order.processed_at, icon: 'construct-outline'        },
                        { label: 'Shipped',   ts: order.shipped_at,   icon: 'car-outline'              },
                        { label: 'Delivered', ts: order.delivered_at, icon: 'checkmark-circle-outline' },
                        { label: 'Completed', ts: order.completed_at, icon: 'ribbon'                  },
                    ].filter(e => e.ts).map((e, idx) => (
                        <View key={idx} style={st.timelineRow}>
                            <View style={st.timelineDot}>
                                <Ionicons name={e.icon} size={14} color="#8D6E63" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[st.timelineLabel, { color: theme.text }]}>{e.label}</Text>
                                <Text style={[st.timelineDate, { color: theme.textMuted }]}>{fmtDt(e.ts)}</Text>
                            </View>
                        </View>
                    ))}
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const st = StyleSheet.create({
    root:               { flex: 1 },
    header:             { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backBtn:            { padding: 4 },
    headerTitle:        { fontSize: 16, fontWeight: '800' },
    headerSub:          { fontSize: 11, marginTop: 1 },
    statusBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    statusBadgeText:    { fontSize: 11, fontWeight: '800' },

    scroll:             { padding: 16, gap: 14, paddingBottom: 40 },

    completedBanner:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#E8F5E9', borderWidth: 1.5, borderColor: '#A5D6A7', borderRadius: 16, padding: 16 },
    completedTitle:     { fontSize: 15, fontWeight: '800', color: '#2E7D32', marginBottom: 2 },
    completedSub:       { fontSize: 12, color: '#388E3C', lineHeight: 18 },

    card: {
        borderRadius: 16, borderWidth: 1, padding: 16, gap: 10,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    cardTitle:          { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },

    infoRow:            { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    infoText:           { fontSize: 13, flex: 1 },
    callChip:           { backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    callChipText:       { fontSize: 11, fontWeight: '700', color: '#2E7D32' },

    payBadge:           { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    payBadgeText:       { fontSize: 11, fontWeight: '800' },

    itemRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
    itemName:           { fontSize: 13, fontWeight: '600', flex: 1 },
    serviceTag:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E3F2FD', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
    serviceTagText:     { fontSize: 10, fontWeight: '700', color: '#1565C0', textTransform: 'capitalize' },
    itemQty:            { fontSize: 12, minWidth: 28, textAlign: 'center' },
    itemAmt:            { fontSize: 13, fontWeight: '700', minWidth: 72, textAlign: 'right' },

    summaryRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    summaryLabel:       { fontSize: 13 },
    summaryValue:       { fontSize: 13, fontWeight: '600' },
    totalRow:           { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 4 },
    totalLabel:         { fontSize: 16, fontWeight: '800', color: '#3e2723' },
    totalValue:         { fontSize: 18, fontWeight: '800', color: '#5D4037' },

    timelineRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
    timelineDot:        { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFEBE9', justifyContent: 'center', alignItems: 'center' },
    timelineLabel:      { fontSize: 13, fontWeight: '700' },
    timelineDate:       { fontSize: 11, marginTop: 1 },
});
