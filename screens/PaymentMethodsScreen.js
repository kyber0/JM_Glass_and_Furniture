import React, { useState, useEffect, useCallback } from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity,
    FlatList, ActivityIndicator, Modal,
    Platform, ScrollView,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../components/CustomAlert';
import { useAuth } from '../context/AuthContext';
import { paymentMethodsAPI } from '../services/api';

const TYPES = [
    { id: 'cod', label: 'Cash on Delivery', icon: 'cash-outline' },
    { id: 'gcash', label: 'GCash', icon: 'phone-portrait-outline' },
    { id: 'bank', label: 'Bank Transfer', icon: 'card-outline' },
];

const defaultForm = { type: 'gcash', label: '', account_name: '', account_number: '' };

const PaymentMethodsScreen = ({ navigation }) => {
    const { user } = useAuth();
    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingMethod, setEditingMethod] = useState(null);
    const [form, setForm] = useState(defaultForm);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    };

    const fetchMethods = useCallback(async () => {
        if (!user?.id) return;
        try {
            const response = await paymentMethodsAPI.getPaymentMethods(user.id);
            if (response.success) setMethods(response.data);
        } catch (e) {
            console.error('Fetch payment methods error:', e);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => { fetchMethods(); }, [fetchMethods]);

    const openAddModal = () => {
        setEditingMethod(null);
        setForm(defaultForm);
        setModalVisible(true);
    };

    const openEditModal = (m) => {
        setEditingMethod(m);
        setForm({ type: m.type, label: m.label, account_name: m.account_name || '', account_number: m.account_number || '' });
        setModalVisible(true);
    };

    const handleSave = async () => {
        const typeInfo = TYPES.find(t => t.id === form.type);
        const label = form.label.trim() || typeInfo?.label || form.type;

        if (form.type !== 'cod' && !form.account_number.trim()) {
            showAlert('Missing Info', 'Please enter your account number.', 'error');
            return;
        }

        setSaving(true);
        try {
            let response;
            if (editingMethod) {
                response = await paymentMethodsAPI.updatePaymentMethod(editingMethod.id, { label, account_name: form.account_name, account_number: form.account_number });
            } else {
                response = await paymentMethodsAPI.addPaymentMethod({ user_id: user.id, type: form.type, label, account_name: form.account_name, account_number: form.account_number });
            }
            if (response.success) {
                setModalVisible(false);
                fetchMethods();
            } else {
                showAlert('Error', response.message || 'Failed to save.', 'error');
            }
        } catch (e) {
            showAlert('Error', 'An unexpected error occurred.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        showAlert('Delete Method', 'Remove this payment method?', 'error', true, async () => {
            try {
                await paymentMethodsAPI.deletePaymentMethod(id);
                fetchMethods();
            } catch {
                showAlert('Error', 'Failed to delete.', 'error');
            }
        });
    };

    const handleSetDefault = async (id) => {
        try {
            await paymentMethodsAPI.setAsDefault(id, user.id);
            fetchMethods();
        } catch (e) {
            console.error('Set default error:', e);
        }
    };

    const getTypeIcon = (type) => TYPES.find(t => t.id === type)?.icon || 'card-outline';

    const renderMethod = ({ item }) => (
        <View style={[styles.card, item.is_default && styles.defaultCard]}>
            <View style={styles.cardTop}>
                <View style={styles.iconRow}>
                    <View style={styles.typeIcon}>
                        <Ionicons name={getTypeIcon(item.type)} size={20} color="#8D6E63" />
                    </View>
                    <View>
                        <Text style={styles.cardLabel}>{item.label}</Text>
                        {item.account_number ? <Text style={styles.cardAccount}>•••• {item.account_number.slice(-4)}</Text> : null}
                        {item.account_name ? <Text style={styles.cardName}>{item.account_name}</Text> : null}
                    </View>
                </View>
                <View style={styles.cardActions}>
                    {item.is_default && (
                        <View style={styles.defaultBadge}><Text style={styles.defaultText}>Default</Text></View>
                    )}
                    <TouchableOpacity onPress={() => openEditModal(item)} style={styles.iconBtn}>
                        <Ionicons name="pencil-outline" size={18} color="#8D6E63" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.iconBtn}>
                        <Ionicons name="trash-outline" size={18} color="#e53935" />
                    </TouchableOpacity>
                </View>
            </View>
            {!item.is_default && (
                <TouchableOpacity onPress={() => handleSetDefault(item.id)} style={styles.setDefaultBtn}>
                    <Text style={styles.setDefaultText}>Set as Default</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const needsAccount = form.type !== 'cod';

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#3e2723" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Payment Methods</Text>
                <TouchableOpacity onPress={openAddModal} style={styles.addBtn}>
                    <Ionicons name="add" size={24} color="#8D6E63" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#8D6E63" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={methods}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderMethod}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="card-outline" size={60} color="#ddd" />
                            <Text style={styles.emptyText}>No payment methods saved</Text>
                            <TouchableOpacity style={styles.addFirstBtn} onPress={openAddModal}>
                                <Text style={styles.addFirstText}>Add Payment Method</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            {/* Add/Edit Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <KeyboardAwareWrapper style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editingMethod ? 'Edit Method' : 'Add Payment Method'}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={22} color="#333" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {!editingMethod && (
                                <>
                                    <Text style={styles.formLabel}>Type</Text>
                                    <View style={styles.typeChips}>
                                        {TYPES.map(t => (
                                            <TouchableOpacity
                                                key={t.id}
                                                style={[styles.typeChip, form.type === t.id && styles.typeChipSelected]}
                                                onPress={() => setForm(prev => ({ ...prev, type: t.id, label: t.label }))}
                                            >
                                                <Ionicons name={t.icon} size={16} color={form.type === t.id ? '#8D6E63' : '#999'} />
                                                <Text style={[styles.typeChipText, form.type === t.id && styles.typeChipTextSelected]}>{t.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}

                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Label (optional nickname)</Text>
                                <TextInput
                                    style={styles.formInput}
                                    placeholder={`e.g. My ${TYPES.find(t => t.id === form.type)?.label}`}
                                    placeholderTextColor="#bbb"
                                    value={form.label}
                                    onChangeText={(v) => setForm(prev => ({ ...prev, label: v }))}
                                />
                            </View>

                            {needsAccount && (
                                <>
                                    <View style={styles.formGroup}>
                                        <Text style={styles.formLabel}>Account Name</Text>
                                        <TextInput
                                            style={styles.formInput}
                                            placeholder="Full name on account"
                                            placeholderTextColor="#bbb"
                                            value={form.account_name}
                                            onChangeText={(v) => setForm(prev => ({ ...prev, account_name: v }))}
                                        />
                                    </View>
                                    <View style={styles.formGroup}>
                                        <Text style={styles.formLabel}>{form.type === 'gcash' ? 'GCash Number' : 'Account Number'}</Text>
                                        <TextInput
                                            style={styles.formInput}
                                            placeholder={form.type === 'gcash' ? '09XX XXX XXXX' : 'Bank account number'}
                                            placeholderTextColor="#bbb"
                                            value={form.account_number}
                                            onChangeText={(v) => setForm(prev => ({ ...prev, account_number: v }))}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                </>
                            )}

                            <TouchableOpacity
                                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                                onPress={handleSave}
                                disabled={saving}
                            >
                                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Method'}</Text>
                            </TouchableOpacity>
                            <View style={{ height: 30 }} />
                        </ScrollView>
                    </View>
                </KeyboardAwareWrapper>
            </Modal>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
                onConfirm={() => {
                    setAlertConfig({ ...alertConfig, visible: false });
                    if (alertConfig.onConfirm) alertConfig.onConfirm();
                }}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 15, paddingVertical: 15,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    backButton: { padding: 4 },
    addBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3e2723' },
    listContent: { padding: 16, paddingBottom: 30 },

    card: {
        backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
        borderWidth: 1, borderColor: 'transparent',
    },
    defaultCard: { borderColor: '#8D6E63' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    iconRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    typeIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f5f0eb', justifyContent: 'center', alignItems: 'center' },
    cardLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
    cardAccount: { fontSize: 13, color: '#888', marginTop: 2 },
    cardName: { fontSize: 12, color: '#aaa' },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    defaultBadge: { backgroundColor: '#8D6E63', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginRight: 4 },
    defaultText: { fontSize: 11, fontWeight: '600', color: '#fff' },
    iconBtn: { padding: 6 },
    setDefaultBtn: { marginTop: 10, alignSelf: 'flex-start' },
    setDefaultText: { fontSize: 13, color: '#8D6E63', fontWeight: '600' },

    emptyContainer: { alignItems: 'center', paddingTop: 80 },
    emptyText: { fontSize: 16, color: '#aaa', marginTop: 12, marginBottom: 20 },
    addFirstBtn: { backgroundColor: '#8D6E63', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
    addFirstText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3e2723' },

    typeChips: { flexDirection: 'column', gap: 8, marginBottom: 20 },
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: 'transparent' },
    typeChipSelected: { backgroundColor: '#f5f0eb', borderColor: '#8D6E63' },
    typeChipText: { fontSize: 14, color: '#777', fontWeight: '500' },
    typeChipTextSelected: { color: '#8D6E63', fontWeight: '600' },

    formGroup: { marginBottom: 16 },
    formLabel: { fontSize: 13, fontWeight: '600', color: '#777', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
    formInput: { borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 10, backgroundColor: '#fafafa', paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: '#333' },

    saveBtn: { backgroundColor: '#8D6E63', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
    saveBtnDisabled: { backgroundColor: '#ccc' },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default PaymentMethodsScreen;
