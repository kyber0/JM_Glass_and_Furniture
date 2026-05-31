import React, { useState, useEffect, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../components/CustomAlert';
import { useAuth } from '../context/AuthContext';
import { addressesAPI } from '../services/api';
import AddressAutocompleteInput from '../components/AddressAutocompleteInput';

const LABELS = ['Home', 'Work', 'Other'];

const defaultForm = { full_name: '', phone: '', address: '', additional_details: '', label: 'Home', latitude: null, longitude: null };

const ShippingAddressesScreen = ({ navigation }) => {
    const { user } = useAuth();
    const [addresses, setAddresses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [form, setForm] = useState(defaultForm);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    };

    const fetchAddresses = useCallback(async () => {
        if (!user?.id) return;
        try {
            const response = await addressesAPI.getAddresses(user.id);
            if (response.success) setAddresses(response.data);
        } catch (e) {
            console.error('Fetch addresses error:', e);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => { fetchAddresses(); }, [fetchAddresses]);

    const openAddModal = () => {
        setEditingAddress(null);
        setForm(defaultForm);
        setModalVisible(true);
    };

    const openEditModal = (addr) => {
        setEditingAddress(addr);
        setForm({
            full_name: addr.full_name,
            phone: addr.phone,
            address: addr.address,
            additional_details: addr.additional_details || '',
            label: addr.label,
            latitude: null,
            longitude: null,
        });
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!form.full_name.trim() || !form.phone.trim() || !form.address.trim()) {
            showAlert('Oops!', 'Please fill in all fields.', 'error');
            return;
        }
        setSaving(true);
        try {
            let response;
            if (editingAddress) {
                response = await addressesAPI.updateAddress(editingAddress.address_id, { ...form, user_id: user.id });
            } else {
                response = await addressesAPI.addAddress({ ...form, user_id: user.id });
            }
            if (response.success) {
                setModalVisible(false);
                fetchAddresses();
            } else {
                showAlert('Error', response.message || 'Failed to save address.', 'error');
            }
        } catch (e) {
            showAlert('Error', 'An unexpected error occurred.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (addressId) => {
        showAlert('Delete Address', 'Are you sure you want to delete this address?', 'error', true, async () => {
            try {
                await addressesAPI.deleteAddress(addressId);
                fetchAddresses();
            } catch (e) {
                showAlert('Error', 'Failed to delete address.', 'error');
            }
        });
    };

    const handleSetDefault = async (addressId) => {
        try {
            await addressesAPI.setAsDefault(addressId, user.id);
            fetchAddresses();
        } catch (e) {
            console.error('Set default error:', e);
        }
    };

    const renderAddress = ({ item }) => (
        <View style={[styles.addressCard, !!item.is_default && styles.defaultCard]}>
            <View style={styles.cardTop}>
                <View style={styles.labelRow}>
                    <View style={styles.labelBadge}><Text style={styles.labelText}>{item.label}</Text></View>
                    {!!item.is_default && <View style={styles.defaultBadge}><Text style={styles.defaultText}>Default</Text></View>}
                </View>
                <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => openEditModal(item)} style={styles.iconBtn}>
                        <Ionicons name="pencil-outline" size={18} color="#8D6E63" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.address_id)} style={styles.iconBtn}>
                        <Ionicons name="trash-outline" size={18} color="#e53935" />
                    </TouchableOpacity>
                </View>
            </View>
            <Text style={styles.addrName}>{item.full_name}</Text>
            <Text style={styles.addrPhone}>{item.phone}</Text>
            <Text style={styles.addrText}>{item.address}</Text>
            {!!item.additional_details && (
                <Text style={styles.addrDetails}>{item.additional_details}</Text>
            )}
            {!item.is_default && (
                <TouchableOpacity onPress={() => handleSetDefault(item.address_id)} style={styles.setDefaultBtn}>
                    <Text style={styles.setDefaultText}>Set as Default</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#3e2723" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Shipping Addresses</Text>
                <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
                    <Ionicons name="add" size={24} color="#8D6E63" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#8D6E63" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={addresses}
                    keyExtractor={(item) => item.address_id.toString()}
                    renderItem={renderAddress}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="location-outline" size={60} color="#ddd" />
                            <Text style={styles.emptyText}>No addresses saved yet</Text>
                            <TouchableOpacity style={styles.addFirstBtn} onPress={openAddModal}>
                                <Text style={styles.addFirstText}>Add an Address</Text>
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
                            <Text style={styles.modalTitle}>{editingAddress ? 'Edit Address' : 'New Address'}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={22} color="#333" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {[
                                { label: 'Full Name', key: 'full_name', placeholder: 'e.g. Juan dela Cruz' },
                                { label: 'Phone Number', key: 'phone', placeholder: 'e.g. 09XX XXX XXXX', keyboardType: 'phone-pad' },
                            ].map(field => (
                                <View key={field.key} style={styles.formGroup}>
                                    <Text style={styles.formLabel}>{field.label}</Text>
                                    <TextInput
                                        style={styles.formInput}
                                        placeholder={field.placeholder}
                                        placeholderTextColor="#bbb"
                                        value={form[field.key]}
                                        onChangeText={(v) => setForm(prev => ({ ...prev, [field.key]: v }))}
                                        keyboardType={field.keyboardType || 'default'}
                                    />
                                </View>
                            ))}

                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Address</Text>
                                <AddressAutocompleteInput
                                    value={form.address}
                                    onChangeText={(t) => setForm(prev => ({ ...prev, address: t, latitude: null, longitude: null }))}
                                    onAddressSelect={(label, lat, lng) => setForm(prev => ({ ...prev, address: label, latitude: lat, longitude: lng }))}
                                    additionalDetails={form.additional_details}
                                    onAdditionalDetailsChange={(t) => setForm(prev => ({ ...prev, additional_details: t }))}
                                    placeholder="Search delivery address..."
                                    theme={{ text: '#333', inputBg: '#fafafa', border: '#e8e8e8', accent: '#8D6E63', card: '#fff', textMuted: '#bbb' }}
                                />
                            </View>

                            <Text style={styles.formLabel}>Label</Text>
                            <View style={styles.labelChips}>
                                {LABELS.map(l => (
                                    <TouchableOpacity
                                        key={l}
                                        style={[styles.chip, form.label === l && styles.chipSelected]}
                                        onPress={() => setForm(prev => ({ ...prev, label: l }))}
                                    >
                                        <Text style={[styles.chipText, form.label === l && styles.chipTextSelected]}>{l}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <TouchableOpacity
                                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                                onPress={handleSave}
                                disabled={saving}
                            >
                                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Address'}</Text>
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
    addButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3e2723' },
    listContent: { padding: 16, paddingBottom: 30 },

    addressCard: {
        backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
        borderWidth: 1, borderColor: 'transparent',
    },
    defaultCard: { borderColor: '#8D6E63' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    labelBadge: { backgroundColor: '#f5f0eb', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    labelText: { fontSize: 12, fontWeight: '600', color: '#8D6E63' },
    defaultBadge: { backgroundColor: '#8D6E63', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    defaultText: { fontSize: 12, fontWeight: '600', color: '#fff' },
    cardActions: { flexDirection: 'row', gap: 4 },
    iconBtn: { padding: 6 },
    addrName: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 2 },
    addrPhone: { fontSize: 13, color: '#888', marginBottom: 4 },
    addrText: { fontSize: 13, color: '#555', lineHeight: 20 },
    setDefaultBtn: { marginTop: 10, alignSelf: 'flex-start' },
    setDefaultText: { fontSize: 13, color: '#8D6E63', fontWeight: '600' },
    addrDetails: { fontSize: 12, color: '#8D6E63', marginTop: 2, fontStyle: 'italic' },

    emptyContainer: { alignItems: 'center', paddingTop: 80 },
    emptyText: { fontSize: 16, color: '#aaa', marginTop: 12, marginBottom: 20 },
    addFirstBtn: { backgroundColor: '#8D6E63', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
    addFirstText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
        backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 20, maxHeight: '90%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3e2723' },

    formGroup: { marginBottom: 16 },
    formLabel: { fontSize: 13, fontWeight: '600', color: '#777', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
    formInput: {
        borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 10, backgroundColor: '#fafafa',
        paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: '#333',
    },
    labelChips: { flexDirection: 'row', gap: 10, marginBottom: 20, marginTop: 6 },
    chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: 'transparent' },
    chipSelected: { backgroundColor: '#f5f0eb', borderColor: '#8D6E63' },
    chipText: { fontSize: 14, color: '#666', fontWeight: '500' },
    chipTextSelected: { color: '#8D6E63', fontWeight: '600' },

    saveBtn: { backgroundColor: '#8D6E63', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
    saveBtnDisabled: { backgroundColor: '#ccc' },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default ShippingAddressesScreen;
