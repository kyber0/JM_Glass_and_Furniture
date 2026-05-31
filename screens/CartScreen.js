import React, { useState, useMemo, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    Image,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { useFees } from '../context/FeesContext';
import { geocodeAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const CartScreen = ({ navigation }) => {
    const { cartItems, removeFromCart, updateQuantity } = useCart();
    const { theme } = useTheme();
    const { getInstallationTier } = useFees();
    const [selectedIds, setSelectedIds] = useState(
        new Set(cartItems.map(item => item.cartId || item.id))
    );


    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null
    });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) =>
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });

    const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const toggleItem = (itemId) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(itemId) ? next.delete(itemId) : next.add(itemId);
            return next;
        });
    };

    const toggleAll = () => {
        setSelectedIds(
            selectedIds.size === cartItems.length
                ? new Set()
                : new Set(cartItems.map(item => item.cartId || item.id))
        );
    };

    const isAllSelected = cartItems.length > 0 && selectedIds.size === cartItems.length;
    const selectedCount = selectedIds.size;

    const selectedItems = useMemo(() =>
        cartItems.filter(item => selectedIds.has(item.cartId || item.id)),
        [cartItems, selectedIds]
    );

    const subtotal = useMemo(() =>
        selectedItems.reduce((sum, item) => {
            const priceNum = typeof item.price === 'string'
                ? parseFloat(item.price.replace(/[^0-9.]/g, ''))
                : (item.price || 0);
            const installFee = item.serviceType === 'Installation'
                ? getInstallationTier(item.installationComplexity).min
                : 0;
            return sum + (priceNum + installFee) * item.quantity;
        }, 0),
        [selectedItems, getInstallationTier]
    );

    // Estimated delivery fee from GPS + shop distance
    const [estimatedDelivery, setEstimatedDelivery] = useState(null); // null = loading/unknown
    const [deliveryLoading, setDeliveryLoading] = useState(false);
    const [deliveryDistance, setDeliveryDistance] = useState(null); // e.g. "3.8 km"

    // Delivery fee is estimated using GPS + shop_id; confirmed precisely at checkout
    const total = subtotal + (estimatedDelivery || 0);

    // Fetch GPS + estimated delivery fee on mount
    useEffect(() => {
        const primaryShopId = cartItems[0]?.shop_id || cartItems[0]?.shopId;
        if (!primaryShopId || selectedItems.length === 0) {
            setEstimatedDelivery(null);
            setDeliveryDistance(null);
            return;
        }

        setDeliveryLoading(true);
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const { latitude: custLat, longitude: custLng } = loc.coords;
                const res = await geocodeAPI.distance({ shopId: primaryShopId, custLat, custLng });
                if (res?.success) {
                    setEstimatedDelivery(res.delivery_fee);
                    setDeliveryDistance(res.distance_display);
                }
            } catch (e) {
                // Non-fatal: GPS denied or network error — stay as null (set at checkout)
            } finally {
                setDeliveryLoading(false);
            }
        })();
    }, [cartItems.length]); // re-run if cart changes

    const handleDeleteItem = (item) => {
        showAlert(
            'Remove Item',
            `Remove "${item.title}" from cart?`,
            'error', true,
            () => removeFromCart(item.cartId || item.id)
        );
    };

    const handleDeleteSelected = () => {
        if (selectedCount === 0) {
            showAlert('No Items Selected', 'Please select items to delete.', 'warning');
            return;
        }
        showAlert(
            'Remove Items',
            `Remove ${selectedCount} selected item${selectedCount > 1 ? 's' : ''} from cart?`,
            'error', true,
            () => { selectedItems.forEach(item => removeFromCart(item.cartId || item.id)); setSelectedIds(new Set()); }
        );
    };

    const handleCheckout = () => {
        if (selectedCount === 0) {
            showAlert('No Items Selected', 'Please select at least one item to checkout.', 'warning');
            return;
        }
        navigation.navigate('Checkout', { selectedItems });
    };

    const renderItem = ({ item, index }) => {
        const itemId = item.cartId || item.id;
        const isSelected = selectedIds.has(itemId);
        const priceNum = typeof item.price === 'string'
            ? parseFloat(item.price.replace(/[^0-9.]/g, ''))
            : (item.price || 0);
        // Use real tier fee from FeesContext
        const installTier = item.serviceType === 'Installation'
            ? getInstallationTier(item.installationComplexity)
            : null;
        const installFee = installTier ? installTier.min : 0;
        const lineTotal = (priceNum + installFee) * item.quantity;

        return (
            <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => navigation.navigate('ProductDetail', { product: item })}
                style={[
                    styles.cartItem,
                    { backgroundColor: theme.card, borderColor: isSelected ? theme.accent : theme.border },
                    isSelected && styles.cartItemSelected,
                ]}
            >
                {/* Left accent bar when selected */}
                {isSelected && <View style={[styles.selectedBar, { backgroundColor: theme.accent }]} />}

                {/* Checkbox */}
                <TouchableOpacity onPress={() => toggleItem(itemId)} style={styles.checkbox} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? theme.accent : theme.textMuted}
                    />
                </TouchableOpacity>

                {/* Product Image */}
                <View style={styles.imageWrapper}>
                    <Image source={{ uri: item.image }} style={styles.itemImage} />
                    {item.quantity > 1 && (
                        <View style={[styles.qtyBadge, { backgroundColor: theme.accent }]}>
                            <Text style={styles.qtyBadgeText}>x{item.quantity}</Text>
                        </View>
                    )}
                </View>

                {/* Details */}
                <View style={styles.itemDetails}>
                    <View style={styles.itemTopRow}>
                        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={2}>
                            {item.title}
                        </Text>
                        {/* Delete Button */}
                        <TouchableOpacity onPress={() => handleDeleteItem(item)} style={styles.deleteBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="trash-outline" size={17} color={theme.danger || '#e53935'} />
                        </TouchableOpacity>
                    </View>

                    {/* Variant Chips */}
                    <View style={styles.chipsRow}>
                        {item.selectedColor && (
                            <View style={styles.chip}>
                                <View style={[styles.colorDot, { backgroundColor: item.selectedColor }]} />
                                <Text style={[styles.chipText, { color: theme.textSecondary }]}>{item.selectedColor}</Text>
                            </View>
                        )}
                        {item.selectedSize && (
                            <View style={[styles.chip, { backgroundColor: theme.sectionBg }]}>
                                <Ionicons name="resize-outline" size={11} color={theme.textMuted} />
                                <Text style={[styles.chipText, { color: theme.textSecondary }]}>{item.selectedSize}</Text>
                            </View>
                        )}
                        {item.serviceType === 'Installation' && installTier && (
                            <View style={[styles.chip, styles.installChip]}>
                                <Ionicons name="construct-outline" size={11} color="#e65100" />
                                <Text style={[styles.chipText, { color: '#e65100' }]}>
                                    {`Install · ${item.installationComplexity
                                        ? item.installationComplexity.charAt(0).toUpperCase() + item.installationComplexity.slice(1)
                                        : 'Basic'} ₱${installTier.min.toLocaleString()}–₱${installTier.max.toLocaleString()}`}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Price row & Qty controls */}
                    <View style={styles.priceQtyRow}>
                        <View>
                            <Text style={[styles.itemPrice, { color: theme.accent }]}>
                                ₱{priceNum.toLocaleString()}
                            </Text>
                            {installFee > 0 && (
                                <Text style={styles.installFeeNote}>+₱{installFee.toLocaleString()} install</Text>
                            )}
                        </View>

                        <View style={[styles.qtyPill, { backgroundColor: theme.sectionBg }]}>
                            <TouchableOpacity
                                style={[styles.qtyBtn, { backgroundColor: theme.card }]}
                                onPress={() => item.quantity > 1
                                    ? updateQuantity(itemId, -1)
                                    : handleDeleteItem(item)
                                }
                            >
                                <Ionicons name={item.quantity <= 1 ? 'trash-outline' : 'remove'} size={14} color={item.quantity <= 1 ? (theme.danger || '#e53935') : theme.text} />
                            </TouchableOpacity>
                            <Text style={[styles.qtyText, { color: theme.text }]}>{item.quantity}</Text>
                            <TouchableOpacity
                                style={[styles.qtyBtn, { backgroundColor: theme.card }]}
                                onPress={() => updateQuantity(itemId, 1)}
                            >
                                <Ionicons name="add" size={14} color={theme.text} />
                            </TouchableOpacity>
                        </View>
                    </View>

                </View>
            </TouchableOpacity>
        );
    };

    /* ── Empty State ── */
    if (cartItems.length === 0) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>My Cart</Text>
                </View>
                <View style={styles.emptyContainer}>
                    <View style={[styles.emptyIconCircle, { backgroundColor: theme.sectionBg }]}>
                        <Ionicons name="cart-outline" size={64} color={theme.accent} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>Your cart is empty</Text>
                    <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                        Looks like you haven't added anything yet. Start exploring!
                    </Text>
                    <TouchableOpacity
                        style={[styles.shopNowButton, { backgroundColor: theme.accent, shadowColor: theme.accent }]}
                        onPress={() => navigation.navigate('Main')}
                    >
                        <Ionicons name="storefront-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.shopNowText}>Browse Products</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>
                    My Cart
                    <Text style={{ fontSize: 15, fontWeight: '500', opacity: 0.7 }}>{' '}({cartItems.length})</Text>
                </Text>
                <TouchableOpacity onPress={handleDeleteSelected} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={22} color={selectedCount > 0 ? (theme.danger || '#e53935') : theme.textMuted} />
                </TouchableOpacity>
            </View>

            {/* Select All Bar */}
            <View style={[styles.selectAllBar, { backgroundColor: theme.sectionBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={toggleAll} style={styles.selectAllRow}>
                    <Ionicons
                        name={isAllSelected ? 'checkbox' : 'square-outline'}
                        size={21}
                        color={isAllSelected ? theme.accent : theme.textMuted}
                    />
                    <Text style={[styles.selectAllText, { color: theme.text }]}>Select All</Text>
                </TouchableOpacity>
                <View style={[styles.countBadge, { backgroundColor: theme.accentBg || '#efebe9' }]}>
                    <Text style={[styles.countBadgeText, { color: theme.accent }]}>
                        {selectedCount}/{cartItems.length} selected
                    </Text>
                </View>
            </View>

            <FlatList
                data={cartItems}
                renderItem={renderItem}
                keyExtractor={(item) => item.cartId || item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
            />

            {/* Footer Summary */}
            <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
                <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
                    <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                            Subtotal ({selectedCount} item{selectedCount !== 1 ? 's' : ''})
                        </Text>
                        <Text style={[styles.summaryValue, { color: theme.text }]}>₱{subtotal.toLocaleString()}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryLabelRow}>
                            <Ionicons name="bicycle-outline" size={14} color={theme.textMuted} style={{ marginRight: 4 }} />
                            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Delivery Fee</Text>
                        </View>
                        {deliveryLoading ? (
                            <ActivityIndicator size="small" color={theme.accent} />
                        ) : estimatedDelivery != null ? (
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.summaryValue, { color: '#2e7d32' }]}>
                                    ~₱{Math.ceil(estimatedDelivery).toLocaleString()}
                                </Text>
                                {deliveryDistance && (
                                    <Text style={{ fontSize: 10, color: theme.textMuted }}>
                                        📍 {deliveryDistance} · estimate
                                    </Text>
                                )}
                            </View>
                        ) : (
                            <Text style={[styles.summaryValue, { color: theme.textMuted, fontStyle: 'italic' }]}>
                                Set at checkout
                            </Text>
                        )}
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.summaryRow}>
                        <Text style={[styles.totalLabel, { color: theme.text }]}>
                            {estimatedDelivery != null ? 'Est. Total' : 'Items Total'}
                        </Text>
                        <Text style={[styles.totalValue, { color: theme.accent }]}>
                            ₱{total.toLocaleString()}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[
                        styles.checkoutButton,
                        { backgroundColor: theme.accent, shadowColor: theme.accent },
                        selectedCount === 0 && [styles.checkoutDisabled, { backgroundColor: theme.border }]
                    ]}
                    onPress={handleCheckout}
                    disabled={selectedCount === 0}
                    activeOpacity={0.85}
                >
                    <View style={styles.checkoutInner}>
                        <Text style={styles.checkoutText}>
                            {selectedCount === 0 ? 'Select Items to Checkout' : `Checkout  (${selectedCount})`}
                        </Text>
                        {selectedCount > 0 && (
                            <View style={styles.checkoutTotalPill}>
                                <Text style={styles.checkoutTotalText}>₱{total.toLocaleString()}</Text>
                            </View>
                        )}
                    </View>
                    {selectedCount > 0 && <Ionicons name="arrow-forward-circle" size={22} color="rgba(255,255,255,0.8)" />}
                </TouchableOpacity>
            </View>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                onConfirm={() => { hideAlert(); if (alertConfig.onConfirm) alertConfig.onConfirm(); }}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },

    /* ── Header ── */
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
    },
    headerTitle: { fontSize: 19, fontWeight: '700' },
    iconBtn: { padding: 6, borderRadius: 10 },

    /* ── Select All ── */
    selectAllBar: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1,
    },
    selectAllRow: { flexDirection: 'row', alignItems: 'center' },
    selectAllText: { marginLeft: 8, fontSize: 14, fontWeight: '600' },
    countBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    countBadgeText: { fontSize: 12, fontWeight: '600' },

    /* ── List ── */
    listContent: { padding: 16, paddingBottom: 230 },

    /* ── Cart Item Card ── */
    cartItem: {
        flexDirection: 'row',
        borderRadius: 18,
        marginBottom: 12,
        borderWidth: 1.5,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
        alignItems: 'flex-start',
        paddingVertical: 10,
        paddingRight: 10,
    },
    cartItemSelected: {
        shadowOpacity: 0.13,
        elevation: 5,
    },
    selectedBar: {
        width: 4,
        alignSelf: 'stretch',
        borderRadius: 4,
        marginRight: 2,
    },
    checkbox: { marginHorizontal: 8, paddingTop: 2 },
    imageWrapper: { position: 'relative' },
    itemImage: {
        width: 80, height: 80, borderRadius: 12,
        backgroundColor: '#f0f0f0',
    },
    qtyBadge: {
        position: 'absolute', bottom: 4, right: 4,
        borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1,
    },
    qtyBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

    /* ── Item Details ── */
    itemDetails: { flex: 1, marginLeft: 10 },
    itemTopRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 2,
    },
    itemTitle: { fontSize: 13, fontWeight: '600', flex: 1, marginRight: 6, lineHeight: 18 },
    deleteBtn: { padding: 3 },

    /* ── Chips ── */
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
        backgroundColor: '#f0f0f0',
    },
    installChip: { backgroundColor: '#fff3e0' },
    chipText: { fontSize: 11, fontWeight: '500' },
    colorDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: '#ddd' },

    /* ── Price & Qty ── */
    priceQtyRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    itemPrice: { fontSize: 14, fontWeight: '700' },
    installFeeNote: { fontSize: 10, color: '#e65100', marginTop: 1 },
    lineTotal: { fontSize: 10, marginTop: 4 },

    qtyPill: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 20, padding: 3, gap: 2,
    },
    qtyBtn: {
        width: 24, height: 24, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
    },
    qtyText: { paddingHorizontal: 6, fontSize: 13, fontWeight: '700' },

    /* ── Empty ── */
    emptyContainer: {
        flex: 1, justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: 40, paddingBottom: 80,
    },
    emptyIconCircle: {
        width: 120, height: 120, borderRadius: 60,
        justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    },
    emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
    emptySubtitle: {
        fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 30, opacity: 0.7,
    },
    shopNowButton: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 32, borderRadius: 30,
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 5,
    },
    shopNowText: { color: 'white', fontSize: 16, fontWeight: '700' },

    /* ── Footer ── */
    footer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24,
        borderTopWidth: 1,
    },
    summaryCard: {
        borderRadius: 16, padding: 14, marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
    },
    summaryRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 7,
    },
    summaryLabelRow: { flexDirection: 'row', alignItems: 'center' },
    summaryLabel: { fontSize: 13 },
    summaryValue: { fontSize: 13, fontWeight: '600' },
    divider: { height: 1, marginVertical: 8 },
    totalLabel: { fontSize: 15, fontWeight: '700' },
    totalValue: { fontSize: 20, fontWeight: '800' },

    /* ── Checkout Button ── */
    checkoutButton: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 15, paddingHorizontal: 20,
        borderRadius: 30,
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
    },
    checkoutDisabled: { shadowOpacity: 0, elevation: 0 },
    checkoutInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkoutText: { color: 'white', fontSize: 16, fontWeight: '700' },
    checkoutTotalPill: {
        backgroundColor: 'rgba(255,255,255,0.22)',
        paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
    },
    checkoutTotalText: { color: 'white', fontSize: 13, fontWeight: '700' },
});

export default CartScreen;
