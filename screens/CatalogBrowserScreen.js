/**
 * CatalogBrowserScreen.js
 * Sellers browse the admin product catalog and avail products into their shop.
 * Route name: 'CatalogBrowser'
 * Params: { shopId }
 */
import React, { useState, useCallback, useRef } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Image, TextInput,
    Modal, ScrollView, Platform,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { catalogAPI, listingsAPI, handymenAPI, BASE_URL } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from '../components/CustomAlert';

const resolveImg = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${BASE_URL}/${url}`;
};

const CatalogBrowserScreen = ({ route, navigation }) => {
    const { shopId } = route.params;
    const { theme } = useTheme();

    const [products, setProducts]       = useState([]);
    const [filtered, setFiltered]       = useState([]);
    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);
    const [search, setSearch]           = useState('');

    // Avail modal
    const [availModal, setAvailModal]   = useState(false);
    const [selectedProduct, setSelected] = useState(null);
    const [customPrice, setCustomPrice] = useState('');
    const [stockQty, setStockQty]       = useState('');
    const [colorStocks, setColorStocks] = useState({});  // { color: stockString }
    const [availing, setAvailing]       = useState(false);
    const [serviceTypes, setServiceTypes] = useState(['delivery']); // delivery | delivery_installation
    const [shopHasHandymen, setShopHasHandymen] = useState(false); // gate for installation chip
    const priceRef = useRef(null);

    // Alert
    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'info',
        showCancel: false, onConfirm: null, confirmText: 'OK', cancelText: 'Cancel',
    });
    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null, confirmText = 'OK', cancelText = 'Cancel') =>
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm, confirmText, cancelText });
    const hideAlert = () => setAlertConfig(p => ({ ...p, visible: false }));

    const fetchCatalog = useCallback(async () => {
        try {
            const res = await catalogAPI.browse(shopId);
            if (res.success) {
                setProducts(res.products);
                applySearch(res.products, search);
            }
        } catch (e) {
            console.error('Browse catalog error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [shopId]);

    useFocusEffect(useCallback(() => {
        setLoading(true);
        fetchCatalog();
        // Check if shop has handymen (determines if installation is selectable)
        if (shopId) {
            handymenAPI.getByShop(shopId)
                .then(res => setShopHasHandymen(!!(res?.handymen?.length > 0)))
                .catch(() => setShopHasHandymen(false));
        }
    }, [fetchCatalog, shopId]));

    const applySearch = (data, q) => {
        const r = q.trim() ? data.filter(p => p.title?.toLowerCase().includes(q.toLowerCase())) : data;
        setFiltered(r);
    };
    const handleSearch = (q) => { setSearch(q); applySearch(products, q); };

    const openAvailModal = (product) => {
        setSelected(product);
        setCustomPrice(String(parseFloat(product.base_price).toFixed(2)));
        setStockQty('');
        // Pre-populate color stocks
        const colors = safeParseColors(product.colors);
        const initial = {};
        colors.forEach(c => { initial[c] = ''; });
        setColorStocks(initial);
        setServiceTypes(['delivery']);
        setAvailModal(true);
    };

    const safeParseColors = (raw) => {
        if (!raw) return [];
        const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
        return arr.map(c => (typeof c === 'string' ? c : c.color)).filter(Boolean);
    };

    const toggleServiceType = (type) => {
        setServiceTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };

    const handleAvail = async () => {
        if (!customPrice || isNaN(parseFloat(customPrice))) {
            showAlert('Required', 'Please enter a valid price', 'warning');
            return;
        }
        if (!stockQty || isNaN(parseInt(stockQty))) {
            showAlert('Required', 'Please enter your stock quantity', 'warning');
            return;
        }
        if (serviceTypes.length === 0) {
            showAlert('Required', 'Please select at least one service type', 'warning');
            return;
        }

        setAvailing(true);
        try {
            // Build color_stocks only for colors that have a value
            const filledColors = {};
            Object.entries(colorStocks).forEach(([color, s]) => {
                if (s.trim() !== '') filledColors[color] = parseInt(s) || 0;
            });

            const res = await listingsAPI.avail({
                shop_id:         shopId,
                product_id:      selectedProduct.product_id,
                custom_price:    parseFloat(customPrice),
                stock_quantity:  parseInt(stockQty),
                color_stocks:    Object.keys(filledColors).length ? filledColors : undefined,
                service_types:   serviceTypes,
            });

            if (res.success) {
                setAvailModal(false);
                showAlert('🎉 Listed!', res.message || 'Product is now available in your shop!', 'success');
                // Refresh to mark as listed
                fetchCatalog();
            } else {
                showAlert('Error', res.message || 'Could not avail product', 'error');
            }
        } catch (e) {
            showAlert('Error', e.message || 'Server error', 'error');
        } finally {
            setAvailing(false);
        }
    };

    const renderProduct = ({ item }) => {
        const img    = resolveImg(item.first_image || item.image_url);
        const colors = safeParseColors(item.colors);
        const listed = !!item.already_listed;

        return (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
                {/* Image */}
                {img
                    ? <Image source={{ uri: img }} style={styles.thumb} />
                    : <View style={[styles.thumb, { backgroundColor: theme.inputBg, justifyContent: 'center', alignItems: 'center' }]}>
                          <Ionicons name="cube-outline" size={28} color={theme.textMuted} />
                      </View>
                }

                {/* Info */}
                <View style={styles.info}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                    <Text style={[styles.basePrice, { color: theme.textMuted }]}>Base: ₱{parseFloat(item.base_price).toLocaleString('en-PH')}</Text>
                    {item.category_name && (
                        <View style={[styles.catBadge, { backgroundColor: theme.accent + '22' }]}>
                            <Text style={[styles.catText, { color: theme.accent }]}>{item.category_name}</Text>
                        </View>
                    )}
                    {colors.length > 0 && (
                        <View style={styles.colorRow}>
                            {colors.slice(0, 5).map((c, i) => (
                                <View key={i} style={[styles.colorDot, { backgroundColor: c, borderColor: theme.border }]} />
                            ))}
                            {colors.length > 5 && <Text style={[styles.moreColors, { color: theme.textMuted }]}>+{colors.length - 5}</Text>}
                        </View>
                    )}
                </View>

                {/* Avail button */}
                {listed ? (
                    <View style={styles.listedBadge}>
                        <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                        <Text style={styles.listedText}>Listed</Text>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.availBtn, { backgroundColor: theme.accent }]}
                        onPress={() => openAvailModal(item)}
                    >
                        <Ionicons name="add-circle-outline" size={15} color="#fff" />
                        <Text style={styles.availBtnText}>Avail</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Browse Catalog</Text>
                <View style={{ width: 36 }} />
            </View>

            {/* Search */}
            <View style={[styles.searchBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <Ionicons name="search" size={17} color={theme.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    placeholder="Search products..."
                    placeholderTextColor={theme.textMuted}
                    value={search}
                    onChangeText={handleSearch}
                />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => handleSearch('')}>
                        <Ionicons name="close-circle" size={17} color={theme.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {/* List */}
            {loading
                ? <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
                : <FlatList
                    data={filtered}
                    renderItem={renderProduct}
                    keyExtractor={item => item.product_id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCatalog(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="cube-outline" size={56} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No products available in catalog</Text>
                        </View>
                    }
                />
            }

            {/* Avail Modal */}
            <Modal visible={availModal} transparent animationType="slide" onRequestClose={() => setAvailModal(false)}>
                <KeyboardAwareWrapper style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
                        <View style={styles.modalHandle} />
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedProduct?.title}</Text>
                            <Text style={[styles.modalSub, { color: theme.textMuted }]}>
                                Base price: ₱{parseFloat(selectedProduct?.base_price || 0).toLocaleString('en-PH')} · Set your selling price and stock.
                            </Text>

                            {/* Price range note */}
                            <View style={[styles.infoBox, { backgroundColor: theme.accent + '15', borderColor: theme.accent + '44' }]}>
                                <Ionicons name="information-circle-outline" size={15} color={theme.accent} />
                                <Text style={[styles.infoText, { color: theme.accent }]}>
                                    Price must be within ±20% of the base price (₱{(parseFloat(selectedProduct?.base_price || 0) * 0.8).toFixed(2)} – ₱{(parseFloat(selectedProduct?.base_price || 0) * 1.2).toFixed(2)})
                                </Text>
                            </View>

                            {/* Custom price */}
                            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Your Selling Price (₱)</Text>
                            <View style={[styles.fieldInput, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                                <Text style={{ color: theme.textMuted, marginRight: 6 }}>₱</Text>
                                <TextInput
                                    ref={priceRef}
                                    style={[styles.fieldText, { color: theme.text }]}
                                    value={customPrice}
                                    onChangeText={setCustomPrice}
                                    keyboardType="decimal-pad"
                                    placeholder="0.00"
                                    placeholderTextColor={theme.textMuted}
                                />
                            </View>

                            {/* Service Type */}
                            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Service Type</Text>
                            <View style={styles.serviceRow}>
                                {[
                                    { key: 'delivery', label: 'Delivery', icon: 'car-outline', disabled: false },
                                    { key: 'delivery_installation', label: 'w/ Installation', icon: 'construct-outline', disabled: !shopHasHandymen },
                                ].map(opt => {
                                    const active = serviceTypes.includes(opt.key);
                                    return (
                                        <TouchableOpacity
                                            key={opt.key}
                                            style={[
                                                styles.serviceChip,
                                                { borderColor: active && !opt.disabled ? theme.accent : theme.border },
                                                active && !opt.disabled && { backgroundColor: theme.accent },
                                                opt.disabled && { opacity: 0.4 },
                                            ]}
                                            onPress={() => !opt.disabled && toggleServiceType(opt.key)}
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

                            {/* Stock quantity */}
                            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Your Stock Quantity</Text>
                            <View style={[styles.fieldInput, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                                <TextInput
                                    style={[styles.fieldText, { color: theme.text }]}
                                    value={stockQty}
                                    onChangeText={setStockQty}
                                    keyboardType="number-pad"
                                    placeholder="e.g. 50"
                                    placeholderTextColor={theme.textMuted}
                                />
                            </View>

                            {/* Per-color stock */}
                            {Object.keys(colorStocks).length > 0 && (
                                <>
                                    <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 8 }]}>
                                        Stock per Color <Text style={{ fontWeight: '400', fontSize: 12 }}>(optional)</Text>
                                    </Text>
                                    {Object.keys(colorStocks).map(color => (
                                        <View key={color} style={styles.colorStockRow}>
                                            <View style={[styles.colorDotLarge, { backgroundColor: color, borderColor: theme.border }]} />
                                            <Text style={[styles.colorLabel, { color: theme.text }]}>{color}</Text>
                                            <View style={[styles.fieldInputSmall, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                                                <TextInput
                                                    style={[styles.fieldText, { color: theme.text }]}
                                                    value={colorStocks[color]}
                                                    onChangeText={val => setColorStocks(p => ({ ...p, [color]: val }))}
                                                    keyboardType="number-pad"
                                                    placeholder="0"
                                                    placeholderTextColor={theme.textMuted}
                                                />
                                            </View>
                                        </View>
                                    ))}
                                </>
                            )}

                            {/* Actions */}
                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                                    onPress={() => setAvailModal(false)}
                                >
                                    <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalConfirmBtn, { backgroundColor: theme.accent }]}
                                    onPress={handleAvail}
                                    disabled={availing}
                                >
                                    {availing
                                        ? <ActivityIndicator size="small" color="#fff" />
                                        : <>
                                            <Ionicons name="storefront-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                                            <Text style={styles.modalConfirmText}>List in My Shop</Text>
                                          </>
                                    }
                                </TouchableOpacity>
                            </View>
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
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                onConfirm={() => { hideAlert(); if (alertConfig.onConfirm) alertConfig.onConfirm(); }}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container:      { flex: 1 },
    header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
    backBtn:        { padding: 4, marginRight: 10 },
    headerTitle:    { flex: 1, fontSize: 18, fontWeight: '700' },
    searchBox:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 14, marginBottom: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
    searchInput:    { flex: 1, fontSize: 14 },
    list:           { paddingHorizontal: 14, paddingBottom: 30 },
    card:           { flexDirection: 'row', alignItems: 'center', borderRadius: 12, marginBottom: 12, padding: 12, gap: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    thumb:          { width: 68, height: 68, borderRadius: 10 },
    info:           { flex: 1 },
    title:          { fontSize: 14, fontWeight: '700', marginBottom: 3 },
    basePrice:      { fontSize: 12, marginBottom: 5 },
    catBadge:       { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginBottom: 5 },
    catText:        { fontSize: 10, fontWeight: '700' },
    colorRow:       { flexDirection: 'row', gap: 4, alignItems: 'center' },
    colorDot:       { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
    moreColors:     { fontSize: 10 },
    listedBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#E8F5E9' },
    listedText:     { color: '#4CAF50', fontSize: 12, fontWeight: '700' },
    availBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
    availBtnText:   { color: '#fff', fontSize: 12, fontWeight: '700' },
    emptyBox:       { alignItems: 'center', paddingTop: 60 },
    emptyText:      { fontSize: 15, marginTop: 12, textAlign: 'center' },
    // Modal
    modalOverlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet:     { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 40, maxHeight: '90%' },
    modalHandle:    { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
    modalTitle:     { fontSize: 18, fontWeight: '800', marginBottom: 4 },
    modalSub:       { fontSize: 13, marginBottom: 14 },
    infoBox:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 16 },
    infoText:       { flex: 1, fontSize: 12, fontWeight: '600' },
    fieldLabel:     { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
    fieldInput:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
    fieldInputSmall: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, width: 80 },
    fieldText:      { flex: 1, fontSize: 15 },
    colorStockRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    colorDotLarge:  { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
    colorLabel:     { flex: 1, fontSize: 14 },
    serviceRow:     { flexDirection: 'row', gap: 10, marginBottom: 12 },
    serviceChip:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    modalActions:   { flexDirection: 'row', gap: 12, marginTop: 20 },
    modalCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
    modalCancelText: { fontSize: 15, fontWeight: '600' },
    modalConfirmBtn: { flex: 1.6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: 14 },
    modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default CatalogBrowserScreen;
