/**
 * SellerProductsScreen.js  (new — listings model)
 * Shows products the seller has listed from the admin catalog.
 * "Browse Catalog" button navigates to CatalogBrowserScreen.
 */
import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, Image, TouchableOpacity,
    ActivityIndicator, Modal, TextInput, Platform, ScrollView,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { listingsAPI, shopAPI, handymenAPI, BASE_URL } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import CustomAlert from '../components/CustomAlert';
import { useTheme } from '../context/ThemeContext';

const resolveImg = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${BASE_URL}/${url}`;
};

const SellerProductsScreen = ({ navigation }) => {
    const { user }  = useAuth();
    const { theme } = useTheme();

    const [shopId, setShopId]       = useState(null);
    const [listings, setListings]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const [editModal, setEditModal] = useState(false);
    const [selected, setSelected]   = useState(null);
    const [editPrice, setEditPrice] = useState('');
    const [editStock, setEditStock] = useState('');
    const [editServiceTypes, setEditServiceTypes] = useState(['delivery']);
    const [shopHasHandymen, setShopHasHandymen] = useState(false);
    const [saving, setSaving]       = useState(false);

    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'info',
        showCancel: false, onConfirm: null, confirmText: 'OK', cancelText: 'Cancel',
    });
    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null, confirmText = 'OK', cancelText = 'Cancel') =>
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm, confirmText, cancelText });
    const hideAlert = () => setAlertConfig(p => ({ ...p, visible: false }));

    // Fetch seller's shop id first, then listings
    const fetchListings = useCallback(async () => {
        try {
            const shopRes = await shopAPI.getMyShop(user.id);
            if (!shopRes.success || !shopRes.shop) {
                setLoading(false);
                return;
            }
            const sid = shopRes.shop.shop_id;
            setShopId(sid);

            // Check handymen availability for installation gate
            handymenAPI.getByShop(sid)
                .then(res => setShopHasHandymen(!!(res?.handymen?.length > 0)))
                .catch(() => setShopHasHandymen(false));

            const res = await listingsAPI.getByShop(sid);
            if (res.success) setListings(res.listings);
        } catch (e) {
            console.error('Fetch listings error:', e);
        } finally {
            setLoading(false);
        }
    }, [user.id]);

    useFocusEffect(useCallback(() => { setLoading(true); fetchListings(); }, [fetchListings]));

    const openEdit = (listing) => {
        setSelected(listing);
        setEditPrice(String(parseFloat(listing.custom_price).toFixed(2)));
        setEditStock(String(listing.stock_quantity));
        const sts = listing.service_types
            ? listing.service_types.split(',')
            : ['delivery'];
        setEditServiceTypes(sts);
        setEditModal(true);
    };

    const saveEdit = async () => {
        if (!editPrice || isNaN(parseFloat(editPrice))) {
            showAlert('Required', 'Please enter a valid price', 'warning');
            return;
        }
        setSaving(true);
        try {
            const res = await listingsAPI.update(selected.listing_id, {
                custom_price:   parseFloat(editPrice),
                stock_quantity: parseInt(editStock) || 0,
                service_types:  editServiceTypes,
            });
            if (res.success) {
                setEditModal(false);
                setListings(prev => prev.map(l =>
                    l.listing_id === selected.listing_id
                        ? { ...l, custom_price: parseFloat(editPrice), stock_quantity: parseInt(editStock) || 0 }
                        : l
                ));
            } else {
                showAlert('Error', res.message || 'Could not update listing', 'error');
            }
        } catch (e) {
            showAlert('Error', e.message || 'Server error', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelist = (listing) => {
        showAlert(
            'Delist Product',
            `Remove "${listing.title}" from your shop? You can re-avail it later from the catalog.`,
            'warning', true,
            async () => {
                try {
                    const res = await listingsAPI.delist(listing.listing_id);
                    if (res.success) {
                        setListings(prev => prev.filter(l => l.listing_id !== listing.listing_id));
                        setTimeout(() => showAlert('Done', 'Product removed from your shop.', 'success'), 300);
                    } else {
                        showAlert('Error', res.message || 'Failed to delist', 'error');
                    }
                } catch (e) {
                    showAlert('Error', 'Server error', 'error');
                }
            },
            'Remove', 'Cancel'
        );
    };

    const renderItem = ({ item }) => {
        const img = resolveImg(item.first_image || item.image_url);
        const colorStocks = Array.isArray(item.color_stocks)
            ? item.color_stocks
            : (item.color_stocks ? JSON.parse(item.color_stocks) : []);
        const lowStock = item.stock_quantity <= 5;

        return (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
                {/* Thumbnail */}
                {img
                    ? <Image source={{ uri: img }} style={styles.image} />
                    : <View style={[styles.image, { backgroundColor: theme.inputBg, justifyContent: 'center', alignItems: 'center' }]}>
                          <Ionicons name="cube-outline" size={28} color={theme.textMuted} />
                      </View>
                }

                {/* Details */}
                <View style={styles.details}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                    <Text style={[styles.price, { color: theme.accent }]}>₱{parseFloat(item.custom_price).toLocaleString('en-PH')}</Text>
                    <View style={styles.metaRow}>
                        <View style={[styles.stockBadge, { backgroundColor: lowStock ? '#FFEBEE' : theme.inputBg }]}>
                            <Ionicons name="cube-outline" size={11} color={lowStock ? '#e53935' : theme.textMuted} />
                            <Text style={[styles.stockText, { color: lowStock ? '#e53935' : theme.textMuted }]}>
                                Stock: {item.stock_quantity} {lowStock ? '⚠️' : ''}
                            </Text>
                        </View>
                        <Text style={[styles.baseRef, { color: theme.textMuted }]}>
                            Base ₱{parseFloat(item.base_price).toLocaleString('en-PH')}
                        </Text>
                    </View>
                    {/* Color stocks preview */}
                    {colorStocks.length > 0 && (
                        <View style={styles.colorRow}>
                            {colorStocks.slice(0, 4).map((cs, i) => (
                                <View key={i} style={styles.colorChip}>
                                    <View style={[styles.colorDot, { backgroundColor: cs.color, borderColor: theme.border }]} />
                                    <Text style={[styles.colorStock, { color: theme.textMuted }]}>{cs.stock}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Action buttons */}
                <View style={styles.actions}>
                    <TouchableOpacity style={[styles.editBtn, { backgroundColor: theme.accent + '22' }]} onPress={() => openEdit(item)}>
                        <Ionicons name="create-outline" size={18} color={theme.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.delistBtn} onPress={() => handleDelist(item)}>
                        <Ionicons name="trash-outline" size={18} color="#e53935" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>My Products</Text>
                <TouchableOpacity
                    style={[styles.browseBtn, { backgroundColor: theme.accent }]}
                    onPress={() => shopId && navigation.navigate('CatalogBrowser', { shopId })}
                >
                    <Ionicons name="grid-outline" size={15} color="#fff" />
                    <Text style={styles.browseBtnText}>Browse Catalog</Text>
                </TouchableOpacity>
            </View>

            {loading
                ? <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
                : listings.length === 0
                    ? <View style={styles.center}>
                          <Ionicons name="cube-outline" size={64} color={theme.textMuted} />
                          <Text style={[styles.emptyText, { color: theme.textMuted }]}>No products listed yet.</Text>
                          <Text style={[styles.emptySub, { color: theme.textMuted }]}>Browse the admin catalog to start listing products in your shop.</Text>
                          <TouchableOpacity
                              style={[styles.addButton, { backgroundColor: theme.accent }]}
                              onPress={() => shopId && navigation.navigate('CatalogBrowser', { shopId })}
                          >
                              <Ionicons name="grid-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                              <Text style={styles.addButtonText}>Browse Catalog</Text>
                          </TouchableOpacity>
                      </View>
                    : <FlatList
                          data={listings}
                          renderItem={renderItem}
                          keyExtractor={item => item.listing_id.toString()}
                          contentContainerStyle={styles.list}
                      />
            }

            {/* Edit Listing Modal */}
            <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
                <KeyboardAwareWrapper style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
                        <View style={styles.modalHandle} />
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Listing</Text>
                        <Text style={[styles.modalProductName, { color: theme.textMuted }]}>{selected?.title}</Text>
                        <Text style={[styles.modalSub, { color: theme.textMuted }]}>
                            Base price: ₱{parseFloat(selected?.base_price || 0).toLocaleString('en-PH')} · Allowed range: ₱{(parseFloat(selected?.base_price || 0) * 0.8).toFixed(2)} – ₱{(parseFloat(selected?.base_price || 0) * 1.2).toFixed(2)}
                        </Text>

                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Selling Price (₱)</Text>
                        <View style={[styles.fieldInput, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                            <Text style={{ color: theme.textMuted, marginRight: 6 }}>₱</Text>
                            <TextInput
                                style={[styles.fieldText, { color: theme.text }]}
                                value={editPrice}
                                onChangeText={setEditPrice}
                                keyboardType="decimal-pad"
                                placeholder="0.00"
                                placeholderTextColor={theme.textMuted}
                            />
                        </View>

                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Stock Quantity</Text>
                        <View style={[styles.fieldInput, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                            <TextInput
                                style={[styles.fieldText, { color: theme.text }]}
                                value={editStock}
                                onChangeText={setEditStock}
                                keyboardType="number-pad"
                                placeholder="e.g. 50"
                                placeholderTextColor={theme.textMuted}
                            />
                        </View>

                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Service Type</Text>
                        <View style={styles.serviceRow}>
                            {[
                                { key: 'delivery', label: 'Delivery', icon: 'car-outline', disabled: false },
                                { key: 'delivery_installation', label: 'w/ Installation', icon: 'construct-outline', disabled: !shopHasHandymen },
                            ].map(opt => {
                                const active = editServiceTypes.includes(opt.key);
                                return (
                                    <TouchableOpacity
                                        key={opt.key}
                                        style={[
                                            styles.serviceChip,
                                            { borderColor: active && !opt.disabled ? theme.accent : theme.border },
                                            active && !opt.disabled && { backgroundColor: theme.accent },
                                            opt.disabled && { opacity: 0.4 },
                                        ]}
                                        onPress={() => !opt.disabled && setEditServiceTypes(prev =>
                                            prev.includes(opt.key)
                                                ? prev.filter(t => t !== opt.key)
                                                : [...prev, opt.key]
                                        )}
                                        disabled={opt.disabled}
                                    >
                                        <Ionicons
                                            name={opt.disabled ? 'lock-closed-outline' : opt.icon}
                                            size={13}
                                            color={opt.disabled ? theme.textMuted : (active ? '#fff' : theme.textMuted)}
                                        />
                                        <Text style={{ color: opt.disabled ? theme.textMuted : (active ? '#fff' : theme.textMuted), fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {!shopHasHandymen && (
                            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: -6, marginBottom: 10 }}>
                                🔒 Add a handyman in your shop settings to offer installation
                            </Text>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: theme.border }]} onPress={() => setEditModal(false)}>
                                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: theme.accent }]} onPress={saveEdit} disabled={saving}>
                                {saving
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Text style={styles.modalSaveText}>Save Changes</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAwareWrapper>
            </Modal>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                onConfirm={() => { hideAlert(); if (alertConfig.onConfirm) alertConfig.onConfirm(); }}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container:   { flex: 1 },
    header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
    backButton:  { padding: 4 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
    browseBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    browseBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    list:        { padding: 14 },
    card:        { flexDirection: 'row', borderRadius: 14, marginBottom: 12, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
    image:       { width: 72, height: 72, borderRadius: 10 },
    details:     { flex: 1, marginLeft: 12 },
    title:       { fontSize: 14, fontWeight: '700', marginBottom: 3 },
    price:       { fontSize: 15, fontWeight: 'bold', marginBottom: 5 },
    metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
    stockBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    stockText:   { fontSize: 11, fontWeight: '600' },
    baseRef:     { fontSize: 11 },
    colorRow:    { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    colorChip:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
    colorDot:    { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
    colorStock:  { fontSize: 10 },
    actions:     { gap: 8 },
    editBtn:     { padding: 10, borderRadius: 10 },
    delistBtn:   { padding: 10, borderRadius: 10, backgroundColor: '#FFEBEE' },
    center:      { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
    emptyText:   { fontSize: 17, marginTop: 16, marginBottom: 8, fontWeight: '700' },
    emptySub:    { fontSize: 13, textAlign: 'center', marginBottom: 24 },
    addButton:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25 },
    addButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    // Modal
    modalOverlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet:    { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 40 },
    modalHandle:   { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
    modalTitle:    { fontSize: 18, fontWeight: '800', marginBottom: 2 },
    modalProductName: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
    modalSub:      { fontSize: 12, marginBottom: 16 },
    fieldLabel:    { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
    fieldInput:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
    fieldText:     { flex: 1, fontSize: 15 },
    serviceRow:    { flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
    serviceChip:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    modalActions:  { flexDirection: 'row', gap: 12, marginTop: 16 },
    modalCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
    modalCancelText: { fontSize: 14, fontWeight: '600' },
    modalSaveBtn:  { flex: 1.5, alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: 14 },
    modalSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default SellerProductsScreen;
