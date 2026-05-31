import React, { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import {
    StyleSheet,
    Text,
    View,
    Image,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    FlatList,
    Modal,
    StatusBar,
    Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import ProductSelectionModal from '../components/ProductSelectionModal';
import { shopAPI, reviewsAPI, productsAPI, stockAlertsAPI, publicAPI, geocodeAPI, addressesAPI, BASE_URL } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useFees } from '../context/FeesContext';
import CustomAlert from '../components/CustomAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const ProductDetailScreen = ({ route, navigation }) => {
    const { product, recommendedProducts } = route.params; // Expecting product and related items
    const { user } = useAuth();
    const { theme, darkMode } = useTheme();
    const { getInstallationTier } = useFees();
    const { toggleFavorite, isFavorite } = useFavorites();
    const { cartCount } = useCart();

    // State for enriched product data
    const [enrichedProduct, setEnrichedProduct] = useState(product);
    const [shop, setShop] = useState(null);
    const [shopProducts, setShopProducts] = useState(recommendedProducts || []);
    const [activeIndex, setActiveIndex] = useState(0);
    const flatListRef = React.useRef(null);
    const [stockAlertSubscribed, setStockAlertSubscribed] = useState(false);

    // Available Locations state
    const [locations, setLocations] = useState([]);
    const [selectedListing, setSelectedListing] = useState(null);
    const [buyerCoords, setBuyerCoords] = useState(null);
    const [shopsModalVisible, setShopsModalVisible] = useState(false);
    const [distanceInfo, setDistanceInfo] = useState(null); // { distance_display, delivery_fee_display }

    const displayProduct = enrichedProduct || product;

    // Fetch Full Details
    React.useEffect(() => {
        const loadDetails = async (coords) => {
            try {
                const res = await productsAPI.getProduct(
                    product.product_id || product.id,
                    // FIX D1: pass listing_id so backend prefers the correct shop
                    { ...(coords || {}), listing_id: product.listing_id }
                );
                if (res.success) {
                    setEnrichedProduct(res.data);
                    setShop(res.data.shop);
                    if (res.data.related_products) {
                        setShopProducts(res.data.related_products);
                    }
                    const locs = res.data.available_locations || [];
                    setLocations(locs);
                    // Auto-select nearest/cheapest with stock — skip user's own shop
                    const buyableLocs = user ? locs.filter(l => l.user_id !== user.id) : locs;
                    const firstInStock = buyableLocs.find(l => l.stock_quantity > 0);
                    setSelectedListing(firstInStock || buyableLocs[0] || null);
                }
            } catch (e) {
                console.error(e);
            }
        };

        // Request user's default address first, fallback to GPS
        (async () => {
            let coords = null;
            try {
                if (user && user.role !== 'guest') {
                    const addrRes = await addressesAPI.getAddresses(user.id);
                    if (addrRes.success) {
                        const defaultAddress = addrRes.data.find(a => a.is_default) || addrRes.data[0];
                        if (defaultAddress && defaultAddress.latitude && defaultAddress.longitude) {
                            coords = { lat: defaultAddress.latitude, lng: defaultAddress.longitude };
                        }
                    }
                }

                if (!coords) {
                    const { status } = await Location.requestForegroundPermissionsAsync();
                    if (status === 'granted') {
                        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                        coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
                    }
                }
                
                if (coords) {
                    setBuyerCoords(coords);
                    await loadDetails(coords);
                } else {
                    await loadDetails(null);
                }
            } catch {
                await loadDetails(null);
            }
        })();

        // --- Recently Viewed (with server-reset detection) ---
        const saveRecentlyViewed = async () => {
            try {
                // Check if a server-side data reset happened — clear local cache if so
                const res = await publicAPI.getResetTimestamp().catch(() => null);
                const serverReset = res?.last_reset_at || null;
                if (serverReset) {
                    const localReset = await AsyncStorage.getItem('last_reset_at');
                    if (!localReset || new Date(serverReset) > new Date(localReset)) {
                        await AsyncStorage.removeItem('recentlyViewed');
                        await AsyncStorage.setItem('last_reset_at', serverReset);
                    }
                }

                const raw = await AsyncStorage.getItem('recentlyViewed');
                const existing = raw ? JSON.parse(raw) : [];
                const productId = product.product_id || product.id;
                // Normalize image to a full URL before saving
                const rawImg = product.image || product.image_url || '';
                const resolvedImage = rawImg.startsWith('http') ? rawImg : (rawImg ? `${BASE_URL}/${rawImg}` : 'https://via.placeholder.com/300');
                const productToSave = { ...product, image: resolvedImage };
                // Remove duplicate and prepend current product
                const filtered = existing.filter(p => (p.product_id || p.id) !== productId);
                const updated = [productToSave, ...filtered].slice(0, 10);
                await AsyncStorage.setItem('recentlyViewed', JSON.stringify(updated));
            } catch (e) { /* silent */ }
        };
        saveRecentlyViewed();

        // FIX A4: corrected condition — !user.role === 'guest' was always false
        if (user && user.role !== 'guest') {
            const pid = product.product_id || product.id;
            stockAlertsAPI.check(user.id, pid).then(r => {
                if (r?.success) setStockAlertSubscribed(r.subscribed);
            }).catch(() => { });
        }
    }, [product]);

    // Fetch distance whenever a shop listing is selected
    React.useEffect(() => {
        setDistanceInfo(null);
        if (!selectedListing || !buyerCoords) return;

        const shopId  = selectedListing.shop_id;
        const { lat: custLat, lng: custLng } = buyerCoords;

        if (!shopId) return;

        // Mode 2: shop_id (DB lookup) + raw customer GPS coords
        geocodeAPI.distance({ shopId, custLat, custLng })
            .then(r => { if (r?.success) setDistanceInfo(r); })
            .catch(() => {});
    }, [selectedListing, buyerCoords]);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'error',
        showCancel: false, confirmText: 'OK', onConfirm: null
    });

    const showAlert = (message, title = 'Error', type = 'error') => {
        setAlertConfig({ visible: true, title, message, type, showCancel: false, confirmText: 'OK', onConfirm: null });
    };

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

    const hideAlert = () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    };

    // FIX Step4: owner_id no longer comes from the list-view route param.
    // Derive isOwner from the shop data returned by the detail API.
    const isOwner = !!(user && shop && shop.user_id === user.id);

    // isListingOwner: true when the currently-selected shop listing belongs to this user.
    // Drives the Add to Cart button — changes to "Your Product" when own shop selected.
    const isListingOwner = !!(user && selectedListing && selectedListing.user_id === user.id);

    // visibleLocations: hide the user's own shop — they can't buy from themselves.
    // This is the source of truth for all Available Locations rendering.
    const visibleLocations = user
        ? locations.filter(loc => loc.user_id !== user.id)
        : locations;

    const handleFavorite = () => {
        if (user?.role === 'guest') {
            showGuestAlert('save favorites');
            return;
        }
        if (isOwner) {
            showAlert("You cannot favorite your own product.", "Action Not Allowed", "error");
            return;
        }
        toggleFavorite(product.product_id || product.id);
    };

    const formatCount = (n) => {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return n.toString();
    };

    // Product Selection Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const handleOpenModal = () => setModalVisible(true);
    const handleCloseModal = () => setModalVisible(false);

    // Lightbox state
    const [lightboxVisible, setLightboxVisible] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const lightboxRef = React.useRef(null);

    const openLightbox = (index) => {
        setLightboxIndex(index);
        setLightboxVisible(true);
    };

    // FIX A3: use enriched displayProduct specs, not stale route param;
    //          no fake placeholder fallback — show nothing if no real specs exist
    const rawSpecs = displayProduct?.specs ?? product.specs;
    const specs = rawSpecs && rawSpecs.length > 0
        ? (typeof rawSpecs === 'string' ? JSON.parse(rawSpecs) : rawSpecs)
        : [];

    const [reviews, setReviews] = useState([]);
    const [loadingReviews, setLoadingReviews] = useState(true);

    useFocusEffect(
        useCallback(() => {
            fetchReviews();
        }, [product])
    );

    const fetchReviews = async () => {
        try {
            const response = await reviewsAPI.getProductReviews(product.id || product.product_id);
            if (response.success) {
                setReviews(response.reviews);
            }
        } catch (error) {
            console.error('Failed to load reviews:', error);
        } finally {
            setLoadingReviews(false);
        }
    };

    const renderRelatedItem = ({ item }) => (
        <TouchableOpacity
            style={styles.relatedCard}
            onPress={() => navigation.push('ProductDetail', { product: item, recommendedProducts })}
        >
            <Image source={{ uri: item.image_url }} style={[styles.relatedImage, { backgroundColor: theme.border }]} />
            <Text style={[styles.relatedTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
            {/* FIX A2: format related product price with ₱ and locale */}
            <Text style={[styles.relatedPrice, { color: theme.accent }]}>
                ₱{parseFloat(item.price || 0).toLocaleString('en-PH')}
            </Text>
        </TouchableOpacity>
    );

    // FIX A5: use live selected listing stock first, then enriched data, then route param
    const isOutOfStock = (
        selectedListing?.stock_quantity ??
        displayProduct?.stock_quantity ??
        product.stock_quantity ??
        0
    ) <= 0;

    const images = enrichedProduct?.images || [product.image || product.image_url];

    // Auto Slide
    React.useEffect(() => {
        if (images.length <= 1) return;
        const interval = setInterval(() => {
            let nextIndex = activeIndex + 1;
            if (nextIndex >= images.length) nextIndex = 0;
            // Only scroll if we are not interacting? For simplicity, just scroll.
            // But scrolling manualy updates activeIndex via onMomentumScrollEnd.
            // If we update state here, it triggers re-render.
            // Better to just scroll, and let onMomentumScrollEnd update index?
            // Actually scrollTo triggers scroll event.
            if (flatListRef.current) {
                flatListRef.current.scrollToIndex({ index: nextIndex, animated: true });
                setActiveIndex(nextIndex);
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [activeIndex, images.length]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Custom Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <View style={styles.headerRight}>
                    <TouchableOpacity style={styles.headerBtn}>
                        <Ionicons name="search-outline" size={24} color={theme.headerText} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerBtn}
                        onPress={() => Share.share({
                            title: displayProduct.title,
                            message: `Check out "${displayProduct.title}" on JM Glass & Furniture! ₱${parseFloat(displayProduct.price).toLocaleString()}`,
                        })}
                    >
                        <Ionicons name="share-social-outline" size={24} color={theme.headerText} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerBtn}
                        onPress={() => navigation.navigate('Cart')}
                    >
                        <Ionicons name="cart-outline" size={24} color={theme.headerText} />
                        {cartCount > 0 && (
                            <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                                <Text style={styles.badgeText}>{cartCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {/* Hero Image Carousel */}
                <View style={styles.imageContainer}>
                    <FlatList
                        ref={flatListRef}
                        data={images}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(event) => {
                            const index = Math.floor(event.nativeEvent.contentOffset.x / width);
                            setActiveIndex(index);
                        }}
                        renderItem={({ item, index }) => (
                            <TouchableOpacity activeOpacity={0.95} onPress={() => openLightbox(index)}>
                                <Image source={{ uri: item }} style={styles.heroImage} />
                            </TouchableOpacity>
                        )}
                        keyExtractor={(item, index) => index.toString()}
                    />
                    {/* Pagination Indicator X/Y */}
                    {images.length > 1 && (
                        <View style={styles.paginationBadge}>
                            <Text style={styles.paginationText}>
                                {activeIndex + 1}/{images.length}
                            </Text>
                        </View>
                    )}
                    {/* Expand / zoom icon */}
                    <TouchableOpacity
                        style={styles.expandBtn}
                        onPress={() => openLightbox(activeIndex)}
                    >
                        <Ionicons name="expand-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.floatingHeart, { backgroundColor: theme.card }, isOwner && { opacity: 0.5 }]}
                        onPress={() => handleFavorite()}
                    >
                        <Ionicons
                            name={isFavorite(product.product_id || product.id) ? "heart" : "heart-outline"}
                            size={28}
                            color={isFavorite(product.product_id || product.id) ? theme.danger : theme.icon}
                        />
                    </TouchableOpacity>
                </View>

                {/* Main Info */}
                <View style={styles.infoContainer}>
                    <Text style={[styles.title, { color: theme.text }]}>{displayProduct.title}</Text>

                    <View style={styles.ratingRow}>
                        <Ionicons name="star" size={16} color="#FFD700" />
                        <Text style={[styles.ratingValue, { color: theme.text }]}>
                            {displayProduct.avg_rating ? parseFloat(displayProduct.avg_rating).toFixed(1) : '0.0'}
                        </Text>
                        <Text style={[styles.ratingCount, { color: theme.textSecondary }]}>({reviews.length} reviews)</Text>
                        <View style={[styles.dividerVertical, { backgroundColor: theme.border }]} />
                        <Text style={[styles.soldCount, { color: theme.textSecondary }]}>{formatCount(displayProduct.sold_count)} Sold</Text>
                    </View>

                    {/* FIX A1: format main price with ₱ symbol and en-PH locale */}
                    <Text style={[styles.price, { color: theme.accent }]}>
                        ₱{parseFloat(displayProduct.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Text>


                    {/* ── Dynamic Shop Section ──────────────────────────── */}
                    {selectedListing ? (() => {
                        const logoUri = selectedListing.logo_url
                            ? (selectedListing.logo_url.startsWith('http') ? selectedListing.logo_url : `${BASE_URL}/${selectedListing.logo_url}`)
                            : `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedListing.shop_name || 'Shop')}&background=8D6E63&color=fff&bold=true`;

                        const shopIsOwner = !!(user && selectedListing.user_id && selectedListing.user_id === user.id);

                        return (
                            <View>
                                <TouchableOpacity
                                    style={[styles.shopSection, { backgroundColor: theme.card, borderColor: theme.border }, shopIsOwner && { opacity: 0.8 }]}
                                    onPress={() => !shopIsOwner && navigation.navigate('Shop', { shopId: selectedListing.shop_id })}
                                    disabled={shopIsOwner}
                                    activeOpacity={0.75}
                                >
                                    <Image source={{ uri: logoUri }} style={styles.shopAvatar} />
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <Text style={[styles.shopLabel, { color: theme.textSecondary }]}>
                                                {shopIsOwner ? 'Your Shop' : 'Sold by'}
                                            </Text>
                                            {selectedListing.is_verified ? (
                                                <Ionicons name="checkmark-circle" size={12} color="#2e7d32" />
                                            ) : null}
                                        </View>
                                        <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={1}>
                                            {selectedListing.shop_name}
                                        </Text>
                                        {selectedListing.address ? (
                                            <Text style={[styles.shopAddress, { color: theme.textMuted }]} numberOfLines={1}>
                                                📍 {selectedListing.address}
                                            </Text>
                                        ) : null}
                                        {distanceInfo && !shopIsOwner && (
                                            <View style={styles.distanceRow}>
                                                <View style={[styles.distancePill, { backgroundColor: theme.accent + '18' }]}>
                                                    <Ionicons name="navigate-outline" size={11} color={theme.accent} />
                                                    <Text style={[styles.distancePillText, { color: theme.accent }]}>
                                                        {distanceInfo.distance_display} away
                                                    </Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                    {!shopIsOwner && (
                                        <TouchableOpacity
                                            style={[styles.chatSellerBtn, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}
                                            onPress={() => {
                                                if (user?.role === 'guest') {
                                                    showGuestAlert('chat with the seller');
                                                    return;
                                                }
                                                navigation.navigate('Chat', {
                                                    otherUserId: selectedListing.user_id,
                                                    conversation: {
                                                        other_user_id: selectedListing.user_id,
                                                        full_name: selectedListing.shop_name,
                                                        shop_logo: selectedListing.logo_url
                                                            ? (selectedListing.logo_url.startsWith('http') ? selectedListing.logo_url : `${BASE_URL}/${selectedListing.logo_url}`)
                                                            : null,
                                                    },
                                                });
                                            }}
                                        >
                                            <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.accent} />
                                            <Text style={[styles.chatSellerText, { color: theme.accent }]}>Chat</Text>
                                        </TouchableOpacity>
                                    )}
                                </TouchableOpacity>
                            </View>
                        );
                    })() : (
                        /* Placeholder — shown until buyer picks a shop from Available Locations */
                        (locations.length > 0 || shop) && (
                            <View style={[styles.shopSectionEmpty, { borderColor: theme.border, backgroundColor: theme.card }]}>
                                <Ionicons name="storefront-outline" size={22} color={theme.textMuted} />
                                <Text style={[styles.shopSectionEmptyText, { color: theme.textMuted }]}>
                                    Select a shop from Available Locations below
                                </Text>
                            </View>
                        )
                    )}

                    {/* ── Available Locations ───────────────────────────── */}
                    {/* User's own shop is filtered from visibleLocations — they can't buy from themselves */}
                    {visibleLocations.length > 0 && (
                        <View style={[styles.locationsSection, { backgroundColor: theme.sectionBg, borderColor: theme.border }]}>
                            {/* Section Header */}
                            <View style={styles.locationsSectionHeader}>
                                <View style={styles.locationsTitleRow}>
                                    <View style={[styles.locationsTitleIcon, { backgroundColor: theme.accent + '20' }]}>
                                        <Ionicons name="location" size={15} color={theme.accent} />
                                    </View>
                                    <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0, marginBottom: 0, marginLeft: 8, fontSize: 16 }]}>
                                        Available Nearby
                                    </Text>
                                    <View style={[styles.locationsBadge, { backgroundColor: theme.accent }]}>
                                        <Text style={[styles.locationsBadgeText, { color: '#fff' }]}>
                                            {visibleLocations.length} {visibleLocations.length === 1 ? 'shop' : 'shops'}
                                        </Text>
                                    </View>
                                </View>
                                {!buyerCoords && (
                                    <View style={[styles.locationsGpsBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                        <Ionicons name="navigate-circle-outline" size={14} color={theme.textMuted} />
                                        <Text style={[styles.locationsNoGps, { color: theme.textMuted }]}>
                                            Enable location to sort by nearest shop
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Location Cards — always 2, more shops in bottom sheet */}
                            {visibleLocations.slice(0, 2).map((loc) => {
                                const isSelected = selectedListing?.listing_id === loc.listing_id;
                                const isOOS = loc.stock_quantity <= 0;
                                const logoUri = loc.logo_url
                                    ? (loc.logo_url.startsWith('http') ? loc.logo_url : `${BASE_URL}/${loc.logo_url}`)
                                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(loc.shop_name)}&background=8D6E63&color=fff&bold=true`;
                                const types = loc.service_types
                                    ? (typeof loc.service_types === 'string' ? loc.service_types.split(',') : loc.service_types)
                                    : ['delivery'];
                                return (
                                    <TouchableOpacity
                                        key={loc.listing_id}
                                        style={[
                                            styles.locationCard,
                                            { backgroundColor: theme.card, borderColor: isSelected ? theme.accent : theme.border },
                                            isSelected && styles.locationCardSelected,
                                            isSelected && { borderColor: theme.accent, shadowColor: theme.accent },
                                            isOOS && { opacity: 0.45 },
                                        ]}
                                        onPress={() => !isOOS && setSelectedListing(loc)}
                                        disabled={isOOS}
                                        activeOpacity={0.78}
                                    >
                                        {/* Selected accent bar */}
                                        {isSelected && (
                                            <View style={[styles.locationCardAccentBar, { backgroundColor: theme.accent }]} />
                                        )}

                                        {/* Selected top-right corner badge */}
                                        {isSelected && (
                                            <View style={[styles.selectedCornerBadge, { backgroundColor: theme.accent }]}>
                                                <Ionicons name="checkmark" size={9} color="#fff" />
                                                <Text style={styles.selectedCornerBadgeText}>Selected</Text>
                                            </View>
                                        )}

                                        {/* Logo with ring */}
                                        <View style={[
                                            styles.locationLogoRing,
                                            { borderColor: isSelected ? theme.accent : 'transparent' }
                                        ]}>
                                            <Image source={{ uri: logoUri }} style={styles.locationLogo} />
                                            {isSelected && (
                                                <View style={[styles.locationLogoCheck, { backgroundColor: theme.accent }]}>
                                                    <Ionicons name="checkmark" size={9} color="#fff" />
                                                </View>
                                            )}
                                        </View>

                                        {/* Content */}
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            {/* Shop name + verified + OOS badge row */}
                                            <View style={styles.locationTopRow}>
                                                <Text style={[styles.locationShopName, { color: theme.text }]} numberOfLines={1}>
                                                    {loc.shop_name}
                                                </Text>
                                                {!!loc.is_verified && (
                                                    <Ionicons name="checkmark-circle" size={14} color="#43a047" style={{ marginLeft: 4 }} />
                                                )}
                                                {isOOS && (
                                                    <View style={styles.oosBadge}>
                                                        <Text style={styles.oosBadgeText}>Out of Stock</Text>
                                                    </View>
                                                )}
                                            </View>

                                            {/* Address pill */}
                                            {loc.address ? (
                                                <View style={styles.locationAddressPill}>
                                                    <Ionicons name="location-outline" size={11} color={theme.textMuted} />
                                                    <Text style={[styles.locationAddress, { color: theme.textMuted, marginBottom: 0 }]} numberOfLines={1}>
                                                        {loc.address}
                                                    </Text>
                                                </View>
                                            ) : null}

                                            {/* Service type badges */}
                                            <View style={styles.serviceTypesRow}>
                                                {types.map(type => (
                                                    <View key={type} style={[
                                                        styles.serviceTypeBadge,
                                                        { backgroundColor: theme.accent + '15', borderColor: theme.accent + '35' }
                                                    ]}>
                                                        <Ionicons
                                                            name={type === 'delivery_installation' ? 'construct-outline' : 'car-outline'}
                                                            size={10} color={theme.accent}
                                                        />
                                                        <Text style={[styles.serviceTypeText, { color: theme.accent }]}>
                                                            {type === 'delivery_installation' ? 'w/ Install' : 'Delivery'}
                                                        </Text>
                                                    </View>
                                                ))}
                                                {/* Install fee range chip — shown when this listing supports installation */}
                                                {types.some(t => t.trim().toLowerCase() === 'delivery_installation') && (() => {
                                                    const complexity = displayProduct.installation_complexity || 'basic';
                                                    const tier = getInstallationTier(complexity);
                                                    return (
                                                        <View style={[styles.serviceTypeBadge, { backgroundColor: '#fff3e0', borderColor: '#ffcc80' }]}>
                                                            <Text style={[styles.serviceTypeText, { color: '#e65100' }]}>
                                                                ₱{tier.min.toLocaleString()}–₱{tier.max.toLocaleString()} install
                                                            </Text>
                                                        </View>
                                                    );
                                                })()}
                                            </View>

                                            {/* Bottom info row: price · stock · distance */}
                                            <View style={styles.locationBottomRow}>
                                                <Text style={[styles.locationPrice, { color: theme.accent }]}>
                                                    ₱{parseFloat(loc.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </Text>
                                                <View style={[styles.locationInfoChip, { backgroundColor: isOOS ? '#ffebee' : theme.sectionBg }]}>
                                                    <Ionicons name="cube-outline" size={10} color={isOOS ? '#e53935' : theme.textSecondary} />
                                                    <Text style={[styles.locationInfoChipText, { color: isOOS ? '#e53935' : theme.textSecondary }]}>
                                                        {isOOS ? 'Out of stock' : `${loc.stock_quantity} left`}
                                                    </Text>
                                                </View>
                                                {loc.distance_km != null && (
                                                    <View style={[styles.locationInfoChip, { backgroundColor: theme.accent + '12' }]}>
                                                        <Ionicons name="navigate-outline" size={10} color={theme.accent} />
                                                        <Text style={[styles.locationInfoChipText, { color: theme.accent }]}>
                                                            {`${loc.distance_km} km`}
                                                        </Text>
                                                    </View>
                                                )}
                                                {loc.distance_km != null && loc.delivery_fee != null && (
                                                    <View style={[styles.locationInfoChip, { backgroundColor: '#4CAF5012' }]}>
                                                        <Ionicons name="bicycle-outline" size={10} color="#2e7d32" />
                                                        <Text style={[styles.locationInfoChipText, { color: '#2e7d32' }]}>
                                                            ~₱{Math.ceil(loc.delivery_fee).toLocaleString()}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>

                                        {/* Right chevron */}
                                        {!isOOS && (
                                            <Ionicons
                                                name={isSelected ? 'radio-button-on' : 'chevron-forward'}
                                                size={isSelected ? 20 : 16}
                                                color={isSelected ? theme.accent : theme.border}
                                                style={{ marginLeft: 6 }}
                                            />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}

                            {/* "View all X shops" expand button — shown when > 2 visible nearby */}
                            {visibleLocations.length > 2 && (
                                <TouchableOpacity
                                    style={[styles.showAllBtn, { backgroundColor: theme.accent + '12', borderColor: theme.accent + '40' }]}
                                    onPress={() => setShopsModalVisible(true)}
                                >
                                    <Ionicons name="storefront-outline" size={15} color={theme.accent} />
                                    <Text style={[styles.showAllBtnText, { color: theme.accent }]}>
                                        {'See all ' + visibleLocations.length + ' shops nearby'}
                                    </Text>
                                    <Ionicons name="chevron-forward" size={14} color={theme.accent} />
                                </TouchableOpacity>
                            )}

                        </View>
                    )}


                    {/* Stock Status */}
                    {isOutOfStock && (
                        <Text style={[styles.outOfStockText, { color: theme.danger }]}>Out of Stock</Text>
                    )}

                    {/* Description */}
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Description</Text>
                    <Text style={[styles.description, { color: theme.textSecondary }]}>
                        {displayProduct.description || "Premium quality furniture designed to elevate your living space. Made with durable materials and modern aesthetics, this piece is perfect for contemporary homes. Easy to install and maintain."}
                    </Text>

                    {/* Specifications — stacked layout handles long values cleanly */}
                    {specs.length > 0 && (
                        <>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Specifications</Text>
                            <View style={[styles.specsContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                {specs.map((spec, index) => (
                                    <View
                                        key={index}
                                        style={[
                                            styles.specRow,
                                            { borderBottomColor: theme.border },
                                            index === specs.length - 1 && { borderBottomWidth: 0 },
                                        ]}
                                    >
                                        <Text style={[styles.specLabel, { color: theme.textMuted }]}>
                                            {spec.label}
                                        </Text>
                                        <Text style={[styles.specValue, { color: theme.text }]}>
                                            {spec.value}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </>
                    )}

                    {/* Reviews */}
                    <View style={styles.reviewsHeader}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Reviews ({reviews.length})</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('AllReviews', { productId: product.product_id || product.id })}>
                            <Text style={[styles.seeAllText, { color: theme.accent }]}>See All</Text>
                        </TouchableOpacity>
                    </View>
                    {reviews.length === 0 ? (
                        <Text style={[styles.noReviewsText, { color: theme.textMuted }]}>No reviews yet</Text>
                    ) : (
                        reviews.slice(0, 4).map((review) => (
                            <View key={review.review_id} style={[styles.reviewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <View style={styles.reviewHeader}>
                                    <View style={styles.reviewerInfo}>
                                        {review.user_profile_image ? (
                                            <Image
                                                source={{ uri: review.user_profile_image.startsWith('http') ? review.user_profile_image : `${BASE_URL}/${review.user_profile_image}` }}
                                                style={styles.reviewerAvatar}
                                            />
                                        ) : (
                                            <View style={[styles.reviewerAvatar, styles.reviewerAvatarPlaceholder, { backgroundColor: theme.border }]}>
                                                <Ionicons name="person" size={20} color="#fff" />
                                            </View>
                                        )}
                                        <View>
                                            <Text style={[styles.reviewUser, { color: theme.text }]}>{review.user_name || 'Anonymous'}</Text>
                                            <View style={styles.reviewRating}>
                                                {[...Array(5)].map((_, i) => (
                                                    <Ionicons
                                                        key={i}
                                                        name={i < review.rating ? "star" : "star-outline"}
                                                        size={12}
                                                        color="#FFD700"
                                                    />
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                    <Text style={[styles.reviewDate, { color: theme.textMuted }]}>
                                        {new Date(review.created_at).toLocaleDateString()}
                                    </Text>
                                </View>

                                {/* Display Tags */}
                                {review.tags && review.tags.length > 0 && (
                                    <View style={styles.reviewTagsContainer}>
                                        {review.tags.map((tag, idx) => (
                                            <View key={idx} style={[styles.reviewTag, { backgroundColor: theme.sectionBg }]}>
                                                <Text style={[styles.reviewTagText, { color: theme.textSecondary }]}>{tag}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                <Text style={[styles.reviewComment, { color: theme.textSecondary }]}>{review.comment}</Text>
                                {review.image_url && (
                                    <Image source={{ uri: review.image_url }} style={styles.reviewImage} />
                                )}
                                {/* Seller Reply */}
                                {review.seller_reply && (
                                    <View style={[styles.sellerReplyBox, { backgroundColor: theme.sectionBg, borderLeftColor: theme.accent }]}>
                                        <Text style={[styles.sellerReplyLabel, { color: theme.accent }]}>Seller's Reply</Text>
                                        <Text style={[styles.sellerReplyText, { color: theme.textSecondary }]}>{review.seller_reply}</Text>
                                    </View>
                                )}
                            </View>
                        ))
                    )}

                    {/* Related Items (More from Shop) */}
                    {shopProducts.length > 0 && (
                        <>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>More from this Shop</Text>
                            <FlatList
                                data={shopProducts}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                renderItem={renderRelatedItem}
                                keyExtractor={item => item.product_id?.toString() || item.id?.toString()}
                                contentContainerStyle={styles.relatedList}
                            />
                        </>
                    )}

                </View>
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={[styles.bottomBar, { backgroundColor: theme.headerBg, borderTopColor: theme.border }]}>
                <TouchableOpacity
                    style={[
                        styles.customDesignBtn,
                        { borderColor: theme.border },
                        (isListingOwner || !selectedListing) && [styles.disabledButton, { backgroundColor: theme.sectionBg, borderColor: theme.border }]
                    ]}
                    onPress={() => {
                        if (user?.role === 'guest') {
                            showGuestAlert('submit custom requests');
                            return;
                        }
                        if (!isListingOwner && selectedListing) {
                            navigation.navigate('RequestCustomization', {
                                product: displayProduct,
                                shop: selectedListing,
                            });
                        }
                    }}
                    disabled={isListingOwner || !selectedListing}
                >
                    <Ionicons
                        name="color-palette-outline"
                        size={22}
                        color={(isListingOwner || !selectedListing) ? theme.textMuted : theme.accent}
                    />
                    <Text style={[styles.customDesignText, { color: theme.accent }, (isListingOwner || !selectedListing) && { color: theme.textMuted }]}>
                        Custom
                    </Text>
                </TouchableOpacity>

                {/* Add to Cart / Your Product / Select a Shop button */}
                {(() => {
                    const noShop = !selectedListing;
                    const ownShop = isListingOwner;
                    const soldOut = isOutOfStock;
                    const disabled = noShop || ownShop || soldOut;

                    const label = noShop ? 'Select a Shop'
                        : ownShop ? 'Your Product'
                            : soldOut ? 'Out of Stock'
                                : 'Add to Cart';

                    const btnStyle = ownShop || noShop
                        ? [styles.mainAddToCartBtn, styles.disabledMainButton, { backgroundColor: 'rgba(0,0,0,0.08)', borderWidth: 1, borderColor: theme.border }]
                        : soldOut
                            ? [styles.mainAddToCartBtn, styles.disabledMainButton, { backgroundColor: theme.border }]
                            : [styles.mainAddToCartBtn, { backgroundColor: theme.accent, shadowColor: theme.accent }];

                    const textColor = (ownShop || noShop || soldOut) ? theme.textMuted : '#fff';

                    return (
                        <TouchableOpacity
                            style={btnStyle}
                            onPress={() => {
                                if (user?.role === 'guest') {
                                    showGuestAlert('add items to your cart');
                                    return;
                                }
                                if (ownShop) {
                                    showAlert("You cannot buy your own product.", "Action Not Allowed", "error");
                                    return;
                                }
                                if (noShop) {
                                    showAlert("Please select a shop from the Available Locations section.", "Select a Shop", "info");
                                    return;
                                }
                                if (!soldOut) handleOpenModal();
                            }}
                            disabled={disabled}
                        >
                            <Text style={[styles.addToCartText, { color: textColor }]}>{label}</Text>
                            {!disabled && <Ionicons name="cart" size={20} color="white" style={{ marginLeft: 8 }} />}
                        </TouchableOpacity>
                    );
                })()}
                {/* In-Stock Alert Button */}
                {isOutOfStock && !isOwner && user && user.role !== 'guest' && (
                    <TouchableOpacity
                        style={[styles.stockAlertBtn, { borderColor: stockAlertSubscribed ? theme.danger : theme.accent }]}
                        onPress={async () => {
                            const pid = displayProduct.product_id || displayProduct.id;
                            if (stockAlertSubscribed) {
                                await stockAlertsAPI.unsubscribe(user.id, pid);
                                setStockAlertSubscribed(false);
                                showAlert('Alert removed.', 'Done', 'info');
                            } else {
                                await stockAlertsAPI.subscribe(user.id, pid);
                                setStockAlertSubscribed(true);
                                showAlert('We\'ll notify you when it\'s back!', 'Alert Set 🔔', 'success');
                            }
                        }}
                    >
                        <Ionicons name={stockAlertSubscribed ? 'notifications' : 'notifications-outline'} size={18} color={stockAlertSubscribed ? theme.danger : theme.accent} />
                        <Text style={[styles.stockAlertText, { color: stockAlertSubscribed ? theme.danger : theme.accent }]}>
                            {stockAlertSubscribed ? 'Remove Alert' : 'Notify Me'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Lightbox Modal ───────────────────────────────────────── */}
            <Modal
                visible={lightboxVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setLightboxVisible(false)}
                statusBarTranslucent
            >
                <View style={styles.lightboxOverlay}>
                    <TouchableOpacity
                        style={styles.lightboxClose}
                        onPress={() => setLightboxVisible(false)}
                    >
                        <Ionicons name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    <FlatList
                        ref={lightboxRef}
                        data={images}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        initialScrollIndex={lightboxIndex}
                        getItemLayout={(_, index) => ({
                            length: width,
                            offset: width * index,
                            index,
                        })}
                        onMomentumScrollEnd={(e) => {
                            const i = Math.floor(e.nativeEvent.contentOffset.x / width);
                            setLightboxIndex(i);
                        }}
                        renderItem={({ item }) => (
                            <View style={styles.lightboxImageWrap}>
                                <Image
                                    source={{ uri: item }}
                                    style={styles.lightboxImage}
                                    resizeMode="contain"
                                />
                            </View>
                        )}
                        keyExtractor={(item, index) => index.toString()}
                    />
                    {images.length > 1 && (
                        <View style={styles.lightboxPagination}>
                            <Text style={styles.lightboxPaginationText}>
                                {lightboxIndex + 1} / {images.length}
                            </Text>
                        </View>
                    )}
                </View>
            </Modal>

            {/* ── All Nearby Shops Bottom Sheet ──────────────────────── */}
            <Modal
                visible={shopsModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setShopsModalVisible(false)}
                statusBarTranslucent
            >
                {/* Dim backdrop — tap to close */}
                <TouchableOpacity
                    style={styles.shopsModalOverlay}
                    activeOpacity={1}
                    onPress={() => setShopsModalVisible(false)}
                />
                <View style={[styles.shopsModalSheet, { backgroundColor: theme.headerBg }]}>
                    {/* Drag handle */}
                    <View style={[styles.shopsModalHandle, { backgroundColor: theme.border }]} />
                    {/* Header */}
                    <View style={[styles.shopsModalHeader, { borderBottomColor: theme.border }]}>
                        <View>
                            <Text style={[styles.shopsModalTitle, { color: theme.text }]}>Nearby Shops</Text>
                            <Text style={[styles.shopsModalSubtitle, { color: theme.textMuted }]}>
                                {visibleLocations.length} {visibleLocations.length === 1 ? 'shop' : 'shops'} within 50 km
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.shopsModalCloseBtn, { backgroundColor: theme.sectionBg }]}
                            onPress={() => setShopsModalVisible(false)}
                        >
                            <Ionicons name="close" size={20} color={theme.text} />
                        </TouchableOpacity>
                    </View>
                    {/* Shop list */}
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
                        {visibleLocations.map((loc) => {
                            const isSelected = selectedListing?.listing_id === loc.listing_id;
                            const isOOS = loc.stock_quantity <= 0;
                            const logoUri = loc.logo_url
                                ? (loc.logo_url.startsWith('http') ? loc.logo_url : `${BASE_URL}/${loc.logo_url}`)
                                : `https://ui-avatars.com/api/?name=${encodeURIComponent(loc.shop_name)}&background=random`;
                            return (
                                <TouchableOpacity
                                    key={loc.listing_id}
                                    style={[
                                        styles.locationCard,
                                        { backgroundColor: theme.card, borderColor: isSelected ? theme.accent : theme.border, marginHorizontal: 16 },
                                        isSelected && { borderWidth: 2, backgroundColor: theme.accentBg },
                                        isOOS && { opacity: 0.5 },
                                    ]}
                                    onPress={() => {
                                        if (!isOOS) {
                                            setSelectedListing(loc);
                                            setShopsModalVisible(false);
                                        }
                                    }}
                                    disabled={isOOS}
                                    activeOpacity={0.75}
                                >
                                    <Image source={{ uri: logoUri }} style={styles.locationLogo} />
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                        <View style={styles.locationTopRow}>
                                            <Text style={[styles.locationShopName, { color: theme.text }]} numberOfLines={1}>
                                                {loc.shop_name}
                                            </Text>
                                            {loc.is_verified ? (
                                                <Ionicons name="checkmark-circle" size={14} color="#2e7d32" style={{ marginLeft: 4 }} />
                                            ) : null}
                                            {isSelected && (
                                                <View style={[styles.selectedBadge, { backgroundColor: theme.accent }]}>
                                                    <Text style={styles.selectedBadgeText}>✓ Selected</Text>
                                                </View>
                                            )}
                                            {isOOS && (
                                                <View style={styles.oosBadge}>
                                                    <Text style={styles.oosBadgeText}>Out of Stock</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={[styles.locationAddress, { color: theme.textMuted }]} numberOfLines={1}>
                                            {loc.address || 'Address not available'}
                                        </Text>
                                        {/* Service type badges */}
                                        {(() => {
                                            const types = loc.service_types
                                                ? (typeof loc.service_types === 'string' ? loc.service_types.split(',') : loc.service_types)
                                                : ['delivery'];
                                            return (
                                                <View style={styles.serviceTypesRow}>
                                                    {types.map(type => (
                                                        <View key={type} style={[styles.serviceTypeBadge, { backgroundColor: theme.accent + '18', borderColor: theme.accent + '40' }]}>
                                                            <Ionicons name={type === 'delivery_installation' ? 'construct-outline' : 'car-outline'} size={10} color={theme.accent} />
                                                            <Text style={[styles.serviceTypeText, { color: theme.accent }]}>
                                                                {type === 'delivery_installation' ? 'w/ Installation' : 'Delivery'}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            );
                                        })()}
                                        <View style={styles.locationBottomRow}>
                                            <Text style={[styles.locationPrice, { color: theme.accent }]}>
                                                ₱{parseFloat(loc.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </Text>
                                            <Text style={[styles.locationStock, { color: theme.textSecondary }]}>
                                                · {isOOS ? '0' : loc.stock_quantity} in stock
                                            </Text>
                                            {loc.distance_km != null && (
                                                <Text style={[styles.locationDistance, { color: theme.textMuted }]}>
                                                    · 📍 {loc.distance_km} km
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </Modal>

            {/* FIX C passthrough: always use displayProduct (enriched), not stale route param */}
            <ProductSelectionModal
                visible={modalVisible}
                onClose={handleCloseModal}
                product={selectedListing
                    ? {
                        ...displayProduct,
                        listing_id: selectedListing.listing_id,
                        price: selectedListing.price,
                        stock_quantity: selectedListing.stock_quantity,
                        service_types: selectedListing.service_types,
                        has_handymen: selectedListing.has_handymen,
                        // Use per-listing color stocks if available; fall back to global catalog colors
                        colors: (selectedListing.color_stocks && selectedListing.color_stocks.length > 0)
                            ? selectedListing.color_stocks
                            : displayProduct.colors,
                    }
                    : displayProduct
                }
                shopId={selectedListing?.shop_id || shop?.shop_id}
            />

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
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    // ── Available Locations ──────────────────────────────────────────────────
    locationsSection: {
        marginTop: 10,
        marginBottom: 16,
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
        padding: 14,
    },
    locationsSectionHeader: {
        marginBottom: 12,
    },
    locationsTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    locationsTitleIcon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    locationsBadge: {
        marginLeft: 8,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 20,
    },
    locationsBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    locationsGpsBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginTop: 2,
    },
    locationsNoGps: {
        fontSize: 11,
        flex: 1,
    },
    locationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
        overflow: 'hidden',
    },
    locationCardSelected: {
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 5,
    },
    locationCardAccentBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        borderTopLeftRadius: 14,
        borderBottomLeftRadius: 14,
    },
    selectedCornerBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderBottomLeftRadius: 10,
        borderTopRightRadius: 12, // Matches card border radius minus some padding/border compensation
        gap: 2,
        zIndex: 2,
    },
    selectedCornerBadgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    locationLogoRing: {
        width: 54,
        height: 54,
        borderRadius: 27,
        borderWidth: 2.5,
        padding: 2,
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    locationLogo: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: '#eee',
    },
    locationLogoCheck: {
        position: 'absolute',
        bottom: -1,
        right: -1,
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#fff',
    },
    locationTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 3,
    },
    locationShopName: {
        fontSize: 14,
        fontWeight: '700',
        flexShrink: 1,
        letterSpacing: 0.1,
    },
    selectedBadge: {
        marginLeft: 6,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
    },
    selectedBadgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    oosBadge: {
        marginLeft: 6,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
        backgroundColor: '#ffcdd2',
    },
    oosBadgeText: {
        color: '#c62828',
        fontSize: 10,
        fontWeight: '700',
    },
    locationAddressPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 5,
    },
    locationAddress: {
        fontSize: 11.5,
        marginBottom: 0,
        flexShrink: 1,
    },
    locationBottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 5,
        marginTop: 4,
    },
    locationPrice: {
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.2,
        marginRight: 2,
    },
    locationInfoChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 20,
    },
    locationInfoChipText: {
        fontSize: 10.5,
        fontWeight: '600',
    },
    locationStock: {
        fontSize: 12,
    },
    locationDistance: {
        fontSize: 12,
    },
    showAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderWidth: 1.5,
        borderRadius: 12,
        marginTop: 2,
    },
    showAllBtnText: {
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: '#fff',
        // borderBottomWidth: 1,
        // borderBottomColor: '#f0f0f0',
    },
    headerRight: {
        flexDirection: 'row',
    },
    headerBtn: {
        padding: 8,
        marginLeft: 5,
    },
    badge: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#e53935',
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    scrollContent: {
        paddingBottom: 100,
    },
    imageContainer: {
        position: 'relative',
        backgroundColor: '#f5f5f5',
    },
    heroImage: {
        width: width,
        height: width * 0.8,
        resizeMode: 'cover',
    },
    expandBtn: {
        position: 'absolute',
        top: 14,
        right: 14,
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderRadius: 20,
        padding: 7,
    },
    // Lightbox
    lightboxOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.97)',
        justifyContent: 'center',
    },
    lightboxClose: {
        position: 'absolute',
        top: 52,
        right: 20,
        zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 22,
        padding: 8,
    },
    lightboxImageWrap: {
        width,
        justifyContent: 'center',
        alignItems: 'center',
    },
    lightboxImage: {
        width: width,
        height: width * 1.1,
    },
    lightboxPagination: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
    },
    lightboxPaginationText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    paginationBadge: {
        position: 'absolute',
        bottom: 15,
        left: 15,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    paginationText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    floatingHeart: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: 'white',
        padding: 10,
        borderRadius: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    infoContainer: {
        padding: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#3e2723',
        marginBottom: 8,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    ratingValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
        marginLeft: 4,
    },
    ratingCount: {
        fontSize: 12,
        color: '#777',
        marginLeft: 4,
    },
    dividerVertical: {
        width: 1,
        height: 12,
        backgroundColor: '#ccc',
        marginHorizontal: 10,
    },
    soldCount: {
        fontSize: 12,
        color: '#777',
    },
    price: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#8D6E63',
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#3e2723',
        marginTop: 10,
        marginBottom: 10,
    },
    description: {
        fontSize: 14,
        color: '#666',
        lineHeight: 22,
        marginBottom: 20,
    },
    specsContainer: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 20,
    },
    specRow: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    specLabel: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    specValue: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '500',
    },
    reviewsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    seeAllText: {
        color: '#8D6E63',
        fontWeight: '600',
    },
    reviewCard: {
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    reviewerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    reviewerAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginRight: 8,
    },
    reviewerAvatarPlaceholder: {
        backgroundColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
    },
    reviewUser: {
        fontWeight: 'bold',
        fontSize: 14,
        color: '#333',
        marginBottom: 2,
    },
    reviewDate: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
    },
    reviewRating: {
        flexDirection: 'row',
    },
    reviewComment: {
        fontSize: 13,
        color: '#555',
        lineHeight: 18,
    },
    relatedList: {
        paddingRight: 20,
    },
    relatedCard: {
        width: 140,
        marginRight: 15,
    },
    relatedImage: {
        width: 140,
        height: 140,
        borderRadius: 12,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
    },
    relatedTitle: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    relatedPrice: {
        fontSize: 14,
        color: '#8D6E63',
        fontWeight: 'bold',
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        flexDirection: 'row',
        padding: 15,
        paddingBottom: 25,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        alignItems: 'center',
    },
    customDesignBtn: {
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 25,
    },
    customDesignText: {
        fontSize: 9,
        color: '#8D6E63',
        marginTop: 2,
    },
    mainAddToCartBtn: {
        flex: 1,
        backgroundColor: '#8D6E63',
        height: 50,
        borderRadius: 25,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addToCartText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    disabledButton: {
        borderColor: '#eee',
        backgroundColor: '#f9f9f9',
    },
    disabledMainButton: {
        backgroundColor: '#ccc',
        shadowOpacity: 0,
        elevation: 0,
    },
    outOfStockText: {
        fontSize: 14,
        color: '#e53935',
        fontWeight: 'bold',
        marginBottom: 10,
        marginTop: -10,
    },
    noReviewsText: {
        fontSize: 14,
        color: '#999',
        fontStyle: 'italic',
        marginBottom: 20,
    },
    reviewTagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 6,
    },
    reviewTag: {
        backgroundColor: '#f0f0f0',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginRight: 6,
        marginBottom: 4,
    },
    reviewTagText: {
        fontSize: 10,
        color: '#666',
    },
    shopSection: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#eee'
    },
    shopSectionEmpty: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    shopSectionEmptyText: {
        fontSize: 13,
        fontStyle: 'italic',
        flex: 1,
    },
    shopAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10
    },
    shopLabel: {
        fontSize: 10,
        color: '#888',
        textTransform: 'uppercase'
    },
    shopName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333'
    },
    shopAddress: {
        fontSize: 11,
        color: '#888',
        marginTop: 2,
    },
    distanceRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 5,
        marginTop: 5,
    },
    distancePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 20,
    },
    distancePillText: {
        fontSize: 10,
        fontWeight: '600',
    },
    chatSellerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f0eb',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginLeft: 'auto',
        borderWidth: 1,
        borderColor: '#8D6E63'
    },
    chatSellerText: {
        fontSize: 12,
        color: '#8D6E63',
        fontWeight: '600',
        marginLeft: 4
    },
    stockAlertBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1.5,
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginTop: 8,
    },
    stockAlertText: {
        fontSize: 14,
        fontWeight: '600',
    },
    sellerReplyBox: {
        marginTop: 10,
        borderLeftWidth: 3,
        paddingLeft: 10,
        paddingVertical: 8,
        borderRadius: 4,
    },
    sellerReplyLabel: {
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    sellerReplyText: {
        fontSize: 13,
        lineHeight: 18,
    },
    // ── Service type badges on location cards ──────────────────────────────────
    serviceTypesRow: { flexDirection: 'row', gap: 5, marginTop: 4, marginBottom: 2, flexWrap: 'wrap' },
    serviceTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    serviceTypeText: { fontSize: 10, fontWeight: '600' },
    // ── All Nearby Shops bottom sheet ──────────────────────────────
    shopsModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    shopsModalSheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 12,
        maxHeight: '75%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 20,
    },
    shopsModalHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 12,
    },
    shopsModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingBottom: 14,
        borderBottomWidth: 1,
        marginBottom: 8,
    },
    shopsModalTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    shopsModalSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    shopsModalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default ProductDetailScreen;
