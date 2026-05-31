import React, { useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    ScrollView, Share, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * ReceiptModal
 * Shown to the field worker after a successful QR-confirmed completion.
 * Props:
 *   visible  – boolean
 *   receipt  – { order_id, buyer_name, buyer_phone, total_amount, delivery_fee,
 *                payment_method, discount_amount, points_redeemed, items[] }
 *   onClose  – () => void
 */
export default function ReceiptModal({ visible, receipt, onClose }) {
    if (!receipt) return null;

    const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    const subtotal = (receipt.items || []).reduce((s, i) => {
        const base = i.base_price > 0 ? i.base_price : parseFloat(i.price_at_purchase || 0);
        return s + base * i.quantity;
    }, 0);
    const installTotal = (receipt.items || []).reduce(
        (s, i) => s + parseFloat(i.installation_fee || 0) * i.quantity, 0
    );
    const isCOD = receipt.payment_method?.toLowerCase() === 'cod';

    const buildHTML = () => `
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:Arial,sans-serif;padding:24px;color:#333;max-width:480px;margin:auto}
  h2{text-align:center;color:#5D4037;margin-bottom:4px}
  .sub{text-align:center;color:#888;font-size:13px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{text-align:left;font-size:12px;color:#888;padding:4px 0;border-bottom:1px solid #eee}
  td{padding:6px 0;font-size:13px;border-bottom:1px solid #f5f5f5}
  .right{text-align:right}
  .total{font-weight:bold;font-size:15px;color:#5D4037}
  .footer{text-align:center;font-size:11px;color:#aaa;margin-top:24px}
  .badge{display:inline-block;background:#E8F5E9;color:#2E7D32;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:bold}
</style></head><body>
<h2>JM Glass &amp; Furniture</h2>
<p class="sub">Official Receipt &mdash; Order #JM-${receipt.order_id}</p>
<table>
  <tr><th>Item</th><th class="right">Qty</th><th class="right">Amount</th></tr>
  ${(receipt.items || []).map(i => {
      const base = i.base_price > 0 ? i.base_price : parseFloat(i.price_at_purchase || 0);
      return `<tr><td>${i.title}</td><td class="right">${i.quantity}</td><td class="right">${fmt(base * i.quantity)}</td></tr>`;
  }).join('')}
</table>
<table>
  <tr><td>Subtotal</td><td class="right">${fmt(subtotal)}</td></tr>
  ${parseFloat(receipt.delivery_fee || 0) > 0 ? `<tr><td>Delivery Fee</td><td class="right">${fmt(receipt.delivery_fee)}</td></tr>` : ''}
  ${installTotal > 0 ? `<tr><td>Installation Fee</td><td class="right">${fmt(installTotal)}</td></tr>` : ''}
  ${parseFloat(receipt.discount_amount || 0) > 0 ? `<tr><td>Discount</td><td class="right">-${fmt(receipt.discount_amount)}</td></tr>` : ''}
  <tr class="total"><td>TOTAL</td><td class="right">${fmt(receipt.total_amount)}</td></tr>
</table>
<p>Customer: <strong>${receipt.buyer_name || ''}</strong></p>
<p>Payment: <span class="badge">${(receipt.payment_method || 'N/A').toUpperCase()}</span></p>
<p class="footer">Thank you for your purchase! &mdash; JM Glass &amp; Furniture</p>
</body></html>`;

    const [isSharing, setIsSharing] = React.useState(false);

    const handleShare = async () => {
        if (isSharing) return;
        try {
            setIsSharing(true);
            const { uri } = await Print.printToFileAsync({ html: buildHTML(), base64: false });
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Receipt #JM-${receipt.order_id}` });
        } catch (e) {
            console.error('[ReceiptModal] share error:', e);
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.sheet}>
                    {/* Header */}
                    <View style={s.header}>
                        <View style={s.headerIcon}>
                            <Ionicons name="checkmark-circle" size={32} color="#2E7D32" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.headerTitle}>Payment Confirmed!</Text>
                            <Text style={s.headerSub}>Order #JM-{receipt.order_id}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                            <Ionicons name="close" size={22} color="#666" />
                        </TouchableOpacity>
                    </View>

                    {/* COD note */}
                    {isCOD && (
                        <View style={s.codBanner}>
                            <Ionicons name="cash-outline" size={16} color="#1565C0" />
                            <Text style={s.codText}>COD — Cash collected from customer</Text>
                        </View>
                    )}

                    <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
                        {/* Customer */}
                        <View style={s.row}>
                            <Text style={s.label}>Customer</Text>
                            <Text style={s.value}>{receipt.buyer_name}</Text>
                        </View>
                        <View style={s.row}>
                            <Text style={s.label}>Payment</Text>
                            <View style={s.payBadge}>
                                <Text style={s.payBadgeText}>{(receipt.payment_method || '').toUpperCase()}</Text>
                            </View>
                        </View>

                        {/* Divider */}
                        <View style={s.divider} />

                        {/* Items */}
                        {(receipt.items || []).map((item, idx) => {
                            const base = item.base_price > 0 ? item.base_price : parseFloat(item.price_at_purchase || 0);
                            return (
                                <View key={idx} style={s.itemRow}>
                                    <Text style={s.itemName} numberOfLines={1}>{item.title}</Text>
                                    <Text style={s.itemQty}>×{item.quantity}</Text>
                                    <Text style={s.itemAmt}>{fmt(base * item.quantity)}</Text>
                                </View>
                            );
                        })}

                        <View style={s.divider} />

                        {/* Totals */}
                        <View style={s.row}><Text style={s.label}>Subtotal</Text><Text style={s.value}>{fmt(subtotal)}</Text></View>
                        {parseFloat(receipt.delivery_fee || 0) > 0 && (
                            <View style={s.row}><Text style={s.label}>Delivery Fee</Text><Text style={s.value}>{fmt(receipt.delivery_fee)}</Text></View>
                        )}
                        {installTotal > 0 && (
                            <View style={s.row}><Text style={[s.label, { color: '#E64A19' }]}>Installation Fee</Text><Text style={[s.value, { color: '#E64A19' }]}>{fmt(installTotal)}</Text></View>
                        )}
                        {parseFloat(receipt.discount_amount || 0) > 0 && (
                            <View style={s.row}><Text style={[s.label, { color: '#E91E63' }]}>Discount</Text><Text style={[s.value, { color: '#E91E63' }]}>-{fmt(receipt.discount_amount)}</Text></View>
                        )}
                        <View style={[s.row, s.totalRow]}>
                            <Text style={s.totalLabel}>TOTAL PAID</Text>
                            <Text style={s.totalValue}>{fmt(receipt.total_amount)}</Text>
                        </View>
                    </ScrollView>

                    {/* Actions */}
                    <View style={s.actions}>
                        <TouchableOpacity style={[s.shareBtn, isSharing && { opacity: 0.7 }]} onPress={handleShare} disabled={isSharing}>
                            {isSharing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="share-outline" size={18} color="#fff" />}
                            <Text style={s.shareBtnText}>{isSharing ? 'Preparing PDF...' : 'Share Receipt PDF'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.doneBtn} onPress={onClose}>
                            <Text style={s.doneBtnText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet:          { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', paddingBottom: 30 },
    header:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    headerIcon:     { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
    headerTitle:    { fontSize: 17, fontWeight: '800', color: '#2E7D32' },
    headerSub:      { fontSize: 13, color: '#888', marginTop: 2 },
    closeBtn:       { padding: 4 },
    codBanner:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E3F2FD', paddingHorizontal: 16, paddingVertical: 10 },
    codText:        { fontSize: 13, fontWeight: '600', color: '#1565C0' },
    body:           { paddingHorizontal: 20, paddingTop: 12 },
    row:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    label:          { fontSize: 13, color: '#888' },
    value:          { fontSize: 13, fontWeight: '600', color: '#333' },
    payBadge:       { backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    payBadgeText:   { fontSize: 11, fontWeight: '800', color: '#2E7D32' },
    divider:        { height: 1, backgroundColor: '#f0f0f0', marginVertical: 12 },
    itemRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    itemName:       { flex: 1, fontSize: 13, color: '#333' },
    itemQty:        { fontSize: 12, color: '#888', marginHorizontal: 8 },
    itemAmt:        { fontSize: 13, fontWeight: '600', color: '#333', minWidth: 70, textAlign: 'right' },
    totalRow:       { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 4 },
    totalLabel:     { fontSize: 15, fontWeight: '800', color: '#333' },
    totalValue:     { fontSize: 18, fontWeight: '800', color: '#5D4037' },
    actions:        { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
    shareBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5D4037', paddingVertical: 14, borderRadius: 14 },
    shareBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
    doneBtn:        { alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#ddd' },
    doneBtnText:    { fontWeight: '700', color: '#666', fontSize: 15 },
});
