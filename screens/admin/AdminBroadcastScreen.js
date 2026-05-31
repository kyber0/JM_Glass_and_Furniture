import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity,
    ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGETS = [
    { key: 'all', label: 'All Users', icon: 'people', color: '#4A90D9' },
    { key: 'buyers', label: 'Buyers Only', icon: 'cart', color: '#4CAF50' },
    { key: 'sellers', label: 'Sellers Only', icon: 'storefront', color: '#FF9800' },
];

const TEMPLATES = [
    {
        label: '🎉 Promo', title: '🎉 Limited-Time Promo!', body: 'Don\'t miss our exclusive deals today.Shop now and save big!'
    },
    { label: '📦 Shipping', title: '📦 Shipping Update', body: 'Delivery times may be slightly extended due to high demand. Thank you for your patience!' },
    { label: '🛠 Maintain', title: '🛠 Scheduled Maintenance', body: 'Our platform will be briefly unavailable for maintenance. We apologize for the inconvenience.' },
    { label: '🔔 New!', title: '🔔 New Feature Available!', body: 'We just launched a new feature to improve your experience. Check it out now!' },
];

// ─── Component ────────────────────────────────────────────────────────────────

const AdminBroadcastScreen = ({ navigation }) => {
    const { theme } = useTheme();

    // Broadcast state
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [target, setTarget] = useState('all');
    const [sending, setSending] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [result, setResult] = useState(null); // { ok: bool, text: str }

    // Announcement state
    const [annoText, setAnnoText] = useState('');
    const [currentAnno, setCurrentAnno] = useState(null);
    const [savingAnno, setSavingAnno] = useState(false);
    const [annoSaved, setAnnoSaved] = useState(false);

    // ── Fetch ──────────────────────────────────────────────────────────────────
    const fetchAnnouncement = useCallback(async () => {
        const res = await adminAPI.getAnnouncement();
        if (res.success) {
            setCurrentAnno(res.announcement);
            setAnnoText(res.announcement || '');
        }
    }, []);

    useFocusEffect(useCallback(() => { fetchAnnouncement(); }, [fetchAnnouncement]));

    // ── Handlers ───────────────────────────────────────────────────────────────
    const handleSend = async () => {
        if (!title.trim() || !message.trim()) return;
        setSending(true);
        setConfirm(false);
        const res = await adminAPI.broadcast(title.trim(), message.trim(), target);
        setSending(false);
        if (res.success) {
            setResult({ ok: true, text: `Sent to ${res.sent} user${res.sent !== 1 ? 's' : ''}!` });
            setTitle(''); setMessage('');
        } else {
            setResult({ ok: false, text: 'Failed to send. Try again.' });
        }
    };

    const handleSaveAnno = async () => {
        setSavingAnno(true);
        if (annoText.trim()) {
            await adminAPI.setAnnouncement(annoText.trim());
            setCurrentAnno(annoText.trim());
        } else {
            await adminAPI.deleteAnnouncement();
            setCurrentAnno(null);
        }
        setSavingAnno(false);
        setAnnoSaved(true);
        setTimeout(() => setAnnoSaved(false), 2500);
    };

    const applyTemplate = (t) => {
        setTitle(t.title);
        setMessage(t.body);
        setResult(null);
    };

    const selectedTarget = TARGETS.find(t => t.key === target);
    const canSend = title.trim().length > 0 && message.trim().length > 0;

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Communications</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ════════════════════════════════════════════════════════════
                    SECTION 1 – Announcement Banner
                ════════════════════════════════════════════════════════════ */}
                <View style={styles.sectionHead}>
                    <View style={[styles.sectionIcon, { backgroundColor: '#FF980022' }]}>
                        <Ionicons name="megaphone" size={16} color="#FF9800" />
                    </View>
                    <View>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Announcement Banner</Text>
                        <Text style={[styles.sectionSub, { color: theme.textMuted }]}>Shown as a dismissible banner on the Home screen</Text>
                    </View>
                </View>

                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {/* Live preview of current announcement */}
                    {currentAnno ? (
                        <View style={[styles.annoPreview, { backgroundColor: '#FF980015', borderColor: '#FF980044' }]}>
                            <Ionicons name="megaphone" size={14} color="#FF9800" />
                            <Text style={[styles.annoPreviewText, { color: '#FF9800' }]} numberOfLines={2}>
                                {currentAnno}
                            </Text>
                            <TouchableOpacity onPress={() => { setAnnoText(''); }} style={styles.annoClose}>
                                <Ionicons name="close-circle" size={16} color="#FF9800" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={[styles.annoPreview, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                            <Ionicons name="megaphone-outline" size={14} color={theme.textMuted} />
                            <Text style={[styles.annoPreviewText, { color: theme.textMuted }]}>No active announcement</Text>
                        </View>
                    )}

                    <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                        placeholder="Write announcement... (empty = clear)"
                        placeholderTextColor={theme.textMuted}
                        value={annoText}
                        onChangeText={t => { setAnnoText(t); setAnnoSaved(false); }}
                        multiline
                    />

                    {/* Save button + inline success */}
                    {annoSaved ? (
                        <View style={[styles.resultBanner, { backgroundColor: '#4CAF5022', borderColor: '#4CAF5066' }]}>
                            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                            <Text style={[styles.resultBannerText, { color: '#4CAF50' }]}>
                                {annoText.trim() ? 'Announcement saved!' : 'Announcement cleared!'}
                            </Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.primaryBtn, { backgroundColor: '#FF9800' }, savingAnno && styles.disabled]}
                            onPress={handleSaveAnno}
                            disabled={savingAnno}
                        >
                            {savingAnno
                                ? <ActivityIndicator color="#fff" />
                                : <>
                                    <Ionicons name={annoText.trim() ? 'save-outline' : 'trash-outline'} size={17} color="#fff" />
                                    <Text style={styles.primaryBtnText}>
                                        {annoText.trim() ? 'Save Announcement' : 'Clear Announcement'}
                                    </Text>
                                </>
                            }
                        </TouchableOpacity>
                    )}
                </View>

                {/* ════════════════════════════════════════════════════════════
                    SECTION 2 – Broadcast Notification
                ════════════════════════════════════════════════════════════ */}
                <View style={styles.sectionHead}>
                    <View style={[styles.sectionIcon, { backgroundColor: '#4A90D922' }]}>
                        <Ionicons name="notifications" size={16} color="#4A90D9" />
                    </View>
                    <View>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Broadcast Notification</Text>
                        <Text style={[styles.sectionSub, { color: theme.textMuted }]}>Push a notification to users</Text>
                    </View>
                </View>

                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>

                    {/* Audience Selector */}
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Audience</Text>
                    <View style={styles.targetRow}>
                        {TARGETS.map(t => {
                            const active = target === t.key;
                            return (
                                <TouchableOpacity
                                    key={t.key}
                                    style={[
                                        styles.targetChip,
                                        { borderColor: theme.border, backgroundColor: theme.inputBg },
                                        active && { backgroundColor: t.color + '22', borderColor: t.color }
                                    ]}
                                    onPress={() => setTarget(t.key)}
                                >
                                    <Ionicons name={t.icon} size={15} color={active ? t.color : theme.textMuted} />
                                    <Text style={[styles.targetText, { color: active ? t.color : theme.textSecondary }]}>
                                        {t.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Quick Templates */}
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Quick Templates</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateScroll} contentContainerStyle={{ gap: 8 }}>
                        {TEMPLATES.map(tpl => (
                            <TouchableOpacity
                                key={tpl.label}
                                style={[styles.templateChip, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
                                onPress={() => applyTemplate(tpl)}
                            >
                                <Text style={[styles.templateChipText, { color: theme.textSecondary }]}>{tpl.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Title */}
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Notification Title</Text>
                    <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                        placeholder="e.g. 🎉 Special Promo Today!"
                        placeholderTextColor={theme.textMuted}
                        value={title}
                        onChangeText={t => { setTitle(t); setResult(null); }}
                        maxLength={80}
                    />
                    <Text style={[styles.charCount, { color: theme.textMuted }]}>{title.length}/80</Text>

                    {/* Message */}
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Message</Text>
                    <TextInput
                        style={[styles.input, styles.messageInput, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                        placeholder="Write your notification message here..."
                        placeholderTextColor={theme.textMuted}
                        value={message}
                        onChangeText={t => { setMessage(t); setResult(null); }}
                        multiline
                        maxLength={300}
                    />
                    <Text style={[styles.charCount, { color: theme.textMuted }]}>{message.length}/300</Text>

                    {/* Notification Preview */}
                    {(title.trim() || message.trim()) && (
                        <View style={[styles.preview, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                            <Text style={[styles.previewLabel, { color: theme.textMuted }]}>Preview</Text>
                            <View style={[styles.previewCard, { backgroundColor: theme.card, borderColor: selectedTarget?.color + '55' }]}>
                                <View style={styles.previewTop}>
                                    <Ionicons name="notifications" size={14} color={selectedTarget?.color || theme.accent} />
                                    <Text style={[styles.previewApp, { color: selectedTarget?.color || theme.accent }]}>JM Glass & Furniture</Text>
                                    <Text style={[styles.previewTime, { color: theme.textMuted }]}>now</Text>
                                </View>
                                <Text style={[styles.previewTitle, { color: theme.text }]} numberOfLines={1}>
                                    {title || 'Notification title...'}
                                </Text>
                                <Text style={[styles.previewBody, { color: theme.textSecondary }]} numberOfLines={2}>
                                    {message || 'Message body...'}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Result Banner */}
                    {result && (
                        <View style={[styles.resultBanner, {
                            backgroundColor: result.ok ? '#4CAF5022' : '#e5393522',
                            borderColor: result.ok ? '#4CAF5066' : '#e5393566'
                        }]}>
                            <Ionicons name={result.ok ? 'checkmark-circle' : 'close-circle'} size={16} color={result.ok ? '#4CAF50' : '#e53935'} />
                            <Text style={[styles.resultBannerText, { color: result.ok ? '#4CAF50' : '#e53935' }]}>
                                {result.text}
                            </Text>
                        </View>
                    )}

                    {/* Send Button */}
                    <TouchableOpacity
                        style={[
                            styles.primaryBtn,
                            { backgroundColor: selectedTarget?.color || theme.accent },
                            (!canSend || sending) && styles.disabled
                        ]}
                        onPress={() => setConfirm(true)}
                        disabled={!canSend || sending}
                    >
                        {sending
                            ? <ActivityIndicator color="#fff" />
                            : <>
                                <Ionicons name="send" size={17} color="#fff" />
                                <Text style={styles.primaryBtnText}>Send to {selectedTarget?.label}</Text>
                            </>
                        }
                    </TouchableOpacity>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* ── Confirm Modal ───────────────────────────────────────────────── */}
            <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
                <View style={styles.overlay}>
                    <View style={[styles.confirmBox, { backgroundColor: theme.card }]}>
                        <View style={[styles.confirmIconWrap, { backgroundColor: (selectedTarget?.color || theme.accent) + '22' }]}>
                            <Ionicons name="megaphone" size={32} color={selectedTarget?.color || theme.accent} />
                        </View>
                        <Text style={[styles.confirmTitle, { color: theme.text }]}>Send Broadcast?</Text>
                        <Text style={[styles.confirmSub, { color: theme.textMuted }]}>
                            This will push a notification to{' '}
                            <Text style={{ fontWeight: '700', color: selectedTarget?.color }}>{selectedTarget?.label}</Text>.
                        </Text>
                        <View style={[styles.confirmPreview, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                            <Text style={[styles.confirmPreviewTitle, { color: theme.text }]}>{title}</Text>
                            <Text style={[styles.confirmPreviewBody, { color: theme.textSecondary }]} numberOfLines={3}>{message}</Text>
                        </View>
                        <View style={styles.confirmBtns}>
                            <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: theme.inputBg }]} onPress={() => setConfirm(false)}>
                                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.confirmSendBtn, { backgroundColor: selectedTarget?.color || theme.accent }]}
                                onPress={handleSend}
                            >
                                <Ionicons name="send" size={15} color="#fff" />
                                <Text style={styles.primaryBtnText}>Send Now</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
    backBtn: { padding: 2 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },

    scroll: { padding: 16, paddingBottom: 40 },

    // Section Header
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, marginTop: 8 },
    sectionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    sectionTitle: { fontSize: 15, fontWeight: '700' },
    sectionSub: { fontSize: 12, marginTop: 1 },

    // Card
    card: { borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, gap: 12 },

    // Announcement Preview
    annoPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
    annoPreviewText: { flex: 1, fontSize: 13, fontWeight: '600' },
    annoClose: { padding: 2 },

    // Inputs
    fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    input: { borderRadius: 10, padding: 13, fontSize: 14, borderWidth: 1 },
    messageInput: { minHeight: 100, textAlignVertical: 'top' },
    charCount: { fontSize: 11, textAlign: 'right', marginTop: -6 },

    // Audience
    targetRow: { flexDirection: 'row', gap: 8 },
    targetChip: { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 4, borderRadius: 12, paddingVertical: 10, borderWidth: 1.5 },
    targetText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

    // Templates
    templateScroll: { marginBottom: 4 },
    templateChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
    templateChipText: { fontSize: 12, fontWeight: '600' },

    // Preview
    preview: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
    previewLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    previewCard: { borderRadius: 10, borderWidth: 1, borderLeftWidth: 4, padding: 12, gap: 3 },
    previewTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    previewApp: { fontSize: 11, fontWeight: '700', flex: 1 },
    previewTime: { fontSize: 10 },
    previewTitle: { fontSize: 13, fontWeight: '700' },
    previewBody: { fontSize: 12 },

    // Result Banner
    resultBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
    resultBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },

    // Buttons
    primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    disabled: { opacity: 0.45 },

    // Modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    confirmBox: { borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 },
    confirmIconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    confirmTitle: { fontSize: 18, fontWeight: '800' },
    confirmSub: { fontSize: 14, textAlign: 'center' },
    confirmPreview: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
    confirmPreviewTitle: { fontSize: 14, fontWeight: '700' },
    confirmPreviewBody: { fontSize: 13 },
    confirmBtns: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
    cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
    cancelText: { fontWeight: '700', fontSize: 14 },
    confirmSendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
});

export default AdminBroadcastScreen;
