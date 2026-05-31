import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const TYPE_COLOR = {
    bug: '#e53935',
    payment: '#FF9800',
    shipping: '#4A90D9',
    product: '#9C27B0',
    account: '#00BCD4',
    other: '#8A9BB0',
};
const TYPE_ICON = {
    bug: 'bug', payment: 'card', shipping: 'cube', product: 'pricetag', account: 'person', other: 'help-circle',
};

const AdminReportsScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('pending');
    const [selected, setSelected] = useState(null);
    const [resolving, setResolving] = useState(false);

    const fetchReports = useCallback(async (f = filter) => {
        try {
            const res = await adminAPI.getReports(f);
            if (res.success) setReports(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    }, [filter]);

    useFocusEffect(useCallback(() => { setLoading(true); fetchReports(filter); }, [filter]));

    const changeFilter = (f) => { setFilter(f); setLoading(true); fetchReports(f); };

    const handleResolve = async () => {
        setResolving(true);
        await adminAPI.resolveReport(selected.id);
        setReports(prev => prev.filter(r => r.id !== selected.id));
        setSelected(null);
        setResolving(false);
    };

    const renderReport = ({ item }) => {
        const type = (item.issue_type || 'other').toLowerCase();
        const color = TYPE_COLOR[type] || TYPE_COLOR.other;
        const icon = TYPE_ICON[type] || 'help-circle';
        return (
            <TouchableOpacity
                style={[styles.card, { borderBottomColor: theme.border }]}
                onPress={() => setSelected(item)}
                activeOpacity={0.75}
            >
                <View style={[styles.cardIcon, { backgroundColor: color + '22' }]}>
                    <Ionicons name={icon} size={20} color={color} />
                </View>
                <View style={styles.cardBody}>
                    <View style={styles.cardTop}>
                        <Text style={[styles.issueType, { color: theme.text }]}>{item.issue_type}</Text>
                        <View style={[styles.badge, { backgroundColor: color + '22' }]}>
                            <Text style={[styles.badgeText, { color }]}>{item.status}</Text>
                        </View>
                    </View>
                    <Text style={[styles.desc, { color: theme.textMuted }]} numberOfLines={2}>{item.description}</Text>
                    <Text style={[styles.reporter, { color: theme.textMuted }]}>
                        {item.reporter_name ? `by ${item.reporter_name}` : 'Anonymous'} · {new Date(item.created_at).toLocaleDateString('en-PH')}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Reports</Text>
                <View style={[styles.countBadge, { backgroundColor: theme.accent + '22' }]}>
                    <Text style={[styles.countText, { color: theme.accent }]}>{reports.length}</Text>
                </View>
            </View>

            <View style={styles.filterRow}>
                {['pending', 'resolved', 'all'].map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.chip, { backgroundColor: theme.inputBg, borderColor: theme.border },
                        filter === f && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                        onPress={() => changeFilter(f)}
                    >
                        <Text style={[styles.chipText, { color: theme.textSecondary }, filter === f && { color: '#fff' }]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={reports}
                    renderItem={renderReport}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchReports(filter); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="flag-outline" size={52} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No {filter} reports</Text>
                        </View>
                    }
                />
            )}

            {/* Detail modal */}
            <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
                <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
                    <View style={[styles.sheet, { backgroundColor: theme.card }]}>
                        <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
                        <Text style={[styles.sheetTitle, { color: theme.text }]}>{selected?.issue_type}</Text>
                        <Text style={[styles.sheetReporter, { color: theme.textMuted }]}>
                            Reported by {selected?.reporter_name || 'Anonymous'} · {selected ? new Date(selected.created_at).toLocaleString('en-PH') : ''}
                        </Text>
                        <ScrollView style={styles.sheetScroll}>
                            <Text style={[styles.sheetDesc, { color: theme.text }]}>{selected?.description}</Text>
                        </ScrollView>
                        {selected?.status === 'pending' && (
                            <TouchableOpacity
                                style={[styles.resolveBtn, { backgroundColor: '#4CAF50' }]}
                                onPress={handleResolve}
                                disabled={resolving}
                            >
                                {resolving ? <ActivityIndicator color="#fff" /> : (
                                    <><Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
                                        <Text style={styles.resolveBtnText}>Mark as Resolved</Text></>
                                )}
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[styles.dismissBtn, { backgroundColor: theme.inputBg }]} onPress={() => setSelected(null)}>
                            <Text style={[styles.dismissText, { color: theme.textSecondary }]}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    backBtn: { padding: 4, marginRight: 12 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
    countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    countText: { fontSize: 13, fontWeight: '700' },
    filterRow: { flexDirection: 'row', padding: 14, gap: 10 },
    chip: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center', borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },
    list: { paddingHorizontal: 16, paddingBottom: 30 },
    card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
    cardIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    cardBody: { flex: 1 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    issueType: { fontSize: 15, fontWeight: '700' },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    desc: { fontSize: 13, lineHeight: 18 },
    reporter: { fontSize: 11, marginTop: 4 },
    emptyBox: { alignItems: 'center', marginTop: 60, gap: 12 },
    emptyText: { fontSize: 15 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
    sheetReporter: { fontSize: 12, marginBottom: 14 },
    sheetScroll: { maxHeight: 160, marginBottom: 16 },
    sheetDesc: { fontSize: 15, lineHeight: 24 },
    resolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14, marginBottom: 10 },
    resolveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    dismissBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    dismissText: { fontWeight: '600', fontSize: 14 },
});

export default AdminReportsScreen;
