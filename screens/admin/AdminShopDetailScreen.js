import React, { useState } from 'react';
import {
    StyleSheet, Text, View, ScrollView,
    TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import CustomAlert from '../../components/CustomAlert';

const STATUS_META = {
    active: { label: 'Active', color: '#4CAF50', icon: 'checkmark-circle' },
    pending: { label: 'Pending', color: '#FF9800', icon: 'time' },
    banned: { label: 'Banned', color: '#e53935', icon: 'ban' },
    rejected: { label: 'Rejected', color: '#9E9E9E', icon: 'close-circle' },
};

const ACCENT_COLORS = ['#6C63FF', '#FF6584', '#43C6AC', '#F7971E', '#2196F3', '#E91E63'];
const avatarColor = (id) => ACCENT_COLORS[id % ACCENT_COLORS.length];
const initials = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const InfoRow = ({ icon, label, value, theme, valueColor, multiline }) => (
    <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
        <View style={[styles.infoIcon, { backgroundColor: theme.inputBg }]}>
            <Ionicons name={icon} size={16} color={theme.textMuted} />
        </View>
        <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
            <Text style={[styles.infoValue, { color: valueColor || theme.text }]}
                numberOfLines={multiline ? 4 : 1}>{value || '—'}</Text>
        </View>
    </View>
);

const AdminShopDetailScreen = ({ route, navigation }) => {
    const { shop: initialShop } = route.params;
    const [shop, setShop] = useState(initialShop);
    const [saving, setSaving] = useState(false);
    const { theme } = useTheme();

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });
    const showAlert = (message, title = 'Info', type = 'info') =>
        setAlertConfig({ visible: true, title, message, type });

    const meta = STATUS_META[shop.status] || STATUS_META.pending;
    const isActive = shop.status === 'active';
    const isBanned = shop.status === 'banned';
    const canToggle = isActive || isBanned;
    const color = avatarColor(shop.shop_id);

    const handleToggle = () => {
        const willBan = isActive;
        Alert.alert(
            willBan ? 'Ban Shop' : 'Restore Shop',
            willBan
                ? `Are you sure you want to ban "${shop.shop_name}"? The seller's products will be hidden.`
                : `Are you sure you want to restore "${shop.shop_name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: willBan ? 'Ban' : 'Restore',
                    style: willBan ? 'destructive' : 'default',
                    onPress: async () => {
                        setSaving(true);
                        try {
                            const newStatus = willBan ? 'banned' : 'active';
                            const res = await adminAPI.updateShopStatus(shop.shop_id, newStatus);
                            if (res.success) {
                                setShop(s => ({ ...s, status: newStatus }));
                                showAlert(
                                    willBan ? 'Shop has been banned.' : 'Shop has been restored.',
                                    'Done', willBan ? 'warning' : 'success'
                                );
                            } else {
                                showAlert(res.message || 'Failed', 'Error', 'error');
                            }
                        } catch {
                            showAlert('Server error', 'Error', 'error');
                        } finally {
                            setSaving(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>Shop Details</Text>
                    <Text style={[styles.headerSub, { color: theme.textMuted }]}>{shop.shop_name}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: meta.color + '22' }]}>
                    <Ionicons name={meta.icon} size={12} color={meta.color} />
                    <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Avatar Hero */}
                <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.avatar, { backgroundColor: color }]}>
                        <Text style={styles.avatarText}>{initials(shop.shop_name)}</Text>
                    </View>
                    <Text style={[styles.heroName, { color: theme.text }]}>{shop.shop_name}</Text>
                    <Text style={[styles.heroSub, { color: theme.textMuted }]}>Owned by {shop.owner_name}</Text>
                </View>

                {/* Shop Info */}
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Shop Information</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <InfoRow theme={theme} icon="storefront-outline" label="Shop Name" value={shop.shop_name} />
                    <InfoRow theme={theme} icon="location-outline" label="Address" value={shop.address} multiline />
                    <InfoRow theme={theme} icon="card-outline" label="TIN Number" value={shop.tin_number} />
                    <InfoRow theme={theme} icon="calendar-outline" label="Registered"
                        value={shop.created_at ? new Date(shop.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                    <InfoRow theme={theme} icon="ellipse-outline" label="Status" value={meta.label} valueColor={meta.color} />
                </View>

                {/* Owner Info */}
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Owner Information</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <InfoRow theme={theme} icon="person-outline" label="Owner Name" value={shop.owner_name} />
                    <InfoRow theme={theme} icon="mail-outline" label="Owner Email" value={shop.owner_email} />
                </View>

                {/* Action */}
                {canToggle && (
                    <TouchableOpacity
                        style={[
                            styles.actionBtn,
                            { backgroundColor: isActive ? '#e5393520' : '#4CAF5022', borderColor: isActive ? '#e53935' : '#4CAF50' },
                            saving && { opacity: 0.6 },
                        ]}
                        onPress={handleToggle}
                        disabled={saving}
                    >
                        {saving
                            ? <ActivityIndicator size="small" color={isActive ? '#e53935' : '#4CAF50'} />
                            : <>
                                <Ionicons
                                    name={isActive ? 'ban' : 'checkmark-circle-outline'}
                                    size={20} color={isActive ? '#e53935' : '#4CAF50'}
                                />
                                <View>
                                    <Text style={[styles.actionBtnText, { color: isActive ? '#e53935' : '#4CAF50' }]}>
                                        {isActive ? 'Ban Shop' : 'Restore Shop'}
                                    </Text>
                                    <Text style={[styles.actionBtnSub, { color: theme.textMuted }]}>
                                        {isActive
                                            ? 'Products will be hidden from buyers'
                                            : 'Restore shop visibility and seller access'}
                                    </Text>
                                </View>
                            </>
                        }
                    </TouchableOpacity>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <CustomAlert
                visible={alertConfig.visible} title={alertConfig.title}
                message={alertConfig.message} type={alertConfig.type}
                onClose={() => setAlertConfig(a => ({ ...a, visible: false }))}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
    },
    backBtn: { padding: 2 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    headerSub: { fontSize: 12, marginTop: 1 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    statusBadgeText: { fontSize: 11, fontWeight: '700' },
    scroll: { padding: 16 },
    heroCard: {
        borderRadius: 16, padding: 24, alignItems: 'center',
        marginBottom: 22, borderWidth: 1, gap: 6,
    },
    avatar: { width: 72, height: 72, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
    heroName: { fontSize: 20, fontWeight: '700' },
    heroSub: { fontSize: 13 },
    sectionTitle: {
        fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: 0.8, marginBottom: 8, marginLeft: 2,
    },
    card: { borderRadius: 14, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
    infoRow: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1,
    },
    infoIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
    infoContent: { flex: 1 },
    infoLabel: { fontSize: 11, marginBottom: 2 },
    infoValue: { fontSize: 14, fontWeight: '600' },
    actionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 10,
    },
    actionBtnText: { fontSize: 15, fontWeight: '700' },
    actionBtnSub: { fontSize: 12, marginTop: 2 },
});

export default AdminShopDetailScreen;
