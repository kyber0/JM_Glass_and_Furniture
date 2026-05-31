import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    FlatList,
    Image,
    ActivityIndicator,
    Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { productsAPI, BASE_URL } from '../services/api';

// Safe JSON parse — never throws
const safeJSON = (str, fallback = []) => {
    if (!str || typeof str !== 'string') return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
};
import { useFavorites } from '../context/FavoritesContext';
import { useCart } from '../context/CartContext';
import { saveSearch } from '../utils/searchHistory';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

const SearchResultsScreen = ({ route, navigation }) => {
    const { initialQuery } = route.params || {};
    const [searchQuery, setSearchQuery] = useState(initialQuery || '');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const { toggleFavorite, isFavorite } = useFavorites();
    const { cartCount } = useCart();  // cartCount used in header badge
    const { theme } = useTheme();

    useEffect(() => {
        if (searchQuery) {
            handleSearch(searchQuery);
        }
    }, []);

    const handleSearch = async (queryText) => {
        if (!queryText.trim()) return;
        setLoading(true);
        try {
            await saveSearch(queryText);
            const response = await productsAPI.getAll({ search: queryText })
                .catch(e => ({ success: false, _err: e.message }));
            if (response?.success) {
                const mappedProducts = response.data.map(p => {
                    const imgUrl = p.image_url
                        ? (p.image_url.startsWith('http') ? p.image_url : `${BASE_URL}/${p.image_url}`)
                        : 'https://via.placeholder.com/300';
                    return {
                        id:             p.product_id.toString(),
                        product_id:     p.product_id,
                        title:          p.title,
                        price:          `₱${parseFloat(p.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                        category:       p.category_name,
                        image:          imgUrl,
                        image_url:      p.image_url,
                        rating:         parseFloat(p.avg_rating) || 0,
                        soldCount:      parseInt(p.sold_count) || 0,
                        description:    p.description,
                        stock_quantity: parseInt(p.stock_quantity) || 0,
                        shop_count:     parseInt(p.shop_count) || 0,
                        sizes:          safeJSON(p.sizes,  []),
                        colors:         safeJSON(p.colors, []),
                        specs:          safeJSON(p.specs,  []),
                    };
                });
                setResults(mappedProducts);
            }
        } catch (error) {
            console.warn('[Search] Error:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const renderProductItem = ({ item }) => (
        <View style={[styles.productCard, { backgroundColor: theme.card }]}>
            <View style={styles.imageWrapper}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('ProductDetail', { product: item, recommendedProducts: results })}
                    activeOpacity={0.9}
                >
                    <Image source={{ uri: item.image }} style={styles.productImage} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.heartButton}
                    onPress={() => toggleFavorite(item.id)}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name={isFavorite(item.id) ? 'heart' : 'heart-outline'}
                        size={22}
                        color={isFavorite(item.id) ? '#e53935' : '#999'}
                    />
                </TouchableOpacity>

                {/* + navigates to ProductDetail — buyer picks shop in Available Locations */}
                <TouchableOpacity
                    style={styles.addToCartButton}
                    onPress={() => navigation.navigate('ProductDetail', { product: item, recommendedProducts: results })}
                >
                    <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
            </View>
            <TouchableOpacity
                style={styles.productInfo}
                onPress={() => navigation.navigate('ProductDetail', { product: item, recommendedProducts: results })}
                activeOpacity={0.7}
            >
                <Text style={[styles.productTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={[styles.ratingText, { color: theme.text }]}>{item.rating}</Text>
                    <Text style={[styles.soldText, { color: theme.textMuted }]}>|  {item.soldCount > 0 ? `${item.soldCount} sold` : '0 sold'}</Text>
                </View>
                <Text style={styles.productPrice}>{item.price}</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <View style={[styles.searchContainer, { backgroundColor: theme.inputBg }]}>
                    <Ionicons name="search" size={20} color={theme.textMuted} style={styles.searchIcon} />
                    <TextInput
                        style={[styles.searchInput, { color: theme.text }]}
                        placeholder="Search products..."
                        placeholderTextColor={theme.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={() => handleSearch(searchQuery)}
                        returnKeyType="search"
                        autoFocus={!initialQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity style={styles.cartButton} onPress={() => navigation.navigate('Cart')}>
                    <Ionicons name="cart-outline" size={26} color={theme.headerText} />
                    {cartCount > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{cartCount}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : results.length > 0 ? (
                <FlatList
                    data={results}
                    renderItem={renderProductItem}
                    keyExtractor={(item) => item.id}
                    numColumns={2}
                    columnWrapperStyle={styles.productRow}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.productList}
                    ListHeaderComponent={() => (
                        <Text style={[styles.resultCountText, { color: theme.textMuted }]}>{results.length} results for "{searchQuery}"</Text>
                    )}
                />
            ) : (
                <View style={styles.centerBox}>
                    <Ionicons name="search-outline" size={60} color={theme.textMuted} />
                    <Text style={[styles.noResultsText, { color: theme.text }]}>No results found for "{searchQuery}"</Text>
                    <Text style={[styles.noResultsSubText, { color: theme.textMuted }]}>Try checking your spelling or use more general terms</Text>
                </View>
            )}

            {/* ProductSelectionModal removed: buyers pick a shop in ProductDetailScreen */}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    backButton: { marginRight: 10 },
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 40,
        marginRight: 15,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 15 },
    cartButton: { position: 'relative' },
    badge: {
        position: 'absolute', top: -5, right: -8, backgroundColor: '#e53935',
        borderRadius: 10, width: 18, height: 18, justifyContent: 'center', alignItems: 'center',
    },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

    centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
    noResultsText: { fontSize: 18, fontWeight: 'bold', marginTop: 15 },
    noResultsSubText: { fontSize: 14, textAlign: 'center', marginTop: 8 },
    resultCountText: { fontSize: 14, marginBottom: 15, marginTop: 5 },

    productList: { padding: 15, paddingBottom: 30 },
    productRow: { justifyContent: 'space-between', marginBottom: 15 },
    productCard: {
        width: width / 2 - 22, borderRadius: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3.84, elevation: 3,
    },
    imageWrapper: { width: '100%', height: 150, borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden', position: 'relative' },
    productImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    heartButton: {
        position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.9)',
        width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41, elevation: 2,
    },
    addToCartButton: {
        position: 'absolute', bottom: 8, right: 8, backgroundColor: '#8D6E63',
        width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
    },
    productInfo: { padding: 10 },
    productTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4, height: 36, lineHeight: 18 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    ratingText: { fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
    soldText: { fontSize: 11, marginLeft: 4 },
    productPrice: { fontSize: 15, fontWeight: 'bold', color: '#8D6E63' },
});

export default SearchResultsScreen;
