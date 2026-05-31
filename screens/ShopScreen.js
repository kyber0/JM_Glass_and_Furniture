import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    Image,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    FlatList,
    Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { shopAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import CustomAlert from '../components/CustomAlert';

const { width } = Dimensions.get('window');

const ShopScreen = ({ route, navigation }) => {
    const { shopId } = route.params ?? {};
    const { user } = useAuth();
    const [shop, setShop] = useState(null);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('All');

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
        fetchShopData();
    }, [shopId]);

    const fetchShopData = async () => {
        try {
            const [shopRes, productsRes] = await Promise.all([
                shopAPI.getPublicShop(shopId),
                shopAPI.getPublicShopProducts(shopId)
            ]);

            if (shopRes.success) {
                setShop(shopRes.shop);
            }
            if (productsRes.success) {
                setProducts(productsRes.products);
            }
        } catch (error) {
            console.error('Failed to load shop data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCount = (n) => {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return n.toString();
    };

    const renderProduct = ({ item }) => (
        <TouchableOpacity
            style={styles.productCard}
            onPress={() => navigation.push('ProductDetail', { product: item })}
        >
            <Image
                source={{ uri: item.image_url || 'https://via.placeholder.com/150' }}
                style={styles.productImage}
            />
            <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.productPrice}>₱{parseFloat(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
            <View style={styles.ratingContainer}>
                <Ionicons name="star" size={12} color="#FFD700" />
                <Text style={styles.ratingText}>
                    {item.avg_rating ? parseFloat(item.avg_rating).toFixed(1) : '0.0'}
                </Text>
                <Text style={styles.soldText}>• {formatCount(item.sold_count)} sold</Text>
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#8D6E63" />
            </View>
        );
    }

    if (!shop) {
        return (
            <View style={styles.center}>
                <Text>Shop not found.</Text>
            </View>
        );
    }

    const shopAvatar = shop.logo_url ? (shop.logo_url.startsWith('http') ? shop.logo_url : `${BASE_URL}/${shop.logo_url}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(shop.shop_name)}&background=random&color=fff&size=128`;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{shop.shop_name}</Text>
                <TouchableOpacity style={styles.backBtn}>
                    <Ionicons name="search" size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Shop Banner/Info */}
                <View style={styles.shopInfoContainer}>
                    <Image source={{ uri: shopAvatar }} style={styles.shopAvatar} />
                    <View style={styles.shopDetails}>
                        <Text style={styles.shopName}>{shop.shop_name}</Text>
                        <Text style={styles.ownerName}>by {shop.owner_name}</Text>
                        <View style={styles.statsRow}>
                            <View style={styles.stat}>
                                <Text style={styles.statValue}>{shop.total_products}</Text>
                                <Text style={styles.statLabel}>Products</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.stat}>
                                <Text style={styles.statValue}>{shop.total_sales}</Text>
                                <Text style={styles.statLabel}>Sales</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.stat}>
                                <Text style={styles.statValue}>
                                    {shop.avg_rating ? parseFloat(shop.avg_rating).toFixed(1) : '0.0'} ⭐
                                </Text>
                                <Text style={styles.statLabel}>Rating</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Description */}
                {shop.description && (
                    <View style={styles.descriptionContainer}>
                        <Text style={styles.description}>{shop.description}</Text>
                    </View>
                )}

                {/* Actions */}
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={[styles.chatButton, user?.id === shop.user_id && styles.disabledButton]}
                        onPress={() => {
                            if (!user) {
                                navigation.navigate('Login');
                                return;
                            }
                            if (user.id === shop.user_id) {
                                showAlert('Info', 'This is your own shop.', 'info');
                                return;
                            }
                            navigation.navigate('Chat', {
                                otherUserId: shop.user_id,
                                conversation: {
                                    other_user_id: shop.user_id,
                                    full_name: shop.shop_name,
                                    shop_logo: shop.logo_url
                                }
                            });
                        }}
                    >
                        <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
                        <Text style={styles.chatButtonText}>Chat with Seller</Text>
                    </TouchableOpacity>
                </View>

                {/* Category Filter Tabs */}
                {(() => {
                    const cats = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
                    const filtered = activeCategory === 'All' ? products : products.filter(p => p.category === activeCategory);
                    return (
                        <>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.categoryScroll}
                                contentContainerStyle={styles.categoryScrollContent}
                            >
                                {cats.map(cat => (
                                    <TouchableOpacity
                                        key={cat}
                                        style={[styles.categoryTab, activeCategory === cat && styles.categoryTabActive]}
                                        onPress={() => setActiveCategory(cat)}
                                    >
                                        <Text style={[styles.categoryTabText, activeCategory === cat && styles.categoryTabTextActive]}>
                                            {cat}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* Products */}
                            <Text style={styles.sectionTitle}>
                                {activeCategory === 'All' ? 'All Products' : activeCategory} ({filtered.length})
                            </Text>
                            <FlatList
                                data={filtered}
                                renderItem={renderProduct}
                                keyExtractor={item => item.product_id?.toString()}
                                numColumns={2}
                                columnWrapperStyle={styles.row}
                                scrollEnabled={false}
                            />
                            {filtered.length === 0 && (
                                <Text style={styles.emptyText}>No products in this category.</Text>
                            )}
                        </>
                    );
                })()}
            </ScrollView>

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
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        backgroundColor: '#5D4037'
    },
    backBtn: { padding: 5 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    content: { paddingBottom: 20 },
    shopInfoContainer: {
        flexDirection: 'row',
        padding: 20,
        backgroundColor: '#fff',
        alignItems: 'center'
    },
    shopAvatar: { width: 80, height: 80, borderRadius: 40, marginRight: 20 },
    shopDetails: { flex: 1 },
    shopName: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    ownerName: { fontSize: 14, color: '#666', marginBottom: 10 },
    statsRow: { flexDirection: 'row', alignItems: 'center' },
    stat: { alignItems: 'center', minWidth: 60 },
    statValue: { fontSize: 16, fontWeight: 'bold', color: '#5D4037' },
    statLabel: { fontSize: 12, color: '#888' },
    statDivider: { width: 1, height: 30, backgroundColor: '#eee', marginHorizontal: 15 },
    descriptionContainer: { padding: 20, backgroundColor: '#fff', marginTop: 1 },
    description: { fontSize: 14, color: '#555', lineHeight: 20 },
    actionRow: { padding: 20, backgroundColor: '#fff', marginTop: 1, alignItems: 'center' },
    chatButton: {
        flexDirection: 'row',
        backgroundColor: '#5D4037',
        paddingVertical: 10,
        paddingHorizontal: 25,
        borderRadius: 25,
        alignItems: 'center'
    },
    chatButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
    disabledButton: { backgroundColor: '#ccc' },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', margin: 20, color: '#333' },
    row: { justifyContent: 'space-between', paddingHorizontal: 10 },
    productCard: {
        width: (width - 30) / 2,
        backgroundColor: '#fff',
        borderRadius: 10,
        marginBottom: 10,
        padding: 10,
        elevation: 2
    },
    productImage: { width: '100%', height: 140, borderRadius: 8, marginBottom: 8 },
    productTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4, height: 36 },
    productPrice: { fontSize: 16, fontWeight: 'bold', color: '#4CAF50' },
    ratingContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    ratingText: { fontSize: 12, color: '#FFD700', marginLeft: 2, fontWeight: 'bold' },
    soldText: { fontSize: 10, color: '#999', marginLeft: 4 },
    emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },
    categoryScroll: { backgroundColor: '#fff', marginTop: 1 },
    categoryScrollContent: { paddingHorizontal: 15, paddingVertical: 12, gap: 8 },
    categoryTab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f0ebe8',
        marginRight: 8,
    },
    categoryTabActive: {
        backgroundColor: '#5D4037',
    },
    categoryTabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#5D4037',
    },
    categoryTabTextActive: {
        color: '#fff',
    },
});

export default ShopScreen;
