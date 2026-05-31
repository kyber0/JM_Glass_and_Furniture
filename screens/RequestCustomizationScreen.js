import React, { useState, useEffect, useRef } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    Image,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { customRequestsAPI, shopAPI, messagesAPI, geocodeAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const RequestCustomizationScreen = ({ route, navigation }) => {
    const { product, shop: initialShop, sellerId } = route.params;
    const { user } = useAuth();
    const [shop, setShop] = useState(initialShop || null);
    const [loadingShop, setLoadingShop] = useState(!initialShop);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info',
        showCancel: false,
        onConfirm: null,
        onCloseCallback: null
    });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null, onCloseCallback = null) => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm, onCloseCallback });
    };

    const hideAlert = () => {
        setAlertConfig({ ...alertConfig, visible: false });
    };

    useEffect(() => {
        if (!initialShop && sellerId) {
            const fetchShop = async () => {
                try {
                    const response = await shopAPI.getShopByOwner(sellerId);
                    if (response.success) {
                        setShop(response.shop);
                    } else {
                        showAlert('Error', 'Shop not found', 'error', false, () => navigation.goBack(), () => navigation.goBack());
                    }
                } catch (error) {
                    showAlert('Error', 'Failed to load shop details', 'error', false, () => navigation.goBack(), () => navigation.goBack());
                } finally {
                    setLoadingShop(false);
                }
            };
            fetchShop(); // Fetch shop details
        }
    }, [sellerId]);

    const [details, setDetails] = useState('');
    const [budget, setBudget] = useState('');
    const [images, setImages] = useState([]);
    const [serviceType, setServiceType] = useState('Delivery');
    const [fragilityLevel, setFragilityLevel] = useState('none');
    const [installationComplexity, setInstallationComplexity] = useState('standard');
    const [submitting, setSubmitting] = useState(false);
    const isSubmittingRef = useRef(false); // Ref guard prevents double-submit race condition

    // Delivery fee estimate from GPS
    const [estimatedFee, setEstimatedFee] = useState(null);
    const [estimateLoading, setEstimateLoading] = useState(false);

    useEffect(() => {
        if (!shop) return;
        setEstimateLoading(true);
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const { latitude: custLat, longitude: custLng } = loc.coords;
                const res = await geocodeAPI.distance({ shopId: shop.shop_id, custLat, custLng });
                if (res?.success) setEstimatedFee(res.delivery_fee);
            } catch (_) {}
            finally { setEstimateLoading(false); }
        })();
    }, [shop]);

    const pickImages = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.7,
        });

        if (!result.canceled && result.assets) {
            if (images.length + result.assets.length > 5) {
                showAlert('Limit', 'You can upload up to 5 images only.', 'warning');
                return;
            }
            setImages(prev => [...prev, ...result.assets.map(a => a.uri)]);
        }
    };

    const removeImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!details.trim()) {
            showAlert('Required', 'Please describe your custom design.', 'warning');
            return;
        }
        // Ref guard: prevents double-tap submitting before React state update propagates
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('user_id', user.id);
            formData.append('shop_id', shop.shop_id);
            if (product) {
                formData.append('product_id', product.product_id || product.id);
            }
            formData.append('details', details.trim());
            formData.append('service_type', serviceType);
            formData.append('fragility_level', fragilityLevel);
            formData.append('installation_complexity', installationComplexity);
            if (budget) formData.append('budget', parseFloat(budget));

            images.forEach((uri, index) => {
                formData.append('images', {
                    uri,
                    type: 'image/jpeg',
                    name: `custom_design_${index}.jpg`,
                });
            });

            const response = await customRequestsAPI.createRequest(formData);
            if (response.success) {
                // Send summary message to chat — stamped with shop_id for correct channel routing
                try {
                    const requestId = response.request_id;
                    const rawImages = response.raw_images || [];
                    let imageUrl = rawImages.length > 0 ? rawImages[0] : null;
                    if (imageUrl && imageUrl.startsWith('http')) {
                        const uploadsIndex = imageUrl.indexOf('uploads/');
                        if (uploadsIndex !== -1) imageUrl = imageUrl.substring(uploadsIndex);
                    }

                    const summaryMessage = `New Custom Request #${requestId}\n\nDetails: ${details}\nBudget: ₱${budget || 'N/A'}\nService: ${serviceType}`;

                    await messagesAPI.sendMessage({
                        sender_id:   user.id,
                        receiver_id: shop.user_id || sellerId,
                        message:     summaryMessage,
                        request_id:  requestId,
                        image_url:   imageUrl,
                        shop_id:     response.shop_id || shop.shop_id,  // channel anchor
                    });
                } catch (msgError) {
                    console.error('Failed to send summary message', msgError);
                }

                showAlert(
                    'Request Sent! 🎨',
                    'Your custom design request has been sent to the seller.',
                    'success',
                    false,
                    () => navigation.navigate('MyOrders', { initialTab: 'Requests' }),
                    'View Requests',
                );
            } else {
                showAlert('Error', response.message || 'Failed to send request.', 'error');
            }
        } catch (error) {
            console.error('Submit error:', error);
            showAlert('Error', 'Failed to send request.', 'error');
        } finally {
            setSubmitting(false);
            isSubmittingRef.current = false;
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#3e2723" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Request Custom Design</Text>
                <View style={{ width: 32 }} />
            </View>

            <KeyboardAwareWrapper>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {/* Reference Product (Optional) */}
                {product && (
                    <View style={styles.refProductCard}>
                        <Image
                            source={{ uri: product.image_url || product.image }}
                            style={styles.refProductImage}
                        />
                        <View style={styles.refProductInfo}>
                            <Text style={styles.refLabel}>Based on</Text>
                            <Text style={styles.refProductTitle} numberOfLines={2}>{product.title}</Text>
                            <Text style={styles.refShop}>from {shop?.shop_name}</Text>
                        </View>
                    </View>
                )}
                {/* Shop Name if no product */}
                {!product && shop && (
                    <View style={{ marginBottom: 20 }}>
                        <Text style={{ fontSize: 16, color: '#555' }}>Requesting from <Text style={{ fontWeight: 'bold', color: '#8D6E63' }}>{shop.shop_name}</Text></Text>
                    </View>
                )}

                {/* Design Description */}
                <Text style={styles.sectionTitle}>Describe Your Design</Text>
                <Text style={styles.hint}>Tell the seller what you'd like to customize — materials, colors, dimensions, etc.</Text>
                <TextInput
                    style={styles.textArea}
                    placeholder="e.g. I want this table in black wood finish with gold legs, 120cm x 80cm..."
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    value={details}
                    onChangeText={setDetails}
                />

                {/* Upload Design Images */}
                <Text style={styles.sectionTitle}>Upload Design References</Text>
                <Text style={styles.hint}>Upload images showing the design you want (up to 5)</Text>

                <View style={styles.imageGrid}>
                    {images.map((uri, index) => (
                        <View key={index} style={styles.imageWrapper}>
                            <Image source={{ uri }} style={styles.uploadedImage} />
                            <TouchableOpacity
                                style={styles.removeImageBtn}
                                onPress={() => removeImage(index)}
                            >
                                <Ionicons name="close-circle" size={22} color="#e53935" />
                            </TouchableOpacity>
                        </View>
                    ))}
                    {images.length < 5 && (
                        <TouchableOpacity style={styles.addImageBtn} onPress={pickImages}>
                            <Ionicons name="camera-outline" size={28} color="#8D6E63" />
                            <Text style={styles.addImageText}>Add</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Service Type Selection */}
                <Text style={styles.sectionTitle}>Service Option</Text>
                <View style={styles.serviceRow}>
                    <TouchableOpacity
                        style={[styles.serviceOption, serviceType === 'Delivery' && styles.selectedService]}
                        onPress={() => setServiceType('Delivery')}
                    >
                        <Ionicons
                            name={serviceType === 'Delivery' ? "radio-button-on" : "radio-button-off"}
                            size={20}
                            color={serviceType === 'Delivery' ? "#8D6E63" : "#777"}
                        />
                        <Text style={[styles.serviceText, serviceType === 'Delivery' && styles.selectedServiceText]}>
                            Delivery Only
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.serviceOption, serviceType === 'Installation' && styles.selectedService]}
                        onPress={() => setServiceType('Installation')}
                    >
                        <Ionicons
                            name={serviceType === 'Installation' ? "radio-button-on" : "radio-button-off"}
                            size={20}
                            color={serviceType === 'Installation' ? "#8D6E63" : "#777"}
                        />
                        <Text style={[styles.serviceText, serviceType === 'Installation' && styles.selectedServiceText]}>
                            Delivery & Installation
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Fragility Level */}
                <Text style={styles.sectionTitle}>Fragility Level</Text>
                <Text style={styles.hint}>Does your desired item involve glass or fragile materials?</Text>
                <View style={styles.serviceRow}>
                    {[
                        { key: 'none',   label: '⚪ None',   note: 'No surcharge' },
                        { key: 'low',    label: '🟡 Low',    note: '+₱100' },
                        { key: 'medium', label: '🟠 Medium', note: '+₱300' },
                        { key: 'high',   label: '🔴 High',   note: '+₱500' },
                    ].map(({ key, label, note }) => (
                        <TouchableOpacity
                            key={key}
                            style={[styles.fragChip, fragilityLevel === key && styles.fragChipActive]}
                            onPress={() => setFragilityLevel(key)}
                        >
                            <Text style={[styles.fragChipText, fragilityLevel === key && styles.fragChipTextActive]}>{label}</Text>
                            <Text style={{ fontSize: 10, color: fragilityLevel === key ? '#fff' : '#999', marginTop: 1 }}>{note}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Installation Complexity */}
                {serviceType === 'Installation' && (
                    <>
                        <Text style={styles.sectionTitle}>Installation Complexity</Text>
                        <Text style={styles.hint}>How complex is the installation you need?</Text>
                        <View style={styles.serviceRow}>
                            {[
                                { key: 'basic',    label: '🔧 Basic',    note: 'Simple setup' },
                                { key: 'standard', label: '⚙️ Standard', note: 'Moderate work' },
                                { key: 'complex',  label: '🏗️ Complex',  note: 'Major install' },
                            ].map(({ key, label, note }) => (
                                <TouchableOpacity
                                    key={key}
                                    style={[styles.fragChip, installationComplexity === key && styles.fragChipActive]}
                                    onPress={() => setInstallationComplexity(key)}
                                >
                                    <Text style={[styles.fragChipText, installationComplexity === key && styles.fragChipTextActive]}>{label}</Text>
                                    <Text style={{ fontSize: 10, color: installationComplexity === key ? '#fff' : '#999', marginTop: 1 }}>{note}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </>
                )}

                {/* Delivery Fee Estimate */}
                <View style={styles.feeEstimateCard}>
                    <Ionicons name="bicycle-outline" size={18} color="#8D6E63" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.feeEstimateLabel}>Estimated Delivery Fee</Text>
                        {estimateLoading ? (
                            <ActivityIndicator size="small" color="#8D6E63" />
                        ) : estimatedFee !== null ? (
                            <Text style={styles.feeEstimateValue}>~₱{estimatedFee.toLocaleString('en-PH')}</Text>
                        ) : (
                            <Text style={styles.feeEstimateMuted}>Calculated at checkout</Text>
                        )}
                        <Text style={styles.feeEstimateNote}>Final fee based on delivery address + fragility surcharge.</Text>
                    </View>
                </View>


                {/* Budget */}
                <Text style={styles.sectionTitle}>Your Budget (Optional)</Text>
                <View style={styles.budgetRow}>
                    <Text style={styles.pesoSign}>₱</Text>
                    <TextInput
                        style={styles.budgetInput}
                        placeholder="e.g. 5000"
                        keyboardType="numeric"
                        value={budget}
                        onChangeText={setBudget}
                    />
                </View>

                {/* Submit */}
                <TouchableOpacity
                    style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="send" size={20} color="#fff" />
                            <Text style={styles.submitBtnText}>Send Request</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
            </KeyboardAwareWrapper>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                onConfirm={() => {
                    hideAlert();
                    if (alertConfig.onConfirm) alertConfig.onConfirm();
                }}
                onClose={() => {
                    hideAlert();
                    if (alertConfig.onCloseCallback) alertConfig.onCloseCallback();
                }}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3e2723' },
    content: { padding: 20, paddingBottom: 40 },

    // Reference Product
    refProductCard: {
        flexDirection: 'row',
        backgroundColor: '#f8f5f2',
        borderRadius: 12,
        padding: 12,
        marginBottom: 25,
        borderWidth: 1,
        borderColor: '#e8e0d8',
    },
    refProductImage: {
        width: 70,
        height: 70,
        borderRadius: 10,
        backgroundColor: '#eee',
    },
    refProductInfo: {
        flex: 1,
        marginLeft: 12,
        justifyContent: 'center',
    },
    refLabel: { fontSize: 10, color: '#999', textTransform: 'uppercase', marginBottom: 2 },
    refProductTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
    refShop: { fontSize: 12, color: '#8D6E63', marginTop: 2 },

    // Sections
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#3e2723',
        marginBottom: 4,
        marginTop: 10,
    },
    hint: { fontSize: 12, color: '#999', marginBottom: 10 },

    textArea: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 12,
        padding: 14,
        fontSize: 14,
        minHeight: 120,
        backgroundColor: '#fafafa',
        color: '#333',
    },

    // Image Grid
    imageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 10,
    },
    imageWrapper: { position: 'relative' },
    uploadedImage: {
        width: 80,
        height: 80,
        borderRadius: 10,
        backgroundColor: '#eee',
    },
    removeImageBtn: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: '#fff',
        borderRadius: 11,
    },
    addImageBtn: {
        width: 80,
        height: 80,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#d4c4b0',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fdf8f4',
    },
    addImageText: { fontSize: 10, color: '#8D6E63', marginTop: 2 },

    // Budget
    budgetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 12,
        paddingHorizontal: 14,
        backgroundColor: '#fafafa',
        marginBottom: 30,
    },
    pesoSign: { fontSize: 18, color: '#8D6E63', fontWeight: '700', marginRight: 5 },
    budgetInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#333' },

    // Submit
    submitBtn: {
        backgroundColor: '#8D6E63',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 14,
    },
    submitBtnDisabled: { backgroundColor: '#ccc' },
    submitBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        marginLeft: 8,
    },
    serviceRow: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    serviceOption: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 20,
        padding: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        backgroundColor: '#fafafa',
    },
    selectedService: {
        borderColor: '#8D6E63',
        backgroundColor: '#efebe9',
    },
    serviceText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#555',
    },
    selectedServiceText: {
        color: '#8D6E63',
        fontWeight: 'bold',
    },
    // Fragility / Complexity Chips
    fragChip: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        backgroundColor: '#fafafa',
        alignItems: 'center',
        marginRight: 8,
        marginBottom: 8,
        minWidth: 64,
    },
    fragChipActive: {
        backgroundColor: '#8D6E63',
        borderColor: '#8D6E63',
    },
    fragChipText: { fontSize: 12, color: '#555', fontWeight: '600' },
    fragChipTextActive: { color: '#fff' },
    // Delivery Fee Estimate Card
    feeEstimateCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f5f2',
        borderRadius: 12,
        padding: 14,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#e8e0d8',
    },
    feeEstimateLabel: { fontSize: 12, color: '#8D6E63', fontWeight: '700', marginBottom: 2 },
    feeEstimateValue: { fontSize: 18, color: '#3e2723', fontWeight: 'bold' },
    feeEstimateMuted: { fontSize: 13, color: '#aaa', fontStyle: 'italic' },
    feeEstimateNote:  { fontSize: 10, color: '#bbb', marginTop: 4 },
});

export default RequestCustomizationScreen;
