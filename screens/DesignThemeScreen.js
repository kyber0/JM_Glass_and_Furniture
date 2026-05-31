import React, { useState, useEffect, useCallback } from 'react';
import {
    StyleSheet, Text, View, Image, ScrollView,
    TouchableOpacity, FlatList, Dimensions, ActivityIndicator,
    StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFavorites } from '../context/FavoritesContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { productsAPI, BASE_URL } from '../services/api';

// Safe JSON parse — never throws
const safeJSON = (str, fallback = []) => {
    if (!str || typeof str !== 'string') return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
};

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 16 * 2 - 12) / 2; // 2-column grid

// ── Star Rating Row ───────────────────────────────────────────────────────────
const Stars = ({ rating, size = 11 }) => (
    <View style={{ flexDirection: 'row', gap: 1 }}>
        {[1, 2, 3, 4, 5].map(i => (
            <Ionicons
                key={i}
                name={i <= Math.round(rating) ? 'star' : 'star-outline'}
                size={size}
                color="#FFD700"
            />
        ))}
    </View>
);

// ── Product Card — Grid ───────────────────────────────────────────────────────
const GridCard = ({ item, onPress, onFav, onCart, isFav, accent }) => (
    <TouchableOpacity style={[gcStyles.card]} onPress={onPress} activeOpacity={0.88}>
        <View style={gcStyles.imageWrap}>
            <Image source={{ uri: item.image }} style={gcStyles.image} resizeMode="cover" />
            {item.tag === 'NEW' && (
                <View style={gcStyles.newBadge}>
                    <Text style={gcStyles.newBadgeText}>NEW</Text>
                </View>
            )}
            <TouchableOpacity style={gcStyles.favBtn} onPress={onFav}>
                <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={18} color={isFav ? '#e53935' : '#fff'} />
            </TouchableOpacity>
        </View>
        <View style={gcStyles.info}>
            <Text style={gcStyles.title} numberOfLines={2}>{item.title}</Text>
            <Stars rating={item.rating} />
            <View style={gcStyles.bottom}>
                <Text style={[gcStyles.price, { color: accent }]}>{item.price}</Text>
                <TouchableOpacity style={[gcStyles.cartBtn, { backgroundColor: accent }]} onPress={onCart}>
                    <Ionicons name="add" size={16} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    </TouchableOpacity>
);

const gcStyles = StyleSheet.create({
    card: {
        width: CARD_W, backgroundColor: '#fff', borderRadius: 14,
        overflow: 'hidden', marginBottom: 12,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
    },
    imageWrap: { width: '100%', height: CARD_W * 0.9, position: 'relative' },
    image: { width: '100%', height: '100%' },
    newBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#4CAF50', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    newBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    favBtn: {
        position: 'absolute', top: 8, right: 8,
        backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 6,
    },
    info: { padding: 10, gap: 4 },
    title: { fontSize: 13, fontWeight: '700', color: '#222', lineHeight: 18 },
    bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    price: { fontSize: 14, fontWeight: '800' },
    cartBtn: { borderRadius: 8, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
});

// ── Product Card — List ───────────────────────────────────────────────────────
const ListCard = ({ item, onPress, onFav, onCart, isFav, accent }) => (
    <TouchableOpacity style={lcStyles.card} onPress={onPress} activeOpacity={0.88}>
        <View style={lcStyles.imageWrap}>
            <Image source={{ uri: item.image }} style={lcStyles.image} resizeMode="cover" />
            {item.tag === 'NEW' && (
                <View style={lcStyles.newBadge}><Text style={lcStyles.newBadgeText}>NEW</Text></View>
            )}
        </View>
        <View style={lcStyles.info}>
            <Text style={lcStyles.title} numberOfLines={2}>{item.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Stars rating={item.rating} />
                <Text style={lcStyles.ratingNum}>{item.rating > 0 ? item.rating.toFixed(1) : '—'}</Text>
            </View>
            {item.category && <Text style={lcStyles.category}>{item.category}</Text>}
            <Text style={lcStyles.sold}>{item.soldCount} sold</Text>
            <View style={lcStyles.bottom}>
                <Text style={[lcStyles.price, { color: accent }]}>{item.price}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={onFav}>
                        <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? '#e53935' : '#aaa'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[lcStyles.cartBtn, { backgroundColor: accent }]} onPress={onCart}>
                        <Ionicons name="cart-outline" size={14} color="#fff" />
                        <Text style={lcStyles.cartBtnText}>Add</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    </TouchableOpacity>
);

const lcStyles = StyleSheet.create({
    card: {
        flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14,
        overflow: 'hidden', marginBottom: 12,
        shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
    },
    imageWrap: { width: 110, height: 120, position: 'relative' },
    image: { width: '100%', height: '100%' },
    newBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#4CAF50', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
    newBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    info: { flex: 1, padding: 12, gap: 4 },
    title: { fontSize: 14, fontWeight: '700', color: '#222', lineHeight: 19 },
    category: { fontSize: 11, color: '#999', fontWeight: '500' },
    ratingNum: { fontSize: 11, color: '#888' },
    sold: { fontSize: 11, color: '#aaa' },
    bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    price: { fontSize: 15, fontWeight: '800' },
    cartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    cartBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

// ── Horizontal Scroll Card (for sections) ─────────────────────────────────────
const HCard = ({ item, onPress, onFav, isFav, accent }) => (
    <TouchableOpacity style={hcStyles.card} onPress={onPress} activeOpacity={0.88}>
        <View style={hcStyles.imageWrap}>
            <Image source={{ uri: item.image }} style={hcStyles.image} resizeMode="cover" />
            <TouchableOpacity style={hcStyles.favBtn} onPress={onFav}>
                <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={16} color={isFav ? '#e53935' : '#fff'} />
            </TouchableOpacity>
            {item.tag === 'NEW' && (
                <View style={hcStyles.newBadge}><Text style={hcStyles.newBadgeText}>NEW</Text></View>
            )}
        </View>
        <View style={hcStyles.info}>
            <Text style={hcStyles.title} numberOfLines={1}>{item.title}</Text>
            <Stars rating={item.rating} size={10} />
            {item.soldCount > 0 && <Text style={hcStyles.sold}>{item.soldCount} sold</Text>}
            <Text style={[hcStyles.price, { color: accent }]}>{item.price}</Text>
        </View>
    </TouchableOpacity>
);

const hcStyles = StyleSheet.create({
    card: {
        width: 145, marginRight: 12, backgroundColor: '#fff',
        borderRadius: 12, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    },
    imageWrap: { width: '100%', height: 130, position: 'relative' },
    image: { width: '100%', height: '100%' },
    favBtn: { position: 'absolute', top: 7, right: 7, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, padding: 5 },
    newBadge: { position: 'absolute', top: 7, left: 7, backgroundColor: '#4CAF50', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
    newBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    info: { padding: 9, gap: 3 },
    title: { fontSize: 12, fontWeight: '700', color: '#222' },
    sold: { fontSize: 10, color: '#aaa' },
    price: { fontSize: 13, fontWeight: '800', marginTop: 2 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
const DesignThemeScreen = ({ route, navigation }) => {
    const { theme: designTheme } = route.params;
    const { toggleFavorite, isFavorite } = useFavorites();
    const { addToCart, cartCount } = useCart();
    const { theme } = useTheme();

    const [themeProducts, setThemeProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'popular' | 'new' | category name
    const [showAll, setShowAll] = useState(false);

    useEffect(() => { loadThemeProducts(); }, [designTheme.title]);

    const loadThemeProducts = async () => {
        try {
            setLoading(true);
            const response = await productsAPI.getAll({ theme: designTheme.title })
                .catch(e => ({ success: false, _err: e.message }));
            if (response?.success) {
                const mappedProducts = response.data.map(p => {
                    const imgUrl = p.image_url
                        ? (p.image_url.startsWith('http') ? p.image_url : `${BASE_URL}/${p.image_url}`)
                        : 'https://via.placeholder.com/300';
                    return {
                        id: p.product_id.toString(),
                        title: p.title,
                        price: `₱${parseFloat(p.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                        rawPrice: parseFloat(p.price),
                        category: p.category_name,
                        image: imgUrl,
                        rating: parseFloat(p.avg_rating) || 0,
                        soldCount: parseInt(p.sold_count) || 0,
                        description: p.description,
                        owner_id: p.owner_id,
                        stock_quantity: p.stock_quantity,
                        sizes:  safeJSON(p.sizes,  []),
                        colors: safeJSON(p.colors, []),
                        specs:  safeJSON(p.specs,  []),
                        tag: p.created_at && new Date(p.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) ? 'NEW' : null,
                    };
                });
                setThemeProducts(mappedProducts);
            } else if (response?._err) {
                console.warn('[ThemeScreen] Fetch error:', response._err);
            }
        } catch (error) {
            console.warn('[ThemeScreen] Unexpected error:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const popularProducts = [...themeProducts].sort((a, b) => b.soldCount - a.soldCount).slice(0, 8);
    const newArrivals = themeProducts.filter(p => p.tag === 'NEW');
    const categories = [...new Set(themeProducts.map(p => p.category).filter(Boolean))];

    // Filtered list for the "All Products" grid/list section
    const filteredProducts = (() => {
        if (activeFilter === 'all') return themeProducts;
        if (activeFilter === 'popular') return popularProducts;
        if (activeFilter === 'new') return newArrivals.length > 0 ? newArrivals : themeProducts;
        return themeProducts.filter(p => p.category === activeFilter);
    })();

    const displayedProducts = showAll ? filteredProducts : filteredProducts.slice(0, 12);

    const goToProduct = (item) => navigation.navigate('ProductDetail', { product: item, recommendedProducts: themeProducts });

    const renderGridItem = useCallback(({ item }) => (
        <GridCard
            item={item}
            onPress={() => goToProduct(item)}
            onFav={() => toggleFavorite(item)}
            onCart={() => addToCart(item)}
            isFav={isFavorite(item.id)}
            accent={theme.accent}
        />
    ), [themeProducts, theme]);

    const renderListItem = useCallback(({ item }) => (
        <ListCard
            item={item}
            onPress={() => goToProduct(item)}
            onFav={() => toggleFavorite(item)}
            onCart={() => addToCart(item)}
            isFav={isFavorite(item.id)}
            accent={theme.accent}
        />
    ), [themeProducts, theme]);

    const FILTERS = [
        { id: 'all', label: 'All' },
        { id: 'popular', label: '🔥 Popular' },
        { id: 'new', label: '✨ New' },
        ...categories.map(c => ({ id: c, label: c })),
    ];

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>

                {/* ── Hero ─────────────────────────────────────────────────── */}
                <View style={styles.heroContainer}>
                    <Image source={{ uri: designTheme.image }} style={styles.heroImage} />
                    <LinearGradient
                        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.65)']}
                        style={StyleSheet.absoluteFill}
                    />
                    <SafeAreaView style={styles.heroContent} edges={['top']}>
                        <View style={styles.headerRow}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                                <Ionicons name="arrow-back" size={22} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Cart')}>
                                <Ionicons name="cart-outline" size={22} color="#fff" />
                                {cartCount > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{cartCount}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>
                        <View style={styles.heroBottom}>
                            <View style={[styles.tagPill, { backgroundColor: theme.accent }]}>
                                <Text style={styles.tagPillText}>Design Theme</Text>
                            </View>
                            <Text style={styles.heroTitle}>{designTheme.title}</Text>
                            {designTheme.subtitle ? (
                                <Text style={styles.heroSubtitle}>{designTheme.subtitle}</Text>
                            ) : null}
                            <View style={styles.heroStats}>
                                <Ionicons name="cube-outline" size={14} color="rgba(255,255,255,0.85)" />
                                <Text style={styles.heroStatText}>{themeProducts.length} products</Text>
                                <View style={styles.heroDot} />
                                <Ionicons name="star-outline" size={14} color="rgba(255,255,255,0.85)" />
                                <Text style={styles.heroStatText}>{popularProducts.length} popular</Text>
                            </View>
                        </View>
                        {/* View toggle — bottom-right of hero */}
                        <View style={styles.heroToggle}>
                            <View style={[styles.viewToggle, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'rgba(255,255,255,0.25)' }]}>
                                <TouchableOpacity
                                    style={[styles.toggleBtn, viewMode === 'grid' && { backgroundColor: theme.accent }]}
                                    onPress={() => setViewMode('grid')}
                                >
                                    <Ionicons name="grid" size={14} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: theme.accent }]}
                                    onPress={() => setViewMode('list')}
                                >
                                    <Ionicons name="list" size={14} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </SafeAreaView>
                </View>

                {/* ── Sticky filter bar ─────────────────────────────────────── */}
                <View style={[styles.stickyBar, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll} style={{ flex: 1 }}>
                        {FILTERS.map(f => (
                            <TouchableOpacity
                                key={f.id}
                                style={[
                                    styles.filterChip,
                                    { borderColor: theme.border, backgroundColor: activeFilter === f.id ? theme.accent : theme.card }
                                ]}
                                onPress={() => { setActiveFilter(f.id); setShowAll(false); }}
                            >
                                <Text style={[styles.filterChipText, { color: activeFilter === f.id ? '#fff' : theme.text }]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.content}>
                    {loading ? (
                        <View style={styles.loadingBox}>
                            <ActivityIndicator size="large" color={theme.accent} />
                            <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading products...</Text>
                        </View>
                    ) : themeProducts.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <Ionicons name="cube-outline" size={48} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No products in this theme yet.</Text>
                        </View>
                    ) : (
                        <>
                            {/* ── Popular horizontal strip (only in 'all' filter) ── */}
                            {activeFilter === 'all' && popularProducts.length > 0 && (
                                <View style={styles.section}>
                                    <View style={styles.sectionHeader}>
                                        <View style={styles.sectionTitleRow}>
                                            <Ionicons name="flame" size={18} color="#FF5722" />
                                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Popular Picks</Text>
                                        </View>
                                    </View>
                                    <FlatList
                                        data={popularProducts}
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        keyExtractor={item => item.id + '_pop'}
                                        renderItem={({ item }) => (
                                            <HCard
                                                item={item}
                                                onPress={() => goToProduct(item)}
                                                onFav={() => toggleFavorite(item)}
                                                isFav={isFavorite(item.id)}
                                                accent={theme.accent}
                                            />
                                        )}
                                        contentContainerStyle={{ paddingRight: 16 }}
                                    />
                                </View>
                            )}

                            {/* ── New Arrivals strip (only in 'all' filter) ────── */}
                            {activeFilter === 'all' && newArrivals.length > 0 && (
                                <View style={styles.section}>
                                    <View style={styles.sectionHeader}>
                                        <View style={styles.sectionTitleRow}>
                                            <Ionicons name="sparkles" size={18} color="#FF9800" />
                                            <Text style={[styles.sectionTitle, { color: theme.text }]}>New Arrivals</Text>
                                        </View>
                                    </View>
                                    <FlatList
                                        data={newArrivals}
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        keyExtractor={item => item.id + '_new'}
                                        renderItem={({ item }) => (
                                            <HCard
                                                item={item}
                                                onPress={() => goToProduct(item)}
                                                onFav={() => toggleFavorite(item)}
                                                isFav={isFavorite(item.id)}
                                                accent={theme.accent}
                                            />
                                        )}
                                        contentContainerStyle={{ paddingRight: 16 }}
                                    />
                                </View>
                            )}

                            {/* ── Product Grid / List ──────────────────────────── */}
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                                        {activeFilter === 'all' ? 'All Products' :
                                            activeFilter === 'popular' ? '🔥 Popular' :
                                                activeFilter === 'new' ? '✨ New Arrivals' : activeFilter}
                                    </Text>
                                    <Text style={[styles.countText, { color: theme.textMuted }]}>
                                        {filteredProducts.length} items
                                    </Text>
                                </View>

                                {viewMode === 'grid' ? (
                                    <View style={styles.grid}>
                                        {displayedProducts.map(item => (
                                            <View key={item.id} style={{ width: CARD_W }}>
                                                <GridCard
                                                    item={item}
                                                    onPress={() => goToProduct(item)}
                                                    onFav={() => toggleFavorite(item)}
                                                    onCart={() => addToCart(item)}
                                                    isFav={isFavorite(item.id)}
                                                    accent={theme.accent}
                                                />
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <View>
                                        {displayedProducts.map(item => (
                                            <ListCard
                                                key={item.id}
                                                item={item}
                                                onPress={() => goToProduct(item)}
                                                onFav={() => toggleFavorite(item)}
                                                onCart={() => addToCart(item)}
                                                isFav={isFavorite(item.id)}
                                                accent={theme.accent}
                                            />
                                        ))}
                                    </View>
                                )}

                                {filteredProducts.length > 12 && !showAll && (
                                    <TouchableOpacity
                                        style={[styles.showMoreBtn, { borderColor: theme.accent }]}
                                        onPress={() => setShowAll(true)}
                                    >
                                        <Text style={[styles.showMoreText, { color: theme.accent }]}>
                                            Show all {filteredProducts.length} products
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color={theme.accent} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </>
                    )}
                </View>
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    // Hero
    heroContainer: { height: 300, width: '100%' },
    heroImage: { ...StyleSheet.absoluteFillObject },
    heroContent: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 16 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    iconBtn: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)', position: 'relative' },
    badge: {
        position: 'absolute', top: 2, right: 2, backgroundColor: '#e53935',
        borderRadius: 10, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    heroBottom: { paddingBottom: 20, gap: 6 },
    heroToggle: { position: 'absolute', bottom: 18, right: 16 },
    tagPill: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
    tagPillText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    heroTitle: { fontSize: 30, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
    heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 20 },
    heroStats: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    heroStatText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
    heroDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
    // Sticky bar
    stickyBar: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
        paddingLeft: 16, paddingRight: 8, borderBottomWidth: 1, gap: 8,
    },
    filtersScroll: { gap: 8, paddingRight: 8 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    filterChipText: { fontSize: 13, fontWeight: '600' },
    viewToggle: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, overflow: 'hidden', flexShrink: 0, alignSelf: 'center', width: 56 },
    toggleBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
    // Content
    content: { padding: 16 },
    loadingBox: { alignItems: 'center', paddingTop: 60, gap: 12 },
    loadingText: { fontSize: 14 },
    emptyBox: { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 15 },
    // Sections
    section: { marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { fontSize: 17, fontWeight: '800' },
    countText: { fontSize: 12 },
    // Grid
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    // Show more
    showMoreBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, marginTop: 8,
    },
    showMoreText: { fontSize: 14, fontWeight: '700' },
});

export default DesignThemeScreen;
