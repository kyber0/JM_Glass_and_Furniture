/**
 * StaffScreen.js — Seller: Staff Overview
 * Shows two tabs: Delivery Team | Installation Team
 * Lets seller issue/view login credentials for existing records.
 * Navigate to DeliveryMenScreen or HandymenScreen for full CRUD.
 */
import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    Modal, Clipboard, ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { workersAPI, shopAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const DM_STATUS = {
    available:   { color: '#2E7D32', bg: '#E8F5E9', label: 'Available' },
    on_delivery: { color: '#1565C0', bg: '#E3F2FD', label: 'On Delivery' },
    off:         { color: '#546E7A', bg: '#ECEFF1', label: 'Off Duty' },
};
const HM_STATUS = {
    available: { color: '#2E7D32', bg: '#E8F5E9', label: 'Available' },
    busy:      { color: '#E65100', bg: '#FFF3E0', label: 'Busy' },
    off:       { color: '#546E7A', bg: '#ECEFF1', label: 'Off Duty' },
};

const getInitials = (name) =>
    (name || '?').split(' ').slice(0, 2).map(w => (w[0] || '')).join('').toUpperCase() || '?';

export default function StaffScreen({ navigation }) {
    const { user }  = useAuth();
    const { theme } = useTheme();

    const [tab,       setTab]       = useState('delivery');
    const [shopId,    setShopId]    = useState(null);
    const [workers,   setWorkers]   = useState({ delivery_men: [], handymen: [] });
    const [loading,   setLoading]   = useState(true);
    const [refreshing,setRefreshing]= useState(false);

    // Credential modal
    const [credModal,    setCredModal]    = useState(false);
    const [credentials,  setCredentials]  = useState(null);
    const [credSaving,   setCredSaving]   = useState(false);

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null });
    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) =>
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    const hideAlert = () => setAlertConfig(p => ({ ...p, visible: false }));

    // ── Load ──────────────────────────────────────────────────────────────────
    const load = useCallback(async () => {
        if (!user) return;
        try {
            const shopRes = await shopAPI.getMyShop(user.id);
            if (!shopRes?.success || !shopRes.shop) return;
            const sid = shopRes.shop.shop_id;
            setShopId(sid);
            const res = await workersAPI.getByShop(sid);
            if (res?.success) {
                setWorkers({
                    delivery_men: res.delivery_men || [],
                    handymen:     res.handymen     || [],
                });
            }
        } catch (e) {
            console.error('[StaffScreen] load error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

    // ── Issue handyman login ───────────────────────────────────────────────────
    const handleCreateHMLogin = (handymanId) => {
        showAlert('Create Login', 'Issue a login account for this handyman?', 'info', true, async () => {
            setCredSaving(true);
            try {
                const res = await workersAPI.createHandymanAccount(handymanId);
                if (res?.success) {
                    setCredentials(res.credentials);
                    setCredModal(true);
                    load();
                } else {
                    showAlert('Error', res?.message || 'Failed to create account.', 'error');
                }
            } catch {
                showAlert('Error', 'Network error. Please try again.', 'error');
            } finally {
                setCredSaving(false);
            }
        });
    };

    // ── Deactivate ─────────────────────────────────────────────────────────────
    const handleDeactivate = (workerUserId, name) => {
        showAlert(
            'Deactivate Account',
            `Remove ${name}'s login access? They will no longer be able to sign in.`,
            'warning', true,
            async () => {
                await workersAPI.deactivate(workerUserId).catch(() => {});
                load();
            }
        );
    };

    // ── Render Delivery Man row ────────────────────────────────────────────────
    const renderDeliveryMan = ({ item }) => {
        const cfg = DM_STATUS[item.status] || DM_STATUS.available;
        return (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[styles.avatar, { backgroundColor: '#1565C0' }]}>
                    <Text style={styles.avatarText}>{getInitials(item.full_name)}</Text>
                </View>

                <View style={styles.cardBody}>
                    <Text style={[styles.cardName, { color: theme.text }]}>{item.full_name || 'Unnamed'}</Text>
                    {!!item.phone && (
                        <Text style={[styles.cardSub, { color: theme.textMuted }]}>{item.phone}</Text>
                    )}

                    <View style={styles.chipRow}>
                        <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                            <Text style={[styles.chipText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                    </View>

                    <View style={[styles.credRow, { borderTopColor: theme.border }]}>
                        <Ionicons name="person-outline" size={12} color={theme.textMuted} />
                        <Text style={[styles.credText, { color: theme.textMuted }]} numberOfLines={1}>
                            {'@' + (item.username || '')}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={() => handleDeactivate(item.user_id, item.full_name)}
                    style={styles.deactivateBtn}
                >
                    <Ionicons name="person-remove-outline" size={18} color="#e53935" />
                </TouchableOpacity>
            </View>
        );
    };

    // ── Render Handyman row ────────────────────────────────────────────────────
    const renderHandyman = ({ item }) => {
        const cfg = HM_STATUS[item.status] || HM_STATUS.available;
        return (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[styles.avatar, { backgroundColor: '#6C3483' }]}>
                    <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
                </View>

                <View style={styles.cardBody}>
                    <Text style={[styles.cardName, { color: theme.text }]}>{item.name || 'Unnamed'}</Text>

                    <View style={styles.chipRow}>
                        <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                            <Text style={[styles.chipText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        {item.has_account ? (
                            <View style={[styles.chip, { backgroundColor: '#E8F5E9' }]}>
                                <Text style={[styles.chipText, { color: '#2E7D32' }]}>Has Login</Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={[styles.chip, { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: '#E65100' }]}
                                onPress={() => handleCreateHMLogin(item.handyman_id)}
                            >
                                <Text style={[styles.chipText, { color: '#E65100' }]}>Create Login</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {!!(item.has_account && item.username) && (
                        <View style={[styles.credRow, { borderTopColor: theme.border }]}>
                            <Ionicons name="person-outline" size={12} color={theme.textMuted} />
                            <Text style={[styles.credText, { color: theme.textMuted }]} numberOfLines={1}>
                                {'@' + item.username}
                            </Text>
                        </View>
                    )}
                </View>

                {!!item.has_account && (
                    <TouchableOpacity
                        onPress={() => handleDeactivate(item.user_id, item.name)}
                        style={styles.deactivateBtn}
                    >
                        <Ionicons name="person-remove-outline" size={18} color="#e53935" />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const isDelivery = tab === 'delivery';
    const listData   = isDelivery ? workers.delivery_men : workers.handymen;
    const dmCount    = workers.delivery_men.length;
    const hmCount    = workers.handymen.length;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>

            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>My Staff</Text>
                    <Text style={[styles.headerSub, { color: theme.accent }]}>
                        {String(dmCount)}
                        <Text style={[styles.headerSub, { color: theme.textMuted }]}>{' delivery  '}</Text>
                        {String(hmCount)}
                        <Text style={[styles.headerSub, { color: theme.textMuted }]}>{' handymen'}</Text>
                    </Text>
                </View>
                {isDelivery ? (
                    <TouchableOpacity
                        style={[styles.addBtn, { backgroundColor: theme.accent }]}
                        onPress={() => navigation.navigate('DeliveryMen')}
                    >
                        <Ionicons name="people-outline" size={19} color="#fff" />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[styles.addBtn, { backgroundColor: '#6C3483' }]}
                        onPress={() => navigation.navigate('Handymen')}
                    >
                        <Ionicons name="hammer-outline" size={19} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Tabs */}
            <View style={[styles.tabs, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity
                    style={[styles.tabItem, tab === 'delivery' && { borderBottomColor: theme.accent, borderBottomWidth: 2.5 }]}
                    onPress={() => setTab('delivery')}
                >
                    <Text style={[styles.tabText, { color: tab === 'delivery' ? theme.accent : theme.textMuted }]}>
                        {'Delivery Team'}
                    </Text>
                    <View style={[styles.tabBadge, { backgroundColor: tab === 'delivery' ? theme.accent : theme.border }]}>
                        <Text style={styles.tabBadgeText}>{String(dmCount)}</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tabItem, tab === 'handyman' && { borderBottomColor: '#6C3483', borderBottomWidth: 2.5 }]}
                    onPress={() => setTab('handyman')}
                >
                    <Text style={[styles.tabText, { color: tab === 'handyman' ? '#6C3483' : theme.textMuted }]}>
                        {'Installation Team'}
                    </Text>
                    <View style={[styles.tabBadge, { backgroundColor: tab === 'handyman' ? '#6C3483' : theme.border }]}>
                        <Text style={styles.tabBadgeText}>{String(hmCount)}</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Manage button */}
            <TouchableOpacity
                style={[styles.manageBar, { backgroundColor: isDelivery ? '#E3F2FD' : '#EDE7F6', borderColor: isDelivery ? '#1565C0' : '#6C3483' }]}
                onPress={() => navigation.navigate(isDelivery ? 'DeliveryMen' : 'Handymen')}
            >
                <Ionicons name={isDelivery ? 'car-outline' : 'hammer-outline'} size={16} color={isDelivery ? '#1565C0' : '#6C3483'} />
                <Text style={[styles.manageBarText, { color: isDelivery ? '#1565C0' : '#6C3483' }]}>
                    {isDelivery ? 'Manage Delivery Men (Add / Edit / Remove)' : 'Manage Handymen (Add / Edit / Remove)'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={isDelivery ? '#1565C0' : '#6C3483'} />
            </TouchableOpacity>

            {/* List */}
            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
            ) : (
                <FlatList
                    data={listData}
                    keyExtractor={(item, i) => String(item.delivery_man_id || item.handyman_id || i)}
                    renderItem={isDelivery ? renderDeliveryMan : renderHandyman}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); load(); }}
                            tintColor={theme.accent}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons
                                name={isDelivery ? 'car-outline' : 'construct-outline'}
                                size={54} color={theme.textMuted}
                            />
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>
                                {isDelivery ? 'No Delivery Men Yet' : 'No Handymen Yet'}
                            </Text>
                            <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                                {isDelivery
                                    ? 'Tap Manage to add a delivery man and generate their login credentials.'
                                    : 'Tap Manage to add handymen, then issue login accounts here.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Credential modal */}
            <Modal visible={credModal} transparent animationType="fade" onRequestClose={() => setCredModal(false)}>
                <View style={styles.credOverlay}>
                    <View style={[styles.credCard, { backgroundColor: theme.card }]}>
                        <View style={styles.credIconWrap}>
                            <Ionicons name="key" size={32} color="#F57F17" />
                        </View>
                        <Text style={[styles.credTitle, { color: theme.text }]}>
                            {'Credentials Ready!'}
                        </Text>
                        <Text style={[styles.credNote, { color: theme.textMuted }]}>
                            {'Share these with your worker. They will be asked to change their password on first login.'}
                        </Text>

                        {credentials ? (
                            <View style={[styles.credBox, { backgroundColor: theme.inputBg || '#f5f5f5', borderColor: theme.border }]}>
                                <View style={styles.credField}>
                                    <Text style={[styles.credFieldLabel, { color: theme.textMuted }]}>{'Username'}</Text>
                                    <Text style={[styles.credFieldValue, { color: theme.text }]}>{credentials.username || ''}</Text>
                                </View>
                                <View style={[styles.credDivider, { backgroundColor: theme.border }]} />
                                <View style={styles.credField}>
                                    <Text style={[styles.credFieldLabel, { color: theme.textMuted }]}>{'Temp Password'}</Text>
                                    <Text style={[styles.credFieldValue, { color: theme.accent }]}>{credentials.temp_password || ''}</Text>
                                </View>
                            </View>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.copyBtn, { backgroundColor: theme.accent }]}
                            onPress={() => {
                                if (credentials) {
                                    Clipboard.setString('Username: ' + credentials.username + '\nPassword: ' + credentials.temp_password);
                                    showAlert('Copied!', 'Credentials copied to clipboard.', 'success');
                                }
                            }}
                        >
                            <Ionicons name="copy-outline" size={16} color="#fff" />
                            <Text style={styles.copyBtnText}>{'Copy to Clipboard'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.doneBtn, { borderColor: theme.border }]}
                            onPress={() => setCredModal(false)}
                        >
                            <Text style={[styles.doneBtnText, { color: theme.textSecondary }]}>{'Done'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                onConfirm={() => { hideAlert(); alertConfig.onConfirm?.(); }}
                onCancel={hideAlert}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:      { flex: 1 },
    header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
    backBtn:        { padding: 6 },
    headerCenter:   { flex: 1, marginHorizontal: 12 },
    headerTitle:    { fontSize: 18, fontWeight: '800' },
    headerSub:      { fontSize: 12, marginTop: 2, fontWeight: '600' },
    addBtn:         { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
    tabs:           { flexDirection: 'row', borderBottomWidth: 1 },
    tabItem:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
    tabText:        { fontSize: 13, fontWeight: '700' },
    tabBadge:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    tabBadgeText:   { color: '#fff', fontSize: 11, fontWeight: '800' },
    manageBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
    manageBarText:  { flex: 1, fontSize: 13, fontWeight: '600' },
    list:           { padding: 16, gap: 12, paddingBottom: 40 },
    card:           { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
    avatar:         { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    avatarText:     { color: '#fff', fontSize: 16, fontWeight: '800' },
    cardBody:       { flex: 1 },
    cardName:       { fontSize: 15, fontWeight: '700' },
    cardSub:        { fontSize: 12, marginTop: 2 },
    chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    chip:           { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    chipText:       { fontSize: 11, fontWeight: '600' },
    credRow:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
    credText:       { fontSize: 12 },
    deactivateBtn:  { padding: 6 },
    empty:          { alignItems: 'center', marginTop: 60, gap: 12, paddingHorizontal: 40 },
    emptyTitle:     { fontSize: 18, fontWeight: '800' },
    emptySub:       { fontSize: 14, textAlign: 'center', lineHeight: 21 },
    credOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    credCard:       { width: '100%', borderRadius: 24, padding: 24, gap: 12, maxWidth: 380 },
    credIconWrap:   { width: 64, height: 64, borderRadius: 20, backgroundColor: '#FFF8E1', justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
    credTitle:      { fontSize: 20, fontWeight: '800', textAlign: 'center' },
    credNote:       { fontSize: 13, textAlign: 'center', lineHeight: 20 },
    credBox:        { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    credField:      { padding: 16, gap: 4 },
    credFieldLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    credFieldValue: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
    credDivider:    { height: 1 },
    copyBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
    copyBtnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
    doneBtn:        { borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
    doneBtnText:    { fontWeight: '700', fontSize: 14 },
});
