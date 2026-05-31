import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    Image,
    TouchableOpacity,
    TextInput,
    FlatList,
    Dimensions,
    Modal,
    Platform,
    ActivityIndicator,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { ordersAPI, addressesAPI, paymentMethodsAPI, shippingAPI, pointsAPI, geocodeAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import { useAuth } from '../context/AuthContext';
import AddressAutocompleteInput from '../components/AddressAutocompleteInput';
import { useFees } from '../context/FeesContext';
import EDDBanner from '../components/EDDBanner';


const { width } = Dimensions.get('window');

const COD_OPTION = { id: 'cod', label: 'Cash on Delivery', icon: 'cash-outline', desc: 'Pay when you receive' };

// ── AddressSelectionModal defined OUTSIDE CheckoutScreen so React gives it a
// stable component identity — prevents remounting (and keyboard dismissal) on
// every parent state change.
const AddressSelectionModal = ({
    visible, theme,
    showAddressForm, setShowAddressForm,
    onClose,
    addresses, selectedAddress, setSelectedAddress,
    newAddress, setNewAddress,
    handleAddAddress,
}) => {
    // Local state for inline autocomplete suggestions (avoids absolute-position clipping inside ScrollView)
    const [addrSuggestions, setAddrSuggestions] = useState([]);
    const [addrLoading, setAddrLoading]         = useState(false);
    const addrDebounce = React.useRef(null);

    const handleAddrChange = (t) => {
        setNewAddress({ ...newAddress, address: t, latitude: null, longitude: null });
        if (addrDebounce.current) clearTimeout(addrDebounce.current);
        if (!t || t.length < 3) { setAddrSuggestions([]); return; }
        addrDebounce.current = setTimeout(async () => {
            setAddrLoading(true);
            try {
                const { geocodeAPI } = require('../services/api');
                const res = await geocodeAPI.autocomplete(t);
                setAddrSuggestions(res.success && res.results?.length > 0 ? res.results : []);
            } catch { setAddrSuggestions([]); }
            finally { setAddrLoading(false); }
        }, 500);
    };

    const handleAddrSelect = (item) => {
        setNewAddress({ ...newAddress, address: item.label, latitude: item.lat, longitude: item.lng });
        setAddrSuggestions([]);
    };

    // Guard: don't render until theme is available
    if (!theme) return null;
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <KeyboardAwareWrapper
                    style={{ height: '90%', width: '100%', justifyContent: 'flex-end' }}
                >
                    <View style={[styles.fullScreenModal, { backgroundColor: theme.background }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                            <TouchableOpacity onPress={() => {
                                if (showAddressForm) { setShowAddressForm(false); setAddrSuggestions([]); }
                                else onClose();
                            }}>
                                <Ionicons name={showAddressForm ? 'arrow-back' : 'close'} size={24} color={theme.headerText} />
                            </TouchableOpacity>
                            <Text style={[styles.modalTitle, { color: theme.headerText }]}>
                                {showAddressForm ? 'New Address' : 'Select Address'}
                            </Text>
                            <View style={{ width: 24 }} />
                        </View>

                        {showAddressForm ? (
                            <ScrollView
                                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                <Text style={[styles.formLabel, { color: theme.text }]}>Label (e.g. Home, Office)</Text>
                                <TextInput
                                    style={[styles.modalInput, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                    value={newAddress.label}
                                    onChangeText={(t) => setNewAddress({ ...newAddress, label: t })}
                                    placeholder="Home"
                                    placeholderTextColor={theme.textMuted}
                                />
                                <Text style={[styles.formLabel, { color: theme.text }]}>Full Name</Text>
                                <TextInput
                                    style={[styles.modalInput, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                    value={newAddress.full_name}
                                    onChangeText={(t) => setNewAddress({ ...newAddress, full_name: t })}
                                    placeholder="Name"
                                    placeholderTextColor={theme.textMuted}
                                />
                                <Text style={[styles.formLabel, { color: theme.text }]}>Phone Number</Text>
                                <TextInput
                                    style={[styles.modalInput, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                                    value={newAddress.phone}
                                    onChangeText={(t) => setNewAddress({ ...newAddress, phone: t })}
                                    placeholder="Phone"
                                    keyboardType="phone-pad"
                                    placeholderTextColor={theme.textMuted}
                                />
                                <Text style={[styles.formLabel, { color: theme.text }]}>Address</Text>

                                {/* ── Inline address search (no absolute dropdown) ── */}
                                <View style={[styles.modalInput, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, height: 46, marginBottom: addrSuggestions.length > 0 ? 0 : 10 }]}>
                                    <Ionicons name="location-outline" size={16} color={theme.accent} style={{ marginRight: 8 }} />
                                    <TextInput
                                        style={{ flex: 1, color: theme.text, fontSize: 14 }}
                                        value={newAddress.address}
                                        onChangeText={handleAddrChange}
                                        placeholder="Search delivery address..."
                                        placeholderTextColor={theme.textMuted}
                                        autoCorrect={false}
                                        autoCapitalize="words"
                                    />
                                    {addrLoading && <ActivityIndicator size="small" color={theme.accent} />}
                                    {!addrLoading && newAddress.address?.length > 0 && (
                                        <TouchableOpacity onPress={() => { setNewAddress({ ...newAddress, address: '', latitude: null, longitude: null }); setAddrSuggestions([]); }}>
                                            <Ionicons name="close-circle" size={16} color={theme.textMuted} />
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {/* Inline suggestion list — part of ScrollView so no clipping */}
                                {addrSuggestions.length > 0 && (
                                    <View style={[styles.inlineSuggestions, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                        {addrSuggestions.map((item, index) => (
                                            <TouchableOpacity
                                                key={index.toString()}
                                                style={[
                                                    styles.suggestionRow,
                                                    { borderBottomColor: theme.border },
                                                    index === addrSuggestions.length - 1 && { borderBottomWidth: 0 },
                                                ]}
                                                onPress={() => handleAddrSelect(item)}
                                                activeOpacity={0.7}
                                            >
                                                <Ionicons name="location" size={14} color={theme.accent} style={{ marginRight: 8, marginTop: 1 }} />
                                                <Text style={{ flex: 1, fontSize: 13, color: theme.text, lineHeight: 18 }} numberOfLines={2}>
                                                    {item.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                {/* Additional details */}
                                <View style={[styles.modalInput, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, height: 46, marginTop: addrSuggestions.length > 0 ? 8 : 0 }]}>
                                    <Ionicons name="document-text-outline" size={15} color={theme.textMuted} style={{ marginRight: 8 }} />
                                    <TextInput
                                        style={{ flex: 1, color: theme.text, fontSize: 14 }}
                                        value={newAddress.additional_details}
                                        onChangeText={(t) => setNewAddress({ ...newAddress, additional_details: t })}
                                        placeholder="House / Unit no., Floor, Landmark (optional)"
                                        placeholderTextColor={theme.textMuted}
                                        autoCorrect={false}
                                    />
                                </View>

                                <View style={styles.checkboxContainer}>
                                    <TouchableOpacity
                                        style={[styles.checkbox, { borderColor: theme.accent }, newAddress.is_default && [styles.checkboxActive, { backgroundColor: theme.accent }]]}
                                        onPress={() => setNewAddress({ ...newAddress, is_default: !newAddress.is_default })}
                                    >
                                        {newAddress.is_default && <Ionicons name="checkmark" size={16} color="#fff" />}
                                    </TouchableOpacity>
                                    <Text style={[styles.checkboxLabel, { color: theme.text }]}>Set as default address</Text>
                                </View>
                                <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.accent }]} onPress={handleAddAddress}>
                                    <Text style={styles.saveButtonText}>Save & Use Address</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        ) : (
                            <View style={{ flex: 1 }}>
                                <FlatList
                                    data={addresses}
                                    keyExtractor={(item) => item.address_id.toString()}
                                    contentContainerStyle={{ padding: 20 }}
                                    ListEmptyComponent={() => (
                                        <View style={styles.emptyState}>
                                            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No addresses found.</Text>
                                        </View>
                                    )}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={[
                                                styles.addressOption,
                                                { backgroundColor: theme.card, borderColor: theme.border },
                                                item.address_id === selectedAddress?.address_id && [styles.addressOptionSelected, { borderColor: theme.accent, backgroundColor: theme.accentBg }]
                                            ]}
                                            onPress={() => { setSelectedAddress(item); onClose(); }}
                                        >
                                            <View style={styles.addressOptionLeft}>
                                                <View style={styles.addressOptionHeader}>
                                                    <Text style={[styles.addressLabel, { color: theme.text }]}>{item.label}</Text>
                                                    {item.is_default === 1 && (
                                                        <View style={styles.defaultBadge}>
                                                            <Text style={styles.defaultBadgeText}>Default</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={[styles.addressText, { color: theme.textSecondary }]}>{item.full_name} | {item.phone}</Text>
                                                <Text style={[styles.addressText, { color: theme.textSecondary }]} numberOfLines={2}>{item.address}</Text>
                                            </View>
                                            {item.address_id === selectedAddress?.address_id && (
                                                <Ionicons name="checkmark-circle" size={24} color={theme.accent} />
                                            )}
                                        </TouchableOpacity>
                                    )}
                                />
                                <TouchableOpacity style={[styles.fab, { backgroundColor: theme.accent }]} onPress={() => setShowAddressForm(true)}>
                                    <Ionicons name="add" size={24} color="#fff" />
                                    <Text style={styles.fabText}>Add New Address</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </KeyboardAwareWrapper>
            </View>
        </Modal>
    );
};

const CheckoutScreen = ({ route, navigation }) => {

    const { user } = useAuth();
    const { cartItems, getCartTotal, clearCart, removeFromCart } = useCart();
    const { theme } = useTheme();
    const { getInstallationTier, freeShippingThreshold } = useFees();

    // Use selected items from CartScreen, fallback to all cart items
    const checkoutItems = route.params?.selectedItems || cartItems;

    // Derive the primary shop_id from the first cart item (all items in a single checkout belong to one shop)
    const primaryShopId = checkoutItems[0]?.shop_id || checkoutItems[0]?.shopId || null;
    const checkoutHasInstall = checkoutItems.some(i => i.serviceType === 'Installation' || (i.installation_fee || 0) > 0);


    // Vehicle selection state
    const [vehicleTiers, setVehicleTiers] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [distanceKm, setDistanceKm] = useState(0);
    const [distanceDisplay, setDistanceDisplay] = useState(null);
    const [edd, setEdd] = useState(null); // { edd_min, edd_max, delayed }


    // Downpayment: item not built yet — no delivery, no install fee, no fragility surcharge.
    // Final balance: item is ready to ship — all fees apply normally.
    const isDownpaymentPhase = checkoutItems.every(
        i => i.isCustomPayment && i.paymentPhase === 'downpayment'
    );

    // Derive highest fragility level from all checkout items.
    // For downpayment items, treat as non-fragile (surcharge only applies at delivery).
    const FRAGILITY_ORDER = ['none', 'low', 'medium', 'high'];
    const fragility_level = isDownpaymentPhase ? 'none' : checkoutItems.reduce((highest, item) => {
        const lvl = item.fragility_level || (item.is_fragile ? 'high' : 'none');
        return FRAGILITY_ORDER.indexOf(lvl) > FRAGILITY_ORDER.indexOf(highest) ? lvl : highest;
    }, 'none');
    const hasFragile = fragility_level !== 'none';

    // Address State
    const [addresses, setAddresses] = useState([]);
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [loadingAddresses, setLoadingAddresses] = useState(false);

    // Payment method State
    const [paymentMethods, setPaymentMethods] = useState([COD_OPTION]);
    const [selectedPayment, setSelectedPayment] = useState('cod');
    const [selectedPaymentObj, setSelectedPaymentObj] = useState(COD_OPTION);

    // UI State
    const [addressModalVisible, setAddressModalVisible] = useState(false);
    const [showAddressForm, setShowAddressForm] = useState(false);
    const [loading, setLoading] = useState(false);

    // Voucher State
    const [voucherCodeInput, setVoucherCodeInput] = useState('');
    const [appliedVoucher, setAppliedVoucher] = useState(null);
    const [discountAmount, setDiscountAmount] = useState(0);
    const [validatingVoucher, setValidatingVoucher] = useState(false);

    // Points State
    const [pointsBalance, setPointsBalance] = useState(0);
    const [pointsInput, setPointsInput] = useState('');
    const [pointsDiscount, setPointsDiscount] = useState(0);
    const [pointsApplied, setPointsApplied] = useState(0);
    const [pointsPreviewNote, setPointsPreviewNote] = useState(null);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info',
        showCancel: false,
        onConfirm: null,
        confirmText: 'OK',
        cancelText: 'Cancel',
        onCancel: null
    });

    const [myVouchers, setMyVouchers] = useState([]);
    const [vouchersModalVisible, setVouchersModalVisible] = useState(false);

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null, confirmText = 'OK', cancelText = 'Cancel', onCancel = null) => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm, confirmText, cancelText, onCancel });
    };

    const hideAlert = () => {
        setAlertConfig({ ...alertConfig, visible: false });
    };

    // New Address Form
    const [newAddress, setNewAddress] = useState({
        full_name: user?.full_name || '',
        phone: user?.phone || '',
        address: '',
        additional_details: '',
        label: 'Home',
        is_default: false,
    });

    // Compute per-item install fee using real tier from FeesContext.
    // Installation fee is waived on downpayment — nothing is installed yet.
    const getItemInstallFee = (item) => {
        if (isDownpaymentPhase) return 0;
        return item.serviceType === 'Installation'
            ? getInstallationTier(item.installationComplexity).min
            : 0;
    };

    const productSubtotal = checkoutItems.reduce((sum, item) => {
        const priceNum = typeof item.price === 'string'
            ? parseFloat(item.price.replace(/[^0-9.]/g, ''))
            : (item.price || 0);
        return sum + priceNum * item.quantity;
    }, 0);

    // Installation total is always 0 for downpayment (guard inside getItemInstallFee)
    const installationTotal = checkoutItems.reduce((sum, item) =>
        sum + getItemInstallFee(item) * item.quantity, 0);

    const subtotal = productSubtotal + installationTotal;

    // Dynamic Delivery Fee state
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [deliveryLabel, setDeliveryLabel] = useState('Standard Delivery');
    const [fragileLabel, setFragileLabel] = useState('');
    const total = Math.max(0, subtotal + (selectedAddress ? deliveryFee : 0) - discountAmount - pointsDiscount);

    // Fetch EDD preview on mount
    useEffect(() => {
        if (!primaryShopId) return;
        ordersAPI.getEDDPreview(primaryShopId, checkoutHasInstall)
            .then(res => { if (res?.success) setEdd(res); })
            .catch(() => {});
    }, [primaryShopId, checkoutHasInstall]);

    // ── Fetch real Haversine distance when address changes ────────────────────
    useEffect(() => {
        setDistanceKm(0);
        setDistanceDisplay(null);
        if (!selectedAddress || !primaryShopId) return;

        const fetchDistance = async () => {
            try {
                // Prefer address_id DB lookup (both sides have stored coords)
                if (selectedAddress.address_id) {
                    const res = await geocodeAPI.distance({
                        shopId: primaryShopId,
                        addressId: selectedAddress.address_id,
                    });
                    if (res?.success) {
                        setDistanceKm(res.distance_km);
                        setDistanceDisplay(res.distance_display);
                        return;
                    }
                }
                // Fallback: use address lat/lng if stored
                if (selectedAddress.latitude && selectedAddress.longitude) {
                    const res = await geocodeAPI.distance({
                        shopId: primaryShopId,
                        custLat: parseFloat(selectedAddress.latitude),
                        custLng: parseFloat(selectedAddress.longitude),
                    });
                    if (res?.success) {
                        setDistanceKm(res.distance_km);
                        setDistanceDisplay(res.distance_display);
                    }
                }
            } catch (e) {
                // Non-fatal — fallback to 0 km (base fee only)
                console.warn('[checkout/distance]', e.message);
            }
        };

        fetchDistance();
    }, [selectedAddress, primaryShopId]);

    // Fetch dynamic rates whenever the address OR vehicle OR distance changes
    useEffect(() => {
        const getShippingRates = async () => {
            // Downpayment phase: item hasn't been made yet, nothing to deliver.
            // Final balance phase: item is ready — delivery fee applies like a normal order.
            if (isDownpaymentPhase) {
                setDeliveryFee(0);
                setDeliveryLabel('No delivery fee (downpayment only)');
                return;
            }

            if (selectedAddress && subtotal > 0) {
                try {
                    const res = await shippingAPI.calculate(
                        selectedAddress.address,
                        selectedVehicle?.id || null,
                        distanceKm || 0,
                        hasFragile,
                        subtotal,
                        fragility_level
                    );
                    if (res.success) {
                        setDeliveryFee(res.fee);
                        setDeliveryLabel(res.label);
                        setFragileLabel(res.fragile_label || '');
                    }
                } catch (error) {
                    setDeliveryFee(500);
                    setDeliveryLabel('Standard Delivery');
                }
            } else {
                setDeliveryFee(0);
            }
        };
        getShippingRates();
    }, [selectedAddress, subtotal, selectedVehicle, distanceKm, checkoutItems]);


    useEffect(() => {
        if (user) {
            const fetchAddresses = async () => {
                if (!user) return;
                setLoadingAddresses(true);
                try {
                    const response = await addressesAPI.getAddresses(user.id);
                    if (response.success) {
                        setAddresses(response.data);
                        const defNode = response.data.find(a => a.is_default);
                        if (defNode) setSelectedAddress(defNode);
                    }
                } catch (error) {
                    console.error('Fetch addresses error:', error);
                } finally {
                    setLoadingAddresses(false);
                }
            };
            fetchAddresses();
        }
    }, [user]);

    const fetchMyVouchers = async () => {
        if (!user) return;
        try {
            const { vouchersAPI } = require('../services/api');
            const res = await vouchersAPI.getMyVouchers(user.id);
            if (res.success) {
                setMyVouchers(res.data);
            }
        } catch (err) {
            console.error('Fetch my vouchers error:', err);
        }
    };

    useEffect(() => {
        if (user) {
            fetchPaymentMethods();
            fetchMyVouchers();
            pointsAPI.getBalance(user.id)
                .then(res => { if (res.success) setPointsBalance(res.balance || 0); })
                .catch(() => { });
            // Load vehicle tiers and auto-select based on cart contents
            shippingAPI.getVehicles()
                .then(res => {
                    if (res.success && res.data?.length > 0) {
                        const tiers = res.data; // sorted cheapest first
                        setVehicleTiers(tiers);

                        const totalQty = checkoutItems.reduce((s, i) => s + (i.quantity || 1), 0);

                        // Auto-select logic:
                        // - Any fragile/glass item → largest vehicle (Truck)
                        // - 5+ total items           → middle vehicle (Pickup)
                        // - Otherwise                → cheapest (Motorcycle)
                        let autoVehicle;
                        if (hasFragile) {
                            // Prefer vehicle named Truck, fallback to most expensive
                            autoVehicle =
                                tiers.find(v => v.name?.toLowerCase().includes('truck')) ||
                                tiers[tiers.length - 1];
                        } else if (totalQty >= 5) {
                            // Middle tier (index 1 if available, else last)
                            autoVehicle = tiers[Math.min(1, tiers.length - 1)];
                        } else {
                            autoVehicle = tiers[0]; // cheapest
                        }
                        setSelectedVehicle(autoVehicle);
                    }
                })
                .catch(() => {});
        }
    }, [user]);

    const fetchPaymentMethods = async () => {
        try {
            const response = await paymentMethodsAPI.getPaymentMethods(user.id);
            if (response.success && response.data.length > 0) {
                // Merge DB methods with COD default (avoid duplicate COD)
                const dbMethods = response.data.map(m => ({
                    id: `db_${m.id}`,
                    dbId: m.id,
                    label: m.label,
                    icon: m.type === 'gcash' ? 'phone-portrait-outline' : m.type === 'bank' ? 'card-outline' : 'cash-outline',
                    desc: m.account_number ? `•••• ${m.account_number.slice(-4)}` : '',
                    type: m.type,
                    is_default: m.is_default,
                }));
                const hasCOD = dbMethods.some(m => m.type === 'cod');
                const allMethods = hasCOD ? dbMethods : [COD_OPTION, ...dbMethods];
                setPaymentMethods(allMethods);
                const def = allMethods.find(m => m.is_default) || allMethods[0];
                setSelectedPayment(def.id);
                setSelectedPaymentObj(def);
            }
        } catch (error) {
            console.error('Fetch payment methods error:', error);
        }
    };

    const handleApplyVoucher = async (code) => {
        if (!code?.trim()) return;

        setValidatingVoucher(true);
        try {
            const { vouchersAPI } = require('../services/api');
            const res = await vouchersAPI.validate(code.trim(), subtotal);
            if (res.success) {
                setAppliedVoucher(res.voucher);
                setDiscountAmount(res.discount);
                setVoucherCodeInput('');
                setVouchersModalVisible(false);
                showAlert('Success', res.message || 'Promo code applied!', 'success');
            } else {
                showAlert('Invalid Code', res.message || 'The promo code entered is invalid.', 'error');
            }
        } catch (error) {
            console.error('Voucher Error', error);
            showAlert('Error', 'Failed to validate promo code.', 'error');
        } finally {
            setValidatingVoucher(false);
        }
    };

    const handleRemoveVoucher = () => {
        setAppliedVoucher(null);
        setDiscountAmount(0);
        showAlert('Removed', 'Promo code removed from the order.', 'info');
    };

    // Points handlers
    const handleApplyPoints = async () => {
        const pts = parseInt(pointsInput, 10);
        if (!pts || pts < 100) {
            showAlert('Minimum 100 pts', 'Enter at least 100 points to redeem.', 'warning');
            return;
        }
        try {
            const res = await pointsAPI.preview(user.id, pts, subtotal);
            if (res.success) {
                setPointsApplied(res.points_applied);
                setPointsDiscount(res.discount_amount);
                setPointsPreviewNote(res.note);
            } else {
                showAlert('Cannot Redeem', res.message, 'error');
            }
        } catch (e) {
            showAlert('Error', 'Could not validate points.', 'error');
        }
    };

    const handleRemovePoints = () => {
        setPointsApplied(0);
        setPointsDiscount(0);
        setPointsInput('');
        setPointsPreviewNote(null);
    };

    const handleAddAddress = async () => {
        if (!newAddress.full_name || !newAddress.phone || !newAddress.address) {
            showAlert('Missing Info', 'Please fill in all fields.', 'warning');
            return;
        }

        try {
            const response = await addressesAPI.addAddress({ ...newAddress, user_id: user.id });
            if (response.success) {
                showAlert("Success", "Address added!", "success");
                setShowAddressForm(false);
                const blank = { full_name: user?.full_name || '', phone: user?.phone || '', address: '', additional_details: '', label: 'Home', is_default: false };
                setNewAddress(blank);
                // Re-fetch address list and auto-select the newly added address
                try {
                    const refreshed = await addressesAPI.getAddresses(user.id);
                    if (refreshed.success) {
                        setAddresses(refreshed.data);
                        // Auto-select new address (last in list, or whichever is_default)
                        const def = refreshed.data.find(a => a.is_default) || refreshed.data[refreshed.data.length - 1];
                        if (def) setSelectedAddress(def);
                    }
                } catch (_) {}
            }
        } catch (error) {
            showAlert("Error", "Failed to add address", "error");
        }
    };

    const handlePlaceOrder = async () => {
        if (!selectedAddress) {
            showAlert('No Address', 'Please select or add a shipping address.', 'warning');
            setAddressModalVisible(true);
            return;
        }

        setLoading(true);
        try {
            const orderItems = checkoutItems.map(item => {
                const basePrice = typeof item.price === 'string'
                    ? parseFloat(item.price.replace(/[^0-9.]/g, ''))
                    : (item.price || 0);
                const installFee = getItemInstallFee(item);

                return {
                    product_id: parseInt(item.product_id || item.id),
                    listing_id: parseInt(item.listing_id || item.listingId || 0) || null,
                    quantity: item.quantity,
                    price: basePrice + installFee,
                    base_price: basePrice,
                    installation_fee: installFee,
                    selected_variant: [item.selectedSize, item.selectedColor, item.serviceType, item.installationComplexity].filter(Boolean).join(' - '),
                    request_id: item.customRequestId || null,
                    payment_phase: item.paymentPhase || null
                };
            });

            // Clean address string — vehicle/fee now stored in dedicated DB columns
            const vehicleName = selectedVehicle?.name || 'Standard Delivery';
            const addrDetails = selectedAddress.additional_details ? ` — ${selectedAddress.additional_details}` : '';
            const shippingAddressStr = `${selectedAddress.full_name}, ${selectedAddress.phone}, ${selectedAddress.address}${addrDetails} | Vehicle: ${vehicleName}`;

            // Determine payment_method string to store
            const paymentLabel = selectedPaymentObj?.label || selectedPayment;

            const orderData = {
                user_id: user.id,
                items: orderItems,
                total_amount: total,
                delivery_fee: deliveryFee,              // ← exact delivery fee stored separately
                shipping_address: shippingAddressStr,
                payment_method: paymentLabel,
                voucher_code: appliedVoucher?.code || null,
                discount_amount: discountAmount || 0,
                points_redeemed: pointsApplied || 0
            };

            const response = await ordersAPI.placeOrder(orderData);
            if (response.success) {
                // Remove only the checked-out items from cart
                checkoutItems.forEach(item => {
                    removeFromCart(item.cartId || item.id);
                });
                showAlert(
                    '🎉 Order Placed!',
                    `Your order #${response.order_id} has been placed successfully!`,
                    'success',
                    true,
                    () => navigation.replace('MyOrders'),
                    'View Orders',
                    'Continue Shopping',
                    () => navigation.navigate('Main')
                );
            } else {
                showAlert('Error', response.message || 'Failed to place order', 'error');
            }
        } catch (error) {
            console.error('Checkout Error:', error);
            showAlert('Error', error.message || 'Failed to place order. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // AddressSelectionModal is rendered directly below as a top-level component (see above CheckoutScreen)

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Checkout</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* ── EDD Banner (top of checkout) ── */}
                {edd && !isDownpaymentPhase && (
                    <EDDBanner
                        eddMin={edd.edd_min}
                        eddMax={edd.edd_max}
                        delayed={edd.delayed}
                        style={{ marginBottom: 4 }}
                    />
                )}

                {/* ── Custom Order Banner ── */}
                {checkoutItems.some(i => i.isCustomPayment) && (() => {
                    const ci = checkoutItems.find(i => i.isCustomPayment);
                    const phase = ci?.paymentPhase;
                    const fragilIcon = { low: '🟡', medium: '🟠', high: '🔴' }[ci?.fragility_level] || '';
                    return (
                        <View style={[styles.section, { backgroundColor: '#FFF3E0', borderLeftWidth: 4, borderLeftColor: '#8D6E63' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <Ionicons name="color-wand" size={18} color="#8D6E63" />
                                <Text style={{ fontSize: 15, fontWeight: '700', color: '#3e2723' }}>
                                    Custom Order — REQ-{ci?.customRequestId}
                                </Text>
                            </View>
                            <Text style={{ fontSize: 13, color: '#795548', fontWeight: '600' }}>
                                {phase === 'downpayment' ? '50% Downpayment' : '50% Final Balance'} · ₱{parseFloat(ci?.price || 0).toLocaleString('en-PH')}
                            </Text>
                            {phase === 'downpayment' ? (
                                <Text style={{ fontSize: 11, color: '#6D4C41', marginTop: 4 }}>
                                    📦 No delivery fee on downpayment — item not yet ready for delivery.
                                </Text>
                            ) : (
                                <Text style={{ fontSize: 11, color: '#2E7D32', marginTop: 4 }}>
                                    🚚 Delivery fee applies — your item is ready and will be shipped to you.
                                </Text>
                            )}
                            {ci?.fragility_level && ci.fragility_level !== 'none' && (
                                <Text style={{ fontSize: 11, color: '#E65100', marginTop: 4 }}>
                                    {fragilIcon} {ci.fragility_level.charAt(0).toUpperCase() + ci.fragility_level.slice(1)} fragility surcharge included in delivery fee
                                </Text>
                            )}
                        </View>
                    );
                })()}
                {/* ── Shipping Address Summary ── */}
                <TouchableOpacity style={[styles.section, { backgroundColor: theme.sectionBg }]} onPress={() => setAddressModalVisible(true)} activeOpacity={0.7}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionHeaderLeft}>
                            <Ionicons name="location" size={20} color={theme.accent} />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Shipping Address</Text>
                        </View>
                        <View style={[styles.editBadge, { backgroundColor: theme.accentBg }]}>
                            <Text style={[styles.editBadgeText, { color: theme.accent }]}>Change</Text>
                        </View>
                    </View>

                    {selectedAddress ? (
                        <View style={[styles.addressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={styles.addressRow}>
                                <Text style={[styles.addressName, { color: theme.text }]}>{selectedAddress.full_name}</Text>
                                <Text style={[styles.addressPhone, { color: theme.accent }]}>{selectedAddress.phone}</Text>
                            </View>
                            <Text style={[styles.addressDetail, { color: theme.textSecondary }]}>{selectedAddress.address}</Text>
                            <Text style={[styles.addressLabelSmall, { color: theme.accent }]}>{selectedAddress.label}</Text>
                        </View>
                    ) : (
                        <View style={[styles.noAddressCard, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                            <Ionicons name="add-circle-outline" size={24} color={theme.accent} />
                            <Text style={[styles.noAddressText, { color: theme.textSecondary }]}>Tap to add a shipping address</Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* ── Order Summary ── */}
                <View style={[styles.section, { backgroundColor: theme.sectionBg }]}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionHeaderLeft}>
                            <Ionicons name="receipt-outline" size={20} color={theme.accent} />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Order Summary</Text>
                        </View>
                        <Text style={[styles.itemCountBadge, { color: theme.textSecondary }]}>{checkoutItems.length} item{checkoutItems.length > 1 ? 's' : ''}</Text>
                    </View>

                    {checkoutItems.map((item, index) => (
                        <View key={index} style={[styles.orderItem, { borderBottomColor: theme.border }]}>
                            <Image source={{ uri: item.image }} style={styles.orderItemImage} />
                            <View style={styles.orderItemInfo}>
                                <Text style={[styles.orderItemTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                                {(item.selectedSize || item.selectedColor) && (
                                    <View style={styles.variantRow}>
                                        {item.selectedColor && (
                                            <View style={[styles.colorDotSmall, { backgroundColor: item.selectedColor, borderColor: theme.border }]} />
                                        )}
                                        {item.selectedSize && (
                                            <Text style={[styles.variantTag, { backgroundColor: theme.inputBg, color: theme.textSecondary }]}>{item.selectedSize}</Text>
                                        )}
                                    </View>
                                )}
                                {item.serviceType && (
                                    <View style={styles.serviceRow}>
                                        <Ionicons
                                            name={item.serviceType === 'Installation' ? 'construct-outline' : 'car-outline'}
                                            size={13}
                                            color={theme.accent}
                                        />
                                        <Text style={[styles.serviceTag, { color: theme.accent }]}>
                                            {item.serviceType === 'Installation' ? 'Installation' : 'Delivery Only'}
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.orderItemBottom}>
                                    <Text style={[styles.orderItemPrice, { color: theme.accent }]}>{item.price}</Text>
                                    <Text style={[styles.orderItemQty, { color: theme.textSecondary }]}>x{item.quantity}</Text>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>

                {/* ── Payment Method ── */}
                <View style={[styles.section, { backgroundColor: theme.sectionBg }]}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionHeaderLeft}>
                            <Ionicons name="wallet-outline" size={20} color={theme.accent} />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Payment Method</Text>
                        </View>
                    </View>

                    {paymentMethods.map((method) => (
                        <TouchableOpacity
                            key={method.id}
                            style={[
                                styles.paymentOption,
                                { backgroundColor: theme.card, borderColor: theme.border },
                                selectedPayment === method.id && [styles.paymentOptionActive, { borderColor: theme.accent, backgroundColor: theme.accentBg }],
                            ]}
                            onPress={() => {
                                setSelectedPayment(method.id);
                                setSelectedPaymentObj(method);
                            }}
                        >
                            <View style={styles.paymentLeft}>
                                <View style={[
                                    styles.paymentIconCircle, { backgroundColor: theme.inputBg },
                                    selectedPayment === method.id && [styles.paymentIconCircleActive, { backgroundColor: theme.accent }],
                                ]}>
                                    <Ionicons
                                        name={method.icon}
                                        size={20}
                                        color={selectedPayment === method.id ? '#fff' : theme.accent}
                                    />
                                </View>
                                <View>
                                    <Text style={[
                                        styles.paymentLabel, { color: theme.textSecondary },
                                        selectedPayment === method.id && [styles.paymentLabelActive, { color: theme.text }],
                                    ]}>
                                        {method.label}
                                    </Text>
                                    <Text style={[styles.paymentDesc, { color: theme.textMuted }]}>{method.desc}</Text>
                                </View>
                            </View>
                            <Ionicons
                                name={selectedPayment === method.id ? 'radio-button-on' : 'radio-button-off'}
                                size={22}
                                color={selectedPayment === method.id ? theme.accent : theme.icon}
                            />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ── Delivery Vehicle (auto-selected, read-only) ── */}
                {selectedVehicle && (
                    <View style={[styles.section, { backgroundColor: theme.sectionBg }]}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionHeaderLeft}>
                                <Ionicons name="car-outline" size={20} color={theme.accent} />
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Delivery Vehicle</Text>
                            </View>
                            <View style={{ backgroundColor: theme.accentBg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 }}>
                                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '700' }}>AUTO</Text>
                            </View>
                        </View>

                        <View style={[styles.paymentOption, {
                            backgroundColor: theme.accentBg,
                            borderColor: theme.accent,
                            borderWidth: 1.5,
                        }]}>
                            <View style={[styles.paymentLeft, { flex: 1, paddingRight: 10 }]}>
                                <View style={[styles.paymentIconCircle, { backgroundColor: theme.accent }]}>
                                    <Ionicons
                                        name={
                                            selectedVehicle.name?.toLowerCase().includes('motorcycle') ? 'bicycle-outline'
                                            : selectedVehicle.name?.toLowerCase().includes('truck') ? 'bus-outline'
                                            : 'car-outline'
                                        }
                                        size={20}
                                        color="#fff"
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.paymentLabelActive, { color: theme.text }]}>
                                        {selectedVehicle.name}
                                    </Text>
                                    <Text style={[styles.paymentDesc, { color: theme.textMuted }]}>
                                        ₱{selectedVehicle.base_fee} base + ₱{selectedVehicle.rate_per_km}/km
                                    </Text>
                                    <Text style={{ fontSize: 11, color: theme.accent, marginTop: 2 }}>
                                        {hasFragile
                                            ? '🛡️ Upgraded for glass/fragile items'
                                            : checkoutItems.reduce((s, i) => s + (i.quantity || 1), 0) >= 5
                                            ? '📦 Selected for large order quantity'
                                            : '✓ Best option for your order'}
                                    </Text>
                                </View>
                            </View>
                            <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                        </View>

                        {hasFragile && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, padding: 10, backgroundColor: '#FFF3E0', borderRadius: 8 }}>
                                <Ionicons name="warning-outline" size={16} color="#E65100" />
                                <Text style={{ color: '#E65100', fontSize: 12, marginLeft: 6, flex: 1 }}>
                                    Glass/fragile item surcharge included in delivery fee
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Promo Code Section */}
                <View style={[styles.section, { backgroundColor: theme.sectionBg }]}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionHeaderLeft}>
                            <Ionicons name="ticket-outline" size={20} color={theme.accent} />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Promo Code</Text>
                        </View>
                    </View>

                    {appliedVoucher ? (
                        <View style={[styles.voucherCard, { backgroundColor: theme.card, borderColor: theme.accent, marginTop: 10 }]}>
                            <View style={[styles.voucherLeftStrip, { backgroundColor: theme.accent, borderRightColor: theme.background }]}>
                                <Text style={styles.voucherValueText}>
                                    {appliedVoucher.type === 'percentage' ? `${appliedVoucher.value}%` : `₱${appliedVoucher.value}`}
                                </Text>
                                <Text style={styles.voucherValueSub}>OFF</Text>
                            </View>
                            <View style={[styles.voucherContent, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 }]}>
                                <View>
                                    <View style={[styles.voucherCodeContainer, { backgroundColor: theme.accent + '20', marginBottom: 4 }]}>
                                        <Text style={[styles.voucherCode, { color: theme.accent }]}>{appliedVoucher.code}</Text>
                                    </View>
                                    <Text style={[styles.voucherDetail, { color: theme.textSecondary, marginBottom: 0 }]}>Discount applied</Text>
                                </View>
                                <TouchableOpacity onPress={handleRemoveVoucher} style={{ padding: 4 }}>
                                    <Ionicons name="close-circle" size={28} color={theme.textMuted} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                backgroundColor: theme.card,
                                borderWidth: 1,
                                borderColor: theme.border,
                                padding: 15,
                                borderRadius: 10,
                                marginTop: 10,
                            }}
                            onPress={() => setVouchersModalVisible(true)}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="wallet-outline" size={20} color={theme.textSecondary} />
                                <Text style={{ marginLeft: 10, color: theme.textSecondary, fontSize: 15 }}>Select Promo from Wallet</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                {myVouchers.length > 0 && (
                                    <View style={{ backgroundColor: theme.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginRight: 8 }}>
                                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{myVouchers.length}</Text>
                                    </View>
                                )}
                                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Loyalty Points Section ── */}
                {pointsBalance >= 100 && (
                    <View style={[styles.section, { backgroundColor: theme.sectionBg }]}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionHeaderLeft}>
                                <Ionicons name="trophy-outline" size={20} color="#FF9800" />
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Loyalty Points</Text>
                            </View>
                            <Text style={{ color: '#FF9800', fontWeight: '700', fontSize: 13 }}>{pointsBalance} pts</Text>
                        </View>

                        {pointsApplied > 0 ? (
                            <View style={[styles.voucherCard, { backgroundColor: '#FFF8E1', borderColor: '#FF9800', marginTop: 10 }]}>
                                <View style={[styles.voucherLeftStrip, { backgroundColor: '#FF9800', borderRightColor: '#FFF8E1' }]}>
                                    <Text style={styles.voucherValueText}>-₱{pointsDiscount.toFixed(0)}</Text>
                                    <Text style={styles.voucherValueSub}>OFF</Text>
                                </View>
                                <View style={[styles.voucherContent, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 }]}>
                                    <View>
                                        <Text style={{ color: '#E65100', fontWeight: '700' }}>{pointsApplied} pts used</Text>
                                        {pointsPreviewNote && <Text style={{ color: '#E65100', fontSize: 11, marginTop: 3 }}>{pointsPreviewNote}</Text>}
                                    </View>
                                    <TouchableOpacity onPress={handleRemovePoints}>
                                        <Ionicons name="close-circle" size={28} color="#bdbdbd" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
                                <TextInput
                                    style={[styles.modalInput, { flex: 1, marginBottom: 0, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text, height: 44 }]}
                                    placeholder={`Min 100, max ${pointsBalance}`}
                                    placeholderTextColor={theme.textMuted}
                                    keyboardType="numeric"
                                    value={pointsInput}
                                    onChangeText={setPointsInput}
                                />
                                <TouchableOpacity
                                    style={{ backgroundColor: '#FF9800', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 }}
                                    onPress={handleApplyPoints}
                                >
                                    <Text style={{ color: '#fff', fontWeight: '700' }}>Apply</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 8 }}>100 pts = ₱10 discount · Max 50% of subtotal</Text>
                    </View>
                )}

                {/* ── Price Breakdown ── */}
                <View style={[styles.section, { backgroundColor: theme.sectionBg }]}>
                    {/* Free-shipping nudge — show when within ₱20,000 of the threshold */}
                    {deliveryFee > 0 && freeShippingThreshold > 0 && (freeShippingThreshold - subtotal) <= 20000 && (freeShippingThreshold - subtotal) > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginBottom: 12, gap: 8 }}>
                            <Ionicons name="gift-outline" size={16} color="#2E7D32" />
                            <Text style={{ color: '#2E7D32', fontSize: 12, flex: 1, fontWeight: '600' }}>
                                Spend ₱{(freeShippingThreshold - subtotal).toLocaleString()} more for FREE delivery!
                            </Text>
                        </View>
                    )}
                    <View style={styles.priceRow}>
                        <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Subtotal (products)</Text>
                        <Text style={[styles.priceValue, { color: theme.text }]}>₱{productSubtotal.toLocaleString()}</Text>
                    </View>
                    {installationTotal > 0 && (
                        <View style={styles.priceRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="construct-outline" size={13} color="#e65100" />
                                <Text style={[styles.priceLabel, { color: '#e65100' }]}>Installation Fee</Text>
                            </View>
                            <Text style={[styles.priceValue, { color: '#e65100' }]}>+₱{installationTotal.toLocaleString()}</Text>
                        </View>
                    )}
                    <View style={styles.priceRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>
                                {selectedAddress ? (deliveryLabel + (selectedVehicle ? ` · ${selectedVehicle.name}` : '')) : 'Delivery Fee'}
                            </Text>
                            {distanceDisplay && distanceKm > 0 && (
                                <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 1 }}>
                                    📍 {distanceDisplay} from shop
                                </Text>
                            )}
                            {!selectedAddress && (
                                <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 1 }}>
                                    Select an address to calculate
                                </Text>
                            )}
                        </View>
                        <Text style={[styles.priceValue, { color: !selectedAddress ? theme.textMuted : theme.text, fontStyle: !selectedAddress ? 'italic' : 'normal' }]}>
                            {!selectedAddress ? '—' : deliveryFee === 0 ? 'FREE' : `₱${deliveryFee.toLocaleString()}`}
                        </Text>
                    </View>
                    {hasFragile && deliveryFee > 0 && (
                        <View style={styles.priceRow}>
                            <Text style={[styles.priceLabel, { color: '#E65100', fontSize: 11 }]}>
                                ↳ {fragileLabel || 'Incl. fragile surcharge'}
                            </Text>
                            <Ionicons name="shield-checkmark-outline" size={13} color="#E65100" />
                        </View>
                    )}
                    {discountAmount > 0 && (
                        <View style={styles.priceRow}>
                            <Text style={[styles.priceLabel, { color: '#E91E63' }]}>Discount ({appliedVoucher?.code})</Text>
                            <Text style={[styles.priceValue, { color: '#E91E63' }]}>- ₱{discountAmount.toLocaleString()}</Text>
                        </View>
                    )}
                    {pointsDiscount > 0 && (
                        <View style={styles.priceRow}>
                            <Text style={[styles.priceLabel, { color: '#FF9800' }]}>Points Discount ({pointsApplied} pts)</Text>
                            <Text style={[styles.priceValue, { color: '#FF9800' }]}>- ₱{pointsDiscount.toFixed(2)}</Text>
                        </View>
                    )}
                    <View style={[styles.totalDivider, { backgroundColor: theme.border }]} />
                    <View style={styles.priceRow}>
                        <Text style={[styles.totalLabel, { color: theme.text }]}>Total Payment</Text>
                        <Text style={[styles.totalValue, { color: theme.accent }]}>₱{total.toLocaleString()}</Text>
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* ── Fixed Bottom Button ── */}
            <View style={[styles.bottomBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
                <View style={styles.bottomTotalContainer}>
                    <Text style={[styles.bottomTotalLabel, { color: theme.textSecondary }]}>Total</Text>
                    <Text style={[styles.bottomTotalValue, { color: theme.text }]}>₱{total.toLocaleString()}</Text>
                </View>
                <TouchableOpacity
                    style={[styles.placeOrderButton, { backgroundColor: theme.accent, shadowColor: theme.accent }, loading && { opacity: 0.7 }]}
                    onPress={handlePlaceOrder}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Text style={styles.placeOrderText}>Place Order</Text>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        </>
                    )}
                </TouchableOpacity>
            </View>

            <AddressSelectionModal
                visible={addressModalVisible}
                theme={theme}
                showAddressForm={showAddressForm}
                setShowAddressForm={setShowAddressForm}
                onClose={() => setAddressModalVisible(false)}
                addresses={addresses}
                selectedAddress={selectedAddress}
                setSelectedAddress={setSelectedAddress}
                newAddress={newAddress}
                setNewAddress={setNewAddress}
                handleAddAddress={handleAddAddress}
            />

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                onConfirm={() => {
                    hideAlert();
                    if (alertConfig.onConfirm) alertConfig.onConfirm();
                }}
                onClose={() => {
                    hideAlert();
                    if (alertConfig.onCancel) alertConfig.onCancel();
                }}
            />

            {/* ── My Vouchers Modal ── */}
            <Modal
                visible={vouchersModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setVouchersModalVisible(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', margin: 0 }]}>
                    <View style={[styles.fullScreenModal, { height: '85%', backgroundColor: theme.background }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                            <TouchableOpacity onPress={() => setVouchersModalVisible(false)}>
                                <Ionicons name="close" size={24} color={theme.headerText} />
                            </TouchableOpacity>
                            <Text style={[styles.modalTitle, { color: theme.headerText }]}>Select Voucher</Text>
                            <View style={{ width: 24 }} />
                        </View>
                        <FlatList
                            data={myVouchers}
                            keyExtractor={(item) => item.claim_id.toString()}
                            contentContainerStyle={{ padding: 20 }}
                            ListEmptyComponent={() => (
                                <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 40 }}>
                                    <Ionicons name="wallet-outline" size={48} color={theme.textMuted} />
                                    <Text style={{ color: theme.textSecondary, marginTop: 10 }}>No vouchers in your wallet yet.</Text>
                                    <TouchableOpacity onPress={() => {
                                        setVouchersModalVisible(false);
                                        navigation.navigate('Main', { screen: 'Menu' });
                                    }} style={{ marginTop: 15, padding: 10, borderWidth: 1, borderColor: theme.accent, borderRadius: 8 }}>
                                        <Text style={{ color: theme.accent }}>Go Claim Vouchers</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => handleApplyVoucher(item.code)}
                                    style={[styles.voucherCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                                >
                                    <View style={[styles.voucherLeftStrip, { backgroundColor: theme.accent, borderRightColor: theme.background }]}>
                                        <Text style={styles.voucherValueText}>
                                            {item.discount_type === 'percentage' ? `${item.discount_value}%` : `₱${item.discount_value}`}
                                        </Text>
                                        <Text style={styles.voucherValueSub}>OFF</Text>
                                    </View>
                                    <View style={styles.voucherContent}>
                                        <View style={[styles.voucherCodeContainer, { backgroundColor: theme.accent + '20' }]}>
                                            <Text style={[styles.voucherCode, { color: theme.accent }]}>{item.code}</Text>
                                        </View>
                                        <Text style={[styles.voucherDetail, { color: theme.textSecondary }]}>Min Spend: ₱{item.min_spend}</Text>
                                        {item.end_date && (
                                            <Text style={[styles.voucherDetail, { color: theme.danger, fontSize: 11, marginTop: 4, fontWeight: '500' }]}>
                                                Valid until {new Date(item.end_date).toLocaleDateString()}
                                            </Text>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </SafeAreaView >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#3e2723',
    },
    scrollContent: {
        paddingBottom: 30,
    },
    section: {
        backgroundColor: '#fff',
        marginTop: 10,
        paddingHorizontal: 20,
        paddingVertical: 18,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#3e2723',
        marginLeft: 8,
    },
    editBadge: {
        backgroundColor: '#fdf6f0',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    editBadgeText: {
        fontSize: 13,
        color: '#8D6E63',
        fontWeight: '600',
    },
    itemCountBadge: {
        fontSize: 13,
        color: '#888',
    },

    /* Address Card */
    addressCard: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e8ddd4',
        borderRadius: 12,
        padding: 15,
        backgroundColor: '#fdf6f0',
    },
    addressRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    addressName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#3e2723',
    },
    addressPhone: {
        fontSize: 13,
        color: '#8D6E63',
        fontWeight: '500',
    },
    addressDetail: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
        marginBottom: 6,
    },
    addressLabelSmall: {
        fontSize: 11,
        color: '#8D6E63',
        backgroundColor: '#efebe9',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden',
        fontWeight: '600',
    },
    noAddressCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fafafa',
        borderRadius: 12,
        padding: 20,
        borderWidth: 1.5,
        borderColor: '#e0e0e0',
        borderStyle: 'dashed',
    },
    noAddressText: {
        fontSize: 14,
        color: '#888',
        marginLeft: 8,
    },

    /* Order Items */
    orderItem: {
        flexDirection: 'row',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    orderItemImage: {
        width: 65,
        height: 65,
        borderRadius: 10,
        backgroundColor: '#f0f0f0',
    },
    orderItemInfo: {
        flex: 1,
        marginLeft: 14,
        justifyContent: 'space-between',
    },
    orderItemTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    variantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 3,
    },
    colorDotSmall: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 6,
        borderWidth: 1,
        borderColor: '#ddd',
    },
    variantTag: {
        fontSize: 11,
        color: '#666',
        backgroundColor: '#f0f0f0',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden',
    },
    serviceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    serviceTag: {
        fontSize: 11,
        color: '#8D6E63',
        fontWeight: '500',
        marginLeft: 4,
    },
    orderItemBottom: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    orderItemPrice: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#8D6E63',
    },
    orderItemQty: {
        fontSize: 13,
        color: '#888',
    },

    /* Payment Methods */
    paymentOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#eee',
        marginBottom: 10,
        backgroundColor: '#fafafa',
    },
    paymentOptionActive: {
        borderColor: '#8D6E63',
        backgroundColor: '#fdf6f0',
    },
    paymentLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    paymentIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f0eb',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    paymentIconCircleActive: {
        backgroundColor: '#8D6E63',
    },
    paymentLabel: {
        fontSize: 15,
        color: '#555',
        fontWeight: '500',
    },
    paymentLabelActive: {
        color: '#3e2723',
        fontWeight: '600',
    },
    paymentDesc: {
        fontSize: 12,
        color: '#999',
        marginTop: 1,
    },

    /* Price Breakdown */
    priceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    priceLabel: {
        fontSize: 14,
        color: '#777',
    },
    priceValue: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    totalDivider: {
        height: 1,
        backgroundColor: '#eee',
        marginVertical: 8,
    },
    totalLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#3e2723',
    },
    totalValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#8D6E63',
    },

    /* Bottom Bar */
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        paddingBottom: 28,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 10,
    },
    bottomTotalContainer: {
        flex: 1,
    },
    bottomTotalLabel: {
        fontSize: 12,
        color: '#888',
    },
    bottomTotalValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#3e2723',
    },
    placeOrderButton: {
        backgroundColor: '#8D6E63',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 30,
        shadowColor: '#8D6E63',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    placeOrderText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginRight: 8,
    },

    /* ── Modal Styles ── */
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0)',
        justifyContent: 'flex-end',
    },
    fullScreenModal: {
        flex: 1,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        marginTop: 50,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#3e2723',
    },
    modalInput: {
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 10,
        padding: 12,
        fontSize: 15,
        backgroundColor: '#fafafa',
        color: '#333',
        marginBottom: 10,
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    formLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#555',
        marginBottom: 6,
        marginTop: 5,
    },
    saveButton: {
        backgroundColor: '#8D6E63',
        paddingVertical: 15,
        borderRadius: 30,
        alignItems: 'center',
        marginTop: 20,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },

    /* Address List Items */
    addressOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        marginBottom: 10,
        backgroundColor: '#fafafa',
        borderWidth: 1,
        borderColor: '#eee',
        borderRadius: 12,
    },
    addressOptionSelected: {
        backgroundColor: '#fdf6f0',
        borderColor: '#8D6E63',
    },
    addressOptionLeft: {
        flex: 1,
    },
    addressOptionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    addressLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#3e2723',
        marginRight: 8,
    },
    defaultBadge: {
        backgroundColor: '#e8f5e9',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    defaultBadgeText: {
        fontSize: 10,
        color: '#2e7d32',
        fontWeight: '700',
    },
    addressText: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        alignSelf: 'center',
        backgroundColor: '#8D6E63',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    fabText: {
        color: '#fff',
        fontWeight: 'bold',
        marginLeft: 8,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 40,
    },
    emptyText: {
        color: '#888',
    },
    inlineSuggestions: {
        borderWidth: 1,
        borderRadius: 10,
        marginBottom: 10,
        overflow: 'hidden',
    },
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 15,
        marginBottom: 10,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#8D6E63',
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxActive: {
        backgroundColor: '#8D6E63',
    },
    checkboxLabel: {
        fontSize: 14,
        color: '#333',
    },

    /* Voucher Modal Item */
    voucherCard: {
        flexDirection: 'row',
        borderRadius: 12,
        marginBottom: 15,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    voucherLeftStrip: {
        width: 80,
        justifyContent: 'center',
        alignItems: 'center',
        borderRightWidth: 1,
        borderStyle: 'dashed',
    },
    voucherContent: {
        flex: 1,
        padding: 15,
        justifyContent: 'center',
    },
    voucherCodeContainer: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginBottom: 8,
    },
    voucherCode: {
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1,
    },
    voucherDetail: {
        fontSize: 13,
        marginBottom: 2,
    },
    voucherValueText: {
        fontSize: 22,
        fontWeight: '900',
        color: '#fff',
    },
    voucherValueSub: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '600',
        marginTop: 2,
    },
});

export default CheckoutScreen;

