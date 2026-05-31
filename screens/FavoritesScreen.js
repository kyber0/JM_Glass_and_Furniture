import React, { useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    Image,
    FlatList,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFavorites } from '../context/FavoritesContext';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
const itemWidth = width / 2;

// Product catalogue is now fetched from API via FavoritesContext
const FavoritesScreen = ({ navigation }) => {
    const { favorites, toggleFavorite } = useFavorites();
    const { theme } = useTheme();

    const favoriteProducts = favorites;

    const renderItem = useCallback(
        ({ item }) => (
            <TouchableOpacity
                style={[styles.productCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => navigation.navigate('ProductDetail', { product: item })}
                activeOpacity={0.7}
            >
                <View style={styles.imageContainer}>
                    <Image source={{ uri: item.image_url || item.image }} style={styles.productImage} />
                    <TouchableOpacity
                        style={styles.heartButton}
                        onPress={() => toggleFavorite(item.product_id || item.id)}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="heart" size={22} color="#e53935" />
                    </TouchableOpacity>
                </View>
                <View style={styles.productInfo}>
                    <Text style={[styles.productTitle, { color: theme.text }]} numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text style={[styles.productPrice, { color: theme.accent }]}>
                        {typeof item.price === 'number'
                            ? `Php. ${parseFloat(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                            : item.price}
                    </Text>
                </View>
            </TouchableOpacity>
        ),
        [toggleFavorite, navigation, theme]
    );

    /* ── Empty State ── */
    if (favoriteProducts.length === 0) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <Text style={[styles.header, { color: theme.text }]}>Favorites</Text>
                <View style={styles.emptyContainer}>
                    <View style={[styles.emptyIconCircle, { backgroundColor: theme.accentBg }]}>
                        <Ionicons name="heart-outline" size={64} color={theme.accent} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>No favorites yet</Text>
                    <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                        Tap the heart icon on any product to save it here.
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    /* ── Favorites Grid ── */
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <Text style={[styles.header, { color: theme.text }]}>Favorites</Text>
            <Text style={[styles.countText, { color: theme.accent }]}>
                {favoriteProducts.length} {favoriteProducts.length === 1 ? 'item' : 'items'}
            </Text>

            <FlatList
                data={favoriteProducts}
                renderItem={renderItem}
                keyExtractor={(item) => (item.favorite_id || item.product_id || item.id).toString()}
                numColumns={2}
                columnWrapperStyle={styles.productRow}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        fontSize: 26,
        fontWeight: '700',
        paddingHorizontal: 20,
        paddingTop: 15,
        letterSpacing: 0.5,
    },
    countText: {
        fontSize: 14,
        paddingHorizontal: 20,
        marginTop: 4,
        marginBottom: 10,
        fontWeight: '500',
    },

    /* ── Empty state ── */
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 80,
    },
    emptyIconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 60,
        lineHeight: 20,
    },

    /* ── Product grid ── */
    listContent: {
        paddingBottom: 80,
    },
    productRow: {
        justifyContent: 'flex-start',
    },
    productCard: {
        width: itemWidth,
        padding: 15,
        borderRightWidth: 0.5,
        borderBottomWidth: 0.5,
    },
    imageContainer: {
        position: 'relative',
    },
    productImage: {
        width: '100%',
        height: 180,
        marginBottom: 10,
        resizeMode: 'cover',
    },
    heartButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 3,
    },
    productInfo: {
        alignItems: 'flex-start',
    },
    productTitle: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
    },
    productPrice: {
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default FavoritesScreen;
