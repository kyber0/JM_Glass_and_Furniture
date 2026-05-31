import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Modal, TextInput,
    Image, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI, BASE_URL } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const STATUS_COLOR = { pending: '#FF9800', active: '#4CAF50', rejected: '#e53935' };

const AdminSellerApplicationsScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [rejectModal, setRejectModal] = useState(false);
    const [selectedShop, setSelectedShop] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [viewModal, setViewModal] = useState(false);
    const [processing, setProcessing] = useState(false);

    const fetchShops = useCallback(async () => {
        try {
            const res = await adminAPI.getPendingShops();
            if (res.success) setShops(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchShops(); }, [fetchShops]));

    const filtered = shops.filter(s => s.status === statusFilter);

    const handleApprove = async (shop) => {
        setProcessing(true);
        try {
            const res = await adminAPI.approveShop(shop.shop_id);
            if (res.success) {
                setShops(prev => prev.map(s => s.shop_id === shop.shop_id ? { ...s, status: 'active' } : s));
                setViewModal(false);
            }
        } catch (e) { console.error(e); }
        setProcessing(false);
    };

    const handleReject = async () => {
        if (!selectedShop) return;
        setProcessing(true);
        try {
            const res = await adminAPI.rejectShop(selectedShop.shop_id, rejectReason);
            if (res.success) {
                setShops(prev => prev.map(s => s.shop_id === selectedShop.shop_id ? { ...s, status: 'rejected' } : s));
            }
        } catch (e) { console.error(e); }
        setRejectModal(false);
        setRejectReason('');
        setViewModal(false);
        setSelectedShop(null);
        setProcessing(false);
    };

    const resolveImageUrl = (url) => {
        if (!url) return null;
        return url.startsWith('http') ? url : `${BASE_URL}/${url}`;
    };

    const renderCard = ({ item }) => {
        const color = STATUS_COLOR[item.status] || '#888';
        return (
            <TouchableOpacity
                style={[styles.card, { borderBottomColor: theme.border }]}
                onPress={() => { setSelectedShop(item); setViewModal(true); }}
                activeOpacity={0.85}
            >
                <View style={[styles.cardIcon, { backgroundColor: color + '22' }]}>
                    <Ionicons name="storefront" size={22} color={color} />
                </View>
                <View style={styles.cardBody}>
                    <Text style={[styles.cardShopName, { color: theme.text }]}>{item.shop_name}</Text>
                    <Text style={[styles.cardOwner, { color: theme.textMuted }]}>{item.full_name} · {item.email}</Text>
                    <Text style={[styles.cardDate, { color: theme.textMuted }]}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: color + '22' }]}>
                    <Text style={[styles.statusText, { color }]}>{item.status}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Seller Applications</Text>
                <View style={[styles.countBadge, { backgroundColor: STATUS_COLOR[statusFilter] + '22' }]}>
                    <Text style={[styles.countText, { color: STATUS_COLOR[statusFilter] }]}>{filtered.length}</Text>
                </View>
            </View>

            <View style={styles.filterRow}>
                {['pending', 'active', 'rejected'].map(s => {
                    const active = statusFilter === s;
                    return (
                        <TouchableOpacity
                            key={s}
                            style={[styles.chip, { backgroundColor: theme.inputBg, borderColor: theme.border },
                            active && { backgroundColor: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] }]}
                            onPress={() => setStatusFilter(s)}
                        >
                            <Text style={[styles.chipText, { color: theme.textSecondary }, active && { color: '#fff' }]}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={filtered}
                    renderItem={renderCard}
                    keyExtractor={i => i.shop_id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchShops(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="document-text-outline" size={52} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No {statusFilter} applications</Text>
                        </View>
                    }
                />
            )}

            {/* Detail Modal */}
            <Modal visible={viewModal} animationType="slide" onRequestClose={() => setViewModal(false)}>
                <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                    <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                        <TouchableOpacity onPress={() => setViewModal(false)}>
                            <Ionicons name="close" size={24} color={theme.headerText} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: theme.headerText, marginLeft: 14 }]}>Application Detail</Text>
                        <View style={{ flex: 1 }} />
                    </View>
                    {selectedShop && (
                        <ScrollView contentContainerStyle={{ padding: 18 }}>
                            {/* Shop Info */}
                            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <Text style={[styles.sectionTitle, { color: theme.accent }]}>Shop Info</Text>
                                <Row label="Shop Name" value={selectedShop.shop_name} theme={theme} />
                                <Row label="Description" value={selectedShop.description || '—'} theme={theme} />
                                <Row label="Address" value={selectedShop.address} theme={theme} />
                                <Row label="TIN" value={selectedShop.tin_number || '—'} theme={theme} />
                            </View>
                            {/* Applicant */}
                            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <Text style={[styles.sectionTitle, { color: theme.accent }]}>Applicant</Text>
                                <Row label="Name" value={selectedShop.full_name} theme={theme} />
                                <Row label="Email" value={selectedShop.email} theme={theme} />
                                <Row label="Phone" value={selectedShop.phone || '—'} theme={theme} />
                            </View>
                            {/* ID Image */}
                            {resolveImageUrl(selectedShop.id_image_url) && (
                                <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                    <Text style={[styles.sectionTitle, { color: theme.accent }]}>Government ID</Text>
                                    <Image source={{ uri: resolveImageUrl(selectedShop.id_image_url) }} style={styles.docImage} resizeMode="contain" />
                                </View>
                            )}
                            {/* Permit */}
                            {resolveImageUrl(selectedShop.permit_image_url) && (
                                <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                    <Text style={[styles.sectionTitle, { color: theme.accent }]}>Business Permit</Text>
                                    <Image source={{ uri: resolveImageUrl(selectedShop.permit_image_url) }} style={styles.docImage} resizeMode="contain" />
                                </View>
                            )}
                            {selectedShop.status === 'pending' && (
                                <View style={styles.actionRow}>
                                    <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(selectedShop)} disabled={processing}>
                                        {processing ? <ActivityIndicator color="#fff" /> : (
                                            <><Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 6 }} /><Text style={styles.btnText}>Approve</Text></>
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejectModal(true)} disabled={processing}>
                                        <Ionicons name="close-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                                        <Text style={styles.btnText}>Reject</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    )}
                </SafeAreaView>
            </Modal>

            {/* Reject Reason Modal */}
            <Modal visible={rejectModal} transparent animationType="fade" onRequestClose={() => setRejectModal(false)}>
                <View style={styles.overlay}>
                    <View style={[styles.reasonBox, { backgroundColor: theme.card }]}>
                        <Text style={[styles.reasonTitle, { color: theme.text }]}>Reject Application</Text>
                        <Text style={[styles.reasonSub, { color: theme.textMuted }]}>Provide a reason (sent to applicant)</Text>
                        <TextInput
                            style={[styles.reasonInput, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                            placeholder="e.g. Incomplete documents..."
                            placeholderTextColor={theme.textMuted}
                            multiline
                            value={rejectReason}
                            onChangeText={setRejectReason}
                        />
                        <View style={styles.reasonBtns}>
                            <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: theme.inputBg }]} onPress={() => setRejectModal(false)}>
                                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.rejectBtn} onPress={handleReject} disabled={processing}>
                                {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Confirm</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const Row = ({ label, value, theme }) => (
    <View style={styles.detailRow}>
        <Text style={[styles.detailLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: theme.text }]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backBtn: { padding: 4, marginRight: 12 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginLeft: 'auto' },
    countText: { fontSize: 13, fontWeight: '700' },
    filterRow: { flexDirection: 'row', padding: 14, gap: 10 },
    chip: { flex: 1, paddingVertical: 9, borderRadius: 20, alignItems: 'center', borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },
    list: { paddingHorizontal: 16, paddingBottom: 30 },
    card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
    cardIcon: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    cardBody: { flex: 1 },
    cardShopName: { fontSize: 15, fontWeight: '700' },
    cardOwner: { fontSize: 12, marginTop: 2 },
    cardDate: { fontSize: 11, marginTop: 3 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    emptyBox: { alignItems: 'center', marginTop: 60, gap: 12 },
    emptyText: { fontSize: 15 },
    section: { borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1 },
    sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    detailLabel: { fontSize: 13, flex: 1 },
    detailValue: { fontSize: 13, fontWeight: '600', flex: 2, textAlign: 'right' },
    docImage: { width: '100%', height: 180, borderRadius: 10 },
    actionRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
    approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 14 },
    rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e53935', borderRadius: 12, paddingVertical: 14 },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    reasonBox: { borderRadius: 16, padding: 22 },
    reasonTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
    reasonSub: { fontSize: 13, marginBottom: 14 },
    reasonInput: { borderRadius: 12, padding: 14, fontSize: 14, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, marginBottom: 16 },
    reasonBtns: { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    cancelText: { fontWeight: '700' },
});

export default AdminSellerApplicationsScreen;
