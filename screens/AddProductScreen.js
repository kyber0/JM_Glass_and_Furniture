import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { shopAPI, handymenAPI, catalogAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import { useTheme } from '../context/ThemeContext';


const AddProductScreen = ({ navigation, route }) => {
    const { productToEdit, isAdminCatalog } = route.params || {};
    const { user } = useAuth();
    const { theme: appTheme } = useTheme();
    const [title, setTitle] = useState(productToEdit ? productToEdit.title : '');
    const [price, setPrice] = useState(productToEdit ? (productToEdit.base_price || productToEdit.price || '').toString() : '');
    const [description, setDescription] = useState(productToEdit ? productToEdit.description : '');
    const [stock, setStock] = useState(productToEdit && !isAdminCatalog ? (productToEdit.stock_quantity || '').toString() : '');
    const [category, setCategory] = useState(productToEdit ? productToEdit.category_id : 1);
    const [theme, setTheme] = useState(productToEdit ? productToEdit.theme : 'Modern');
    const [serviceType, setServiceType] = useState(productToEdit ? (productToEdit.service_type || 'delivery') : 'delivery');
    const [installationComplexity, setInstallationComplexity] = useState(productToEdit ? (productToEdit.installation_complexity || 'standard') : 'standard');
    const [fragilityLevel, setFragilityLevel] = useState(productToEdit ? (productToEdit.fragility_level || 'none') : 'none');
    const [hasHandymen, setHasHandymen] = useState(null); // null=checking, true/false=result

    // Check if this shop has handymen (so owner can enable installation)
    // Skipped for admin catalog — admin has no shop, and service type is not set by admin.
    React.useEffect(() => {
        if (isAdminCatalog) { setHasHandymen(false); return; }
        const checkHandymen = async () => {
            if (!user) return;
            try {
                const shopRes = await shopAPI.getMyShop(user.id);
                if (shopRes.success && shopRes.shop?.shop_id) {
                    const hRes = await handymenAPI.getByShop(shopRes.shop.shop_id);
                    setHasHandymen(!!(hRes?.handymen?.length > 0));
                } else {
                    setHasHandymen(false);
                }
            } catch {
                setHasHandymen(false);
            }
        };
        checkHandymen();
    }, [user, isAdminCatalog]);
    // Build initial image list from existing product data:
    // productToEdit.images = array from product_images table (set by ProductDetailScreen)
    // productToEdit.image_url = main thumbnail fallback
    const buildInitialImages = () => {
        if (!productToEdit) return [];
        const extras = Array.isArray(productToEdit.images) ? productToEdit.images : [];
        const main = productToEdit.image_url || null;
        // Combine extras + main, deduplicate, keep only valid strings
        const all = [...extras, main].filter(Boolean);
        return [...new Set(all)];
    };
    const [images, setImages] = useState(buildInitialImages);
    const [loading, setLoading] = useState(false);

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

    // New Attributes State
    const [sizes, setSizes] = useState(productToEdit ? (typeof productToEdit.sizes === 'string' ? JSON.parse(productToEdit.sizes) : productToEdit.sizes || []) : []);
    const [tempSize, setTempSize] = useState('');

    // Colors stored as [{color: string, stock: number}]
    const parseColorsInit = (raw) => {
        if (!raw) return [];
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return arr.map(c => typeof c === 'string' ? { color: c, stock: 0 } : c);
    };
    const [colors, setColors] = useState(productToEdit ? parseColorsInit(productToEdit.colors) : []);
    const [tempColor, setTempColor] = useState('');
    const [tempColorStock, setTempColorStock] = useState('');

    const [specs, setSpecs] = useState(productToEdit ? (typeof productToEdit.specs === 'string' ? JSON.parse(productToEdit.specs) : productToEdit.specs || []) : []);
    const [tempSpecKey, setTempSpecKey] = useState('');
    const [tempSpecValue, setTempSpecValue] = useState('');

    // Fetch full details for admin catalog edit
    React.useEffect(() => {
        if (isAdminCatalog && productToEdit) {
            const fetchFullDetails = async () => {
                setLoading(true);
                try {
                    const res = await catalogAPI.getById(productToEdit.product_id);
                    if (res.success && res.product) {
                        const p = res.product;
                        
                        // Update images
                        const extras = Array.isArray(p.images) ? p.images : [];
                        const main = p.image_url || null;
                        const allImgs = [...extras, main].filter(Boolean);
                        setImages([...new Set(allImgs)]);

                        // Update sizes
                        setSizes(typeof p.sizes === 'string' ? JSON.parse(p.sizes) : p.sizes || []);
                        
                        // Update colors
                        setColors(parseColorsInit(p.colors));
                        
                        // Update specs
                        setSpecs(typeof p.specs === 'string' ? JSON.parse(p.specs) : p.specs || []);
                    }
                } catch (e) {
                    console.error("Failed to fetch full catalog product details:", e);
                } finally {
                    setLoading(false);
                }
            };
            fetchFullDetails();
        }
    }, [isAdminCatalog, productToEdit]);

    const categories = [
        { id: 1, name: 'Window' },
        { id: 2, name: 'Door' },
        { id: 3, name: 'Cabinets' },
        { id: 4, name: 'Sink' },
        { id: 5, name: 'Shower Enclosure' },
    ];

    const themes = ['Modern', 'Vintage', 'Industrial', 'Rustic', 'Minimalist', 'Classic'];

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            selectionLimit: 5,
            allowsEditing: false, // allowsEditing must be false for multiple selection
            quality: 0.5,
        });

        if (!result.canceled) {
            const newUris = result.assets.map(asset => asset.uri);
            setImages([...images, ...newUris]);
        }
    };

    const removeImage = (index) => {
        const newImages = [...images];
        newImages.splice(index, 1);
        setImages(newImages);
    };

    // Helper functions for new attributes
    const handleAddSize = () => {
        if (tempSize.trim()) {
            setSizes([...sizes, tempSize.trim()]);
            setTempSize('');
        }
    };

    const handleRemoveSize = (index) => {
        const newSizes = [...sizes];
        newSizes.splice(index, 1);
        setSizes(newSizes);
    };

    const handleAddColor = () => {
        if (tempColor.trim()) {
            if (!isAdminCatalog) {
                // Seller flow: validate against total stock
                const stockNum = parseInt(tempColorStock, 10);
                if (isNaN(stockNum) || stockNum < 0) {
                    showAlert('Invalid Stock', 'Please enter a valid stock quantity (0 or more) for this color.', 'warning');
                    return;
                }
                const totalStockLimit = parseInt(stock, 10) || 0;
                const usedStock = colors.reduce((s, c) => s + (c.stock || 0), 0);
                if (usedStock + stockNum > totalStockLimit) {
                    showAlert(
                        'Stock Exceeded',
                        `Adding ${stockNum} units for "${tempColor.trim()}" would exceed the total stock of ${totalStockLimit}.\n\nRemaining distributable stock: ${totalStockLimit - usedStock}`,
                        'warning'
                    );
                    return;
                }
                setColors([...colors, { color: tempColor.trim(), stock: stockNum }]);
            } else {
                // Admin catalog: just add color variant, no stock
                setColors([...colors, { color: tempColor.trim(), stock: 0 }]);
            }
            setTempColor('');
            setTempColorStock('');
        }
    };

    const handleRemoveColor = (index) => {
        setColors(colors.filter((_, i) => i !== index));
    };

    // Update stock of an existing color entry inline
    const handleUpdateColorStock = (index, newStock) => {
        const updated = [...colors];
        updated[index] = { ...updated[index], stock: parseInt(newStock, 10) || 0 };
        setColors(updated);
    };

    const handleAddSpec = () => {
        if (tempSpecKey.trim() && tempSpecValue.trim()) {
            setSpecs([...specs, { label: tempSpecKey.trim(), value: tempSpecValue.trim() }]);
            setTempSpecKey('');
            setTempSpecValue('');
        }
    };

    const handleRemoveSpec = (index) => {
        const newSpecs = [...specs];
        newSpecs.splice(index, 1);
        setSpecs(newSpecs);
    };

    // Helper to determine text color based on background
    const getContrastColor = (hex) => {
        try {
            const r = parseInt(hex.substr(1, 2), 16);
            const g = parseInt(hex.substr(3, 2), 16);
            const b = parseInt(hex.substr(5, 2), 16);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (yiq >= 128) ? '#000000' : '#ffffff';
        } catch (e) {
            return '#000';
        }
    };

    const handleSubmit = async () => {
        if (!title || !price || !description || (!isAdminCatalog && !stock)) {
            showAlert('Missing Info', 'Please fill in all fields.', 'warning');
            return;
        }

        // Validate per-color stock only in seller flow
        if (!isAdminCatalog && colors.length > 0) {
            const totalColorStock = colors.reduce((s, c) => s + (c.stock || 0), 0);
            const totalStock = parseInt(stock, 10) || 0;
            if (totalColorStock > totalStock) {
                showAlert(
                    'Stock Mismatch',
                    `Total color stock (${totalColorStock}) exceeds the product stock quantity (${totalStock}).\n\nPlease reduce color stocks or increase the product stock quantity.`,
                    'error'
                );
                return;
            }
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('user_id', user.id);
            formData.append('title', title);
            formData.append('price', price.replace(/[^0-9.]/g, ''));
            if (isAdminCatalog) {
                formData.append('base_price', price.replace(/[^0-9.]/g, ''));
                formData.append('is_catalog_active', '1');
            } else {
                formData.append('stock_quantity', stock);
            }
            formData.append('description', description);
            formData.append('category_id', category);
            formData.append('theme', theme);
            formData.append('service_type', serviceType);
            formData.append('installation_complexity', installationComplexity);
            formData.append('fragility_level', fragilityLevel);

            // Append JSON attributes
            formData.append('sizes', JSON.stringify(sizes));
            formData.append('colors', JSON.stringify(colors));
            formData.append('specs', JSON.stringify(specs));

            // Separate existing (http) images from new local picks
            const existingImages = images.filter(img => img.startsWith('http'));
            const newImages     = images.filter(img => !img.startsWith('http'));

            // Tell the backend which existing images to keep
            formData.append('keepImages', JSON.stringify(existingImages));

            // Upload only new images picked from the device
            newImages.forEach((imgUri) => {
                const filename = imgUri.split('/').pop();
                    const match = /\.(\.+|\w+)$/.exec(filename);
                    const type = match ? `image/${match[1]}` : `image/jpeg`;
                    formData.append('images', { uri: imgUri, name: filename, type });
            });

            let response;
            if (isAdminCatalog) {
                response = productToEdit
                    ? await catalogAPI.update(productToEdit.product_id, formData)
                    : await catalogAPI.create(formData);
            } else if (productToEdit) {
                response = await shopAPI.updateProduct(productToEdit.product_id, formData);
            } else {
                response = await shopAPI.addProduct(formData);
            }

            if (response.success) {
                showAlert('Success', `Product ${productToEdit ? 'updated' : 'added'} successfully!`, 'success', false, () => navigation.goBack());
            } else {
                showAlert('Error', response.message || 'Operation failed', 'error');
            }
        } catch (error) {
            showAlert('Error', `Failed to ${productToEdit ? 'update' : 'add'} product`, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: appTheme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: appTheme.headerBg, borderBottomColor: appTheme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={appTheme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: appTheme.headerText }]}>
                    {isAdminCatalog
                        ? (productToEdit ? 'Edit Catalog Product' : 'Add Catalog Product')
                        : (productToEdit ? 'Edit Product' : 'Add New Product')
                    }
                </Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAwareWrapper>
            <ScrollView contentContainerStyle={[styles.content, { backgroundColor: appTheme.background }]} keyboardShouldPersistTaps="handled">
                {/* Image Picker */}
                {/* Image Picker */}
                <View style={styles.imageSection}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
                        {images.map((img, index) => (
                            <View key={index} style={styles.imageContainer}>
                                <Image source={{ uri: img }} style={[styles.previewImage, { backgroundColor: appTheme.inputBg }]} />
                                <TouchableOpacity style={[styles.removeImageButton, { backgroundColor: appTheme.card }]} onPress={() => removeImage(index)}>
                                    <Ionicons name="close-circle" size={20} color="#e53935" />
                                </TouchableOpacity>
                            </View>
                        ))}
                        <TouchableOpacity style={[styles.addImageButton, { backgroundColor: appTheme.inputBg, borderColor: appTheme.border }]} onPress={pickImage}>
                            <Ionicons name="camera-outline" size={32} color={appTheme.textMuted} />
                            <Text style={[styles.addImageText, { color: appTheme.textMuted }]}>Add</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>

                <View style={styles.form}>
                    <Text style={[styles.label, { color: appTheme.textSecondary }]}>Product Title</Text>
                    <TextInput style={[styles.input, { backgroundColor: appTheme.inputBg, borderColor: appTheme.border, color: appTheme.text }]} value={title} onChangeText={setTitle} placeholder="e.g. Modern Glass Window" placeholderTextColor={appTheme.textMuted} />

                    <Text style={[styles.label, { color: appTheme.textSecondary }]}>
                        {isAdminCatalog ? 'Base Price (₱)' : 'Price (₱)'}
                    </Text>
                    {isAdminCatalog && (
                        <Text style={{ fontSize: 11, color: appTheme.textMuted, marginBottom: 6, marginTop: -4 }}>
                            💡 Sellers can set their own price within ±20% of this base price.
                        </Text>
                    )}
                    <TextInput style={[styles.input, { backgroundColor: appTheme.inputBg, borderColor: appTheme.border, color: appTheme.text }]} value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor={appTheme.textMuted} keyboardType="numeric" />

                    {/* Stock — only shown for sellers, not for admin catalog */}
                    {!isAdminCatalog && (
                        <>
                            <Text style={[styles.label, { color: appTheme.textSecondary }]}>
                                Stock Quantity
                                {colors.length > 0 && (() => {
                                    const used = colors.reduce((s, c) => s + (c.stock || 0), 0);
                                    const limit = parseInt(stock, 10) || 0;
                                    const remaining = limit - used;
                                    const isOver = remaining < 0;
                                    const isExact = remaining === 0;
                                    return (
                                        <Text style={{ fontSize: 12, fontWeight: '400', color: isOver ? '#e53935' : isExact ? '#e65100' : appTheme.textMuted }}>
                                            {'  '}({remaining < 0 ? `⚠ ${Math.abs(remaining)} over limit` : `${remaining} remaining to distribute`})
                                        </Text>
                                    );
                                })()}
                            </Text>
                            <TextInput style={[styles.input, { backgroundColor: appTheme.inputBg, borderColor: appTheme.border, color: appTheme.text }]} value={stock} onChangeText={setStock} placeholder="1" placeholderTextColor={appTheme.textMuted} keyboardType="numeric" />
                        </>
                    )}

                    <Text style={[styles.label, { color: appTheme.textSecondary }]}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                        {categories.map((cat) => (
                            <TouchableOpacity
                                key={cat.id}
                                style={[styles.categoryChip, { backgroundColor: appTheme.inputBg }, category === cat.id && styles.categoryChipActive]}
                                onPress={() => setCategory(cat.id)}
                            >
                                <Text style={[styles.categoryText, { color: appTheme.textSecondary }, category === cat.id && styles.categoryTextActive]}>{cat.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <Text style={[styles.label, { color: appTheme.textSecondary }]}>Theme</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                        {themes.map((t) => (
                            <TouchableOpacity
                                key={t}
                                style={[styles.categoryChip, { backgroundColor: appTheme.inputBg }, theme === t && styles.categoryChipActive]}
                                onPress={() => setTheme(t)}
                            >
                                <Text style={[styles.categoryText, { color: appTheme.textSecondary }, theme === t && styles.categoryTextActive]}>{t}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* ── Service Type — seller sets this, hidden for admin catalog ── */}
                    {!isAdminCatalog && (
                        <>
                            <Text style={[styles.label, { color: appTheme.textSecondary }]}>Service Type</Text>
                            <View style={styles.serviceTypeRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.serviceTypeOption,
                                        { backgroundColor: appTheme.inputBg, borderColor: appTheme.border },
                                        serviceType === 'delivery' && [styles.serviceTypeActive, { borderColor: appTheme.accent, backgroundColor: appTheme.accentBg }],
                                    ]}
                                    onPress={() => setServiceType('delivery')}
                                >
                                    <Ionicons
                                        name="car-outline"
                                        size={22}
                                        color={serviceType === 'delivery' ? appTheme.accent : appTheme.textMuted}
                                    />
                                    <Text style={[
                                        styles.serviceTypeText,
                                        { color: serviceType === 'delivery' ? appTheme.accent : appTheme.textSecondary },
                                        serviceType === 'delivery' && { fontWeight: 'bold' },
                                    ]}>
                                        Delivery Only
                                    </Text>
                                    {serviceType === 'delivery' && (
                                        <Ionicons name="checkmark-circle" size={16} color={appTheme.accent} style={{ marginLeft: 4 }} />
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.serviceTypeOption,
                                        { backgroundColor: appTheme.inputBg, borderColor: appTheme.border },
                                        serviceType === 'installation' && [styles.serviceTypeActive, { borderColor: '#e65100', backgroundColor: '#fff3e0' }],
                                        !hasHandymen && { opacity: 0.45 },
                                    ]}
                                    onPress={() => {
                                        if (hasHandymen) setServiceType('installation');
                                    }}
                                    disabled={!hasHandymen}
                                >
                                    <Ionicons
                                        name={!hasHandymen ? 'lock-closed-outline' : 'construct-outline'}
                                        size={22}
                                        color={serviceType === 'installation' && hasHandymen ? '#e65100' : appTheme.textMuted}
                                    />
                                    <Text style={[
                                        styles.serviceTypeText,
                                        { color: serviceType === 'installation' && hasHandymen ? '#e65100' : appTheme.textMuted },
                                        serviceType === 'installation' && hasHandymen && { fontWeight: 'bold' },
                                    ]}>
                                        + Installation
                                    </Text>
                                    {serviceType === 'installation' && hasHandymen && (
                                        <Ionicons name="checkmark-circle" size={16} color="#e65100" style={{ marginLeft: 4 }} />
                                    )}
                                </TouchableOpacity>
                            </View>
                            {!hasHandymen && hasHandymen !== null && (
                                <View style={[styles.installNote, { backgroundColor: appTheme.inputBg, borderColor: appTheme.border }]}>
                                    <Ionicons name="lock-closed-outline" size={14} color={appTheme.textMuted} />
                                    <Text style={[styles.installNoteText, { color: appTheme.textMuted }]}>
                                        You need to add handymen to your shop before enabling installation service.
                                    </Text>
                                </View>
                            )}
                            {hasHandymen && serviceType === 'installation' && (
                                <View style={[styles.installNote, { backgroundColor: '#fff3e0', borderColor: '#e65100' }]}>
                                    <Ionicons name="information-circle-outline" size={14} color="#e65100" />
                                    <Text style={[styles.installNoteText, { color: '#e65100' }]}>
                                        Customers can opt in for installation (+₱500 fee) when adding to cart.
                                    </Text>
                                </View>
                            )}
                            {hasHandymen === null && (
                                <Text style={[styles.installNoteText, { color: appTheme.textMuted, marginBottom: 8 }]}>Checking handymen...</Text>
                            )}
                        </>
                    )}

                    {/* ── Installation Complexity ── */}
                    {(isAdminCatalog || serviceType === 'installation') && (
                        <>
                            <Text style={[styles.label, { color: appTheme.textSecondary }]}>
                                {isAdminCatalog ? 'Installation Complexity (For sellers who offer it)' : 'Installation Complexity'}
                            </Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                                {['basic', 'standard', 'complex'].map((comp) => (
                                    <TouchableOpacity
                                        key={comp}
                                        style={[styles.categoryChip, { backgroundColor: appTheme.inputBg }, installationComplexity === comp && styles.categoryChipActive]}
                                        onPress={() => setInstallationComplexity(comp)}
                                    >
                                        <Text style={[styles.categoryText, { color: appTheme.textSecondary, textTransform: 'capitalize' }, installationComplexity === comp && styles.categoryTextActive]}>{comp}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </>
                    )}

                    {/* ── Fragility Level ── */}
                    <>
                        <Text style={[styles.label, { color: appTheme.textSecondary }]}>
                            Fragility Level
                        </Text>
                        <Text style={{ fontSize: 11, color: appTheme.textMuted, marginBottom: 8 }}>
                            Sets the handling surcharge added to the delivery fee.
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                            {[
                                { key: 'none',   label: 'None',   icon: '⚪', note: 'No surcharge' },
                                { key: 'low',    label: 'Low',    icon: '🟡', note: '+₱100' },
                                { key: 'medium', label: 'Medium', icon: '🟠', note: '+₱300' },
                                { key: 'high',   label: 'High',   icon: '🔴', note: '+₱500 (Glass)' },
                            ].map(({ key, label, icon, note }) => (
                                <TouchableOpacity
                                    key={key}
                                    style={[
                                        styles.categoryChip,
                                        { backgroundColor: appTheme.inputBg },
                                        fragilityLevel === key && styles.categoryChipActive
                                    ]}
                                    onPress={() => setFragilityLevel(key)}
                                >
                                    <Text style={[
                                        styles.categoryText,
                                        { color: appTheme.textSecondary },
                                        fragilityLevel === key && styles.categoryTextActive
                                    ]}>
                                        {icon} {label}
                                    </Text>
                                    <Text style={{ fontSize: 10, color: fragilityLevel === key ? '#fff' : appTheme.textMuted, marginTop: 2 }}>
                                        {note}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </>

                    <Text style={[styles.label, { color: appTheme.textSecondary }]}>Description</Text>
                    <TextInput
                        style={[styles.input, { height: 100, textAlignVertical: 'top', backgroundColor: appTheme.inputBg, borderColor: appTheme.border, color: appTheme.text }]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Describe your product..."
                        placeholderTextColor={appTheme.textMuted}
                        multiline
                    />

                    {/* Sizes / Types */}
                    <Text style={[styles.sectionHeader, { color: appTheme.text }]}>Sizes / Types</Text>
                    <View style={styles.tagInputContainer}>
                        <TextInput
                            style={[styles.tagInput, { backgroundColor: appTheme.inputBg, borderColor: appTheme.border, color: appTheme.text }]}
                            value={tempSize}
                            onChangeText={setTempSize}
                            placeholder="Add size (e.g. Small, 120x80)"
                            placeholderTextColor={appTheme.textMuted}
                        />
                        <TouchableOpacity onPress={handleAddSize} style={[styles.addButton, { backgroundColor: appTheme.accent }]}>
                            <Ionicons name="add" size={24} color="white" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.tagsContainer}>
                        {sizes.map((s, index) => (
                            <View key={index} style={[styles.tag, { backgroundColor: appTheme.accentBg }]}>
                                <Text style={[styles.tagText, { color: appTheme.text }]}>{s}</Text>
                                <TouchableOpacity onPress={() => handleRemoveSize(index)}>
                                    <Ionicons name="close-circle" size={16} color={appTheme.textMuted} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>

                    {/* Colors */}
                    <Text style={[styles.sectionHeader, { color: appTheme.text }]}>
                        {isAdminCatalog ? 'Color Variants' : 'Colors & Stock per Color'}
                    </Text>
                    <View style={styles.colorInputRow}>
                        <TextInput
                            style={[styles.tagInput, { flex: 2, backgroundColor: appTheme.inputBg, borderColor: appTheme.border, color: appTheme.text }]}
                            value={tempColor}
                            onChangeText={setTempColor}
                            placeholder="Color (e.g. Red, #FF0000)"
                            placeholderTextColor={appTheme.textMuted}
                        />
                        {/* Stock per color only shown for sellers */}
                        {!isAdminCatalog && (
                            <TextInput
                                style={[styles.stockMiniInput, { backgroundColor: appTheme.inputBg, borderColor: appTheme.border, color: appTheme.text }]}
                                value={tempColorStock}
                                onChangeText={setTempColorStock}
                                placeholder="Stock"
                                placeholderTextColor={appTheme.textMuted}
                                keyboardType="numeric"
                            />
                        )}
                        <TouchableOpacity onPress={handleAddColor} style={[styles.addButton, { backgroundColor: appTheme.accent }]}>
                            <Ionicons name="add" size={24} color="white" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.tagsContainer}>
                        {colors.map((c, index) => {
                            const isHex = c.color.startsWith('#');
                            const bgColor = isHex ? c.color : appTheme.accentBg;
                            const txtColor = isHex ? getContrastColor(c.color) : appTheme.text;
                            const isOOS = c.stock === 0;
                            return (
                                <View key={index} style={[styles.colorTag, { backgroundColor: bgColor, opacity: isOOS ? 0.6 : 1 }]}>
                                    <View style={styles.colorTagLeft}>
                                        <Text style={[styles.tagText, { color: txtColor }]}>{c.color}</Text>
                                        <View style={[styles.stockBadge, { backgroundColor: isOOS ? '#e53935' : '#2e7d32' }]}>
                                            <Text style={styles.stockBadgeText}>{c.stock}</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={() => handleRemoveColor(index)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                        <Ionicons name="close-circle" size={18} color={isHex ? getContrastColor(c.color) : appTheme.textMuted} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                    {/* Stock summary hint — only for seller flow */}
                    {!isAdminCatalog && colors.length > 0 && (() => {
                        const used = colors.reduce((s, c) => s + (c.stock || 0), 0);
                        const limit = parseInt(stock, 10) || 0;
                        const remaining = limit - used;
                        const isOver = remaining < 0;
                        const isExact = remaining === 0 && used > 0;
                        return (
                            <Text style={[styles.colorHint, {
                                color: isOver ? '#e53935' : isExact ? '#e65100' : appTheme.textMuted,
                                fontWeight: isOver ? '600' : '400',
                            }]}>
                                {isOver
                                    ? `⚠ Color stock total (${used}) exceeds product stock (${limit})`
                                    : isExact
                                        ? `✓ All stock distributed (${used}/${limit})`
                                        : `Total color stock: ${used} / ${limit}  ·  ${remaining} left to distribute`
                                }
                            </Text>
                        );
                    })()}

                    {/* Specifications */}
                    <Text style={[styles.sectionHeader, { color: appTheme.text }]}>Specifications</Text>
                    <View style={styles.specInputRow}>
                        <TextInput
                            style={[styles.specInput, { flex: 1, marginRight: 5, backgroundColor: appTheme.inputBg, borderColor: appTheme.border, color: appTheme.text }]}
                            value={tempSpecKey}
                            onChangeText={setTempSpecKey}
                            placeholder="Label (e.g. Material)"
                            placeholderTextColor={appTheme.textMuted}
                        />
                        <TextInput
                            style={[styles.specInput, { flex: 1, marginRight: 5, backgroundColor: appTheme.inputBg, borderColor: appTheme.border, color: appTheme.text }]}
                            value={tempSpecValue}
                            onChangeText={setTempSpecValue}
                            placeholder="Value (e.g. Glass)"
                            placeholderTextColor={appTheme.textMuted}
                        />
                        <TouchableOpacity onPress={handleAddSpec} style={[styles.addButton, { backgroundColor: appTheme.accent }]}>
                            <Ionicons name="add" size={24} color="white" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.specsList}>
                        {specs.map((spec, index) => (
                            <View key={index} style={[styles.specItem, { borderBottomColor: appTheme.border }]}>
                                <Text style={[styles.specItemText, { color: appTheme.textSecondary }]}>
                                    <Text style={{ fontWeight: 'bold', color: appTheme.text }}>{spec.label}:</Text> {spec.value}
                                </Text>
                                <TouchableOpacity onPress={() => handleRemoveSpec(index)}>
                                    <Ionicons name="trash-outline" size={18} color="#e53935" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>

                </View>

                <TouchableOpacity style={[styles.submitButton, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading}>
                    <Text style={styles.submitText}>
                        {loading
                            ? (productToEdit ? 'Updating...' : 'Saving...')
                            : (isAdminCatalog
                                ? (productToEdit ? 'Update Catalog Product' : 'Add to Catalog')
                                : (productToEdit ? 'Update Product' : 'Add Product')
                            )
                        }
                    </Text>
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
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 15, borderBottomWidth: 1,
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    content: { padding: 20 },
    imageSection: { marginBottom: 20 },
    imageScroll: { flexDirection: 'row' },
    imageContainer: { marginRight: 10, position: 'relative' },
    previewImage: { width: 100, height: 100, borderRadius: 8 },
    removeImageButton: { position: 'absolute', top: -5, right: -5, borderRadius: 10 },
    addImageButton: {
        width: 100, height: 100, borderRadius: 8,
        justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderStyle: 'dashed',
    },
    addImageText: { fontSize: 12, marginTop: 4 },
    form: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 12 },
    input: {
        borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16,
    },
    categoryScroll: { flexDirection: 'row', marginBottom: 10 },
    categoryChip: {
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    },
    categoryChipActive: { backgroundColor: '#8D6E63' },
    categoryText: {},
    categoryTextActive: { color: '#fff', fontWeight: 'bold' },
    submitButton: {
        backgroundColor: '#8D6E63', padding: 16, borderRadius: 30, alignItems: 'center',
        shadowColor: '#8D6E63', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
        marginTop: 20,
    },
    submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    sectionHeader: {
        fontSize: 16, fontWeight: 'bold', marginTop: 20, marginBottom: 10,
    },
    tagInputContainer: {
        flexDirection: 'row', alignItems: 'center', marginBottom: 10,
    },
    tagInput: {
        flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, marginRight: 10,
    },
    addButton: {
        padding: 10, borderRadius: 10,
        justifyContent: 'center', alignItems: 'center',
    },
    tagsContainer: {
        flexDirection: 'row', flexWrap: 'wrap', marginBottom: 5,
    },
    tag: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 20, marginRight: 8, marginBottom: 8,
    },
    tagText: {
        fontSize: 14, marginRight: 5,
    },
    /* ── Color with stock ── */
    colorInputRow: {
        flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8,
    },
    stockMiniInput: {
        width: 72, borderWidth: 1, borderRadius: 10, padding: 10,
        textAlign: 'center',
    },
    colorTag: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 10, paddingVertical: 7,
        borderRadius: 20, marginRight: 8, marginBottom: 8,
        minWidth: 90,
    },
    colorTagLeft: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 6,
    },
    stockBadge: {
        borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
        minWidth: 22, alignItems: 'center',
    },
    stockBadgeText: {
        color: '#fff', fontSize: 11, fontWeight: '700',
    },
    colorHint: {
        fontSize: 11, marginBottom: 8, marginTop: -4,
    },
    specInputRow: {
        flexDirection: 'row', alignItems: 'center', marginBottom: 10,
    },
    specInput: {
        borderWidth: 1, borderRadius: 10, padding: 10,
    },
    specsList: {
        marginTop: 5,
    },
    specItem: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 8, borderBottomWidth: 1,
    },
    specItemText: {
        fontSize: 14,
    },
    serviceTypeRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 8,
    },
    serviceTypeOption: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderWidth: 1.5,
        borderRadius: 12,
        gap: 6,
    },
    serviceTypeActive: {
        borderWidth: 2,
    },
    serviceTypeText: {
        fontSize: 13,
        fontWeight: '500',
    },
    installNote: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 6,
    },
    installNoteText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 17,
    },
});

export default AddProductScreen;
