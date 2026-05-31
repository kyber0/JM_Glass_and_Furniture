import React from 'react';
import {
    StyleSheet, Text, View, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

const ACTION_ICONS = {
    'product_hidden': { icon: 'eye-off', color: '#FF9800' },
    'product_shown': { icon: 'eye', color: '#4CAF50' },
    'report_resolved': { icon: 'shield-checkmark', color: '#00BCD4' },
    'shop_approved': { icon: 'checkmark-circle', color: '#4CAF50' },
    'shop_rejected': { icon: 'close-circle', color: '#e53935' },
    'user_blocked': { icon: 'ban', color: '#e53935' },
    'user_unblocked': { icon: 'person-add', color: '#4A90D9' },
    'broadcast_sent': { icon: 'megaphone', color: '#9C27B0' },
    'announcement_updated': { icon: 'alert-circle', color: '#FF9800' },
    'announcement_deleted': { icon: 'trash', color: '#e53935' },
    'payout_processed': { icon: 'wallet', color: '#8BC34A' },
    'dispute_resolved': { icon: 'shield-half', color: '#E91E63' },
    'voucher_created': { icon: 'ticket', color: '#673AB7' },
    'voucher_toggled': { icon: 'options', color: '#FF9800' },
    'voucher_deleted': { icon: 'trash', color: '#e53935' },
    'cms_banner_added': { icon: 'image', color: '#4A90D9' },
    'cms_banner_deleted': { icon: 'trash', color: '#e53935' },
    'cms_category_added': { icon: 'grid', color: '#4A90D9' },
    'cms_category_deleted': { icon: 'trash', color: '#e53935' },
    'account_activated': { icon: 'checkmark-circle', color: '#4CAF50' },
    'account_deactivated': { icon: 'ban', color: '#e53935' },
    'default': { icon: 'hardware-chip', color: '#78909c' },
};

// Prettify raw action key => human-readable label
const formatAction = (action = '') =>
    action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const InfoRow = ({ icon, label, value, theme, valueColor, multiline }) => (
    <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
        <View style={[styles.infoIcon, { backgroundColor: theme.inputBg }]}>
            <Ionicons name={icon} size={16} color={theme.textMuted} />
        </View>
        <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
            <Text
                style={[styles.infoValue, { color: valueColor || theme.text }]}
                numberOfLines={multiline ? 10 : 1}
            >
                {value || '—'}
            </Text>
        </View>
    </View>
);

const AdminLogDetailScreen = ({ route, navigation }) => {
    const { log } = route.params;
    const { theme } = useTheme();

    const config = ACTION_ICONS[log.action] || ACTION_ICONS['default'];
    const actionLabel = formatAction(log.action);
    const performer = log.full_name || log.email || 'System Admin';

    const fullDate = log.created_at
        ? new Date(log.created_at).toLocaleString('en-PH', {
            weekday: 'short', year: 'numeric', month: 'long',
            day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
        : '—';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>Log Entry</Text>
                    <Text style={[styles.headerSub, { color: theme.textMuted }]}>#{log.id}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Action Hero */}
                <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.iconCircle, { backgroundColor: config.color + '22' }]}>
                        <Ionicons name={config.icon} size={34} color={config.color} />
                    </View>
                    <View style={[styles.actionBadge, { backgroundColor: config.color + '18' }]}>
                        <Text style={[styles.actionBadgeText, { color: config.color }]}>
                            {actionLabel}
                        </Text>
                    </View>
                    <Text style={[styles.heroDetails, { color: theme.textSecondary }]}>
                        {log.details || 'No additional details recorded.'}
                    </Text>
                </View>

                {/* Details */}
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Log Details</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <InfoRow theme={theme} icon="flash-outline" label="Action Type" value={actionLabel} valueColor={config.color} />
                    <InfoRow theme={theme} icon="document-text-outline" label="Full Details" value={log.details || 'No additional details recorded.'} multiline />
                </View>

                {/* Performer */}
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Performed By</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <InfoRow theme={theme} icon="person-outline" label="Admin / User" value={performer} />
                    {log.email && log.full_name && (
                        <InfoRow theme={theme} icon="mail-outline" label="Email" value={log.email} />
                    )}
                </View>

                {/* Timestamp */}
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Timestamp</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <InfoRow theme={theme} icon="calendar-outline" label="Date & Time" value={fullDate} multiline />
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
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
    scroll: { padding: 16 },
    heroCard: {
        borderRadius: 16, padding: 24, alignItems: 'center',
        marginBottom: 22, borderWidth: 1, gap: 12,
    },
    iconCircle: {
        width: 72, height: 72, borderRadius: 36,
        justifyContent: 'center', alignItems: 'center',
    },
    actionBadge: {
        paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    },
    actionBadgeText: { fontSize: 13, fontWeight: '700' },
    heroDetails: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
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
    infoValue: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
});

export default AdminLogDetailScreen;
