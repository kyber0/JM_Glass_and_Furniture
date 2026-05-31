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

const STATUS_COLOR = {
    pending: '#FF9800',
    completed: '#4CAF50',
    rejected: '#e53935',
};

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

const AdminPayoutDetailScreen = ({ route, navigation }) => {
    const { payout: initialPayout } = route.params;
    const [payout, setPayout] = useState(initialPayout);
    const [saving, setSaving] = useState(false);
    const { theme } = useTheme();

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });
    const showAlert = (message, title = 'Info', type = 'info') =>
        setAlertConfig({ visible: true, title, message, type });

    const statusColor = STATUS_COLOR[payout.status] || theme.textMuted;

    const handleApprove = () => {
        Alert.alert(
            'Confirm Payout',
            'Mark this payout as completed? This implies you have already manually transferred the funds.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    onPress: async () => {
                        setSaving(true);
                        try {
                            const res = await adminAPI.approvePayout(payout.payout_id, { status: 'completed' });
                            if (res.success) {
                                setPayout(p => ({ ...p, status: 'completed' }));
                                showAlert('Payout marked as completed!', 'Success', 'success');
                            } else {
                                showAlert(res.message || 'Failed to approve payout', 'Error', 'error');
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
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>Payout Details</Text>
                    <Text style={[styles.headerSub, { color: theme.textMuted }]}>#{payout.payout_id}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColor }]}>{payout.status}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Amount Card */}
                <View style={[styles.amountCard, { backgroundColor: theme.accent + '14', borderColor: theme.accent + '33' }]}>
                    <Text style={[styles.amountLabel, { color: theme.textMuted }]}>Requested Amount</Text>
                    <Text style={[styles.amountValue, { color: theme.accent }]}>
                        ₱{parseFloat(payout.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Text>
                </View>

                {/* Seller / Shop Info */}
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Seller Information</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <InfoRow theme={theme} icon="storefront-outline" label="Shop Name" value={payout.shop_name} />
                    <InfoRow theme={theme} icon="person-outline" label="Account Name" value={payout.account_name} />
                </View>

                {/* Bank Info */}
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Bank / E-Wallet Details</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <InfoRow theme={theme} icon="card-outline" label="Bank / E-Wallet" value={payout.bank_name} />
                    <InfoRow theme={theme} icon="keypad-outline" label="Account Number" value={payout.account_number} />
                </View>

                {/* Timeline */}
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Timeline</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <InfoRow theme={theme} icon="time-outline" label="Requested On"
                        value={new Date(payout.created_at).toLocaleString('en-PH')} />
                    {payout.updated_at && payout.status !== 'pending' && (
                        <InfoRow theme={theme} icon="checkmark-circle-outline" label="Processed On"
                            value={new Date(payout.updated_at).toLocaleString('en-PH')}
                            valueColor={STATUS_COLOR[payout.status]} />
                    )}
                </View>

                {/* Approve Button */}
                {payout.status === 'pending' && (
                    <TouchableOpacity
                        style={[styles.approveBtn, { backgroundColor: theme.accent }, saving && { opacity: 0.6 }]}
                        onPress={handleApprove}
                        disabled={saving}
                    >
                        {saving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <>
                                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                                <Text style={styles.approveBtnText}>Mark as Completed</Text>
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
    statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    statusBadgeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    scroll: { padding: 16 },
    amountCard: {
        borderRadius: 16, padding: 24, alignItems: 'center',
        marginBottom: 22, borderWidth: 1,
    },
    amountLabel: { fontSize: 13, marginBottom: 6 },
    amountValue: { fontSize: 36, fontWeight: '800' },
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
    approveBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: 16, borderRadius: 14, marginBottom: 10,
    },
    approveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default AdminPayoutDetailScreen;
