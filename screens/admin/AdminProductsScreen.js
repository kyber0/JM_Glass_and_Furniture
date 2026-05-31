import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Image, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminAPI, BASE_URL } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const resolveImg = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${BASE_URL}/${url}`;
};

const AdminProductsScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [products, setProducts] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [showFilter, setShowFilter] = useState('all'); // all | visible | hidden

    const fetchProducts = useCallback(async () => {
        try {
            const res = await adminAPI.getProducts();
            if (res.success) { setProducts(res.data); applyFilter(res.data, search, showFilter); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useFocusEffect(useCallback(() => { setLoading(true); fetchProducts(); }, [fetchProducts]));

    const applyFilter = (data, q, f) => {
        let r = data;
        if (f === 'visible') r = r.filter(p => !p.is_hidden);
        if (f === 'hidden') r = r.filter(p => p.is_hidden);
        if (q.trim()) r = r.filter(p => p.title.toLowerCase().includes(q.toLowerCase()) || p.shop_name?.toLowerCase().includes(q.toLowerCase()));
        setFiltered(r);
    };

    const handleSearch = (q) => { setSearch(q); applyFilter(products, q, showFilter); };
    const handleShow = (f) => { setShowFilter(f); applyFilter(products, search, f); };

    const toggleHide = async (product) => {
        const next = { ...product, is_hidden: product.is_hidden ? 0 : 1 };
        const upd = p => p.product_id === product.product_id ? next : p;
        setProducts(prev => prev.map(upd));
        setFiltered(prev => prev.map(upd));
        await adminAPI.toggleProduct(product.product_id);
    };

    const renderProduct = ({ item }) => (
        <View style={[styles.card, { borderBottomColor: theme.border, opacity: item.is_hidden ? 0.55 : 1 }]}>
            {resolveImg(item.image_url) ? (
                <Image source={{ uri: resolveImg(item.image_url) }} style={styles.productImg} />
            ) : (
                <View style={[styles.productImg, { backgroundColor: theme.inputBg, justifyContent: 'center', alignItems: 'center' }]}>
                    <Ionicons name="image-outline" size={24} color={theme.textMuted} />
                </View>
            )}
            <View style={styles.productInfo}>
                <Text style={[styles.productTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                <Text style={[styles.productShop, { color: theme.textMuted }]}>{item.shop_name}</Text>
                <View style={styles.metaRow}>
                    <Text style={[styles.price, { color: theme.accent }]}>₱{parseFloat(item.price).toLocaleString('en-PH')}</Text>
                    <Text style={[styles.stock, { color: theme.textMuted }]}>Stock: {item.stock_quantity}</Text>
                    <Text style={[styles.sold, { color: theme.textMuted }]}>{item.sold_count} sold</Text>
                </View>
            </View>
            <TouchableOpacity
                style={[styles.hideBtn, { backgroundColor: item.is_hidden ? '#4CAF5022' : '#e5393522' }]}
                onPress={() => toggleHide(item)}
            >
                <Ionicons name={item.is_hidden ? 'eye' : 'eye-off'} size={18} color={item.is_hidden ? '#4CAF50' : '#e53935'} />
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Products</Text>
                <View style={[styles.countBadge, { backgroundColor: theme.accent + '22' }]}>
                    <Text style={[styles.countText, { color: theme.accent }]}>{filtered.length}</Text>
                </View>
            </View>

            <View style={[styles.searchBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <Ionicons name="search" size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
                <TextInput style={[styles.searchInput, { color: theme.text }]}
                    placeholder="Search products or shops..." placeholderTextColor={theme.textMuted}
                    value={search} onChangeText={handleSearch} />
            </View>

            <View style={styles.filterRow}>
                {['all', 'visible', 'hidden'].map(f => (
                    <TouchableOpacity key={f}
                        style={[styles.chip, { backgroundColor: theme.inputBg, borderColor: theme.border },
                        showFilter === f && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                        onPress={() => handleShow(f)}
                    >
                        <Text style={[styles.chipText, { color: theme.textSecondary }, showFilter === f && { color: '#fff' }]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} /> : (
                <FlatList
                    data={filtered}
                    renderItem={renderProduct}
                    keyExtractor={item => item.product_id.toString()}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProducts(); }} tintColor={theme.accent} />}
                    ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.textMuted }]}>No products found</Text>}
                />
            )}
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
    searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
    searchInput: { flex: 1, fontSize: 14 },
    filterRow: { flexDirection: 'row', padding: 14, gap: 8 },
    chip: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center', borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '600' },
    list: { paddingHorizontal: 16, paddingBottom: 30 },
    card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
    productImg: { width: 60, height: 60, borderRadius: 10 },
    productInfo: { flex: 1 },
    productTitle: { fontSize: 14, fontWeight: '700' },
    productShop: { fontSize: 12, marginTop: 2, marginBottom: 5 },
    metaRow: { flexDirection: 'row', gap: 10 },
    price: { fontSize: 13, fontWeight: '700' },
    stock: { fontSize: 12 },
    sold: { fontSize: 12 },
    hideBtn: { padding: 10, borderRadius: 10 },
    emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15 },
});

export default AdminProductsScreen;
