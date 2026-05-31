import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    StyleSheet,
    Text,
    View,
    Image,
    TextInput,
    ScrollView,
    TouchableOpacity,
    FlatList,
    Dimensions,
    Keyboard,
    Modal,
    Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import ProductSelectionModal from '../components/ProductSelectionModal';
import SearchSuggestions from '../components/SearchSuggestions';
import { productsAPI, adminAPI, BASE_URL } from '../services/api';
import { saveSearch } from '../utils/searchHistory';
import CustomAlert from '../components/CustomAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const itemWidth = width / 2;

const categories = ['All', 'Window', 'Door', 'Cabinets', 'Sink', 'Shower Enclosure'];

const heroSlides = [
    {
        id: '1',
        image: 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?q=80&w=2070&auto=format&fit=crop',
        title: 'From idea to installation',
        subtitle: '— all in one place.'
    },
    {
        id: '2',
        image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=2070&auto=format&fit=crop',
        title: 'Modern Designs',
        subtitle: 'Elevate your space.'
    },
    {
        id: '3',
        image: 'https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=2000&auto=format&fit=crop',
        title: 'Premium Materials',
        subtitle: 'Built to last.'
    }
];

// ... Carousel ...
const HeroCarousel = React.memo(() => {
    const [activeSlide, setActiveSlide] = useState(0);
    const scrollRef = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => {
            setActiveSlide((prev) => {
                const next = (prev + 1) % heroSlides.length;
                scrollRef.current?.scrollTo({ x: next * width, animated: true });
                return next;
            });
        }, 4000);
        return () => clearInterval(timer);
    }, []);

    const onScrollEnd = useCallback((e) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / width);
        setActiveSlide(idx);
    }, []);

    return (
        <View style={styles.heroContainer}>
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onScrollEnd}
                scrollEventThrottle={16}
                nestedScrollEnabled
            >
                {heroSlides.map((slide) => (
                    <View key={slide.id} style={styles.heroSlide}>
                        <Image source={{ uri: slide.image }} style={styles.heroImage} />
                        <View style={styles.heroOverlay} />
                        <View style={styles.heroTextContainer}>
                            <Text style={styles.heroTitle}>{slide.title}</Text>
                            <Text style={styles.heroSubtitle}>{slide.subtitle}</Text>
                        </View>
                    </View>
                ))}
            </ScrollView>

            {/* Pagination Dots */}
            <View style={styles.paginationContainer}>
                {heroSlides.map((_, index) => (
                    <View
                        key={index}
                        style={[
                            styles.paginationDot,
                            index === activeSlide ? styles.activeDot : styles.inactiveDot,
                        ]}
                    />
                ))}
            </View>
        </View>
    );
});

/* ───────────────────────────────────────────
   Main HomeScreen
   ─────────────────────────────────────────── */
const HomeScreen = ({ navigation }) => {
    const { theme, darkMode } = useTheme();
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState([]);
    const [trendingProducts, setTrendingProducts] = useState([]);
    const [newArrivals, setNewArrivals] = useState([]);
    const [designThemes, setDesignThemes] = useState([]);
    const { toggleFavorite, isFavorite } = useFavorites();
    const { addToCart, cartCount } = useCart();
    const [searchFocused, setSearchFocused] = useState(false);
    const [headerScrolled, setHeaderScrolled] = useState(false);
    const [announcement, setAnnouncement] = useState(null);
    const [announcementVisible, setAnnouncementVisible] = useState(false);
    const annoFadeAnim = useRef(new Animated.Value(0)).current;
    const annoSlideAnim = useRef(new Animated.Value(60)).current;
    const { user } = useAuth();
    const [recentlyViewed, setRecentlyViewed] = useState([]);
    const [flashSales, setFlashSales] = useState([]);
    const [flashCountdowns, setFlashCountdowns] = useState({});

    // Alert State
    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'error',
        showCancel: false, confirmText: 'OK', cancelText: 'Cancel', onConfirm: null
    });
    const showAlert = (message, title = 'Attention', type = 'warning') =>
        setAlertConfig({ visible: true, title, message, type, showCancel: false, confirmText: 'OK', onConfirm: null });
    
    // Show a "Log In / Cancel" prompt for guests
    const showGuestAlert = (action = 'do this') => {
        setAlertConfig({
            visible: true,
            title: 'Account Required',
            message: `Please log in or create an account to ${action}.`,
            type: 'info',
            showCancel: true,
            cancelText: 'Not now',
            confirmText: 'Log In',
            onConfirm: () => navigation.navigate('Login'),
        });
    };
    const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    useFocusEffect(
        useCallback(() => {
            loadProducts();
            // Load recently viewed from AsyncStorage
            AsyncStorage.getItem('recentlyViewed').then(raw => {
                if (raw) setRecentlyViewed(JSON.parse(raw));
            }).catch(() => { });
            // Load active flash sale vouchers
            import('../services/api').then(({ vouchersAPI }) => {
                vouchersAPI.getActive && vouchersAPI.getActive().then(res => {
                    if (res?.success && res.data) {
                        setFlashSales(res.data.filter(v => v.end_date));
                    }
                }).catch(() => { });
            });
        }, [])
    );

    // Flash sale countdown ticker
    useEffect(() => {
        if (flashSales.length === 0) return;
        const tick = () => {
            const now = Date.now();
            const next = {};
            flashSales.forEach(v => {
                const diff = new Date(v.end_date).getTime() - now;
                if (diff > 0) {
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    next[v.voucher_id] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                } else {
                    next[v.voucher_id] = 'EXPIRED';
                }
            });
            setFlashCountdowns(next);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [flashSales]);

    const formatCount = (n) => {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return n.toString();
    };

    // Safe JSON parse — never throws, returns fallback on any error
    const safeJSON = (str, fallback = []) => {
        if (!str || typeof str !== 'string') return fallback;
        try { return JSON.parse(str); } catch { return fallback; }
    };

    const loadProducts = async () => {
        try {
            // Fetch products and announcement in parallel — themes is separate (can fail independently)
            const [prodRes, annoRes] = await Promise.all([
                productsAPI.getAll().catch(e => ({ success: false, _err: e.message })),
                adminAPI.getAnnouncement().catch(() => null),
            ]);

            if (annoRes?.success && annoRes.announcement) {
                setAnnouncement(annoRes.announcement);
                setTimeout(() => {
                    setAnnouncementVisible(true);
                    Animated.parallel([
                        Animated.timing(annoFadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
                        Animated.spring(annoSlideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
                    ]).start();
                }, 800);
            } else {
                setAnnouncement(null);
            }

            if (prodRes?.success) {
                // One row per admin-catalog product (no listing_id — shop selection
                // happens in ProductDetailScreen via the Available Locations section)
                const mappedProducts = prodRes.data.map(p => ({
                    id:             p.product_id.toString(),
                    product_id:     p.product_id,
                    title:          p.title,
                    price:          `₱${parseFloat(p.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                    category:       p.category_name,
                    image:          p.image_url || 'https://via.placeholder.com/300',
                    image_url:      p.image_url,
                    rating:         parseFloat(p.avg_rating) || 0,
                    soldCount:      parseInt(p.sold_count) || 0,
                    description:    p.description,
                    stock_quantity: parseInt(p.stock_quantity) || 0,
                    shop_count:     parseInt(p.shop_count) || 0,
                    sizes:          safeJSON(p.sizes,  []),
                    colors:         safeJSON(p.colors, []),
                    specs:          safeJSON(p.specs,  []),
                    tag:            p.created_at && new Date(p.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) ? 'NEW' : null,
                }));
                setProducts(mappedProducts);
                setTrendingProducts(mappedProducts.slice(0, 5));
                const tagged = mappedProducts.filter(p => p.tag === 'NEW');
                setNewArrivals(tagged.length > 0 ? tagged : mappedProducts.slice(0, 5));
            } else if (prodRes?._err) {
                console.warn('[Products] Fetch error:', prodRes._err);
            }
        } catch (error) {
            console.error('Failed to load products:', error);
        }

        // Themes fetched independently — failure here doesn't affect products
        const fetchThemes = async (attempt = 1) => {
            try {
                const themeRes = await productsAPI.getThemes();
                if (themeRes?.success && themeRes.data?.length > 0) {
                    const premiumCovers = [
                        'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=2074&auto=format&fit=crop',
                        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2070&auto=format&fit=crop',
                        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=2053&auto=format&fit=crop',
                        'https://images.unsplash.com/photo-1600585152220-90363fe7e115?q=80&w=2070&auto=format&fit=crop'
                    ];
                    setDesignThemes(themeRes.data.map((t, i) => ({ ...t, image: premiumCovers[i % premiumCovers.length] })));
                } else if (attempt < 3) {
                    // Retry up to 2 more times (server may be mid-restart)
                    setTimeout(() => fetchThemes(attempt + 1), 2000 * attempt);
                }
            } catch (e) {
                if (attempt < 3) {
                    setTimeout(() => fetchThemes(attempt + 1), 2000 * attempt);
                } else {
                    console.warn('[Themes] Could not load after 3 attempts:', e.message);
                }
            }
        };
        fetchThemes();
    };

    // Note: ProductSelectionModal removed — buyers pick a shop in ProductDetailScreen
    // (Available Locations section) before adding to cart.

    const handleMainScroll = useCallback((event) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        setHeaderScrolled(offsetY > 200);
    }, []);

    const renderProductItem = useCallback(({ item }) => (
        <View style={[styles.productCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.imageWrapper}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('ProductDetail', { product: item, recommendedProducts: products })}
                    activeOpacity={0.9}
                >
                    <Image source={{ uri: item.image }} style={styles.productImage} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.heartButton, { backgroundColor: darkMode ? 'rgba(0,0,0,0.5)' : '#fff' }]}
                    onPress={() => {
                        if (user?.role === 'guest') {
                            showGuestAlert('save favorites');
                            return;
                        }
                        toggleFavorite(item.id);
                    }}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name={isFavorite(item.id) ? 'heart' : 'heart-outline'}
                        size={22}
                        color={isFavorite(item.id) ? theme.danger : theme.textSecondary}
                    />
                </TouchableOpacity>

                {/* Shop count badge — shown when multiple sellers carry this product */}
                {item.shop_count > 1 && (
                    <View style={[styles.shopCountBadge, { backgroundColor: theme.accent }]}>
                        <Ionicons name="storefront-outline" size={10} color="#fff" />
                        <Text style={styles.shopCountText}>{item.shop_count} shops</Text>
                    </View>
                )}

                {/* + button navigates to ProductDetail so buyer can pick a shop first */}
                <TouchableOpacity
                    style={[styles.addToCartButton, { backgroundColor: theme.accent }]}
                    onPress={() => {
                        if (user?.role === 'guest') {
                            showGuestAlert('view product details');
                            return;
                        }
                        navigation.navigate('ProductDetail', { product: item, recommendedProducts: products });
                    }}
                >
                    <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
            </View>
            <TouchableOpacity
                style={styles.productInfo}
                onPress={() => navigation.navigate('ProductDetail', { product: item, recommendedProducts: products })}
                activeOpacity={0.7}
            >
                <Text style={[styles.productTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={[styles.ratingText, { color: theme.textSecondary }]}>{item.rating}</Text>
                    <Text style={[styles.soldText, { color: theme.textMuted }]}>|  {formatCount(item.soldCount)} sold</Text>
                </View>
                <Text style={[styles.productPrice, { color: theme.accent }]}>{item.price}</Text>
            </TouchableOpacity>
        </View>
    ), [toggleFavorite, isFavorite, theme, darkMode, products, navigation]);

    const listHeader = (
        <View>
            <HeroCarousel />

            {/* Categories */}
            <View style={[styles.mainContent, { backgroundColor: theme.background }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>CATEGORIES</Text>
                <View style={styles.categoriesContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
                        {categories.map((cat, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.categoryPill,
                                    { borderColor: theme.accent },
                                    activeCategory === cat && { backgroundColor: theme.accent }
                                ]}
                                onPress={() => setActiveCategory(cat)}
                            >
                                <Text
                                    style={[
                                        styles.categoryText,
                                        { color: theme.accent },
                                        activeCategory === cat && { color: '#fff' }
                                    ]}
                                >
                                    {cat}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* ── Flash Sales ── */}
                {flashSales.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>⚡ FLASH DEALS</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                            {flashSales.map(v => (
                                <View key={v.voucher_id} style={[styles.flashCard, { backgroundColor: theme.accent }]}>
                                    <Text style={styles.flashDiscount}>{v.discount_percent ? `${v.discount_percent}% OFF` : `₱${v.discount_amount} OFF`}</Text>
                                    <Text style={styles.flashCode}>{v.code}</Text>
                                    <View style={styles.flashTimerRow}>
                                        <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.8)" />
                                        <Text style={styles.flashTimer}>{flashCountdowns[v.voucher_id] || '...'}</Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </>
                )}



                {/* ── Trending Now ── */}
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>TRENDING NOW</Text>
                    <Ionicons name="trending-up" size={22} color={theme.accent} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                    {(activeCategory === 'All' ? trendingProducts : trendingProducts.filter(p => p.category === activeCategory)).map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={[styles.trendingCard, { backgroundColor: theme.card }]}
                            onPress={() => navigation.navigate('ProductDetail', { product: item, recommendedProducts: products })}
                        >
                            <Image source={{ uri: item.image }} style={styles.trendingImage} />
                            <View style={styles.trendingInfo}>
                                <Text style={[styles.trendingTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                                <Text style={[styles.trendingPrice, { color: theme.accent }]}>{item.price}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* ── Design Themes ── */}
                {designThemes.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>DESIGN THEMES</Text>
                            <Ionicons name="color-palette-outline" size={22} color={theme.accent} />
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                            {designThemes.map((dt) => (
                                <TouchableOpacity
                                    key={dt.id}
                                    style={styles.themeCard}
                                    onPress={() => navigation.navigate('DesignTheme', { theme: dt })}
                                >
                                    <Image source={{ uri: dt.image }} style={styles.themeImage} />
                                    <View style={styles.themeOverlay} />
                                    <View style={styles.themeTextContainer}>
                                        <Text style={styles.themeTitle}>{dt.title}</Text>
                                        <Text style={styles.themeSubtitle}>{dt.subtitle}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </>
                )}

                {/* ── New Arrivals ── */}
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>NEW ARRIVALS</Text>
                    <Ionicons name="sparkles" size={22} color={theme.accent} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                    {(activeCategory === 'All' ? newArrivals : newArrivals.filter(p => p.category === activeCategory)).map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.arrivalCard}
                            onPress={() => navigation.navigate('ProductDetail', { product: item, recommendedProducts: products })}
                        >
                            <View style={{ position: 'relative' }}>
                                <View style={styles.arrivalImageWrapper}>
                                    <Image source={{ uri: item.image }} style={styles.arrivalImage} />
                                </View>
                                <View style={[styles.newBadge, { backgroundColor: theme.accent }]}>
                                    <Text style={styles.newBadgeText}>NEW</Text>
                                </View>
                            </View>
                            <Text style={[styles.arrivalTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                            <Text style={[styles.arrivalPrice, { color: theme.accent }]}>{item.price}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Products Section Header */}
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>ALL PRODUCTS</Text>
                    <Ionicons name="grid-outline" size={20} color={theme.accent} />
                </View>
            </View>
        </View>
    );

    const handleSearch = async (query) => {
        setSearchFocused(false);
        if (query.trim()) {
            await saveSearch(query);
            navigation.navigate('SearchResults', { initialQuery: query });
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar style={headerScrolled ? (darkMode ? 'light' : 'dark') : 'light'} />


            <FlatList
                data={activeCategory === 'All' ? products : products.filter(p => p.category === activeCategory)}
                renderItem={renderProductItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                columnWrapperStyle={styles.productRow}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.productList}
                ListHeaderComponent={listHeader}
                onScroll={handleMainScroll}
                scrollEventThrottle={16}
            />

            {/* Fixed Header Overlay */}
            <SafeAreaView
                style={[
                    styles.absoluteHeader,
                    headerScrolled && [styles.absoluteHeaderScrolled, { backgroundColor: theme.headerBg }],
                ]}
                pointerEvents="box-none"
            >
                <View style={styles.headerSearchRow}>
                    <View style={[
                        styles.searchContainer,
                        headerScrolled && [styles.searchContainerScrolled, { backgroundColor: theme.inputBg }],
                    ]}>
                        <Ionicons name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
                        <TextInput
                            style={[styles.searchInput, { color: theme.text }]}
                            placeholder="Search"
                            placeholderTextColor={theme.textMuted}
                            value={searchQuery}
                            onChangeText={(text) => {
                                setSearchQuery(text);
                                if (!searchFocused) setSearchFocused(true);
                            }}
                            onFocus={() => setSearchFocused(true)}
                            onSubmitEditing={() => handleSearch(searchQuery)}
                            returnKeyType="search"
                        />
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.cartButton,
                            headerScrolled && [styles.cartButtonScrolled, { borderColor: theme.accent }],
                        ]}
                        onPress={() => navigation.navigate('Cart')}
                    >
                        <View>
                            <Ionicons name="cart-outline" size={28} color={headerScrolled || searchFocused ? theme.headerText : 'white'} />
                            {cartCount > 0 && (
                                <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                                    <Text style={styles.badgeText}>{cartCount}</Text>
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>
                </View>

            </SafeAreaView>

            {/* Search Suggestions — at root level so absoluteFill covers full screen */}
            <SearchSuggestions
                visible={searchFocused}
                onClose={() => setSearchFocused(false)}
                onSelect={handleSearch}
            />

            {/* ProductSelectionModal removed from HomeScreen:
                Buyers must go through ProductDetailScreen to pick a shop
                (Available Locations section) before adding to cart. */}

            {/* Custom Alert */}
            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                cancelText={alertConfig.cancelText || 'Cancel'}
                confirmText={alertConfig.confirmText || 'OK'}
                onConfirm={() => { hideAlert(); if (alertConfig.onConfirm) alertConfig.onConfirm(); }}
                onClose={hideAlert}
            />

            {/* ── Announcement Pop-up Modal ────────────────────── */}
            <Modal
                visible={announcementVisible}
                transparent
                animationType="none"
                statusBarTranslucent
                onRequestClose={() => setAnnouncementVisible(false)}
            >
                <TouchableOpacity
                    style={styles.annoModalOverlay}
                    activeOpacity={1}
                    onPress={() => setAnnouncementVisible(false)}
                >
                    <Animated.View
                        style={[
                            styles.annoModalCard,
                            { backgroundColor: theme.card },
                            { opacity: annoFadeAnim, transform: [{ translateY: annoSlideAnim }] },
                        ]}
                    >
                        <TouchableOpacity activeOpacity={1} onPress={() => { }}>
                            {/* Header gradient strip */}
                            <View style={[styles.annoModalHeader, { backgroundColor: theme.accent }]}>
                                <View style={styles.annoModalHeaderLeft}>
                                    <View style={styles.annoIconCircle}>
                                        <Ionicons name="megaphone" size={20} color="#fff" />
                                    </View>
                                    <View>
                                        <Text style={styles.annoModalTag}>ANNOUNCEMENT</Text>
                                        <Text style={styles.annoModalTitle}>Notice from Admin</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={styles.annoCloseBtn}
                                    onPress={() => setAnnouncementVisible(false)}
                                >
                                    <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
                                </TouchableOpacity>
                            </View>

                            {/* Message body */}
                            <View style={styles.annoModalBody}>
                                <View style={[styles.annoAccentBar, { backgroundColor: theme.accent }]} />
                                <Text style={[styles.annoModalMsg, { color: theme.text }]}>
                                    {announcement}
                                </Text>
                            </View>

                            {/* Footer */}
                            <TouchableOpacity
                                style={[styles.annoModalFooterBtn, { backgroundColor: theme.accent }]}
                                onPress={() => setAnnouncementVisible(false)}
                            >
                                <Text style={styles.annoModalFooterText}>Got it!</Text>
                            </TouchableOpacity>
                        </TouchableOpacity>
                    </Animated.View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    heroContainer: {
        height: 380,
        width: '100%',
        position: 'relative',
    },
    heroSlide: {
        width: width,
        height: 380,
    },
    heroImage: {
        ...StyleSheet.absoluteFillObject,
        resizeMode: 'cover',
    },
    heroOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    heroTextContainer: {
        position: 'absolute',
        bottom: 80,
        left: 20,
        right: 20,
    },
    heroTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: 'white',
        textShadowColor: 'rgba(0,0,0,0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10,
        marginBottom: 2,
    },
    heroSubtitle: {
        fontSize: 22,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        textShadowColor: 'rgba(0,0,0,0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10,
    },
    paginationContainer: {
        position: 'absolute',
        bottom: 60,
        left: 20,
        flexDirection: 'row',
        zIndex: 5,
    },
    paginationDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8,
    },
    activeDot: {
        backgroundColor: 'white',
        width: 28,
        borderRadius: 5,
    },
    inactiveDot: {
        backgroundColor: 'rgba(255,255,255,0.6)',
    },

    // Fixed header
    absoluteHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    absoluteHeaderScrolled: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
    },
    headerSearchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 10,
        width: '100%',
    },
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 30,
        paddingHorizontal: 15,
        alignItems: 'center',
        height: 50,
        marginRight: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3.84,
        elevation: 5,
    },
    searchContainerScrolled: {
        backgroundColor: '#f5f5f5',
        shadowOpacity: 0,
        elevation: 0,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#333',
    },
    cartButton: {
        width: 50,
        height: 50,
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    cartButtonScrolled: {
        backgroundColor: 'transparent',
        borderColor: '#8D6E63',
    },
    badge: {
        position: 'absolute',
        top: -5,
        right: -8,
        backgroundColor: '#e53935',
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#fff',
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },

    // Categories section
    mainContent: {
        backgroundColor: '#fff',
        marginTop: -40,
        borderTopRightRadius: 40,
        paddingTop: 30,
        paddingBottom: 15,
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: '700',
        letterSpacing: 1,
        color: '#3e2723',
        marginLeft: 20,
        marginBottom: 15,
        textTransform: 'uppercase',
    },
    categoriesContainer: {
        marginBottom: 10,
    },
    categoriesScroll: {
        paddingHorizontal: 15,
    },
    categoryPill: {
        backgroundColor: 'transparent',
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 20,
        marginHorizontal: 5,
        borderWidth: 1,
        borderColor: '#8D6E63',
    },
    activeCategoryPill: {
        backgroundColor: '#8D6E63',
        borderColor: '#8D6E63',
    },
    categoryText: {
        color: '#8D6E63',
        fontWeight: '600',
        fontSize: 14,
    },
    activeCategoryText: {
        color: 'white',
    },

    // Section header row
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingRight: 20,
        marginTop: 10,
    },
    horizontalScroll: {
        paddingHorizontal: 15,
        paddingBottom: 5,
    },

    // ── Trending ──
    trendingCard: {
        width: 160,
        marginHorizontal: 5,
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
    },
    trendingImage: {
        width: '100%',
        height: 120,
        resizeMode: 'cover',
    },
    trendingInfo: {
        padding: 10,
    },
    trendingTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        marginBottom: 3,
    },
    trendingPrice: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#8D6E63',
    },

    // ── Design Themes ──
    themeCard: {
        width: 220,
        height: 140,
        marginHorizontal: 5,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    themeImage: {
        ...StyleSheet.absoluteFillObject,
        resizeMode: 'cover',
    },
    themeOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    themeTextContainer: {
        position: 'absolute',
        bottom: 14,
        left: 14,
        right: 14,
    },
    themeTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: 'white',
        marginBottom: 2,
    },
    themeSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
    },

    // ── New Arrivals ──
    arrivalCard: {
        width: 150,
        marginHorizontal: 5,
    },
    arrivalImageWrapper: {
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 8,
    },
    arrivalImage: {
        width: '100%',
        height: 150,
        resizeMode: 'cover',
    },
    newBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: '#8D6E63',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    newBadgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
    },
    arrivalTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        marginBottom: 2,
    },
    arrivalPrice: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#8D6E63',
    },

    // Product grid
    productList: {
        paddingHorizontal: 0,
        paddingBottom: 80,
    },
    productRow: {
        justifyContent: 'flex-start',
        marginBottom: 0,
    },
    productCard: {
        backgroundColor: '#fff',
        width: itemWidth,
        padding: 15,
        borderRightWidth: 0.5,
        borderBottomWidth: 0.5,
        borderColor: '#f0f0f0',
    },
    imageWrapper: {
        position: 'relative',
    },
    productImage: {
        width: '100%',
        height: 180,
        marginBottom: 10,
        resizeMode: 'cover',
    },
    heartButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 3,
    },
    addToCartButton: {
        position: 'absolute',
        bottom: 15,
        right: 10,
        backgroundColor: '#8D6E63',
        borderRadius: 20,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 4,
        zIndex: 10,
    },
    // Multi-seller shop count badge (bottom-left of product image)
    shopCountBadge: {
        position: 'absolute',
        bottom: 15,
        left: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 10,
        zIndex: 10,
    },
    shopCountText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    productInfo: {
        alignItems: 'flex-start',
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    ratingText: {
        fontSize: 12,
        color: '#555',
        marginLeft: 4,
        fontWeight: '600',
    },
    soldText: {
        fontSize: 12,
        color: '#999',
        marginLeft: 8,
    },
    productTitle: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
    },
    productPrice: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Announcement modal
    annoModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
        paddingBottom: 30,
        paddingHorizontal: 16,
    },
    annoModalCard: {
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 12,
    },
    annoModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    annoModalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    annoIconCircle: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center', alignItems: 'center',
    },
    annoModalTag: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
    annoModalTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
    annoCloseBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.2)',
        justifyContent: 'center', alignItems: 'center',
    },
    annoModalBody: {
        flexDirection: 'row',
        padding: 18,
        gap: 12,
        alignItems: 'flex-start',
    },
    annoAccentBar: { width: 3, borderRadius: 4, minHeight: 40 },
    annoModalMsg: { flex: 1, fontSize: 15, lineHeight: 23, fontWeight: '400' },
    annoModalFooterBtn: {
        marginHorizontal: 18, marginBottom: 18,
        borderRadius: 12, paddingVertical: 13,
        alignItems: 'center',
    },
    annoModalFooterText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    flashCard: {
        width: 140,
        borderRadius: 16,
        padding: 14,
        marginHorizontal: 5,
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
    },
    flashDiscount: {
        fontSize: 22,
        fontWeight: '900',
        color: '#fff',
        marginBottom: 4,
    },
    flashCode: {
        fontSize: 13,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.85)',
        letterSpacing: 1,
        marginBottom: 8,
    },
    flashTimerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    flashTimer: {
        fontSize: 13,
        fontWeight: '800',
        color: '#fff',
        fontVariant: ['tabular-nums'],
    },
});

export default HomeScreen;

