import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, RefreshControl, Alert, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import CustomAlert from '../../components/CustomAlert';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getVoucherState = (v) => {
    const now = new Date();
    if (!v.is_active) return 'inactive';
    if (v.end_date && new Date(v.end_date) < now) return 'expired';
    if (v.start_date && new Date(v.start_date) > now) return 'upcoming';
    if (v.usage_limit !== null && v.used_count >= v.usage_limit) return 'exhausted';
    return 'active';
};

const STATE_META = {
    active: { label: 'Active', color: '#4CAF50', icon: 'checkmark-circle' },
    inactive: { label: 'Inactive', color: '#9E9E9E', icon: 'pause-circle' },
    expired: { label: 'Expired', color: '#e53935', icon: 'close-circle' },
    upcoming: { label: 'Upcoming', color: '#2196F3', icon: 'time' },
    exhausted: { label: 'Used Up', color: '#FF9800', icon: 'alert-circle' },
};

const fmt = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const FILTERS = ['all', 'active', 'inactive', 'expired'];

// ─── Component ────────────────────────────────────────────────────────────────

const AdminVouchersScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);

    const blank = {
        code: '', discount_type: 'percentage', discount_value: '',
        min_spend: '', max_discount: '', usage_limit: '',
        start_date: '', end_date: '',
    };
    const [form, setForm] = useState(blank);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });

    // ── Fetch ──────────────────────────────────────────────────────────────────
    const fetchVouchers = useCallback(async () => {
        try {
            const res = await adminAPI.getVouchers();
            if (res.success) setVouchers(res.data || []);
        } catch (e) {
            showAlert('Failed to load vouchers', 'Error', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchVouchers(); }, [fetchVouchers]));

    const showAlert = (message, title = 'Info', type = 'info') =>
        setAlertConfig({ visible: true, title, message, type });

    // ── Stats ──────────────────────────────────────────────────────────────────
    const stats = {
        total: vouchers.length,
        active: vouchers.filter(v => getVoucherState(v) === 'active').length,
        expired: vouchers.filter(v => getVoucherState(v) === 'expired').length,
        inactive: vouchers.filter(v => getVoucherState(v) === 'inactive').length,
    };

    // ── Filter ─────────────────────────────────────────────────────────────────
    const filtered = filter === 'all'
        ? vouchers
        : filter === 'active' ? vouchers.filter(v => getVoucherState(v) === 'active')
            : filter === 'inactive' ? vouchers.filter(v => ['inactive', 'exhausted'].includes(getVoucherState(v)))
                : vouchers.filter(v => getVoucherState(v) === 'expired');

    // ── Actions ────────────────────────────────────────────────────────────────
    const handleAdd = async () => {
        if (!form.code.trim() || !form.discount_value) {
            return showAlert('Code and Discount Value are required.', 'Missing Fields', 'warning');
        }
        try {
            const payload = {
                code: form.code.trim().toUpperCase(),
                discount_type: form.discount_type,
                discount_value: parseFloat(form.discount_value),
                min_spend: form.min_spend ? parseFloat(form.min_spend) : 0,
                max_discount: form.max_discount ? parseFloat(form.max_discount) : null,
                usage_limit: form.usage_limit ? parseInt(form.usage_limit, 10) : null,
                start_date: form.start_date.trim() || null,
                end_date: form.end_date.trim() || null,
            };
            const res = await adminAPI.addVoucher(payload);
            if (res.success) {
                setForm(blank);
                setShowForm(false);
                fetchVouchers();
                showAlert('Voucher created successfully!', 'Success', 'success');
            } else {
                showAlert(res.message || 'Failed to add voucher.', 'Error', 'error');
            }
        } catch {
            showAlert('Server error. Try again.', 'Error', 'error');
        }
    };

    const handleToggle = async (id) => {
        try {
            const res = await adminAPI.toggleVoucher(id);
            if (res.success) fetchVouchers();
            else showAlert(res.message || 'Failed to toggle voucher.', 'Error', 'error');
        } catch { showAlert('Server error.', 'Error', 'error'); }
    };

    const handleDelete = (id, code) => {
        Alert.alert(
            'Delete Voucher',
            `Permanently delete promo code "${code}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive',
                    onPress: async () => {
                        try {
                            const res = await adminAPI.deleteVoucher(id);
                            if (res.success) fetchVouchers();
                            else showAlert(res.message || 'Failed to delete.', 'Error', 'error');
                        } catch { showAlert('Server error.', 'Error', 'error'); }
                    }
                }
            ]
        );
    };

    // ── Render Card ────────────────────────────────────────────────────────────
    const renderCard = (v) => {
        const state = getVoucherState(v);
        const meta = STATE_META[state];
        const usagePct = v.usage_limit ? Math.min((v.used_count / v.usage_limit) * 100, 100) : null;

        return (
            <View key={v.voucher_id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {/* Header row */}
                <View style={styles.cardHeader}>
                    <View style={styles.codeWrap}>
                        <Ionicons name="pricetag" size={14} color={theme.accent} style={{ marginRight: 5 }} />
                        <Text style={[styles.codeText, { color: theme.text }]}>{v.code}</Text>
                    </View>
                    <View style={[styles.stateBadge, { backgroundColor: meta.color + '22' }]}>
                        <Ionicons name={meta.icon} size={12} color={meta.color} />
                        <Text style={[styles.stateBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                </View>

                {/* Discount value */}
                <Text style={[styles.discountValue, { color: theme.accent }]}>
                    {v.discount_type === 'percentage'
                        ? `${parseFloat(v.discount_value)}% OFF`
                        : `₱${parseFloat(v.discount_value).toLocaleString('en-PH')} OFF`}
                </Text>

                {/* Details grid */}
                <View style={[styles.detailsGrid, { backgroundColor: theme.background }]}>
                    {v.min_spend > 0 && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Min. Spend</Text>
                            <Text style={[styles.detailValue, { color: theme.textSecondary }]}>₱{parseFloat(v.min_spend).toLocaleString('en-PH')}</Text>
                        </View>
                    )}
                    {v.max_discount && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Max Discount</Text>
                            <Text style={[styles.detailValue, { color: theme.textSecondary }]}>₱{parseFloat(v.max_discount).toLocaleString('en-PH')}</Text>
                        </View>
                    )}
                    {v.start_date && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Starts</Text>
                            <Text style={[styles.detailValue, { color: theme.textSecondary }]}>{fmt(v.start_date)}</Text>
                        </View>
                    )}
                    {v.end_date && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Expires</Text>
                            <Text style={[styles.detailValue, { color: state === 'expired' ? '#e53935' : theme.textSecondary }]}>{fmt(v.end_date)}</Text>
                        </View>
                    )}
                </View>

                {/* Usage bar */}
                <View style={styles.usageRow}>
                    <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
                        Used: {v.used_count} {v.usage_limit ? `/ ${v.usage_limit}` : '(Unlimited)'}
                    </Text>
                </View>
                {usagePct !== null && (
                    <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                        <View style={[
                            styles.progressFill,
                            {
                                width: `${usagePct}%`,
                                backgroundColor: usagePct >= 100 ? '#e53935' : usagePct >= 75 ? '#FF9800' : '#4CAF50'
                            }
                        ]} />
                    </View>
                )}

                {/* Action buttons */}
                <View style={styles.cardActions}>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: v.is_active ? theme.border : theme.accent + '22', borderColor: v.is_active ? theme.border : theme.accent }]}
                        onPress={() => handleToggle(v.voucher_id)}
                    >
                        <Ionicons name={v.is_active ? 'eye-off-outline' : 'eye-outline'} size={15} color={v.is_active ? theme.textMuted : theme.accent} />
                        <Text style={[styles.actionBtnText, { color: v.is_active ? theme.textMuted : theme.accent }]}>
                            {v.is_active ? 'Deactivate' : 'Activate'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#e5393522', borderColor: '#e53935' }]}
                        onPress={() => handleDelete(v.voucher_id, v.code)}
                    >
                        <Ionicons name="trash-outline" size={15} color="#e53935" />
                        <Text style={[styles.actionBtnText, { color: '#e53935' }]}>Delete</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Promo Vouchers</Text>
                <TouchableOpacity
                    style={[styles.addHeaderBtn, { backgroundColor: theme.accent }]}
                    onPress={() => setShowForm(sf => !sf)}
                >
                    <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
                    <Text style={styles.addHeaderBtnText}>{showForm ? 'Cancel' : 'New'}</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => { setRefreshing(true); fetchVouchers(); }}
                        tintColor={theme.accent}
                    />
                }
            >
                {loading ? (
                    <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
                ) : (
                    <>
                        {/* Stats Banner */}
                        <View style={[styles.statsBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            {[
                                { label: 'Total', value: stats.total, color: theme.text },
                                { label: 'Active', value: stats.active, color: '#4CAF50' },
                                { label: 'Inactive', value: stats.inactive, color: '#9E9E9E' },
                                { label: 'Expired', value: stats.expired, color: '#e53935' },
                            ].map((s, i, arr) => (
                                <View key={s.label} style={[styles.statItem, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: theme.border }]}>
                                    <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                                    <Text style={[styles.statLabel, { color: theme.textMuted }]}>{s.label}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Create Form */}
                        {showForm && (
                            <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Create New Promo Code</Text>

                                <TextInput
                                    style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                    placeholder="Promo Code (e.g. SUMMER50)"
                                    placeholderTextColor={theme.textMuted}
                                    value={form.code}
                                    onChangeText={t => setForm({ ...form, code: t.toUpperCase() })}
                                    autoCapitalize="characters"
                                />

                                {/* Discount type toggle */}
                                <View style={styles.row}>
                                    {['percentage', 'fixed'].map(type => (
                                        <TouchableOpacity
                                            key={type}
                                            style={[
                                                styles.typeBtn,
                                                { borderColor: theme.border, backgroundColor: theme.inputBg },
                                                form.discount_type === type && { backgroundColor: theme.accent, borderColor: theme.accent }
                                            ]}
                                            onPress={() => setForm({ ...form, discount_type: type })}
                                        >
                                            <Ionicons
                                                name={type === 'percentage' ? 'medal-outline' : 'cash-outline'}
                                                size={14}
                                                color={form.discount_type === type ? '#fff' : theme.textSecondary}
                                            />
                                            <Text style={[styles.typeBtnText, { color: form.discount_type === type ? '#fff' : theme.textSecondary }]}>
                                                {type === 'percentage' ? 'Percentage (%)' : 'Fixed Amount (₱)'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Row: Discount + Usage Limit */}
                                <View style={styles.row}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                                            {form.discount_type === 'percentage' ? 'Discount %' : 'Discount ₱'}
                                        </Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                            placeholder="e.g. 20"
                                            placeholderTextColor={theme.textMuted}
                                            value={form.discount_value}
                                            onChangeText={t => setForm({ ...form, discount_value: t })}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                    <View style={{ width: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Usage Limit</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                            placeholder="Unlimited"
                                            placeholderTextColor={theme.textMuted}
                                            value={form.usage_limit}
                                            onChangeText={t => setForm({ ...form, usage_limit: t })}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                </View>

                                {/* Row: Min Spend + Max Discount */}
                                <View style={styles.row}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Min. Spend (₱)</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                            placeholder="e.g. 500"
                                            placeholderTextColor={theme.textMuted}
                                            value={form.min_spend}
                                            onChangeText={t => setForm({ ...form, min_spend: t })}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                    <View style={{ width: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Max Discount (₱)</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                            placeholder="Optional"
                                            placeholderTextColor={theme.textMuted}
                                            value={form.max_discount}
                                            onChangeText={t => setForm({ ...form, max_discount: t })}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                </View>

                                {/* Row: Start + End Dates */}
                                <View style={styles.row}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Start Date</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                            placeholder="YYYY-MM-DD"
                                            placeholderTextColor={theme.textMuted}
                                            value={form.start_date}
                                            onChangeText={t => setForm({ ...form, start_date: t })}
                                        />
                                    </View>
                                    <View style={{ width: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>End Date</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                            placeholder="YYYY-MM-DD"
                                            placeholderTextColor={theme.textMuted}
                                            value={form.end_date}
                                            onChangeText={t => setForm({ ...form, end_date: t })}
                                        />
                                    </View>
                                </View>

                                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: theme.accent }]} onPress={handleAdd}>
                                    <Ionicons name="ticket-outline" size={18} color="#fff" />
                                    <Text style={styles.submitBtnText}>Generate Voucher</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Filter Tabs */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                            {FILTERS.map(f => {
                                const count = f === 'all' ? stats.total
                                    : f === 'active' ? stats.active
                                        : f === 'inactive' ? stats.inactive
                                            : stats.expired;
                                const active = filter === f;
                                return (
                                    <TouchableOpacity
                                        key={f}
                                        style={[styles.chip, { backgroundColor: active ? theme.accent : theme.inputBg, borderColor: active ? theme.accent : theme.border }]}
                                        onPress={() => setFilter(f)}
                                    >
                                        <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]}>
                                            {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* Voucher Cards */}
                        {filtered.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <Ionicons name="ticket-outline" size={52} color={theme.textMuted} />
                                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No vouchers in this category</Text>
                            </View>
                        ) : (
                            filtered.map(v => renderCard(v))
                        )}
                    </>
                )}
            </ScrollView>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
            />
        </SafeAreaView>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
    backBtn: { marginRight: 12 },
    headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
    addHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
    addHeaderBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

    scroll: { padding: 16, paddingBottom: 50, gap: 14 },

    // Stats Banner
    statsBanner: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
    statItem: { flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontSize: 18, fontWeight: '800' },
    statLabel: { fontSize: 11, marginTop: 2 },

    // Form
    formCard: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
    sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    inputLabel: { fontSize: 12, marginBottom: 4 },
    input: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 8, borderWidth: 1, fontSize: 14 },
    row: { flexDirection: 'row', gap: 0 },
    typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 8, borderWidth: 1 },
    typeBtnText: { fontSize: 12, fontWeight: '600' },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, marginTop: 4 },
    submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

    // Filters
    filterRow: { marginBottom: 4, marginHorizontal: -4 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },

    // Cards
    card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    codeWrap: { flexDirection: 'row', alignItems: 'center' },
    codeText: { fontSize: 17, fontWeight: '800', letterSpacing: 1 },
    stateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    stateBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    discountValue: { fontSize: 22, fontWeight: '900' },
    detailsGrid: { borderRadius: 8, padding: 10, gap: 6 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    detailLabel: { fontSize: 12 },
    detailValue: { fontSize: 12, fontWeight: '600' },
    usageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    progressTrack: { height: 5, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: 5, borderRadius: 4 },
    cardActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
    actionBtnText: { fontSize: 13, fontWeight: '600' },

    // Empty
    emptyBox: { alignItems: 'center', paddingVertical: 50, gap: 12 },
    emptyText: { fontSize: 15 },
});

export default AdminVouchersScreen;
