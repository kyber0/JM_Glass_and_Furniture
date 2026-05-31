/**
 * AdminProductCatalogScreen.js
 * Admin manages the master product catalog.
 * Navigates to AddProductScreen (re-used) for creating / editing.
 */
import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Image, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { catalogAPI, BASE_URL } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import CustomAlert from '../../components/CustomAlert';

const resolveImg = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${BASE_URL}/${url}`;
};

const AdminProductCatalogScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [products, setProducts]   = useState([]);
    const [filtered, setFiltered]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch]       = useState('');
    const [filterActive, setFilterActive] = useState('all'); // all | active | hidden

    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'info',
        showCancel: false, onConfirm: null, confirmText: 'OK', cancelText: 'Cancel',
    });
    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null, confirmText = 'OK', cancelText = 'Cancel') =>
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm, confirmText, cancelText });
    const hideAlert = () => setAlertConfig(p => ({ ...p, visible: false }));

    const fetchProducts = useCallback(async () => {
        try {
            const res = await catalogAPI.getAll();
            if (res.success) {
                setProducts(res.products);
                applyFilter(res.products, search, filterActive);
            }
        } catch (e) {
            console.error('Fetch catalog error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchProducts(); }, [fetchProducts]));

    const applyFilter = (data, q, f) => {
        let r = data;
        if (f === 'active') r = r.filter(p => p.is_catalog_active);
        if (f === 'hidden') r = r.filter(p => !p.is_catalog_active);
        if (q.trim()) r = r.filter(p => p.title?.toLowerCase().includes(q.toLowerCase()));
        setFiltered(r);
    };

    const handleSearch     = (q) => { setSearch(q); applyFilter(products, q, filterActive); };
    const handleFilterChange = (f) => { setFilterActive(f); applyFilter(products, search, f); };

    const toggleVisibility = (product) => {
        const next = product.is_catalog_active ? 0 : 1;
        const label = next ? 'restore to catalog' : 'hide from catalog';
        showAlert(
            next ? 'Restore Product' : 'Hide Product',
            `Are you sure you want to ${label} "${product.title}"?`,
            'warning', true,
            async () => {
                try {
                    const formData = new FormData();
                    formData.append('is_catalog_active', String(next));
                    await catalogAPI.update(product.product_id, formData);
                    setProducts(prev => prev.map(p => p.product_id === product.product_id ? { ...p, is_catalog_active: next } : p));
                    setFiltered(prev => prev.map(p => p.product_id === product.product_id ? { ...p, is_catalog_active: next } : p));
                } catch (e) {
                    showAlert('Error', 'Failed to update product', 'error');
                }
            },
            'Yes', 'Cancel'
        );
    };

    const renderItem = ({ item }) => {
        const img = resolveImg(item.first_image || item.image_url);
        const colors = Array.isArray(item.colors) ? item.colors : (item.colors ? JSON.parse(item.colors) : []);
        const isActive = !!item.is_catalog_active;

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card, opacity: isActive ? 1 : 0.55 }]}
                onPress={() => navigation.navigate('AdminAddProduct', { productToEdit: item, isAdminCatalog: true })}
                activeOpacity={0.85}
            >
                {/* Thumbnail */}
                {img
                    ? <Image source={{ uri: img }} style={styles.thumb} />
                    : <View style={[styles.thumb, { backgroundColor: theme.inputBg, justifyContent: 'center', alignItems: 'center' }]}>
                          <Ionicons name="image-outline" size={26} color={theme.textMuted} />
                      </View>
                }

                {/* Info */}
                <View style={styles.info}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                    <View style={styles.metaRow}>
                        <Text style={[styles.price, { color: theme.accent }]}>₱{parseFloat(item.price).toLocaleString('en-PH')}</Text>
                        <View style={styles.shopCountBadge}>
                            <Ionicons name="storefront-outline" size={11} color={theme.textMuted} />
                            <Text style={[styles.shopCount, { color: theme.textMuted }]}>{item.shop_count} shops</Text>
                        </View>
                    </View>
                    {/* Color dots */}
                    {colors.length > 0 && (
                        <View style={styles.colorRow}>
                            {colors.slice(0, 6).map((c, i) => (
                                <View key={i} style={[styles.colorDot, { backgroundColor: c.color || '#ccc', borderColor: theme.border }]} />
                            ))}
                            {colors.length > 6 && <Text style={[styles.moreColors, { color: theme.textMuted }]}>+{colors.length - 6}</Text>}
                        </View>
                    )}
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: isActive ? '#e5393522' : '#4CAF5022' }]}
                        onPress={() => toggleVisibility(item)}
                    >
                        <Ionicons name={isActive ? 'eye-off-outline' : 'eye-outline'} size={18} color={isActive ? '#e53935' : '#4CAF50'} />
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Product Catalog</Text>
                <TouchableOpacity
                    style={[styles.addBtn, { backgroundColor: theme.accent }]}
                    onPress={() => navigation.navigate('AdminAddProduct', { isAdminCatalog: true })}
                >
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addBtnText}>Add Product</Text>
                </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={[styles.searchBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <Ionicons name="search" size={17} color={theme.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    placeholder="Search catalog..."
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

            {/* Filters */}
            <View style={styles.filterRow}>
                {[['all', 'All'], ['active', 'Active'], ['hidden', 'Hidden']].map(([key, label]) => (
                    <TouchableOpacity
                        key={key}
                        style={[styles.chip, { backgroundColor: theme.inputBg, borderColor: theme.border },
                            filterActive === key && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                        onPress={() => handleFilterChange(key)}
                    >
                        <Text style={[styles.chipText, { color: theme.textSecondary }, filterActive === key && { color: '#fff' }]}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                ))}
                <View style={styles.chipSpacer} />
                <View style={[styles.countBadge, { backgroundColor: theme.accent + '22' }]}>
                    <Text style={[styles.countText, { color: theme.accent }]}>{filtered.length} products</Text>
                </View>
            </View>

            {/* List */}
            {loading
                ? <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
                : <FlatList
                    data={filtered}
                    renderItem={renderItem}
                    keyExtractor={item => item.product_id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProducts(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={
                        <View style={styles.emptyBox}>
                            <Ionicons name="cube-outline" size={56} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No products in catalog</Text>
                            <TouchableOpacity
                                style={[styles.emptyAddBtn, { backgroundColor: theme.accent }]}
                                onPress={() => navigation.navigate('AdminAddProduct', { isAdminCatalog: true })}
                            >
                                <Text style={styles.emptyAddBtnText}>Add First Product</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            }

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
    container:    { flex: 1 },
    header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
    backBtn:      { padding: 4, marginRight: 10 },
    headerTitle:  { flex: 1, fontSize: 18, fontWeight: '700' },
    addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
    addBtnText:   { color: '#fff', fontSize: 13, fontWeight: '700' },
    searchBox:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 14, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
    searchInput:  { flex: 1, fontSize: 14 },
    filterRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
    chip:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    chipText:     { fontSize: 13, fontWeight: '600' },
    chipSpacer:   { flex: 1 },
    countBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    countText:    { fontSize: 12, fontWeight: '700' },
    list:         { paddingHorizontal: 14, paddingBottom: 30 },
    card:         { flexDirection: 'row', alignItems: 'center', borderRadius: 12, marginBottom: 12, padding: 12, gap: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    thumb:        { width: 64, height: 64, borderRadius: 10 },
    info:         { flex: 1 },
    title:        { fontSize: 14, fontWeight: '700', marginBottom: 5 },
    metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    price:        { fontSize: 14, fontWeight: '700' },
    shopCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    shopCount:    { fontSize: 11 },
    colorRow:     { flexDirection: 'row', gap: 4, alignItems: 'center' },
    colorDot:     { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
    moreColors:   { fontSize: 10 },
    actions:      { gap: 8 },
    actionBtn:    { padding: 10, borderRadius: 10 },
    emptyBox:     { alignItems: 'center', paddingTop: 60 },
    emptyText:    { fontSize: 15, marginTop: 12, marginBottom: 20 },
    emptyAddBtn:  { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25 },
    emptyAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default AdminProductCatalogScreen;
