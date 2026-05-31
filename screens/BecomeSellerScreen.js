import React, { useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Image,
    ActivityIndicator,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { shopAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const benefits = [
    { icon: 'storefront-outline', title: 'Your Own Shop', desc: 'Set up your storefront and showcase your products.' },
    { icon: 'cash-outline', title: 'Earn More', desc: 'Reach thousands of customers and grow your revenue.' },
    { icon: 'shield-checkmark-outline', title: 'Seller Protection', desc: 'We protect your transactions and payments.' },
    { icon: 'analytics-outline', title: 'Dashboard & Analytics', desc: 'Track sales, orders, and customer insights.' },
];

const BecomeSellerScreen = ({ navigation }) => {
    const { user, updateUser, logout } = useAuth();
    const { theme } = useTheme();
    const [fullName, setFullName] = useState(user?.full_name || '');
    const [email] = useState(user?.email || '');
    const [shopName, setShopName] = useState('');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState(user?.phone || '');
    const [address, setAddress] = useState(user?.address || '');
    const [idType, setIdType] = useState(null);
    const [idImage, setIdImage] = useState(null);       // { uri, name, type }
    const [permitImage, setPermitImage] = useState(null);
    const [tin, setTin] = useState('');
    const [agreed, setAgreed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [existingShop, setExistingShop] = useState(null);

    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null
    });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    };

    const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const idTypes = ["National ID", "Driver's License", "Passport", "PhilSys ID", "SSS ID", "Postal ID"];

    React.useEffect(() => {
        const checkShopStatus = async () => {
            if (!user?.id) return;
            try {
                const res = await shopAPI.getShopByOwner(user.id);
                if (res.success && res.data) {
                    const shop = res.data;
                    setExistingShop(shop);
                    if (shop.status === 'rejected') {
                        setShopName(shop.shop_name || '');
                        setDescription(shop.description || '');
                        setAddress(shop.address || '');
                        setTin(shop.tin_number || '');
                        setPhone(shop.phone || user.phone || '');
                        setAgreed(false); // Make them agree again
                    }
                }
            } catch (e) {
                // 'Shop not found' is expected when the user hasn't applied yet — not a real error
                if (!e.message?.toLowerCase().includes('not found')) {
                    console.error('Failed to check shop status:', e);
                }
            } finally {
                setCheckingStatus(false);
            }
        };
        checkShopStatus();
    }, [user?.id]);

    /* ── Image Picker ── */
    const pickImage = async (setter) => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            showAlert('Permission Needed', 'Please allow access to your photo library to upload images.', 'warning');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            const asset = result.assets[0];
            const filename = asset.uri.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const mimeType = match ? `image/${match[1]}` : 'image/jpeg';
            setter({ uri: asset.uri, name: filename, type: mimeType });
        }
    };

    /* ── Submit ── */
    const handleSubmit = async () => {
        if (!shopName.trim() || !address.trim()) {
            showAlert('Missing Info', 'Please fill in Shop Name and Address.', 'warning');
            return;
        }
        if (!agreed) {
            showAlert('Terms Required', 'Please agree to the Terms & Conditions.', 'warning');
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('user_id', String(user.id));
            formData.append('shop_name', shopName.trim());
            formData.append('description', description.trim());
            formData.append('address', address.trim());
            formData.append('tin_number', tin.trim());
            formData.append('full_name', fullName.trim());
            formData.append('phone', phone.trim());

            if (idImage) {
                formData.append('id_image', {
                    uri: idImage.uri,
                    name: idImage.name,
                    type: idImage.type,
                });
            }
            if (permitImage) {
                formData.append('permit_image', {
                    uri: permitImage.uri,
                    name: permitImage.name,
                    type: permitImage.type,
                });
            }

            const response = await shopAPI.createShop(formData);

            if (!response.success) {
                showAlert('Error', response.message || 'Failed to create shop', 'error');
                return;
            }

            showAlert(
                'Application Submitted! 📋',
                'Your seller application has been submitted and is now under review by our admin team. You will receive a notification once it has been approved.',
                'success',
                false,
                async () => {
                    navigation.goBack();
                }
            );
        } catch (error) {
            showAlert('Error', error.message || 'Failed to create shop', 'error');
        } finally {
            setLoading(false);
        }
    };

    /* ── Upload Box ── */
    const UploadBox = ({ label, image, onPick, fieldName }) => (
        <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>{label}</Text>
            <TouchableOpacity
                style={[styles.uploadBox, { borderColor: theme.border, backgroundColor: theme.inputBg }, image && [styles.uploadBoxDone, { backgroundColor: theme.accentBg, borderColor: theme.accent }]]}
                onPress={() => pickImage(onPick)}
                activeOpacity={0.7}
            >
                {image ? (
                    <>
                        <Image source={{ uri: image.uri }} style={styles.uploadThumb} />
                        <Text style={[styles.uploadText, { color: '#4CAF50', fontWeight: '600' }]}>
                            ✓ Image selected — tap to change
                        </Text>
                    </>
                ) : (
                    <>
                        <Ionicons name="cloud-upload-outline" size={32} color={theme.accent} />
                        <Text style={[styles.uploadText, { color: theme.textSecondary }]}>Tap to upload photo</Text>
                    </>
                )}
            </TouchableOpacity>
        </View>
    );

    if (checkingStatus) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={theme.accent} />
            </SafeAreaView>
        );
    }

    // If shop exists and is NOT rejected, block them from applying again
    if (existingShop && existingShop.status !== 'rejected') {
        const isPending = existingShop.status === 'pending';
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>Shop Status</Text>
                    <View style={{ width: 24 }} />
                </View>
                <View style={[styles.statusContainer, { padding: 40, alignItems: 'center', flex: 1, justifyContent: 'center' }]}>
                    <Ionicons name={isPending ? "time" : "checkmark-circle"} size={80} color={isPending ? "#FF9800" : "#4CAF50"} style={{ marginBottom: 20 }} />
                    <Text style={[styles.statusTitle, { color: theme.text, fontSize: 24, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }]}>
                        {isPending ? 'Application Pending' : 'Shop Approved'}
                    </Text>
                    <Text style={[styles.statusDesc, { color: theme.textSecondary, textAlign: 'center', fontSize: 16, lineHeight: 24 }]}>
                        {isPending
                            ? 'Your application is currently being reviewed by our admin team. Please wait for an update.'
                            : 'Your shop has been approved! You can now access your seller dashboard.'}
                    </Text>
                    <TouchableOpacity
                        style={[styles.submitButton, { backgroundColor: theme.accent, shadowColor: theme.accent, marginTop: 40, width: '100%' }]}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.submitText}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Become a Seller</Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAwareWrapper>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {existingShop?.status === 'rejected' && (
                    <View style={styles.rejectionBanner}>
                        <Ionicons name="alert-circle" size={24} color="#fff" style={{ marginRight: 12 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.rejectionTitle}>Application Rejected</Text>
                            <Text style={styles.rejectionReason}>Reason: {existingShop.rejection_reason || 'Please review your details and submit again.'}</Text>
                            <Text style={[styles.rejectionReason, { marginTop: 6, fontStyle: 'italic' }]}>
                                ⚠️ Please re-upload your ID documents before resubmitting.
                            </Text>
                        </View>
                    </View>
                )}
                {/* Hero */}
                <View style={styles.heroSection}>
                    <View style={[styles.heroIconCircle, { backgroundColor: theme.accent, shadowColor: theme.accent }]}>
                        <Ionicons name="storefront" size={40} color="#fff" />
                    </View>
                    <Text style={[styles.heroTitle, { color: theme.text }]}>Start Selling on JM Glass</Text>
                    <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
                        Join our community of sellers and reach more customers for your glass & furniture products.
                    </Text>
                </View>

                {/* Benefits */}
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Why Sell With Us?</Text>
                <View style={styles.benefitsGrid}>
                    {benefits.map((b, i) => (
                        <View key={i} style={[styles.benefitCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
                            <View style={[styles.benefitIconCircle, { backgroundColor: theme.inputBg }]}>
                                <Ionicons name={b.icon} size={22} color={theme.accent} />
                            </View>
                            <Text style={[styles.benefitTitle, { color: theme.text }]}>{b.title}</Text>
                            <Text style={[styles.benefitDesc, { color: theme.textSecondary }]}>{b.desc}</Text>
                        </View>
                    ))}
                </View>

                {/* Registration Form */}
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Seller Registration</Text>
                <View style={styles.formContainer}>
                    {/* Personal Info */}
                    <Text style={[styles.formSectionTitle, { color: theme.accent }]}>Personal Information</Text>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Full Name *</Text>
                        <TextInput
                            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                            placeholderTextColor={theme.textMuted}
                            placeholder="Juan Dela Cruz"
                            value={fullName}
                            onChangeText={setFullName}
                        />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Email Address</Text>
                        <TextInput
                            style={[styles.input, styles.inputDisabled, { color: theme.textMuted, borderColor: theme.border, backgroundColor: theme.background }]}
                            value={email}
                            editable={false}
                        />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Phone Number *</Text>
                        <TextInput
                            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                            placeholderTextColor={theme.textMuted}
                            placeholder="e.g. 09123456789"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                        />
                    </View>

                    {/* Business Info */}
                    <Text style={[styles.formSectionTitle, { marginTop: 10, color: theme.accent }]}>Business Information</Text>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Shop Name *</Text>
                        <TextInput
                            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                            placeholderTextColor={theme.textMuted}
                            placeholder="e.g. JM Glass Works"
                            value={shopName}
                            onChangeText={setShopName}
                        />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Shop Description</Text>
                        <TextInput
                            style={[styles.input, { height: 60, textAlignVertical: 'top', color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                            placeholderTextColor={theme.textMuted}
                            placeholder="Briefly describe your shop..."
                            value={description}
                            onChangeText={setDescription}
                            multiline
                        />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Business Address *</Text>
                        <TextInput
                            style={[styles.input, { height: 80, textAlignVertical: 'top', color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                            placeholderTextColor={theme.textMuted}
                            placeholder="Full address"
                            value={address}
                            onChangeText={setAddress}
                            multiline
                        />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>TIN (Tax Identification Number)</Text>
                        <TextInput
                            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                            placeholderTextColor={theme.textMuted}
                            placeholder="e.g. 123-456-789-000"
                            value={tin}
                            onChangeText={setTin}
                            keyboardType="numeric"
                        />
                    </View>

                    {/* ID Verification */}
                    <Text style={[styles.formSectionTitle, { marginTop: 10, color: theme.accent }]}>Identity Verification</Text>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Government ID Type</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.idTypeScroll}>
                            {idTypes.map((type, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[styles.idTypeChip, { backgroundColor: theme.inputBg, borderColor: theme.border }, idType === type && [styles.idTypeChipActive, { backgroundColor: theme.accent, borderColor: theme.accent }]]}
                                    onPress={() => setIdType(type)}
                                >
                                    <Text style={[styles.idTypeText, { color: theme.textSecondary }, idType === type && [styles.idTypeTextActive, { color: '#fff' }]]}>{type}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    <UploadBox
                        label="Upload Government ID *"
                        image={idImage}
                        onPick={setIdImage}
                        fieldName="id_image"
                    />

                    <UploadBox
                        label="Business Permit (Optional)"
                        image={permitImage}
                        onPick={setPermitImage}
                        fieldName="permit_image"
                    />

                    {/* Terms */}
                    <TouchableOpacity style={styles.termsRow} onPress={() => setAgreed(!agreed)}>
                        <Ionicons
                            name={agreed ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={agreed ? theme.accent : theme.textSecondary}
                        />
                        <Text style={[styles.termsText, { color: theme.textSecondary }]}>
                            I agree to the <Text style={[styles.termsLink, { color: theme.accent }]}>Seller Terms & Conditions</Text>
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Submit */}
                <TouchableOpacity style={[styles.submitButton, { backgroundColor: theme.accent, shadowColor: theme.accent }, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading}>
                    <Text style={styles.submitText}>{loading ? 'Creating Shop...' : 'Submit Application'}</Text>
                    {!loading && <Ionicons name="arrow-forward" size={20} color="#fff" />}
                </TouchableOpacity>

                <View style={{ height: 40 }} />
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
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    backButton: { padding: 4 },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    scrollContent: {
        padding: 20,
    },

    /* Hero */
    rejectionBanner: {
        backgroundColor: '#e53935',
        flexDirection: 'row',
        padding: 16,
        borderRadius: 12,
        marginBottom: 20,
        alignItems: 'center',
    },
    rejectionTitle: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 4,
    },
    rejectionReason: {
        color: '#fff',
        fontSize: 13,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 30,
    },
    heroIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    heroTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    heroSubtitle: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 20,
    },

    /* Benefits */
    sectionLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 15,
    },
    benefitsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    benefitCard: {
        width: '48%',
        borderRadius: 12,
        padding: 15,
        marginBottom: 12,
    },
    benefitIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    benefitTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
    },
    benefitDesc: {
        fontSize: 12,
        lineHeight: 16,
    },

    /* Form */
    formContainer: {
        marginBottom: 20,
    },
    inputGroup: {
        marginBottom: 15,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
    },
    inputDisabled: {
    },
    termsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
    },
    termsText: {
        fontSize: 13,
        marginLeft: 8,
        flex: 1,
    },
    termsLink: {
        fontWeight: '600',
    },

    /* Submit */
    submitButton: {
        paddingVertical: 16,
        borderRadius: 30,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    submitText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginRight: 8,
    },
    formSectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 12,
        marginTop: 5,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    idTypeScroll: {
        marginBottom: 5,
    },
    idTypeChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        borderWidth: 1,
    },
    idTypeChipActive: {
    },
    idTypeText: {
        fontSize: 13,
    },
    idTypeTextActive: {
        fontWeight: 'bold',
    },
    uploadBox: {
        borderWidth: 2,
        borderStyle: 'dashed',
        borderRadius: 12,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    uploadBoxDone: {
        borderStyle: 'solid',
    },
    uploadThumb: {
        width: 80,
        height: 80,
        borderRadius: 8,
        marginBottom: 4,
    },
    uploadText: {
        fontSize: 13,
    },
});

export default BecomeSellerScreen;
