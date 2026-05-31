import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { shopAPI, BASE_URL } from '../services/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../components/CustomAlert';
import { useTheme } from '../context/ThemeContext';
import AddressAutocompleteInput from '../components/AddressAutocompleteInput';

const ShopSettingsScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const [shopName, setShopName] = useState('');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [addressLat, setAddressLat] = useState(null);
    const [addressLng, setAddressLng] = useState(null);
    const [addressDetails, setAddressDetails] = useState('');
    const [logo, setLogo] = useState(null);
    const [logoUrl, setLogoUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info',
        showCancel: false,
        onConfirm: null,
        confirmText: 'OK',
        cancelText: 'Cancel'
    });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null, confirmText = 'OK', cancelText = 'Cancel') => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm, confirmText, cancelText });
    };

    const hideAlert = () => {
        setAlertConfig({ ...alertConfig, visible: false });
    };

    useEffect(() => {
        fetchShop();
    }, []);

    const fetchShop = async () => {
        try {
            const response = await shopAPI.getMyShop(user.id);
            if (response.success) {
                setShopName(response.shop.shop_name);
                setDescription(response.shop.description);
                setAddress(response.shop.address);
                setAddressDetails(response.shop.address_details || '');
                setLogoUrl(response.shop.logo_url);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            setLogo(result.assets[0].uri);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('user_id', user.id);
            formData.append('shop_name', shopName);
            formData.append('description', description);
            formData.append('address', address);
            formData.append('address_details', addressDetails);
            if (addressLat && addressLng) {
                formData.append('latitude', addressLat.toString());
                formData.append('longitude', addressLng.toString());
            }

            if (logo) {
                formData.append('logo', {
                    uri: logo,
                    name: 'shop_logo.jpg',
                    type: 'image/jpeg',
                });
            }

            const response = await shopAPI.updateShopSettings(formData);
            if (response.success) {
                if (response.logo_url) setLogoUrl(response.logo_url);
                showAlert('Success', 'Shop settings updated!', 'success', false, () => navigation.goBack());
            } else {
                showAlert('Error', response.message, 'error');
            }
        } catch (error) {
            console.error(error);
            showAlert('Error', 'Failed to update settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDeletePress = () => {
        showAlert(
            'Delete Shop',
            'Are you sure you want to delete your shop? This action cannot be undone. Your products will be deactivated.',
            'error',
            true,
            confirmDelete,
            'Delete',
            'Cancel'
        );
    };

    const confirmDelete = async () => {
        setLoading(true);
        try {
            const response = await shopAPI.deleteShop(user.id);
            if (response.success) {
                showAlert('Shop Deleted', 'Your shop has been deleted.', 'success', false, () => navigation.popToTop());
            } else {
                showAlert('Error', response.message, 'error');
                setLoading(false);
            }
        } catch (error) {
            showAlert('Error', 'Failed to delete shop', 'error');
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Shop Settings</Text>
                <TouchableOpacity onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={[styles.saveText, { color: theme.accent }]}>Save</Text>}
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : (
                <KeyboardAwareWrapper>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    {/* Logo Picker */}
                    <View style={styles.logoContainer}>
                        <TouchableOpacity onPress={pickImage}>
                            <Image
                                source={{ uri: logo || (logoUrl ? (logoUrl.startsWith('http') ? logoUrl : `${BASE_URL}/${logoUrl}`) : null) || `https://ui-avatars.com/api/?name=${encodeURIComponent(shopName || 'Shop')}&background=random` }}
                                style={styles.logo}
                            />
                            <View style={[styles.editIcon, { backgroundColor: theme.accent }]}>
                                <Ionicons name="camera" size={16} color="white" />
                            </View>
                        </TouchableOpacity>
                        <Text style={[styles.logoLabel, { color: theme.textMuted }]}>Tap to change logo</Text>
                    </View>

                    <Text style={[styles.label, { color: theme.textSecondary }]}>Shop Name</Text>
                    <TextInput style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]} value={shopName} onChangeText={setShopName} />

                    <Text style={[styles.label, { color: theme.textSecondary }]}>Description</Text>
                    <TextInput
                        style={[styles.input, styles.textArea, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        numberOfLines={4}
                    />

                    <Text style={[styles.label, { color: theme.textSecondary }]}>Address</Text>
                    <AddressAutocompleteInput
                        value={address}
                        onChangeText={(t) => {
                            setAddress(t);
                            setAddressLat(null);
                            setAddressLng(null);
                        }}
                        onAddressSelect={(label, lat, lng) => {
                            setAddress(label);
                            setAddressLat(lat);
                            setAddressLng(lng);
                        }}
                        additionalDetails={addressDetails}
                        onAdditionalDetailsChange={setAddressDetails}
                        placeholder="Search shop address..."
                        theme={theme}
                    />

                    <TouchableOpacity style={styles.deleteButton} onPress={handleDeletePress} disabled={saving}>
                        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.deleteText}>Delete Shop</Text>}
                    </TouchableOpacity>
                </ScrollView>
                </KeyboardAwareWrapper>
            )}

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
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', borderBottomWidth: 1 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    saveText: { fontSize: 16, fontWeight: 'bold' },
    backButton: { padding: 5 },
    content: { padding: 20 },
    logoContainer: { alignItems: 'center', marginBottom: 20 },
    logo: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#eee' },
    editIcon: { position: 'absolute', bottom: 0, right: 0, padding: 6, borderRadius: 15 },
    logoLabel: { marginTop: 8, fontSize: 12 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 15 },
    input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
    textArea: { height: 100, textAlignVertical: 'top' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    deleteButton: { marginTop: 30, backgroundColor: '#ffebee', padding: 15, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ffcdd2' },
    deleteText: { color: '#d32f2f', fontWeight: 'bold' },
});

export default ShopSettingsScreen;
