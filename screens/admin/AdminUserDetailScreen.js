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

const ROLE_COLOR = { buyer: '#4A90D9', seller: '#FF9800', admin: '#9C27B0' };

const InfoRow = ({ icon, label, value, theme, valueColor }) => (
    <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
        <View style={[styles.infoIcon, { backgroundColor: theme.inputBg }]}>
            <Ionicons name={icon} size={16} color={theme.textMuted} />
        </View>
        <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
            <Text style={[styles.infoValue, { color: valueColor || theme.text }]}>{value || '—'}</Text>
        </View>
    </View>
);

const AdminUserDetailScreen = ({ route, navigation }) => {
    const { user: initialUser } = route.params;
    const [user, setUser] = useState(initialUser);
    const [saving, setSaving] = useState(false);
    const { theme } = useTheme();

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });
    const showAlert = (message, title = 'Info', type = 'info') =>
        setAlertConfig({ visible: true, title, message, type });

    const roleColor = ROLE_COLOR[user.role] || theme.accent;
    const isBlocked = !user.is_active;

    const handleToggleStatus = () => {
        const willBlock = !isBlocked;
        Alert.alert(
            willBlock ? 'Block User' : 'Unblock User',
            willBlock
                ? `Are you sure you want to block "${user.full_name}"? They will lose access to the app.`
                : `Are you sure you want to restore access for "${user.full_name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: willBlock ? 'Block' : 'Unblock',
                    style: willBlock ? 'destructive' : 'default',
                    onPress: async () => {
                        setSaving(true);
                        try {
                            const res = await adminAPI.updateUserStatus(user.user_id, willBlock ? 0 : 1);
                            if (res.success) {
                                setUser(u => ({ ...u, is_active: willBlock ? 0 : 1 }));
                                showAlert(
                                    willBlock ? 'User has been blocked.' : 'User has been unblocked.',
                                    'Done', willBlock ? 'warning' : 'success'
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
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>User Details</Text>
                {isBlocked && (
                    <View style={styles.blockedBadge}>
                        <Ionicons name="ban" size={12} color="#e53935" />
                        <Text style={styles.blockedText}>Blocked</Text>
                    </View>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Avatar Hero */}
                <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.avatar, { backgroundColor: roleColor + '22' }]}>
                        <Text style={[styles.avatarLetter, { color: roleColor }]}>
                            {user.full_name?.[0]?.toUpperCase() || '?'}
                        </Text>
                    </View>
                    <Text style={[styles.heroName, { color: theme.text }]}>{user.full_name}</Text>
                    <Text style={[styles.heroEmail, { color: theme.textMuted }]}>{user.email}</Text>
                    <View style={[styles.roleBadge, { backgroundColor: roleColor + '22' }]}>
                        <Text style={[styles.roleText, { color: roleColor }]}>
                            {user.role?.toUpperCase()}
                        </Text>
                    </View>
                </View>

                {/* Info */}
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Account Information</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <InfoRow theme={theme} icon="person-outline" label="Full Name" value={user.full_name} />
                    <InfoRow theme={theme} icon="mail-outline" label="Email" value={user.email} />
                    <InfoRow theme={theme} icon="shield-outline" label="Role" value={user.role} valueColor={roleColor} />
                    {user.shop_name && (
                        <InfoRow theme={theme} icon="storefront-outline" label="Shop" value={user.shop_name} valueColor="#FF9800" />
                    )}
                    <InfoRow theme={theme} icon="calendar-outline" label="Joined"
                        value={user.created_at ? new Date(user.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                    <InfoRow theme={theme} icon="ellipse-outline" label="Status"
                        value={isBlocked ? 'Blocked' : 'Active'}
                        valueColor={isBlocked ? '#e53935' : '#4CAF50'} />
                </View>

                {/* Action */}
                <TouchableOpacity
                    style={[
                        styles.actionBtn,
                        { backgroundColor: isBlocked ? '#4CAF5022' : '#e5393520', borderColor: isBlocked ? '#4CAF50' : '#e53935' },
                        saving && { opacity: 0.6 }
                    ]}
                    onPress={handleToggleStatus}
                    disabled={saving}
                >
                    {saving
                        ? <ActivityIndicator size="small" color={isBlocked ? '#4CAF50' : '#e53935'} />
                        : <>
                            <Ionicons
                                name={isBlocked ? 'checkmark-circle-outline' : 'ban'}
                                size={20} color={isBlocked ? '#4CAF50' : '#e53935'}
                            />
                            <View>
                                <Text style={[styles.actionBtnText, { color: isBlocked ? '#4CAF50' : '#e53935' }]}>
                                    {isBlocked ? 'Unblock User' : 'Block User'}
                                </Text>
                                <Text style={[styles.actionBtnSub, { color: theme.textMuted }]}>
                                    {isBlocked ? 'Restore access to the app' : 'Prevent this user from accessing the app'}
                                </Text>
                            </View>
                        </>
                    }
                </TouchableOpacity>

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
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
    blockedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#e5393520', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
    },
    blockedText: { fontSize: 11, color: '#e53935', fontWeight: '700' },
    scroll: { padding: 16 },
    heroCard: {
        borderRadius: 16, padding: 24, alignItems: 'center',
        marginBottom: 22, borderWidth: 1, gap: 8,
    },
    avatar: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    avatarLetter: { fontSize: 30, fontWeight: '800' },
    heroName: { fontSize: 20, fontWeight: '700' },
    heroEmail: { fontSize: 13 },
    roleBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginTop: 4 },
    roleText: { fontSize: 12, fontWeight: '700' },
    sectionTitle: {
        fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: 0.8, marginBottom: 8, marginLeft: 2,
    },
    card: { borderRadius: 14, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
    infoRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1,
    },
    infoIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
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

export default AdminUserDetailScreen;
