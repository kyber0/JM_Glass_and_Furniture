/**
 * WorkersScreen.js — Seller: Manage Delivery Men & Handymen
 * Two tabs: Delivery Team | Installation Team
 * Each row shows login status and a "Create Login" button for handymen without accounts.
 * Credential cards are shown in a modal after creation.
 */
import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    Modal, TextInput, ScrollView, ActivityIndicator,
    RefreshControl, Clipboard,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { workersAPI, shopAPI, handymenAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const DM_STATUS_CFG = {
    available:   { color:'#2E7D32', bg:'#E8F5E9', label:'Available' },
    on_delivery: { color:'#1565C0', bg:'#E3F2FD', label:'On Delivery' },
    off:         { color:'#546E7A', bg:'#ECEFF1', label:'Off Duty' },
};
const HM_STATUS_CFG = {
    available: { color:'#2E7D32', bg:'#E8F5E9', label:'Available' },
    busy:      { color:'#E65100', bg:'#FFF3E0', label:'Busy' },
    off:       { color:'#546E7A', bg:'#ECEFF1', label:'Off Duty' },
};

export default function WorkersScreen({ navigation }) {
    const { user }  = useAuth();
    const { theme } = useTheme();

    const [tab, setTab]         = useState('delivery'); // 'delivery' | 'handyman'
    const [shopId, setShopId]   = useState(null);
    const [workers, setWorkers] = useState({ delivery_men: [], handymen: [] });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // ── Add Delivery Man Modal ─────────────────────────────────────────────────
    const [dmModal, setDmModal]   = useState(false);
    const [dmForm, setDmForm]     = useState({ full_name:'', phone:'', plate_number:'' });
    const [saving, setSaving]     = useState(false);

    // ── Credential Result Modal ────────────────────────────────────────────────
    const [credModal, setCredModal]   = useState(false);
    const [credentials, setCredentials] = useState(null);

    const [alertConfig, setAlertConfig] = useState({ visible:false, title:'', message:'', type:'info', showCancel:false, onConfirm:null });
    const showAlert = (title, message, type='info', showCancel=false, onConfirm=null) =>
        setAlertConfig({ visible:true, title, message, type, showCancel, onConfirm });
    const hideAlert = () => setAlertConfig(p => ({ ...p, visible:false }));

    // ── Load ───────────────────────────────────────────────────────────────────
    const load = useCallback(async () => {
        if (!user) return;
        try {
            const shopRes = await shopAPI.getMyShop(user.id);
            if (!shopRes?.success || !shopRes.shop) return;
            const sid = shopRes.shop.shop_id;
            setShopId(sid);
            const res = await workersAPI.getByShop(sid);
            if (res?.success) setWorkers({ delivery_men: res.delivery_men || [], handymen: res.handymen || [] });
        } catch (e) { console.error('[WorkersScreen] load:', e); }
        finally { setLoading(false); setRefreshing(false); }
    }, [user]);

    useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

    // ── Create Delivery Man ────────────────────────────────────────────────────
    const handleCreateDM = async () => {
        if (!dmForm.full_name.trim()) { showAlert('Required', 'Please enter the full name.', 'warning'); return; }
        setSaving(true);
        try {
            const res = await workersAPI.createDeliveryMan(shopId, dmForm);
            if (res?.success) {
                setDmModal(false);
                setDmForm({ full_name:'', phone:'', plate_number:'' });
                setCredentials(res.credentials);
                setCredModal(true);
                load();
            } else {
                showAlert('Error', res?.message || 'Failed to create account.', 'error');
            }
        } catch { showAlert('Error', 'Network error. Please try again.', 'error'); }
        finally { setSaving(false); }
    };

    // ── Create Handyman Login ──────────────────────────────────────────────────
    const handleCreateHMLogin = async (handymanId) => {
        showAlert('Create Login', 'Issue a login account for this handyman?', 'info', true, async () => {
            try {
                const res = await workersAPI.createHandymanAccount(handymanId);
                if (res?.success) { setCredentials(res.credentials); setCredModal(true); load(); }
                else showAlert('Error', res?.message || 'Failed.', 'error');
            } catch { showAlert('Error', 'Network error.', 'error'); }
        });
    };

    // ── Deactivate ─────────────────────────────────────────────────────────────
    const handleDeactivate = (workerUserId, name) => {
        showAlert('Deactivate', `Remove ${name}'s login access? They will no longer be able to sign in.`, 'warning', true, async () => {
            await workersAPI.deactivate(workerUserId).catch(() => {});
            load();
        });
    };

    // ── Render Delivery Man row ────────────────────────────────────────────────
    const renderDM = ({ item }) => {
        const cfg = DM_STATUS_CFG[item.status] || DM_STATUS_CFG.available;
        return (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[styles.cardAvatar, { backgroundColor: '#1565C0' }]}>
                    <Text style={styles.cardAvatarText}>
                        {item.full_name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()}
                    </Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: theme.text }]}>{item.full_name}</Text>
                    {item.phone && <Text style={[styles.cardSub, { color: theme.textMuted }]}>{item.phone}</Text>}
                    </View>
                    <View style={[styles.credRow, { borderTopColor: theme.border }]}>
                        <Ionicons name="person-outline" size={12} color={theme.textMuted} />
                        <Text style={[styles.credText, { color: theme.textMuted }]} numberOfLines={1}>@{item.username}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => handleDeactivate(item.user_id, item.full_name)} style={styles.deactivateBtn}>
                    <Ionicons name="person-remove-outline" size={18} color="#e53935" />
                </TouchableOpacity>
            </View>
        );
    };

    // ── Render Handyman row ────────────────────────────────────────────────────
    const renderHM = ({ item }) => {
        const cfg = HM_STATUS_CFG[item.status] || HM_STATUS_CFG.available;
        return (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[styles.cardAvatar, { backgroundColor: '#6C3483' }]}>
                    <Text style={styles.cardAvatarText}>
                        {item.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()}
                    </Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: theme.text }]}>{item.name}</Text>
                    <View style={styles.chipRow}>
                        <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                            <Text style={[styles.chipText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        {item.has_account ? (
                            <View style={[styles.chip, { backgroundColor: '#E8F5E9' }]}>
                                <Ionicons name="checkmark-circle" size={11} color="#2E7D32" />
                                <Text style={[styles.chipText, { color: '#2E7D32' }]}>Has Login</Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={[styles.chip, { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: '#E65100' }]}
                                onPress={() => handleCreateHMLogin(item.handyman_id)}
                            >
                                <Ionicons name="key-outline" size={11} color="#E65100" />
                                <Text style={[styles.chipText, { color: '#E65100' }]}>Create Login</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {item.has_account && item.username && (
                        <View style={[styles.credRow, { borderTopColor: theme.border }]}>
                            <Ionicons name="person-outline" size={12} color={theme.textMuted} />
                            <Text style={[styles.credText, { color: theme.textMuted }]} numberOfLines={1}>@{item.username}</Text>
                        </View>
                    )}
                </View>
                {item.has_account && (
                    <TouchableOpacity onPress={() => handleDeactivate(item.user_id, item.name)} style={styles.deactivateBtn}>
                        <Ionicons name="person-remove-outline" size={18} color="#e53935" />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const isDelivery = tab === 'delivery';
    const listData   = isDelivery ? workers.delivery_men : workers.handymen;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>My Workers</Text>
                    <Text style={[styles.headerSub, { color: theme.accent }]}>
                        {workers.delivery_men.length} delivery · {workers.handymen.length} handymen
                    </Text>
                </View>
                {isDelivery && (
                    <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.accent }]} onPress={() => setDmModal(true)}>
                        <Ionicons name="add" size={22} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Tabs */}
            <View style={[styles.tabs, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                {[
                    { key:'delivery', label:'🚚  Delivery Team', count: workers.delivery_men.length },
                    { key:'handyman', label:'🔧  Installation Team', count: workers.handymen.length },
                ].map(t => (
                    <TouchableOpacity
                        key={t.key}
                        style={[styles.tabItem, tab === t.key && { borderBottomColor: theme.accent, borderBottomWidth: 2.5 }]}
                        onPress={() => setTab(t.key)}
                    >
                        <Text style={[styles.tabText, { color: tab === t.key ? theme.accent : theme.textMuted }]}>
                            {t.label}
                        </Text>
                        <View style={[styles.tabBadge, { backgroundColor: tab === t.key ? theme.accent : theme.border }]}>
                            <Text style={styles.tabBadgeText}>{t.count}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} /> : (
                <FlatList
                    data={listData}
                    keyExtractor={(item, i) => (item.delivery_man_id || item.handyman_id || i).toString()}
                    renderItem={isDelivery ? renderDM : renderHM}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name={isDelivery ? 'car-outline' : 'construct-outline'} size={54} color={theme.textMuted} />
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>
                                {isDelivery ? 'No Delivery Men Yet' : 'No Handymen Yet'}
                            </Text>
                            <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                                {isDelivery
                                    ? 'Tap + to add a delivery man and generate their login credentials.'
                                    : 'Add handymen from the Installation Team screen, then issue them login accounts here.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* ── Add Delivery Man Modal ──────────────────────────────────────── */}
            <Modal visible={dmModal} transparent animationType="slide" onRequestClose={() => setDmModal(false)}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setDmModal(false)} />
                    <View style={[styles.sheet, { backgroundColor: theme.card }]}>
                        <View style={[styles.handle, { backgroundColor: theme.border }]} />
                        <Text style={[styles.sheetTitle, { color: theme.text }]}>Add Delivery Man</Text>
                        <Text style={[styles.sheetSub, { color: theme.textMuted }]}>
                            Login credentials will be auto-generated and shown to you after creation.
                        </Text>

                        <KeyboardAwareWrapper>
                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            {[
                                { label:'Full Name *', key:'full_name', placeholder:'e.g. Juan dela Cruz', keyboard:'default' },
                                { label:'Phone Number', key:'phone',     placeholder:'09XX XXX XXXX',       keyboard:'phone-pad' },
                                { label:'Plate Number', key:'plate_number', placeholder:'e.g. ABC 123',    keyboard:'default' },
                            ].map(f => (
                                <View key={f.key}>
                                    <Text style={[styles.label, { color: theme.textSecondary }]}>{f.label}</Text>
                                    <View style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                                        <TextInput
                                            style={[styles.inputText, { color: theme.text }]}
                                            placeholder={f.placeholder}
                                            placeholderTextColor={theme.textMuted}
                                            value={dmForm[f.key]}
                                            onChangeText={v => setDmForm(p => ({ ...p, [f.key]: v }))}
                                            keyboardType={f.keyboard}
                                        />
                                    </View>
                                </View>
                            ))}

                            <View style={styles.modalBtns}>
                                <TouchableOpacity style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={() => setDmModal(false)}>
                                    <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.saveBtn, { backgroundColor: theme.accent }, saving && { opacity: 0.6 }]}
                                    onPress={handleCreateDM}
                                    disabled={saving}
                                >
                                    {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                                        <>
                                            <Ionicons name="person-add-outline" size={16} color="#fff" />
                                            <Text style={styles.saveBtnText}>Create & Get Credentials</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                        </KeyboardAwareWrapper>
                    </View>
                </View>
            </Modal>

            {/* ── Credential Result Modal ─────────────────────────────────────── */}
            <Modal visible={credModal} transparent animationType="fade" onRequestClose={() => setCredModal(false)}>
                <View style={styles.credOverlay}>
                    <View style={[styles.credCard, { backgroundColor: theme.card }]}>
                        <View style={styles.credIconWrap}>
                            <Ionicons name="key" size={32} color="#F57F17" />
                        </View>
                        <Text style={[styles.credTitle, { color: theme.text }]}>Credentials Ready!</Text>
                        <Text style={[styles.credNote, { color: theme.textMuted }]}>
                            Share these with your worker. They will be asked to change their password on first login.
                        </Text>

                        {credentials && (
                            <View style={[styles.credBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                                <View style={styles.credField}>
                                    <Text style={[styles.credFieldLabel, { color: theme.textMuted }]}>Username</Text>
                                    <Text style={[styles.credFieldValue, { color: theme.text }]}>{credentials.username}</Text>
                                </View>
                                <View style={[styles.credDivider, { backgroundColor: theme.border }]} />
                                <View style={styles.credField}>
                                    <Text style={[styles.credFieldLabel, { color: theme.textMuted }]}>Temp Password</Text>
                                    <Text style={[styles.credFieldValue, { color: theme.accent }]}>{credentials.temp_password}</Text>
                                </View>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.copyBtn, { backgroundColor: theme.accent }]}
                            onPress={() => {
                                Clipboard.setString(`Username: ${credentials?.username}\nPassword: ${credentials?.temp_password}`);
                                showAlert('Copied!', 'Credentials copied to clipboard.', 'success');
                            }}
                        >
                            <Ionicons name="copy-outline" size={16} color="#fff" />
                            <Text style={styles.copyBtnText}>Copy to Clipboard</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.doneBtn, { borderColor: theme.border }]} onPress={() => setCredModal(false)}>
                            <Text style={[styles.doneBtnText, { color: theme.textSecondary }]}>Done</Text>
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
    container:       { flex: 1 },
    header:          { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:1 },
    backBtn:         { padding:6 },
    headerTitle:     { fontSize:18, fontWeight:'800' },
    headerSub:       { fontSize:12, marginTop:2 },
    addBtn:          { width:38, height:38, borderRadius:19, justifyContent:'center', alignItems:'center', shadowOffset:{width:0,height:3}, shadowOpacity:0.3, shadowRadius:6, elevation:4 },
    tabs:            { flexDirection:'row', borderBottomWidth:1 },
    tabItem:         { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:14 },
    tabText:         { fontSize:13, fontWeight:'700' },
    tabBadge:        { paddingHorizontal:7, paddingVertical:2, borderRadius:10 },
    tabBadgeText:    { color:'#fff', fontSize:11, fontWeight:'700' },
    list:            { padding:16, gap:12, paddingBottom:40 },
    card:            { flexDirection:'row', alignItems:'flex-start', gap:12, borderRadius:16, borderWidth:1, padding:14, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:6, elevation:2 },
    cardAvatar:      { width:46, height:46, borderRadius:14, justifyContent:'center', alignItems:'center', flexShrink:0 },
    cardAvatarText:  { color:'#fff', fontSize:16, fontWeight:'800' },
    cardName:        { fontSize:15, fontWeight:'700' },
    cardSub:         { fontSize:12, marginTop:2 },
    chipRow:         { flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:6 },
    chip:            { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:10 },
    chipText:        { fontSize:11, fontWeight:'600' },
    credRow:         { flexDirection:'row', alignItems:'center', gap:4, marginTop:8, paddingTop:8, borderTopWidth:1 },
    credText:        { fontSize:12 },
    deactivateBtn:   { padding:6 },
    empty:           { alignItems:'center', marginTop:60, gap:12, paddingHorizontal:40 },
    emptyTitle:      { fontSize:18, fontWeight:'800' },
    emptySub:        { fontSize:14, textAlign:'center', lineHeight:21 },
    overlay:         { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
    sheet:           { borderTopLeftRadius:28, borderTopRightRadius:28, padding:24, paddingBottom:40, maxHeight:'90%' },
    handle:          { width:40, height:5, borderRadius:3, alignSelf:'center', marginBottom:20 },
    sheetTitle:      { fontSize:20, fontWeight:'800', marginBottom:4 },
    sheetSub:        { fontSize:13, lineHeight:20, marginBottom:16 },
    label:           { fontSize:13, fontWeight:'600', marginBottom:8, marginTop:14 },
    input:           { borderWidth:1, borderRadius:12, paddingHorizontal:14 },
    inputText:       { paddingVertical:12, fontSize:15 },
    vehicleRow:      { flexDirection:'row', flexWrap:'wrap', gap:8 },
    vehicleChip:     { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:14, paddingVertical:10, borderRadius:12, borderWidth:1.5, flexGrow:1 },
    vehicleText:     { fontSize:13, fontWeight:'600' },
    modalBtns:       { flexDirection:'row', gap:12, marginTop:24 },
    cancelBtn:       { flex:1, borderWidth:1.5, borderRadius:12, paddingVertical:14, alignItems:'center' },
    cancelText:      { fontWeight:'700', fontSize:14 },
    saveBtn:         { flex:2, borderRadius:12, paddingVertical:14, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:8, shadowOffset:{width:0,height:3}, shadowOpacity:0.3, shadowRadius:6, elevation:4 },
    saveBtnText:     { color:'#fff', fontWeight:'800', fontSize:14 },
    credOverlay:     { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center', padding:24 },
    credCard:        { width:'100%', borderRadius:24, padding:24, gap:12, maxWidth:380 },
    credIconWrap:    { width:64, height:64, borderRadius:20, backgroundColor:'#FFF8E1', justifyContent:'center', alignItems:'center', alignSelf:'center' },
    credTitle:       { fontSize:20, fontWeight:'800', textAlign:'center' },
    credNote:        { fontSize:13, textAlign:'center', lineHeight:20 },
    credBox:         { borderRadius:16, borderWidth:1, overflow:'hidden' },
    credField:       { padding:16, gap:4 },
    credFieldLabel:  { fontSize:12, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5 },
    credFieldValue:  { fontSize:18, fontWeight:'800', letterSpacing:0.5 },
    credDivider:     { height:1 },
    copyBtn:         { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:14, borderRadius:14, shadowOffset:{width:0,height:3}, shadowOpacity:0.25, shadowRadius:6, elevation:4 },
    copyBtnText:     { color:'#fff', fontWeight:'700', fontSize:15 },
    doneBtn:         { borderWidth:1.5, borderRadius:14, paddingVertical:13, alignItems:'center' },
    doneBtnText:     { fontWeight:'700', fontSize:14 },
});
