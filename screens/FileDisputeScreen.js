import React, { useState } from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity,
    ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { disputesAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const REASONS = [
    { label: 'Item not received',      icon: 'cube-outline' },
    { label: 'Wrong item delivered',   icon: 'swap-horizontal-outline' },
    { label: 'Damaged item',           icon: 'warning-outline' },
    { label: 'Quality issue',          icon: 'thumbs-down-outline' },
    { label: 'Other',                  icon: 'ellipsis-horizontal-circle-outline' },
];

const FileDisputeScreen = ({ route, navigation }) => {
    const { order } = route.params;
    const { user } = useAuth();
    const { theme } = useTheme();

    const [reason, setReason]           = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting]   = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'info', onConfirm: null,
    });

    const showAlert = (title, message, type = 'info', onConfirm = null) =>
        setAlertConfig({ visible: true, title, message, type, onConfirm });
    const hideAlert = () =>
        setAlertConfig(prev => ({ ...prev, visible: false }));

    const handleSubmit = async () => {
        if (!reason) {
            showAlert('Select a Reason', 'Please select a reason for your dispute.', 'warning');
            return;
        }
        if (description.trim().length < 20) {
            showAlert('Description Too Short', 'Please describe the issue in at least 20 characters.', 'warning');
            return;
        }

        setSubmitting(true);
        try {
            const res = await disputesAPI.fileDispute({
                order_id:    order.order_id,
                user_id:     user.id || user.user_id,
                reason,
                description: description.trim(),
            });

            if (res.success) {
                showAlert(
                    '✅ Dispute Filed',
                    'Your dispute has been submitted. Our team will review it and contact you shortly.',
                    'success',
                    () => navigation.goBack()
                );
            } else {
                showAlert('Error', res.message || 'Failed to file dispute.', 'error');
            }
        } catch (e) {
            showAlert('Error', 'An unexpected error occurred. Please try again.', 'error');
            console.error('File dispute error:', e);
        } finally {
            setSubmitting(false);
        }
    };

    const formatCurrency = (v) => `₱${parseFloat(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>File a Dispute</Text>
                <View style={{ width: 32 }} />
            </View>

            <KeyboardAwareWrapper>
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                    {/* Order info banner */}
                    <View style={[styles.orderBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={[styles.orderBannerIcon, { backgroundColor: theme.accentBg || '#efebe9' }]}>
                            <Ionicons name="receipt-outline" size={22} color={theme.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.orderBannerTitle, { color: theme.text }]}>Order #JM-{order.order_id}</Text>
                            <Text style={[styles.orderBannerSub, { color: theme.textMuted }]}>
                                {formatCurrency(order.total_amount)} · Completed
                            </Text>
                        </View>
                    </View>

                    {/* Info note */}
                    <View style={[styles.infoBox, { backgroundColor: '#FFF3E0', borderColor: '#FF9800' }]}>
                        <Ionicons name="information-circle-outline" size={18} color="#FF9800" />
                        <Text style={styles.infoText}>
                            Disputes are reviewed by our admin team within 24–48 hours. Please provide as much detail as possible.
                        </Text>
                    </View>

                    {/* Reason picker */}
                    <Text style={[styles.sectionLabel, { color: theme.text }]}>What's the issue?</Text>
                    <View style={styles.reasonGrid}>
                        {REASONS.map((r) => {
                            const selected = reason === r.label;
                            return (
                                <TouchableOpacity
                                    key={r.label}
                                    style={[
                                        styles.reasonChip,
                                        {
                                            backgroundColor: selected ? (theme.accentBg || '#efebe9') : theme.card,
                                            borderColor:     selected ? theme.accent : theme.border,
                                        },
                                    ]}
                                    onPress={() => setReason(r.label)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons
                                        name={r.icon}
                                        size={18}
                                        color={selected ? theme.accent : theme.textMuted}
                                        style={{ marginBottom: 6 }}
                                    />
                                    <Text
                                        style={[
                                            styles.reasonChipText,
                                            { color: selected ? theme.accent : theme.textSecondary },
                                            selected && { fontWeight: '700' },
                                        ]}
                                        numberOfLines={2}
                                    >
                                        {r.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Description */}
                    <Text style={[styles.sectionLabel, { color: theme.text }]}>Describe the problem</Text>
                    <View style={[styles.inputWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <TextInput
                            style={[styles.textArea, { color: theme.text }]}
                            placeholder="Provide details about what went wrong (min. 20 characters)..."
                            placeholderTextColor={theme.textMuted}
                            multiline
                            numberOfLines={6}
                            textAlignVertical="top"
                            value={description}
                            onChangeText={setDescription}
                            maxLength={1000}
                        />
                        <Text style={[styles.charCount, { color: theme.textMuted }]}>{description.length}/1000</Text>
                    </View>

                    {/* Submit */}
                    <TouchableOpacity
                        style={[
                            styles.submitBtn,
                            { backgroundColor: reason && description.trim().length >= 20 ? '#B71C1C' : theme.border },
                        ]}
                        onPress={handleSubmit}
                        disabled={submitting}
                        activeOpacity={0.85}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="alert-circle-outline" size={18} color="#fff" />
                                <Text style={styles.submitBtnText}>Submit Dispute</Text>
                            </>
                        )}
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAwareWrapper>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={hideAlert}
                onConfirm={() => { hideAlert(); alertConfig.onConfirm?.(); }}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1,
    },
    headerBtn:   { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700' },

    scroll: { padding: 18, paddingBottom: 40 },

    orderBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16,
    },
    orderBannerIcon: {
        width: 46, height: 46, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
    },
    orderBannerTitle: { fontSize: 15, fontWeight: '700' },
    orderBannerSub:   { fontSize: 12, marginTop: 2 },

    infoBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 22,
    },
    infoText: { flex: 1, fontSize: 13, color: '#E65100', lineHeight: 18 },

    sectionLabel: { fontSize: 15, fontWeight: '700', marginBottom: 12 },

    reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
    reasonChip: {
        width: '30%', minWidth: 90, paddingVertical: 12, paddingHorizontal: 8,
        borderRadius: 12, borderWidth: 1.5,
        alignItems: 'center', justifyContent: 'center',
    },
    reasonChipText: { fontSize: 12, textAlign: 'center', lineHeight: 16 },

    inputWrap: {
        borderRadius: 12, borderWidth: 1,
        marginBottom: 24, overflow: 'hidden',
    },
    textArea: { padding: 14, fontSize: 14, minHeight: 140 },
    charCount: { fontSize: 11, textAlign: 'right', paddingRight: 12, paddingBottom: 8 },

    submitBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 16, borderRadius: 14,
    },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default FileDisputeScreen;
