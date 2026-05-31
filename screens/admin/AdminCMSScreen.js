import React, { useState, useCallback, useRef } from 'react';
import {
    StyleSheet, Text, View, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, RefreshControl, Alert, Switch,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import CustomAlert from '../../components/CustomAlert';

// Collapsible section wrapper
const Section = ({ title, icon, color, children, badge }) => {
    const [open, setOpen] = useState(true);
    const { theme } = useTheme();
    return (
        <View style={[sStyles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity
                style={sStyles.sectionHeader}
                onPress={() => setOpen(o => !o)}
                activeOpacity={0.7}
            >
                <View style={[sStyles.sectionIconBox, { backgroundColor: color + '22' }]}>
                    <Ionicons name={icon} size={18} color={color} />
                </View>
                <Text style={[sStyles.sectionTitle, { color: theme.text }]}>{title}</Text>
                {badge !== undefined && badge > 0 && (
                    <View style={[sStyles.badge, { backgroundColor: color }]}>
                        <Text style={sStyles.badgeText}>{badge}</Text>
                    </View>
                )}
                <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.textMuted}
                    style={{ marginLeft: 'auto' }}
                />
            </TouchableOpacity>
            {open && <View style={sStyles.sectionBody}>{children}</View>}
        </View>
    );
};

const sStyles = StyleSheet.create({
    section: { borderRadius: 14, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
    sectionIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    sectionTitle: { fontSize: 15, fontWeight: '700' },
    sectionBody: { paddingHorizontal: 14, paddingBottom: 14 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────

const AdminCMSScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Data states
    const [banners, setBanners] = useState([]);
    const [categories, setCategories] = useState([]);
    const [settings, setSettings] = useState({});
    const [maintenanceStats, setMaintenanceStats] = useState(null);

    // Form states
    const [newBanner, setNewBanner] = useState({ image_url: '', link_url: '' });
    const [newCategory, setNewCategory] = useState({ name: '', icon_name: 'grid-outline' });

    // Announcement
    const [announcementText, setAnnouncementText] = useState('');
    const [announcementSaving, setAnnouncementSaving] = useState(false);

    // Contact Info
    const [contact, setContact] = useState({ contact_phone: '', contact_email: '', contact_address: '' });
    const [contactSaving, setContactSaving] = useState(false);

    // Social Links
    const [social, setSocial] = useState({ social_facebook: '', social_instagram: '', social_tiktok: '' });
    const [socialSaving, setSocialSaving] = useState(false);

    // Maintenance
    const [maintenanceOn, setMaintenanceOn] = useState(false);
    const [maintenanceMsg, setMaintenanceMsg] = useState('');
    const [maintenanceSaving, setMaintenanceSaving] = useState(false);

    // Platform Fees
    const [fees, setFees] = useState({ commission_rate: '3.00', transaction_fee_pct: '2.00', transaction_fee_fixed: '15.00' });
    const [feesSaving, setFeesSaving] = useState(false);

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });

    const showAlert = (message, title = 'Info', type = 'info') => {
        setAlertConfig({ visible: true, title, message, type });
    };

    const fetchData = useCallback(async () => {
        try {
            const [bRes, cRes, sRes, mRes] = await Promise.all([
                adminAPI.getCMSBanners(),
                adminAPI.getCMSCategories(),
                adminAPI.getPlatformSettings(),
                adminAPI.getMaintenanceStats(),
            ]);
            if (bRes.success) setBanners(bRes.data || []);
            if (cRes.success) setCategories(cRes.data || []);
            if (sRes.success) {
                const s = sRes.data || {};
                setSettings(s);
                setAnnouncementText(s.announcement || '');
                setContact({
                    contact_phone: s.contact_phone || '',
                    contact_email: s.contact_email || '',
                    contact_address: s.contact_address || '',
                });
                setSocial({
                    social_facebook: s.social_facebook || '',
                    social_instagram: s.social_instagram || '',
                    social_tiktok: s.social_tiktok || '',
                });
                setMaintenanceOn(s.maintenance_mode === 'true');
                setMaintenanceMsg(s.maintenance_message || 'We are currently under maintenance. Please check back later.');
                setFees({
                    commission_rate: s.commission_rate || '3.00',
                    transaction_fee_pct: s.transaction_fee_pct || '2.00',
                    transaction_fee_fixed: s.transaction_fee_fixed || '15.00'
                });
            }
            if (mRes.success) setMaintenanceStats(mRes.data);
        } catch (e) {
            console.error(e);
            showAlert('Failed to load CMS data', 'Error', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

    // ── Announcement ───────────────────────────────────────────────────────────
    const handleSaveAnnouncement = async () => {
        setAnnouncementSaving(true);
        try {
            let res;
            if (!announcementText.trim()) {
                res = await adminAPI.deleteAnnouncement();
            } else {
                res = await adminAPI.setAnnouncement(announcementText.trim());
            }
            if (res.success) showAlert('Announcement updated', 'Saved', 'success');
            else showAlert(res.message || 'Failed to save', 'Error', 'error');
        } catch (e) {
            showAlert('Server error', 'Error', 'error');
        } finally {
            setAnnouncementSaving(false);
        }
    };

    // ── Contact Info ───────────────────────────────────────────────────────────
    const handleSaveContact = async () => {
        setContactSaving(true);
        try {
            const res = await adminAPI.updatePlatformSettings(contact);
            if (res.success) showAlert('Contact information saved', 'Saved', 'success');
            else showAlert(res.message || 'Failed to save', 'Error', 'error');
        } catch (e) { showAlert('Server error', 'Error', 'error'); }
        finally { setContactSaving(false); }
    };

    // ── Social Links ───────────────────────────────────────────────────────────
    const handleSaveSocial = async () => {
        setSocialSaving(true);
        try {
            const res = await adminAPI.updatePlatformSettings(social);
            if (res.success) showAlert('Social links saved', 'Saved', 'success');
            else showAlert(res.message || 'Failed to save', 'Error', 'error');
        } catch (e) { showAlert('Server error', 'Error', 'error'); }
        finally { setSocialSaving(false); }
    };

    // ── Maintenance ────────────────────────────────────────────────────────────
    const handleToggleMaintenance = async (val) => {
        if (val) {
            Alert.alert(
                '⚠️ Enable Maintenance Mode',
                'This will display a maintenance message to all app users. Are you sure?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Enable', style: 'destructive', onPress: async () => {
                            setMaintenanceOn(true);
                            await adminAPI.updatePlatformSettings({ maintenance_mode: 'true', maintenance_message: maintenanceMsg });
                            showAlert('Maintenance mode enabled', 'Done', 'warning');
                        }
                    }
                ]
            );
        } else {
            setMaintenanceOn(false);
            await adminAPI.updatePlatformSettings({ maintenance_mode: 'false' });
            showAlert('Maintenance mode disabled', 'Done', 'success');
        }
    };

    const handleSaveMaintenance = async () => {
        setMaintenanceSaving(true);
        try {
            const res = await adminAPI.updatePlatformSettings({
                maintenance_mode: String(maintenanceOn),
                maintenance_message: maintenanceMsg,
            });
            if (res.success) showAlert('Maintenance settings saved', 'Saved', 'success');
            else showAlert(res.message || 'Failed', 'Error', 'error');
        } catch (e) { showAlert('Server error', 'Error', 'error'); }
        finally { setMaintenanceSaving(false); }
    };

    // ── Fees ───────────────────────────────────────────────────────────────────
    const handleSaveFees = async () => {
        setFeesSaving(true);
        try {
            const res = await adminAPI.updatePlatformSettings(fees);
            if (res.success) showAlert('Platform fees saved', 'Saved', 'success');
            else showAlert(res.message || 'Failed', 'Error', 'error');
        } catch (e) { showAlert('Server error', 'Error', 'error'); }
        finally { setFeesSaving(false); }
    };

    // ── Banners ────────────────────────────────────────────────────────────────
    const handleAddBanner = async () => {
        if (!newBanner.image_url) return showAlert('Image URL is required', 'Missing Field', 'warning');
        try {
            const res = await adminAPI.addCMSBanner(newBanner);
            if (res.success) { setNewBanner({ image_url: '', link_url: '' }); fetchData(); showAlert('Banner added', 'Success', 'success'); }
            else showAlert(res.message || 'Failed', 'Error', 'error');
        } catch (e) { showAlert('Server error', 'Error', 'error'); }
    };

    const handleDeleteBanner = (id) => {
        Alert.alert('Delete Banner', 'Remove this carousel banner?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                        const res = await adminAPI.deleteCMSBanner(id);
                        if (res.success) fetchData();
                        else showAlert(res.message || 'Failed', 'Error', 'error');
                    } catch (e) { showAlert('Server error', 'Error', 'error'); }
                }
            }
        ]);
    };

    // ── Categories ─────────────────────────────────────────────────────────────
    const handleAddCategory = async () => {
        if (!newCategory.name) return showAlert('Category Name is required', 'Missing Field', 'warning');
        try {
            const res = await adminAPI.addCMSCategory(newCategory);
            if (res.success) { setNewCategory({ name: '', icon_name: 'grid-outline' }); fetchData(); showAlert('Category added', 'Success', 'success'); }
            else showAlert(res.message || 'Failed', 'Error', 'error');
        } catch (e) { showAlert('Server error', 'Error', 'error'); }
    };

    const handleDeleteCategory = (id) => {
        Alert.alert('Delete Category', 'Are you sure? This fails if products are using this category.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                        const res = await adminAPI.deleteCMSCategory(id);
                        if (res.success) fetchData();
                        else showAlert(res.message || 'Cannot delete: products still use this category.', 'Error', 'error');
                    } catch (e) { showAlert('Server error', 'Error', 'error'); }
                }
            }
        ]);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>Platform Content</Text>
                    <Text style={[styles.headerSub, { color: theme.textMuted }]}>Manage app content & settings</Text>
                </View>
                <TouchableOpacity onPress={() => { setRefreshing(true); fetchData(); }} style={styles.refreshBtn}>
                    <Ionicons name="refresh" size={20} color={theme.headerText} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={theme.accent} />}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={theme.accent} />
                        <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading platform content...</Text>
                    </View>
                ) : (
                    <>
                        {/* ── MAINTENANCE MODE ───────────────────────────────── */}
                        <Section title="Maintenance Mode" icon="construct" color="#FF5722">
                            <View style={[styles.maintenanceCard, { backgroundColor: maintenanceOn ? '#FF572215' : theme.inputBg, borderColor: maintenanceOn ? '#FF5722' : theme.border }]}>
                                <View style={styles.switchRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.switchLabel, { color: theme.text }]}>
                                            {maintenanceOn ? '🔴 Maintenance is ACTIVE' : '🟢 App is Running Normally'}
                                        </Text>
                                        <Text style={[styles.switchSub, { color: theme.textMuted }]}>
                                            {maintenanceOn ? 'Users see the maintenance message below' : 'Toggle to put app in maintenance mode'}
                                        </Text>
                                    </View>
                                    <Switch
                                        value={maintenanceOn}
                                        onValueChange={handleToggleMaintenance}
                                        trackColor={{ false: theme.border, true: '#FF572280' }}
                                        thumbColor={maintenanceOn ? '#FF5722' : theme.textMuted}
                                    />
                                </View>
                            </View>

                            {maintenanceStats && (
                                <View style={styles.statsRow}>
                                    {[
                                        { label: 'Active Products', val: maintenanceStats.totalProducts, icon: 'cube', color: '#4A90D9' },
                                        { label: 'Active Shops', val: maintenanceStats.totalShops, icon: 'storefront', color: '#FF9800' },
                                        { label: 'Pending Orders', val: maintenanceStats.pendingOrders, icon: 'time', color: '#e53935' },
                                    ].map(s => (
                                        <View key={s.label} style={[styles.statChip, { backgroundColor: s.color + '15', borderColor: s.color + '40' }]}>
                                            <Ionicons name={s.icon} size={14} color={s.color} />
                                            <Text style={[styles.statChipVal, { color: s.color }]}>{s.val}</Text>
                                            <Text style={[styles.statChipLabel, { color: theme.textMuted }]}>{s.label}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Maintenance Message</Text>
                            <TextInput
                                style={[styles.textArea, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                placeholder="Message shown to users during maintenance..."
                                placeholderTextColor={theme.textMuted}
                                value={maintenanceMsg}
                                onChangeText={setMaintenanceMsg}
                                multiline
                                numberOfLines={3}
                            />
                            <TouchableOpacity
                                style={[styles.saveBtn, { backgroundColor: '#FF5722' }, maintenanceSaving && styles.saveBtnDisabled]}
                                onPress={handleSaveMaintenance}
                                disabled={maintenanceSaving}
                            >
                                {maintenanceSaving
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <><Ionicons name="save-outline" size={16} color="#fff" /><Text style={styles.saveBtnText}>Save Maintenance Settings</Text></>
                                }
                            </TouchableOpacity>
                        </Section>

                        {/* ── INCOME & FEES ──────────────────────────────────── */}
                        <Section title="Income & Fees" icon="cash" color="#4CAF50">
                            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                                Set platform deductions applied on completed orders.
                            </Text>
                            {[
                                { key: 'commission_rate', label: 'Platform Commission (%)', icon: 'pie-chart-outline', placeholder: '3.00' },
                                { key: 'transaction_fee_pct', label: 'Payment Gateway Fee (%)', icon: 'card-outline', placeholder: '2.00' },
                                { key: 'transaction_fee_fixed', label: 'Fixed Gateway Fee (₱)', icon: 'cash-outline', placeholder: '15.00' },
                            ].map(field => (
                                <View key={field.key} style={styles.fieldGroup}>
                                    <View style={styles.fieldLabelRow}>
                                        <Ionicons name={field.icon} size={13} color="#4CAF50" />
                                        <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 0, marginLeft: 4 }]}>{field.label}</Text>
                                    </View>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                        placeholder={field.placeholder}
                                        placeholderTextColor={theme.textMuted}
                                        value={fees[field.key]}
                                        onChangeText={v => setFees({ ...fees, [field.key]: v })}
                                        keyboardType="numeric"
                                    />
                                </View>
                            ))}
                            <TouchableOpacity
                                style={[styles.saveBtn, { backgroundColor: '#4CAF50' }, feesSaving && styles.saveBtnDisabled]}
                                onPress={handleSaveFees}
                                disabled={feesSaving}
                            >
                                {feesSaving
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <><Ionicons name="save-outline" size={16} color="#fff" /><Text style={styles.saveBtnText}>Save Fee Settings</Text></>
                                }
                            </TouchableOpacity>
                        </Section>

                        {/* ── ANNOUNCEMENT BANNER ────────────────────────────── */}
                        <Section title="Announcement Banner" icon="megaphone" color="#FF9800" badge={announcementText ? 1 : 0}>
                            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                                Shown as a banner to all users on the Home screen. Leave empty to hide.
                            </Text>
                            <TextInput
                                style={[styles.textArea, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                placeholder="e.g. 🎉 Grand Sale this weekend! Up to 50% off on selected items."
                                placeholderTextColor={theme.textMuted}
                                value={announcementText}
                                onChangeText={setAnnouncementText}
                                multiline
                                numberOfLines={3}
                            />
                            {announcementText ? (
                                <View style={[styles.previewBox, { backgroundColor: '#FF980015', borderColor: '#FF9800' }]}>
                                    <Ionicons name="megaphone-outline" size={14} color="#FF9800" />
                                    <Text style={[styles.previewText, { color: '#FF9800' }]} numberOfLines={2}>{announcementText}</Text>
                                </View>
                            ) : null}
                            <View style={styles.btnRow}>
                                {announcementText ? (
                                    <TouchableOpacity
                                        style={[styles.saveBtn, { flex: 0.4, backgroundColor: '#e5393520' }]}
                                        onPress={() => {
                                            setAnnouncementText('');
                                            adminAPI.deleteAnnouncement().then(() => showAlert('Announcement cleared', 'Done', 'info'));
                                        }}
                                    >
                                        <Ionicons name="close-circle-outline" size={16} color="#e53935" />
                                        <Text style={[styles.saveBtnText, { color: '#e53935' }]}>Clear</Text>
                                    </TouchableOpacity>
                                ) : null}
                                <TouchableOpacity
                                    style={[styles.saveBtn, { flex: announcementText ? 0.58 : 1, backgroundColor: '#FF9800' }, announcementSaving && styles.saveBtnDisabled]}
                                    onPress={handleSaveAnnouncement}
                                    disabled={announcementSaving}
                                >
                                    {announcementSaving
                                        ? <ActivityIndicator size="small" color="#fff" />
                                        : <><Ionicons name="checkmark-circle-outline" size={16} color="#fff" /><Text style={styles.saveBtnText}>Publish</Text></>
                                    }
                                </TouchableOpacity>
                            </View>
                        </Section>

                        {/* ── CONTACT INFORMATION ────────────────────────────── */}
                        <Section title="Contact Information" icon="call" color="#4CAF50">
                            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Displayed in the app's About / Help page</Text>
                            {[
                                { key: 'contact_phone', label: 'Phone Number', icon: 'call-outline', placeholder: '+63 912 345 6789', keyboardType: 'phone-pad' },
                                { key: 'contact_email', label: 'Email Address', icon: 'mail-outline', placeholder: 'support@jmglass.com', keyboardType: 'email-address' },
                                { key: 'contact_address', label: 'Business Address', icon: 'location-outline', placeholder: '123 Main St, City', keyboardType: 'default' },
                            ].map(field => (
                                <View key={field.key} style={styles.fieldGroup}>
                                    <View style={styles.fieldLabelRow}>
                                        <Ionicons name={field.icon} size={13} color={theme.textMuted} />
                                        <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 0, marginLeft: 4 }]}>{field.label}</Text>
                                    </View>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                        placeholder={field.placeholder}
                                        placeholderTextColor={theme.textMuted}
                                        value={contact[field.key]}
                                        onChangeText={v => setContact({ ...contact, [field.key]: v })}
                                        keyboardType={field.keyboardType}
                                        autoCapitalize="none"
                                    />
                                </View>
                            ))}
                            <TouchableOpacity
                                style={[styles.saveBtn, { backgroundColor: '#4CAF50' }, contactSaving && styles.saveBtnDisabled]}
                                onPress={handleSaveContact}
                                disabled={contactSaving}
                            >
                                {contactSaving
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <><Ionicons name="save-outline" size={16} color="#fff" /><Text style={styles.saveBtnText}>Save Contact Info</Text></>
                                }
                            </TouchableOpacity>
                        </Section>

                        {/* ── SOCIAL MEDIA LINKS ─────────────────────────────── */}
                        <Section title="Social Media Links" icon="share-social" color="#4A90D9">
                            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Linked from the app's footer / About page</Text>
                            {[
                                { key: 'social_facebook', label: 'Facebook Page URL', icon: 'logo-facebook', color: '#1877F2', placeholder: 'https://facebook.com/jmglass' },
                                { key: 'social_instagram', label: 'Instagram Profile URL', icon: 'logo-instagram', color: '#E1306C', placeholder: 'https://instagram.com/jmglass' },
                                { key: 'social_tiktok', label: 'TikTok Profile URL', icon: 'logo-tiktok', color: '#000', placeholder: 'https://tiktok.com/@jmglass' },
                            ].map(field => (
                                <View key={field.key} style={styles.fieldGroup}>
                                    <View style={styles.fieldLabelRow}>
                                        <Ionicons name={field.icon} size={13} color={field.color} />
                                        <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 0, marginLeft: 4 }]}>{field.label}</Text>
                                    </View>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: field.color + '60' }]}
                                        placeholder={field.placeholder}
                                        placeholderTextColor={theme.textMuted}
                                        value={social[field.key]}
                                        onChangeText={v => setSocial({ ...social, [field.key]: v })}
                                        autoCapitalize="none"
                                        keyboardType="url"
                                    />
                                </View>
                            ))}
                            <TouchableOpacity
                                style={[styles.saveBtn, { backgroundColor: '#4A90D9' }, socialSaving && styles.saveBtnDisabled]}
                                onPress={handleSaveSocial}
                                disabled={socialSaving}
                            >
                                {socialSaving
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <><Ionicons name="save-outline" size={16} color="#fff" /><Text style={styles.saveBtnText}>Save Social Links</Text></>
                                }
                            </TouchableOpacity>
                        </Section>

                        {/* ── CAROUSEL BANNERS ───────────────────────────────── */}
                        <Section title="Carousel Banners" icon="images" color="#9C27B0" badge={banners.length}>
                            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Add image URLs to display in the home screen carousel</Text>
                            <View style={styles.fieldGroup}>
                                <TextInput
                                    style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                    placeholder="Image URL (e.g. https://...)"
                                    placeholderTextColor={theme.textMuted}
                                    value={newBanner.image_url}
                                    onChangeText={t => setNewBanner({ ...newBanner, image_url: t })}
                                    autoCapitalize="none"
                                    keyboardType="url"
                                />
                                <TextInput
                                    style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                    placeholder="Link URL (optional)"
                                    placeholderTextColor={theme.textMuted}
                                    value={newBanner.link_url}
                                    onChangeText={t => setNewBanner({ ...newBanner, link_url: t })}
                                    autoCapitalize="none"
                                    keyboardType="url"
                                />
                                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#9C27B0' }]} onPress={handleAddBanner}>
                                    <Ionicons name="add-circle-outline" size={16} color="#fff" />
                                    <Text style={styles.saveBtnText}>Add Banner</Text>
                                </TouchableOpacity>
                            </View>

                            {banners.length === 0 ? (
                                <View style={styles.emptyRow}>
                                    <Ionicons name="images-outline" size={28} color={theme.textMuted} />
                                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>No banners configured yet</Text>
                                </View>
                            ) : (
                                banners.map((b, i) => (
                                    <View key={b.banner_id} style={[styles.listItem, { borderTopColor: theme.border, borderTopWidth: i === 0 ? 1 : 0 }]}>
                                        <View style={[styles.bannerNumBox, { backgroundColor: '#9C27B022' }]}>
                                            <Text style={[styles.bannerNum, { color: '#9C27B0' }]}>#{i + 1}</Text>
                                        </View>
                                        <View style={{ flex: 1, marginHorizontal: 10 }}>
                                            <Text style={[styles.itemLabel, { color: theme.text }]} numberOfLines={1}>{b.image_url}</Text>
                                            {b.link_url ? <Text style={[styles.itemSub, { color: theme.textMuted }]} numberOfLines={1}>→ {b.link_url}</Text> : null}
                                        </View>
                                        <TouchableOpacity onPress={() => handleDeleteBanner(b.banner_id)} style={styles.delBtn}>
                                            <Ionicons name="trash-outline" size={18} color="#e53935" />
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </Section>

                        {/* ── PRODUCT CATEGORIES ─────────────────────────────── */}
                        <Section title="Product Categories" icon="pricetags" color="#00BCD4" badge={categories.length}>
                            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Manage the categories buyers use to browse products</Text>
                            <View style={styles.fieldGroup}>
                                <TextInput
                                    style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                    placeholder="Category Name (e.g. Glass Doors)"
                                    placeholderTextColor={theme.textMuted}
                                    value={newCategory.name}
                                    onChangeText={t => setNewCategory({ ...newCategory, name: t })}
                                />
                                <View style={styles.iconRow}>
                                    <TextInput
                                        style={[styles.input, { flex: 1, backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                        placeholder="Ionicons name (e.g. bed-outline)"
                                        placeholderTextColor={theme.textMuted}
                                        value={newCategory.icon_name}
                                        onChangeText={t => setNewCategory({ ...newCategory, icon_name: t })}
                                        autoCapitalize="none"
                                    />
                                    <View style={[styles.iconPreview, { backgroundColor: '#00BCD422', borderColor: theme.border }]}>
                                        <Ionicons name={newCategory.icon_name || 'grid-outline'} size={20} color="#00BCD4" />
                                    </View>
                                </View>
                                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#00BCD4' }]} onPress={handleAddCategory}>
                                    <Ionicons name="add-circle-outline" size={16} color="#fff" />
                                    <Text style={styles.saveBtnText}>Add Category</Text>
                                </TouchableOpacity>
                            </View>

                            {categories.length === 0 ? (
                                <View style={styles.emptyRow}>
                                    <Ionicons name="pricetags-outline" size={28} color={theme.textMuted} />
                                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>No categories configured yet</Text>
                                </View>
                            ) : (
                                <View style={[styles.categoryGrid]}>
                                    {categories.map(c => (
                                        <View key={c.category_id} style={[styles.categoryChip, { backgroundColor: '#00BCD415', borderColor: '#00BCD440' }]}>
                                            <Ionicons name={c.icon_name || 'grid-outline'} size={16} color="#00BCD4" />
                                            <Text style={[styles.categoryChipText, { color: theme.text }]} numberOfLines={1}>{c.name}</Text>
                                            <TouchableOpacity onPress={() => handleDeleteCategory(c.category_id)}>
                                                <Ionicons name="close-circle" size={16} color="#e5393590" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </Section>

                        <View style={{ height: 30 }} />
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

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, gap: 10,
    },
    headerTitle: { fontSize: 17, fontWeight: '800' },
    headerSub: { fontSize: 11, marginTop: 1 },
    backBtn: { padding: 4 },
    refreshBtn: { padding: 8 },
    scroll: { padding: 14 },
    loadingBox: { alignItems: 'center', marginTop: 60, gap: 12 },
    loadingText: { fontSize: 14 },

    // Fields
    fieldGroup: { gap: 8, marginBottom: 12 },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
    input: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 8, borderWidth: 1, fontSize: 14 },
    textArea: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 8, borderWidth: 1, fontSize: 14, textAlignVertical: 'top', minHeight: 80, marginBottom: 10 },
    iconRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    iconPreview: { width: 46, height: 46, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },

    // Buttons
    saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, gap: 6 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    saveBtnDisabled: { opacity: 0.6 },
    btnRow: { flexDirection: 'row', gap: 8 },

    // Maintenance
    maintenanceCard: { borderRadius: 10, borderWidth: 1.5, padding: 14, marginBottom: 14 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    switchLabel: { fontSize: 14, fontWeight: '700' },
    switchSub: { fontSize: 12, marginTop: 3 },
    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    statChip: { flex: 1, alignItems: 'center', borderRadius: 10, padding: 10, borderWidth: 1, gap: 3 },
    statChipVal: { fontSize: 18, fontWeight: '800' },
    statChipLabel: { fontSize: 10, textAlign: 'center' },

    // Announcement
    previewBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', marginBottom: 10 },
    previewText: { flex: 1, fontSize: 13, fontWeight: '500' },

    // List items (banners)
    listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#00000010' },
    bannerNumBox: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    bannerNum: { fontSize: 12, fontWeight: '800' },
    itemLabel: { fontSize: 13, fontWeight: '600' },
    itemSub: { fontSize: 11, marginTop: 2 },
    delBtn: { padding: 6 },

    // Category chips
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, maxWidth: '48%' },
    categoryChipText: { flex: 1, fontSize: 13, fontWeight: '600' },

    // Empty state
    emptyRow: { alignItems: 'center', paddingVertical: 20, gap: 8 },
    emptyText: { fontSize: 14 },
});

export default AdminCMSScreen;
