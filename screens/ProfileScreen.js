import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Image,
    Modal,
    Platform,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../components/CustomAlert';

import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { addressesAPI, ordersAPI, vouchersAPI, pointsAPI, BASE_URL } from '../services/api';
import AddressAutocompleteInput from '../components/AddressAutocompleteInput';

const ProfileScreen = ({ navigation }) => {
    const { user, updateUser } = useAuth();
    const { theme, darkMode } = useTheme();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [profileImage, setProfileImage] = useState(null); // Local uri for picking

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info',
        showCancel: false,
        onConfirm: null
    });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    };

    const hideAlert = () => {
        setAlertConfig({ ...alertConfig, visible: false });
    };

    // Address Modal State
    const [addressModalVisible, setAddressModalVisible] = useState(false);
    const [addresses, setAddresses] = useState([]);
    const [loadingAddresses, setLoadingAddresses] = useState(false);
    const [showAddressForm, setShowAddressForm] = useState(false);
    const [editingAddressId, setEditingAddressId] = useState(null);

    // New/Edit Address Form State
    const [addressForm, setAddressForm] = useState({
        full_name: '',
        phone: '',
        address: '',
        additional_details: '',
        label: 'Home',
        is_default: false,
    });

    // Payment Modal State
    const [paymentModalVisible, setPaymentModalVisible] = useState(false);

    // Order Stats
    const [orderStats, setOrderStats] = useState({
        pending: 0,
        processing: 0,
        shipped: 0,
        delivered: 0,
    });

    // Wallet State
    const [myVouchers, setMyVouchers] = useState([]);
    const [claimCode, setClaimCode] = useState('');
    const [claimingVoucher, setClaimingVoucher] = useState(false);
    const [vouchersModalVisible, setVouchersModalVisible] = useState(false);
    const [pointsBalance, setPointsBalance] = useState(0);

    useFocusEffect(
        React.useCallback(() => {
            fetchOrderStats();
            fetchMyVouchers();
            if (user) {
                pointsAPI.getBalance(user.id)
                    .then(res => { if (res.success) setPointsBalance(res.balance || 0); })
                    .catch(() => { });
            }
        }, [user])
    );

    const fetchOrderStats = async () => {
        if (!user) return;
        try {
            const response = await ordersAPI.getUserOrders(user.id);
            if (response.success) {
                const stats = {
                    pending: 0,
                    processing: 0,
                    shipped: 0,
                    delivered: 0,
                };
                response.data.forEach(order => {
                    if (stats.hasOwnProperty(order.status)) {
                        stats[order.status]++;
                    }
                });
                setOrderStats(stats);
            }
        } catch (error) {
            console.error('Fetch stats error:', error);
        }
    };

    const fetchMyVouchers = async () => {
        if (!user) return;
        try {
            const res = await vouchersAPI.getMyVouchers(user.id);
            if (res.success) {
                setMyVouchers(res.data);
            }
        } catch (err) {
            console.error('Fetch my vouchers error:', err);
        }
    };

    const handleClaimVoucher = async () => {
        if (!claimCode.trim() || !user) return;
        setClaimingVoucher(true);
        try {
            const res = await vouchersAPI.claimVoucher(user.id, claimCode.trim());
            if (res.success) {
                showAlert('Success', res.message || 'Voucher claimed!', 'success');
                setClaimCode('');
                fetchMyVouchers(); // Refresh list to update count
            } else {
                showAlert('Error', res.message || 'Failed to claim voucher.', 'error');
            }
        } catch (err) {
            showAlert('Error', 'An error occurred while claiming.', 'error');
        } finally {
            setClaimingVoucher(false);
        }
    };

    // Initial State derived from Context
    const [userData, setUserData] = useState({
        name: user?.full_name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        address: user?.address || '',
    });

    const [tempData, setTempData] = useState({ ...userData });

    useEffect(() => {
        if (user) {
            setUserData({
                name: user.full_name || '',
                email: user.email || '',
                phone: user.phone || '',
                address: user.address || '',
            });
            setTempData({
                name: user.full_name || '',
                email: user.email || '',
                phone: user.phone || '',
                address: user.address || '',
            });
            setProfileImage(null); // Reset local selection when user changes
        }
    }, [user]);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            setProfileImage(result.assets[0].uri);
        }
    };

    const handleSaveProfile = async () => {
        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('full_name', tempData.name);
            formData.append('phone', tempData.phone);
            formData.append('address', tempData.address);

            if (profileImage) {
                formData.append('profile_image', {
                    uri: profileImage,
                    name: 'profile_pic.jpg',
                    type: 'image/jpeg',
                });
            }

            await updateUser(formData, true); // We'll need to update AuthContext to handle FormData
            setIsEditing(false);
            setProfileImage(null);
            showAlert("Success", "Profile updated successfully!", "success");
        } catch (error) {
            showAlert("Error", "Failed to update profile: " + error.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (field, value) => {
        setTempData(prev => ({ ...prev, [field]: value }));
    };

    // ── Address API Handlers ──
    const fetchAddresses = async () => {
        if (!user) return;
        setLoadingAddresses(true);
        try {
            const response = await addressesAPI.getAddresses(user.id);
            if (response.success) {
                setAddresses(response.data);
            }
        } catch (error) {
            console.error('Fetch addresses error:', error);
        } finally {
            setLoadingAddresses(false);
        }
    };

    const handleOpenAddressModal = () => {
        setAddressModalVisible(true);
        setShowAddressForm(false);
        fetchAddresses();
    };

    const startAddAddress = () => {
        setAddressForm({
            full_name: user?.full_name || '',
            phone: user?.phone || '',
            address: '',
            additional_details: '',
            label: 'Home',
            is_default: addresses.length === 0,
        });
        setEditingAddressId(null);
        setShowAddressForm(true);
    };

    const startEditAddress = (addr) => {
        setAddressForm({
            full_name: addr.full_name,
            phone: addr.phone,
            address: addr.address,
            additional_details: addr.additional_details || '',
            label: addr.label,
            is_default: !!addr.is_default,
        });
        setEditingAddressId(addr.address_id);
        setShowAddressForm(true);
    };

    const handleSaveAddress = async () => {
        if (!addressForm.full_name || !addressForm.phone || !addressForm.address) {
            showAlert('Missing Info', 'Please fill in all fields.', 'warning');
            return;
        }

        try {
            const payload = { ...addressForm, user_id: user.id };

            if (editingAddressId) {
                await addressesAPI.updateAddress(editingAddressId, payload);
                showAlert("Success", "Address updated!", "success");
            } else {
                await addressesAPI.addAddress(payload);
                showAlert("Success", "Address added!", "success");
            }

            setShowAddressForm(false);
            fetchAddresses(); // Refresh list
        } catch (error) {
            showAlert("Error", "Failed to save address: " + error.message, "error");
        }
    };

    const handleDeleteAddress = async (id) => {
        showAlert(
            "Delete Address",
            "Are you sure you want to delete this address?",
            "error",
            true,
            async () => {
                try {
                    await addressesAPI.deleteAddress(id);
                    fetchAddresses();
                } catch (error) {
                    showAlert("Error", "Failed to delete address", "error");
                }
            }
        );
    };

    const handleSetDefault = async (id) => {
        try {
            await addressesAPI.setAsDefault(id, user.id);
            fetchAddresses();
        } catch (error) {
            showAlert("Error", "Failed to set default address", "error");
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>My Profile</Text>
                <TouchableOpacity
                    onPress={isEditing ? handleSaveProfile : (() => {
                        setIsEditing(true);
                        setProfileImage(null);
                    })}
                    disabled={isSaving}
                    style={[
                        styles.headerActionBtn,
                        isEditing
                            ? { backgroundColor: theme.accent }
                            : { backgroundColor: theme.accent + '18', borderColor: theme.accent + '44', borderWidth: 1 }
                    ]}
                >
                    {isSaving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <>
                            <Ionicons
                                name={isEditing ? 'checkmark' : 'pencil-outline'}
                                size={14}
                                color={isEditing ? '#fff' : theme.accent}
                            />
                            <Text style={[styles.editButtonText, { color: isEditing ? '#fff' : theme.accent }]}>
                                {isEditing ? 'Save' : 'Edit'}
                            </Text>
                        </>
                    }
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Avatar Section */}
                <View style={[styles.avatarContainer, { backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <View style={[styles.avatarCircle, { backgroundColor: theme.border }]}>
                        {profileImage ? (
                            <Image source={{ uri: profileImage }} style={styles.avatarImageReal} />
                        ) : user?.profile_image ? (
                            <Image
                                source={{ uri: user.profile_image.startsWith('http') ? user.profile_image : `${BASE_URL}/${user.profile_image}` }}
                                style={styles.avatarImageReal}
                            />
                        ) : (
                            <Ionicons name="person" size={50} color={theme.textMuted} />
                        )}

                        {isEditing && (
                            <TouchableOpacity style={[styles.cameraButton, { backgroundColor: theme.accent, borderColor: theme.background }]} onPress={pickImage}>
                                <Ionicons name="camera" size={20} color="#fff" />
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={[styles.nameDisplay, { color: theme.text }]}>{userData.name}</Text>
                    <Text style={[styles.emailDisplay, { color: theme.textSecondary }]}>{userData.email}</Text>
                </View>



                {/* My Orders */}
                <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
                    <View style={[styles.sectionHeader, { borderBottomColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>My Orders</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('MyOrders')} style={styles.seeAllBtn}>
                            <Text style={[styles.seeAllText, { color: theme.accent }]}>View All</Text>
                            <Ionicons name="chevron-forward" size={12} color={theme.accent} style={{ marginTop: 1 }} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.iconRow}>
                        <TouchableOpacity style={styles.iconItem} onPress={() => navigation.navigate('MyOrders', { initialTab: 'pending' })}>
                            <View style={[styles.iconCircle, { backgroundColor: theme.accent + '15' }]}>
                                <Ionicons name="card-outline" size={24} color={theme.accent} />
                                {orderStats.pending > 0 && (
                                    <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
                                        <Text style={styles.badgeText}>{orderStats.pending}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={[styles.iconLabel, { color: theme.textSecondary }]}>Pending</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconItem} onPress={() => navigation.navigate('MyOrders', { initialTab: 'processing' })}>
                            <View style={[styles.iconCircle, { backgroundColor: theme.accent + '15' }]}>
                                <Ionicons name="cube-outline" size={24} color={theme.accent} />
                                {orderStats.processing > 0 && (
                                    <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
                                        <Text style={styles.badgeText}>{orderStats.processing}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={[styles.iconLabel, { color: theme.textSecondary }]}>Processing</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconItem} onPress={() => navigation.navigate('MyOrders', { initialTab: 'shipped' })}>
                            <View style={[styles.iconCircle, { backgroundColor: theme.accent + '15' }]}>
                                <Ionicons name="car-outline" size={24} color={theme.accent} />
                                {orderStats.shipped > 0 && (
                                    <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
                                        <Text style={styles.badgeText}>{orderStats.shipped}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={[styles.iconLabel, { color: theme.textSecondary }]}>Shipped</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconItem} onPress={() => navigation.navigate('MyOrders', { initialTab: 'delivered' })}>
                            <View style={[styles.iconCircle, { backgroundColor: theme.accent + '15' }]}>
                                <Ionicons name="star-outline" size={24} color={theme.accent} />
                            </View>
                            <Text style={[styles.iconLabel, { color: theme.textSecondary }]}>Delivered</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* My Wallet */}
                <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
                    <Text style={[styles.sectionTitle, { marginBottom: 15, paddingHorizontal: 16, paddingTop: 16 }]}>My Wallet</Text>
                    <View style={[styles.walletRow, { borderColor: theme.border }]}>
                        <TouchableOpacity style={styles.walletItem} onPress={() => navigation.navigate('MyWallet')}>
                            <Ionicons name="wallet-outline" size={24} color={theme.accent} />
                            <Text style={[styles.walletValue, { color: theme.text }]}>Balance</Text>
                            <Text style={[styles.walletLabel, { color: theme.textSecondary }]}>View</Text>
                        </TouchableOpacity>
                        <View style={[styles.walletDivider, { backgroundColor: theme.border }]} />
                        <TouchableOpacity style={styles.walletItem} onPress={() => navigation.navigate('MyPoints')}>
                            <Ionicons name="trophy-outline" size={24} color="#FF9800" />
                            <Text style={[styles.walletValue, { color: theme.text }]}>{pointsBalance.toLocaleString()}</Text>
                            <Text style={[styles.walletLabel, { color: theme.textSecondary }]}>Points</Text>
                        </TouchableOpacity>
                        <View style={[styles.walletDivider, { backgroundColor: theme.border }]} />
                        <TouchableOpacity style={styles.walletItem} onPress={() => setVouchersModalVisible(true)}>
                            <Ionicons name="ticket-outline" size={24} color={theme.accent} />
                            <Text style={[styles.walletValue, { color: theme.text }]}>{myVouchers.length}</Text>
                            <Text style={[styles.walletLabel, { color: theme.textSecondary }]}>Vouchers</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.claimContainer, { paddingHorizontal: 16, paddingBottom: 16 }]}>
                        <TextInput
                            style={[styles.claimInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                            placeholder="Enter Code (e.g. WELCOME10)"
                            placeholderTextColor={theme.textMuted}
                            value={claimCode}
                            onChangeText={setClaimCode}
                            autoCapitalize="characters"
                        />
                        <TouchableOpacity
                            style={[styles.claimButton, { backgroundColor: claimCode.trim() ? theme.accent : theme.border }]}
                            onPress={handleClaimVoucher}
                            disabled={!claimCode.trim() || claimingVoucher}
                        >
                            {claimingVoucher ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.claimButtonText}>Save Voucher</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Services / Menu */}
                <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
                    <TouchableOpacity style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={handleOpenAddressModal}>
                        <View style={styles.menuItemLeft}>
                            <View style={[styles.menuIconBg, { backgroundColor: theme.accent + '15' }]}>
                                <Ionicons name="location-outline" size={20} color={theme.accent} />
                            </View>
                            <View style={{ marginLeft: 15, flex: 1 }}>
                                <Text style={[styles.menuText, { color: theme.text }]}>Shipping Addresses</Text>
                                <Text style={[styles.menuSubText, { color: theme.textSecondary }]}>Manage your delivery locations</Text>
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => setPaymentModalVisible(true)}>
                        <View style={styles.menuItemLeft}>
                            <View style={[styles.menuIconBg, { backgroundColor: theme.accent + '15' }]}>
                                <Ionicons name="card-outline" size={20} color={theme.accent} />
                            </View>
                            <View style={{ marginLeft: 15 }}>
                                <Text style={[styles.menuText, { color: theme.text }]}>Payment Methods</Text>
                                <Text style={[styles.menuSubText, { color: theme.textSecondary }]}>Cash on Delivery</Text>
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('HelpCenter')}>
                        <View style={styles.menuItemLeft}>
                            <View style={[styles.menuIconBg, { backgroundColor: theme.accent + '15' }]}>
                                <Ionicons name="help-circle-outline" size={20} color={theme.accent} />
                            </View>
                            <Text style={[styles.menuText, { marginLeft: 15, color: theme.text }]}>Help Center</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                </View>

                <View style={[styles.dividerLarge, { backgroundColor: theme.border }]} />

                {/* Personal Details */}
                <View style={[styles.personalSection, { backgroundColor: theme.card, marginHorizontal: 16, borderRadius: 16, marginBottom: 24 }]}>
                    <View style={[styles.personalSectionHeader, { borderBottomColor: theme.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="person-circle-outline" size={20} color={theme.accent} />
                            <Text style={[styles.personalTitle, { color: theme.text, marginLeft: 0, marginBottom: 0 }]}>Personal Details</Text>
                        </View>
                        {isEditing && (
                            <View style={[styles.editingBadge, { backgroundColor: theme.accent + '18', borderColor: theme.accent + '44' }]}>
                                <Ionicons name="pencil" size={11} color={theme.accent} />
                                <Text style={[styles.editingBadgeText, { color: theme.accent }]}>Editing</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.formContainer}>
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: theme.textSecondary }]}>Full Name</Text>
                            <View style={[
                                styles.inputWrap,
                                { borderColor: isEditing ? theme.accent : theme.border, backgroundColor: isEditing ? theme.inputBg : 'transparent' }
                            ]}>
                                <Ionicons name="person-outline" size={16} color={isEditing ? theme.accent : theme.textMuted} style={{ marginRight: 8 }} />
                                <TextInput
                                    style={[styles.input, { color: theme.text, flex: 1 }]}
                                    value={isEditing ? tempData.name : userData.name}
                                    onChangeText={(text) => handleChange('name', text)}
                                    editable={isEditing}
                                    placeholder={isEditing ? 'Enter full name' : ''}
                                    placeholderTextColor={theme.textMuted}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
                            <View style={[styles.inputWrap, { borderColor: theme.border, backgroundColor: 'transparent', opacity: 0.7 }]}>
                                <Ionicons name="mail-outline" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
                                <TextInput
                                    style={[styles.input, { color: theme.textSecondary, flex: 1 }]}
                                    value={userData.email}
                                    editable={false}
                                />
                                <Ionicons name="lock-closed-outline" size={13} color={theme.textMuted} />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: theme.textSecondary }]}>Phone Number</Text>
                            <View style={[
                                styles.inputWrap,
                                { borderColor: isEditing ? theme.accent : theme.border, backgroundColor: isEditing ? theme.inputBg : 'transparent' }
                            ]}>
                                <Ionicons name="call-outline" size={16} color={isEditing ? theme.accent : theme.textMuted} style={{ marginRight: 8 }} />
                                <TextInput
                                    style={[styles.input, { color: theme.text, flex: 1 }]}
                                    value={isEditing ? tempData.phone : userData.phone}
                                    onChangeText={(text) => handleChange('phone', text)}
                                    editable={isEditing}
                                    keyboardType="phone-pad"
                                    placeholder={isEditing ? 'Enter phone number' : ''}
                                    placeholderTextColor={theme.textMuted}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: theme.textSecondary }]}>Primary Address</Text>
                            <View style={[
                                styles.inputWrap,
                                { borderColor: isEditing ? theme.accent : theme.border, backgroundColor: isEditing ? theme.inputBg : 'transparent', minHeight: 60, alignItems: 'flex-start', paddingTop: 10 }
                            ]}>
                                <Ionicons name="home-outline" size={16} color={isEditing ? theme.accent : theme.textMuted} style={{ marginRight: 8, marginTop: 2 }} />
                                <TextInput
                                    style={[styles.input, { color: theme.text, flex: 1, textAlignVertical: 'top' }]}
                                    value={isEditing ? tempData.address : userData.address}
                                    onChangeText={(text) => handleChange('address', text)}
                                    editable={isEditing}
                                    multiline
                                    placeholder={isEditing ? 'Enter your primary address' : 'No address set'}
                                    placeholderTextColor={theme.textMuted}
                                />
                            </View>
                        </View>

                        {isEditing && (
                            <TouchableOpacity
                                style={[styles.cancelButton, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                                onPress={() => setIsEditing(false)}
                            >
                                <Ionicons name="close-outline" size={16} color={theme.textSecondary} />
                                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel Changes</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </ScrollView>

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
                            <Text style={[styles.modalTitle, { color: theme.headerText }]}>My Wallet Vouchers</Text>
                            <View style={{ width: 24 }} />
                        </View>
                        <FlatList
                            data={myVouchers}
                            keyExtractor={(item) => item.claim_id.toString()}
                            contentContainerStyle={{ padding: 20 }}
                            ListEmptyComponent={() => (
                                <View style={styles.emptyState}>
                                    <Ionicons name="ticket-outline" size={48} color={theme.textMuted} />
                                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Your wallet has no vouchers.</Text>
                                </View>
                            )}
                            renderItem={({ item }) => (
                                <View style={[styles.voucherCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
                                </View>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            {/* ── Address Modal ── */}
            <Modal
                visible={addressModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setAddressModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <KeyboardAwareWrapper
                        style={{ height: '90%', width: '100%', justifyContent: 'flex-end' }}
                    >
                        <View style={[styles.fullScreenModal, { backgroundColor: theme.background }]}>
                            <View style={[styles.modalHeader, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                                <TouchableOpacity onPress={() => {
                                    if (showAddressForm) setShowAddressForm(false);
                                    else setAddressModalVisible(false);
                                }}>
                                    <Ionicons name={showAddressForm ? "arrow-back" : "close"} size={24} color={theme.headerText} />
                                </TouchableOpacity>
                                <Text style={[styles.modalTitle, { color: theme.headerText }]}>
                                    {showAddressForm ? (editingAddressId ? 'Edit Address' : 'New Address') : 'My Addresses'}
                                </Text>
                                <View style={{ width: 24 }} />
                            </View>

                            {showAddressForm ? (
                                <ScrollView contentContainerStyle={{ padding: 20 }}>
                                    <Text style={[styles.formLabel, { color: theme.textSecondary }]}>Label (e.g. Home, Office)</Text>
                                    <TextInput
                                        style={[styles.modalInput, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                                        placeholderTextColor={theme.textMuted}
                                        value={addressForm.label}
                                        onChangeText={(t) => setAddressForm({ ...addressForm, label: t })}
                                        placeholder="Home"
                                    />

                                    <Text style={[styles.formLabel, { color: theme.textSecondary }]}>Full Name</Text>
                                    <TextInput
                                        style={[styles.modalInput, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                                        placeholderTextColor={theme.textMuted}
                                        value={addressForm.full_name}
                                        onChangeText={(t) => setAddressForm({ ...addressForm, full_name: t })}
                                        placeholder="Name"
                                    />

                                    <Text style={[styles.formLabel, { color: theme.textSecondary }]}>Phone Number</Text>
                                    <TextInput
                                        style={[styles.modalInput, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                                        placeholderTextColor={theme.textMuted}
                                        value={addressForm.phone}
                                        onChangeText={(t) => setAddressForm({ ...addressForm, phone: t })}
                                        placeholder="Phone"
                                        keyboardType="phone-pad"
                                    />

                                    <Text style={[styles.formLabel, { color: theme.textSecondary }]}>Address</Text>
                                    <AddressAutocompleteInput
                                        value={addressForm.address}
                                        onChangeText={(t) => setAddressForm({ ...addressForm, address: t, latitude: null, longitude: null })}
                                        onAddressSelect={(label, lat, lng) => setAddressForm({ ...addressForm, address: label, latitude: lat, longitude: lng })}
                                        additionalDetails={addressForm.additional_details}
                                        onAdditionalDetailsChange={(t) => setAddressForm({ ...addressForm, additional_details: t })}
                                        placeholder="Search delivery address..."
                                        theme={theme}
                                        style={{ marginBottom: 4 }}
                                    />

                                    <View style={styles.checkboxContainer}>
                                        <TouchableOpacity
                                            style={[styles.checkbox, { borderColor: theme.accent }, addressForm.is_default && [styles.checkboxActive, { backgroundColor: theme.accent }]]}
                                            onPress={() => setAddressForm({ ...addressForm, is_default: !addressForm.is_default })}
                                        >
                                            {addressForm.is_default && <Ionicons name="checkmark" size={16} color={theme.background} />}
                                        </TouchableOpacity>
                                        <Text style={[styles.checkboxLabel, { color: theme.text }]}>Set as default address</Text>
                                    </View>

                                    <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.accent }]} onPress={handleSaveAddress}>
                                        <Text style={styles.saveButtonText}>Save Address</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            ) : (
                                <View style={{ flex: 1 }}>
                                    {loadingAddresses ? (
                                        <ActivityIndicator style={{ marginTop: 20 }} color="#8D6E63" />
                                    ) : (
                                        <FlatList
                                            data={addresses}
                                            keyExtractor={(item) => item.address_id.toString()}
                                            contentContainerStyle={{ padding: 20 }}
                                            ListEmptyComponent={() => (
                                                <View style={styles.emptyState}>
                                                    <Ionicons name="map-outline" size={48} color={theme.textMuted} />
                                                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No addresses saved yet.</Text>
                                                </View>
                                            )}
                                            renderItem={({ item }) => (
                                                <View style={[styles.addressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                                    <View style={styles.addressCardHeader}>
                                                        <Text style={[styles.addressLabel, { color: theme.text }]}>{item.label}</Text>
                                                        {item.is_default === 1 && (
                                                            <View style={[styles.defaultBadge, { backgroundColor: theme.accent }]}>
                                                                <Text style={styles.defaultBadgeText}>Default</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={[styles.addressText, { color: theme.textSecondary }]}>{item.full_name} | {item.phone}</Text>
                                                    <Text style={[styles.addressText, { color: theme.textSecondary }]}>{item.address}</Text>

                                                    <View style={[styles.addressActions, { borderTopColor: theme.border }]}>
                                                        <TouchableOpacity onPress={() => startEditAddress(item)}>
                                                            <Text style={[styles.actionText, { color: theme.accent }]}>Edit</Text>
                                                        </TouchableOpacity>
                                                        <View style={[styles.actionDivider, { backgroundColor: theme.border }]} />
                                                        {!item.is_default && (
                                                            <>
                                                                <TouchableOpacity onPress={() => handleSetDefault(item.address_id)}>
                                                                    <Text style={[styles.actionText, { color: theme.accent }]}>Set Default</Text>
                                                                </TouchableOpacity>
                                                                <View style={[styles.actionDivider, { backgroundColor: theme.border }]} />
                                                            </>
                                                        )}
                                                        <TouchableOpacity onPress={() => handleDeleteAddress(item.address_id)}>
                                                            <Text style={[styles.actionText, { color: theme.danger }]}>Delete</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            )}
                                        />
                                    )}
                                    <TouchableOpacity style={[styles.fab, { backgroundColor: theme.accent }]} onPress={startAddAddress}>
                                        <Ionicons name="add" size={24} color="#fff" />
                                        <Text style={styles.fabText}>Add New Address</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </KeyboardAwareWrapper>
                </View>
            </Modal>

            {/* ── Payment Methods Modal ── */}
            <Modal
                visible={paymentModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setPaymentModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
                        <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.headerText }]}>Payment Methods</Text>
                            <TouchableOpacity onPress={() => setPaymentModalVisible(false)}>
                                <Ionicons name="close" size={24} color={theme.headerText} />
                            </TouchableOpacity>
                        </View>

                        {/* COD */}
                        <View style={[styles.pmItem, { backgroundColor: theme.card, borderColor: theme.accent }]}>
                            <View style={styles.pmItemLeft}>
                                <View style={[styles.pmIcon, { backgroundColor: theme.accent }]}>
                                    <Ionicons name="cash-outline" size={22} color="#fff" />
                                </View>
                                <View>
                                    <Text style={[styles.pmName, { color: theme.text }]}>Cash on Delivery</Text>
                                    <Text style={[styles.pmStatus, { color: theme.textSecondary }]}>Default</Text>
                                </View>
                            </View>
                            <View style={[styles.pmActiveBadge, { backgroundColor: theme.accentBg }]}>
                                <Text style={[styles.pmActiveBadgeText, { color: theme.accent }]}>Active</Text>
                            </View>
                        </View>

                        {/* GCash */}
                        <View style={[styles.pmItem, { backgroundColor: theme.card, borderColor: theme.border, opacity: 0.6 }]}>
                            <View style={styles.pmItemLeft}>
                                <View style={[styles.pmIcon, { backgroundColor: '#007aff' }]}>
                                    <Ionicons name="phone-portrait-outline" size={22} color="#fff" />
                                </View>
                                <View>
                                    <Text style={[styles.pmName, { color: theme.text }]}>GCash</Text>
                                    <Text style={[styles.pmStatus, { color: theme.textSecondary }]}>Coming Soon</Text>
                                </View>
                            </View>
                        </View>

                        {/* Bank */}
                        <View style={[styles.pmItem, { backgroundColor: theme.card, borderColor: theme.border, opacity: 0.6 }]}>
                            <View style={styles.pmItemLeft}>
                                <View style={[styles.pmIcon, { backgroundColor: '#34c759' }]}>
                                    <Ionicons name="card-outline" size={22} color="#fff" />
                                </View>
                                <View>
                                    <Text style={[styles.pmName, { color: theme.text }]}>Bank Transfer</Text>
                                    <Text style={[styles.pmStatus, { color: theme.textSecondary }]}>Coming Soon</Text>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.modalSaveButton, { backgroundColor: theme.accent }]}
                            onPress={() => setPaymentModalVisible(false)}
                        >
                            <Text style={styles.modalSaveText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

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
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#3e2723',
    },
    backButton: {
        padding: 5,
    },
    headerActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
    },
    editButtonText: {
        fontSize: 14,
        fontWeight: '700',
    },
    scrollContent: {
        paddingBottom: 40,
    },
    avatarContainer: {
        alignItems: 'center',
        paddingVertical: 30,
        marginBottom: 20,
    },
    avatarCircle: {
        width: 104,
        height: 104,
        borderRadius: 52,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
        position: 'relative',
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 4,
    },
    cameraButton: {
        position: 'absolute',
        bottom: 0,
        right: -4,
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
    },
    avatarImageReal: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    nameDisplay: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#3e2723',
        marginBottom: 5,
    },
    emailDisplay: {
        fontSize: 14,
        color: '#777',
    },
    formContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        color: '#8D6E63',
        marginBottom: 8,
        fontWeight: '500',
    },
    input: {
        fontSize: 16,
        color: '#333',
        paddingVertical: 8,
    },
    inputView: {
        backgroundColor: 'transparent',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingHorizontal: 0,
    },
    inputEditable: {
        backgroundColor: '#f9f9f9',
        borderRadius: 10,
        paddingHorizontal: 15,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#8D6E63',
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 11,
        marginTop: 4,
    },
    cancelButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 13,
        marginTop: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    cancelText: {
        fontSize: 14,
        fontWeight: '600',
    },
    personalSection: {
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
    },
    personalSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    editingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
    },
    editingBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },

    /* Dashboard Styles */
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    statItem: {
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    statLabel: {
        fontSize: 12,
    },
    statDivider: {
        width: 1,
        height: 24,
    },
    sectionCard: {
        marginHorizontal: 16,
        marginBottom: 20,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    seeAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    seeAllText: {
        fontSize: 13,
        fontWeight: '600',
    },
    iconRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 12,
    },
    iconItem: {
        alignItems: 'center',
        flex: 1,
    },
    iconCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    iconLabel: {
        fontSize: 12,
        fontWeight: '500',
    },
    badge: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#e53935',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 2,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    walletRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingBottom: 16,
    },
    walletItem: {
        alignItems: 'center',
    },
    walletValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#3e2723',
        marginTop: 4,
    },
    walletLabel: {
        fontSize: 12,
        color: '#777',
        marginTop: 2,
    },
    walletDivider: {
        width: 1,
        height: 30,
    },
    menuContainer: {
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    menuIconBg: {
        width: 38,
        height: 38,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuText: {
        fontSize: 15,
        fontWeight: '600',
    },
    menuSubText: {
        fontSize: 12,
        marginTop: 2,
    },
    menuSubTextEmpty: {
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 2,
    },
    dividerLarge: {
        height: 8,
        backgroundColor: '#f5f5f5',
        marginBottom: 20,
    },
    personalTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginLeft: 0,
        marginBottom: 0,
    },

    /* ── Modal Styles ── */
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0)', // Important: translucent handled by view
        justifyContent: 'flex-end',
    },
    modalContainer: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingTop: 12,
    },
    fullScreenModal: {
        flex: 1,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        marginTop: 50, // Top offset
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    modalHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#3e2723',
    },

    /* Payment Methods Items */
    pmItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    pmItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    pmIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    pmName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#333',
    },
    pmStatus: {
        fontSize: 12,
        color: '#888',
        marginTop: 1,
    },
    pmActiveBadge: {
        backgroundColor: '#e8f5e9',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    pmActiveBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4CAF50',
    },
    modalSaveButton: {
        backgroundColor: '#8D6E63',
        paddingVertical: 15,
        borderRadius: 30,
        alignItems: 'center',
        marginTop: 24,
    },
    modalSaveText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },

    /* Address List Items */
    addressCard: {
        borderRadius: 12,
        padding: 15,
        marginBottom: 15,
        borderWidth: 1,
    },
    addressCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    addressLabel: {
        fontSize: 14,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    defaultBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    defaultBadgeText: {
        fontSize: 10,
        color: '#fff',
        fontWeight: '700',
    },
    addressText: {
        fontSize: 14,
        marginBottom: 2,
    },
    addressActions: {
        flexDirection: 'row',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    actionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    actionDivider: {
        width: 1,
        marginHorizontal: 15,
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        alignSelf: 'center',
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
        paddingTop: 50,
    },
    emptyText: {
        marginTop: 10,
    },

    /* Address Form */
    formLabel: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 6,
        marginTop: 12,
    },
    modalInput: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        fontSize: 15,
    },
    saveButton: {
        paddingVertical: 15,
        borderRadius: 30,
        alignItems: 'center',
        marginTop: 30,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxActive: {
    },
    checkboxLabel: {
        fontSize: 14,
    },
    claimContainer: {
        flexDirection: 'row',
        marginTop: 15,
        alignItems: 'center',
    },
    claimInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 15,
        height: 48,
        marginRight: 10,
    },
    claimButton: {
        borderRadius: 8,
        paddingHorizontal: 15,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    claimButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
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

export default ProfileScreen;
