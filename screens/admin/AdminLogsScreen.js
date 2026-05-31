import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, ActivityIndicator,
    RefreshControl, TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
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
    'default': { icon: 'hardware-chip', color: '#78909c' }
};

const AdminLogsScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchLogs = useCallback(async () => {
        try {
            const res = await adminAPI.getLogs(100); // Fetch latest 100
            if (res.success) setLogs(res.data);
        } catch (e) {
            console.error('Failed to load logs', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchLogs(); }, [fetchLogs]));

    const renderItem = ({ item }) => {
        const config = ACTION_ICONS[item.action] || ACTION_ICONS['default'];

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => navigation.navigate('AdminLogDetail', { log: item })}
                activeOpacity={0.8}
            >
                <View style={[styles.iconBox, { backgroundColor: config.color + '22' }]}>
                    <Ionicons name={config.icon} size={22} color={config.color} />
                </View>
                <View style={styles.contentBox}>
                    <Text style={[styles.message, { color: theme.text }]} numberOfLines={2}>
                        {item.details || 'System log recorded.'}
                    </Text>
                    <View style={styles.metaRow}>
                        <Text style={[styles.adminName, { color: theme.textSecondary }]}>
                            By {item.full_name || item.email || 'System Admin'}
                        </Text>
                        <Text style={[styles.date, { color: theme.textMuted }]}>
                            {new Date(item.created_at).toLocaleString('en-PH', {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                        </Text>
                    </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>System Activity Logs</Text>
                    <Text style={[styles.headerSub, { color: theme.textSecondary }]}>Audit Trail</Text>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={logs}
                    renderItem={renderItem}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLogs(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="list-outline" size={52} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No system logs recorded yet.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backButton: { marginRight: 15 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    headerSub: { fontSize: 13, marginTop: 2 },
    list: { padding: 16, gap: 12, paddingBottom: 40 },
    card: { flexDirection: 'row', padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 14 },
    iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    contentBox: { flex: 1 },
    message: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' },
    adminName: { fontSize: 12, fontWeight: '600' },
    date: { fontSize: 11 },
    emptyBox: { alignItems: 'center', marginTop: 100 },
    emptyText: { marginTop: 12, fontSize: 15 }
});

export default AdminLogsScreen;
