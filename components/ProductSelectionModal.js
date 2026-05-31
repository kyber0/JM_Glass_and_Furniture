import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    Modal,
    Image,
    TouchableOpacity,
    ScrollView,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { useFees } from '../context/FeesContext';
import EDDBanner from './EDDBanner';
import { ordersAPI } from '../services/api';


const { width, height } = Dimensions.get('window');


const ProductSelectionModal = ({ visible, onClose, product, shopId }) => {
    const { addToCart } = useCart();
    const { theme } = useTheme();
    const { installationFees } = useFees();
    const [quantity, setQuantity] = useState(1);
    const [selectedColor, setSelectedColor] = useState(null);
    const [selectedSize, setSelectedSize] = useState(null);
    const [serviceType, setServiceType] = useState(null);
    const [hasHandymen, setHasHandymen] = useState(null);
    const [edd, setEdd] = useState(null); // { edd_min, edd_max, delayed }


    // Parse colors — supports both legacy string[] and new {color,stock}[] formats
    const rawColors = product?.colors && product.colors.length > 0
        ? (typeof product.colors === 'string' ? JSON.parse(product.colors) : product.colors)
        : [];

    // Normalize to [{color, stock}] objects
    const colors = rawColors.map(c => typeof c === 'string' ? { color: c, stock: null } : c);

    // FIX C3: empty array when no sizes — Size section hidden in JSX when empty
    const sizes = product?.sizes && product.sizes.length > 0
        ? (typeof product.sizes === 'string' ? JSON.parse(product.sizes) : product.sizes)
        : [];

    const rawServiceTypes = product?.service_types
        ? (typeof product.service_types === 'string'
            ? product.service_types.split(',')
            : product.service_types)
        : (product?.service_type
            ? [product.service_type]
            : []);
    const listingTypes = rawServiceTypes
        .map(t => String(t || '').trim().toLowerCase())
        .filter(Boolean);
    const offersDelivery = listingTypes.includes('delivery');
    const offersInstallation =
        listingTypes.includes('delivery_installation') ||
        listingTypes.includes('installation');
    const offersBoth = offersDelivery && offersInstallation;

    useEffect(() => {
        if (!visible) return; // only run when modal opens

        const rawColorsNow = product?.colors && product.colors.length > 0
            ? (typeof product.colors === 'string' ? JSON.parse(product.colors) : product.colors)
            : [];
        const colorsNow = rawColorsNow.map(c => typeof c === 'string' ? { color: c, stock: null } : c);

        const sizesNow = product?.sizes && product.sizes.length > 0
            ? (typeof product.sizes === 'string' ? JSON.parse(product.sizes) : product.sizes)
            : [];

        const rawTypesNow = product?.service_types
            ? (typeof product.service_types === 'string'
                ? product.service_types.split(',')
                : product.service_types)
            : (product?.service_type ? [product.service_type] : []);
        const typesNow = rawTypesNow.map(t => String(t || '').trim().toLowerCase()).filter(Boolean);
        const deliv = typesNow.includes('delivery');
        const instal = typesNow.includes('delivery_installation') || typesNow.includes('installation');
        const both = deliv && instal;

        setQuantity(1);

        const firstInStock = colorsNow.find(c => c.stock === null || c.stock > 0);
        setSelectedColor(firstInStock ? firstInStock.color : (colorsNow[0]?.color || null));
        setSelectedSize(sizesNow[0] || null);

        if (both) setServiceType(null);
        else if (instal) setServiceType('Installation');
        else if (deliv) setServiceType('Delivery');
        else setServiceType(null);

        if (product?.has_handymen !== undefined && product?.has_handymen !== null) {
            setHasHandymen(Boolean(Number(product.has_handymen)));
        } else {
            setHasHandymen(instal);
        }
        setEdd(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, product?.listing_id]);  // ← only re-run when modal opens or a different product is shown

    // Fetch EDD whenever serviceType or shopId changes
    useEffect(() => {
        if (!visible || !shopId || !serviceType) { setEdd(null); return; }
        const hasInstall = serviceType === 'Installation';
        ordersAPI.getEDDPreview(shopId, hasInstall)
            .then(res => { if (res?.success) setEdd(res); })
            .catch(() => {});
    }, [visible, shopId, serviceType]);


    if (!product) return null;

    const handleAddToCart = () => {
        if ((!offersDelivery && !offersInstallation) || !serviceType) return;

        // Use admin-set complexity from product, default to 'standard'
        const complexity = (serviceType === 'Installation')
            ? (product.installation_complexity || 'standard')
            : null;

        const tierFees = complexity ? installationFees[complexity] : null;

        const tailoredProduct = {
            ...product,
            listing_id: product.listing_id,
            product_id: product.product_id || product.id,
            selectedColor,
            selectedSize,
            serviceType,
            installationTier: complexity,
            installationFeeMin: tierFees?.min ?? null,
            installationFeeMax: tierFees?.max ?? null,
            quantity,
            cartId: `${product.listing_id || product.product_id || product.id}-${selectedColor}-${selectedSize}-${serviceType}`,
        };
        addToCart(tailoredProduct);
        onClose();
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <TouchableOpacity style={styles.overlayTouchable} onPress={onClose} />
                <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
                    {/* Header Handle */}
                    <View style={[styles.handleIndicator, { backgroundColor: theme.border }]} />

                    {/* Product Header Info */}
                    <View style={[styles.headerRow, { borderBottomColor: theme.border }]}>
                        {/* FIX C1: product uses image_url (listings model), not .image */}
                        <Image
                            source={{ uri: product.image || product.image_url || product.images?.[0] }}
                            style={styles.productImage}
                        />
                        <View style={styles.productInfo}>
                            {/* FIX C2: format price with ₱ symbol and en-PH locale */}
                            <Text style={[styles.price, { color: theme.accent }]}>
                                ₱{parseFloat(product.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </Text>
                            {serviceType === 'Installation' && (() => {
                                const complexity = product.installation_complexity || 'standard';
                                const tier = installationFees[complexity];
                                const tierLabel = complexity.charAt(0).toUpperCase() + complexity.slice(1);
                                return (
                                    <Text style={styles.installFeeText}>
                                        + {tierLabel} Installation: ₱{tier?.min?.toLocaleString()} – ₱{tier?.max?.toLocaleString()}
                                    </Text>
                                );
                            })()}
                            <Text style={[styles.stockText, { color: theme.textSecondary }]}>Stock: {product.stock_quantity || 'N/A'}</Text>

                            {/* Rating in Modal */}
                            {!!product.rating && (
                                <View style={styles.ratingRow}>
                                    <Ionicons name="star" size={14} color="#FFD700" />
                                    <Text style={[styles.ratingText, { color: theme.text }]}>{product.rating}</Text>
                                    <Text style={[styles.soldText, { color: theme.textMuted }]}>| {product.soldCount} sold</Text>
                                </View>
                            )}
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={theme.text} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                        {/* ── EDD Banner ── */}
                        {edd && (
                            <EDDBanner
                                eddMin={edd.edd_min}
                                eddMax={edd.edd_max}
                                delayed={edd.delayed}
                                style={{ marginBottom: 16 }}
                            />
                        )}

                        {/* Color Selection */}
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Color</Text>
                        <View style={styles.optionsRow}>
                            {colors.length === 0 ? (
                                <Text style={{ color: theme.textMuted, fontSize: 13 }}>No colors specified</Text>
                            ) : colors.map((c, index) => {
                                const isOOS = c.stock !== null && c.stock === 0;
                                const isSelected = selectedColor === c.color;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.colorOption,
                                            { borderColor: theme.border, backgroundColor: theme.inputBg },
                                            isSelected && [styles.selectedColorOption, { borderColor: theme.accent, backgroundColor: theme.accentBg }],
                                            isOOS && { opacity: 0.4 },
                                        ]}
                                        onPress={() => !isOOS && setSelectedColor(c.color)}
                                        disabled={isOOS}
                                    >
                                        <Text style={[
                                            styles.colorText, { color: theme.text },
                                            isSelected && [styles.selectedColorText, { color: theme.accent }],
                                            isOOS && { color: theme.textMuted },
                                        ]}>
                                            {isOOS ? '🔒 ' : ''}{c.color}
                                        </Text>
                                        {c.stock !== null && (
                                            <Text style={{
                                                fontSize: 10,
                                                color: isOOS ? '#e53935' : (isSelected ? theme.accent : theme.textMuted),
                                                marginTop: 2,
                                            }}>
                                                {isOOS ? 'Out of stock' : `${c.stock} left`}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* FIX C3: only show Size/Type section when product has real sizes */}
                        {sizes.length > 0 && (
                            <>
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Size / Type</Text>
                                <View style={styles.optionsRow}>
                                    {sizes.map((size, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            style={[
                                                styles.sizeOption,
                                                { borderColor: theme.border, backgroundColor: theme.inputBg },
                                                selectedSize === size && [styles.selectedSizeOption, { borderColor: theme.accent, backgroundColor: theme.accentBg }],
                                            ]}
                                            onPress={() => setSelectedSize(size)}
                                        >
                                            <Text style={[
                                                styles.sizeText, { color: theme.text },
                                                selectedSize === size && [styles.selectedSizeText, { color: theme.accent }]
                                            ]}>
                                                {size}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}

                        {/* Quantity Selection */}
                        <View style={styles.quantitySection}>
                            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Quantity</Text>
                            <View style={[styles.quantityControl, { borderColor: theme.border }]}>
                                <TouchableOpacity
                                    style={styles.qtyBtn}
                                    onPress={() => setQuantity(Math.max(1, quantity - 1))}
                                >
                                    <Ionicons name="remove" size={20} color={theme.text} />
                                </TouchableOpacity>
                                <Text style={[styles.qtyValue, { color: theme.text }]}>{quantity}</Text>
                                {/* FIX C5: cap quantity at available stock */}
                                <TouchableOpacity
                                    style={styles.qtyBtn}
                                    onPress={() => {
                                        const maxQty = product.stock_quantity > 0 ? product.stock_quantity : 99;
                                        setQuantity(Math.min(maxQty, quantity + 1));
                                    }}
                                >
                                    <Ionicons name="add" size={20} color={theme.text} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        {/* FIX C5: max stock feedback */}
                        {product.stock_quantity > 0 && quantity >= product.stock_quantity && (
                            <Text style={{ color: theme.danger, fontSize: 11, marginBottom: 10, textAlign: 'right' }}>
                                Max stock reached ({product.stock_quantity})
                            </Text>
                        )}


                        {/* Service Type Picker — required only when BOTH options are available */}
                        {offersBoth && (
                            <>
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Service Option</Text>
                                <View style={styles.serviceRow}>
                                    <TouchableOpacity
                                        style={[styles.serviceOption, { borderColor: theme.border, backgroundColor: theme.inputBg }, serviceType === 'Delivery' && [styles.selectedService, { borderColor: theme.accent, backgroundColor: theme.accentBg }]]}
                                        onPress={() => setServiceType('Delivery')}
                                    >
                                        <Ionicons
                                            name={serviceType === 'Delivery' ? "radio-button-on" : "radio-button-off"}
                                            size={20}
                                            color={serviceType === 'Delivery' ? theme.accent : theme.icon}
                                        />
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Text style={[styles.serviceText, { color: theme.text, marginLeft: 0 }, serviceType === 'Delivery' && [styles.selectedServiceText, { color: theme.text }]]}>
                                                Delivery Only
                                            </Text>
                                        </View>
                                    </TouchableOpacity>

                                    {/* Installation — disabled if shop has no handymen */}
                                    <TouchableOpacity
                                        style={[
                                            styles.serviceOption,
                                            { borderColor: theme.border, backgroundColor: theme.inputBg },
                                            serviceType === 'Installation' && hasHandymen && [styles.selectedService, { borderColor: theme.accent, backgroundColor: theme.accentBg }],
                                            !hasHandymen && { opacity: 0.45 },
                                        ]}
                                        onPress={() => hasHandymen && setServiceType('Installation')}
                                        disabled={!hasHandymen}
                                    >
                                        <Ionicons
                                            name={!hasHandymen ? 'lock-closed-outline' : (serviceType === 'Installation' ? 'radio-button-on' : 'radio-button-off')}
                                            size={20}
                                            color={!hasHandymen ? theme.textMuted : (serviceType === 'Installation' ? theme.accent : theme.icon)}
                                        />
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Text style={[styles.serviceText, { color: !hasHandymen ? theme.textMuted : theme.text }, serviceType === 'Installation' && hasHandymen && [styles.selectedServiceText, { color: theme.text }]]}>
                                                Delivery &amp; Installation
                                            </Text>
                                            {!hasHandymen && hasHandymen !== null && (
                                                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                                                    Not available — seller has no installation team
                                                </Text>
                                            )}
                                            {hasHandymen === null && (
                                                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Checking availability...</Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                </View>
                                {!serviceType && (
                                    <Text style={{ fontSize: 12, color: theme.danger, marginBottom: 10 }}>
                                        Please choose a service option before adding to cart.
                                    </Text>
                                )}
                            </>
                        )}

                        {/* Installation service info card — no picker, complexity handled by seller */}
                        {serviceType === 'Installation' && hasHandymen && (
                            <View style={[styles.installInfoCard, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <Ionicons name="construct-outline" size={16} color={theme.accent} />
                                    <Text style={[styles.installInfoTitle, { color: theme.accent }]}>
                                        Installation Service Included
                                    </Text>
                                </View>
                                <Text style={[styles.installInfoDesc, { color: theme.textSecondary }]}>
                                    Our team will assess your item and confirm the final installation fee before delivery.
                                </Text>
                                <View style={[styles.installInfoRow, { borderTopColor: theme.border }]}>
                                    <Text style={[styles.installInfoRange, { color: theme.textMuted }]}>Estimated range</Text>
                                    <Text style={[styles.installInfoRangeValue, { color: theme.accent }]}>
                                        ₱{installationFees.basic.min.toLocaleString()} – ₱{installationFees.complex.max.toLocaleString()}
                                    </Text>
                                </View>
                            </View>
                        )}
                        {!offersBoth && !offersDelivery && !offersInstallation && (
                            <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>
                                This listing has no valid service option configured.
                            </Text>
                        )}
                    </ScrollView>

                    {/* Footer Action */}
                    <View style={[styles.footer, { backgroundColor: theme.background }]}>
                        <TouchableOpacity
                            style={[
                                styles.addToCartButton,
                                { backgroundColor: theme.accent, shadowColor: theme.accent },
                                ((!offersDelivery && !offersInstallation) || !serviceType) && { opacity: 0.5 }
                            ]}
                            onPress={handleAddToCart}
                            disabled={(!offersDelivery && !offersInstallation) || !serviceType}
                        >
                            <Text style={styles.addToCartText}>Add to Cart</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View >
        </Modal >
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    overlayTouchable: {
        flex: 1,
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        minHeight: height * 0.5,
        maxHeight: height * 0.8,
        paddingBottom: 20,
    },
    handleIndicator: {
        width: 40,
        height: 5,
        backgroundColor: '#ccc',
        borderRadius: 3,
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 10,
    },
    headerRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    productImage: {
        width: 100,
        height: 100,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
    },
    productInfo: {
        flex: 1,
        marginLeft: 15,
        justifyContent: 'flex-end',
    },
    price: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#8D6E63',
        marginBottom: 4,
    },
    stockText: {
        fontSize: 12,
        color: '#777',
        marginBottom: 4,
    },
    installFeeText: {
        fontSize: 12,
        color: '#e65100',
        fontWeight: '500',
        marginBottom: 2,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    ratingText: {
        fontSize: 12,
        color: '#333',
        marginLeft: 4,
        fontWeight: '600',
    },
    soldText: {
        fontSize: 12,
        color: '#999',
        marginLeft: 8,
    },
    closeButton: {
        position: 'absolute',
        top: 0,
        right: 20,
    },
    scrollContent: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
        marginTop: 8,
    },
    optionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 20,
    },
    colorOption: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        marginRight: 10,
        marginBottom: 10,
        backgroundColor: '#f9f9f9',
        alignItems: 'center',
        minWidth: 64,
    },
    selectedColorOption: {
        borderColor: '#8D6E63',
        backgroundColor: '#efebe9',
    },
    colorText: {
        fontSize: 14,
        color: '#333',
    },
    selectedColorText: {
        color: '#8D6E63',
        fontWeight: 'bold',
    },
    sizeOption: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        marginRight: 12,
        marginBottom: 10,
        backgroundColor: '#f9f9f9',
    },
    selectedSizeOption: {
        borderColor: '#8D6E63',
        backgroundColor: '#efebe9',
    },
    sizeText: {
        fontSize: 14,
        color: '#333',
    },
    selectedSizeText: {
        color: '#8D6E63',
        fontWeight: 'bold',
    },
    quantitySection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        marginBottom: 20,
    },
    quantityControl: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
    },
    qtyBtn: {
        padding: 10,
        width: 40,
        alignItems: 'center',
    },
    qtyValue: {
        paddingHorizontal: 20,
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    addToCartButton: {
        backgroundColor: '#8D6E63',
        paddingVertical: 15,
        borderRadius: 30,
        alignItems: 'center',
        shadowColor: '#8D6E63',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    addToCartText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    serviceRow: {
        marginBottom: 20,
    },
    serviceOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 10,
        marginBottom: 10,
        backgroundColor: '#fafafa',
    },
    selectedService: {
        borderColor: '#8D6E63',
        backgroundColor: '#efebe9',
    },
    serviceText: {
        fontSize: 14,
        color: '#333',
    },
    selectedServiceText: {
        fontWeight: 'bold',
        color: '#3e2723',
    },
    tierOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: 1.5,
        borderRadius: 12,
        marginBottom: 10,
    },
    tierOptionActive: {
        borderWidth: 1.5,
    },
    tierLabel: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    tierDesc: {
        fontSize: 11,
    },
    tierPrice: {
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'right',
    },
    installInfoCard: {
        borderWidth: 1.5,
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
    },
    installInfoTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginLeft: 8,
    },
    installInfoDesc: {
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 10,
    },
    installInfoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 10,
        borderTopWidth: 1,
    },
    installInfoRange: {
        fontSize: 12,
    },
    installInfoRangeValue: {
        fontSize: 13,
        fontWeight: '700',
    },
});

export default ProductSelectionModal;
