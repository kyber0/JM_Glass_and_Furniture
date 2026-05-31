import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, Image, Modal, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { reviewsAPI, BASE_URL } from '../services/api';

const AllReviewsScreen = ({ route, navigation }) => {
    const { productId } = route.params;
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lightboxUri, setLightboxUri]   = useState(null);
    const [lightboxVisible, setLightboxVisible] = useState(false);

    const openLightbox = (uri) => { setLightboxUri(uri); setLightboxVisible(true); };
    const closeLightbox = () => { setLightboxVisible(false); };

    useEffect(() => {
        fetchReviews();
    }, [productId]);

    const fetchReviews = async () => {
        try {
            const response = await reviewsAPI.getProductReviews(productId);
            if (response.success) {
                setReviews(response.reviews);
            }
        } catch (error) {
            console.error('Failed to load reviews:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderReview = ({ item }) => (
        <View style={styles.reviewCard}>
            {/* Product Info Strip */}
            {(item.product_title || item.product_image_url) && (
                <View style={styles.productStrip}>
                    {item.product_image_url ? (
                        <Image
                            source={{ uri: item.product_image_url.startsWith('http') ? item.product_image_url : `${BASE_URL}/${item.product_image_url}` }}
                            style={styles.productStripImage}
                        />
                    ) : null}
                    <View style={{ flex: 1 }}>
                        {item.product_title ? (
                            <Text style={styles.productStripTitle} numberOfLines={1}>{item.product_title}</Text>
                        ) : null}
                        {item.selected_variant ? (
                            <Text style={styles.productStripVariant} numberOfLines={1}>Variant: {item.selected_variant}</Text>
                        ) : null}
                    </View>
                </View>
            )}

            <View style={styles.reviewHeader}>
                <View style={styles.reviewerInfo}>
                    {item.user_profile_image ? (
                        <Image
                            source={{ uri: item.user_profile_image.startsWith('http') ? item.user_profile_image : `${BASE_URL}/${item.user_profile_image}` }}
                            style={styles.reviewerAvatar}
                        />
                    ) : (
                        <View style={[styles.reviewerAvatar, styles.reviewerAvatarPlaceholder]}>
                            <Ionicons name="person" size={20} color="#fff" />
                        </View>
                    )}
                    <View>
                        <Text style={styles.reviewUser}>{item.user_name || 'Anonymous'}</Text>
                        <View style={styles.reviewRating}>
                            {[...Array(5)].map((_, i) => (
                                <Ionicons
                                    key={i}
                                    name={i < item.rating ? "star" : "star-outline"}
                                    size={12}
                                    color="#FFD700"
                                />
                            ))}
                        </View>
                    </View>
                </View>
                <Text style={styles.reviewDate}>
                    {new Date(item.created_at).toLocaleDateString()}
                </Text>
            </View>

            {item.tags && item.tags.length > 0 && (
                <View style={styles.reviewTagsContainer}>
                    {item.tags.map((tag, idx) => (
                        <View key={idx} style={styles.reviewTag}>
                            <Text style={styles.reviewTagText}>{tag}</Text>
                        </View>
                    ))}
                </View>
            )}
            <Text style={styles.reviewComment}>{item.comment}</Text>
            {item.image_url && (
                <TouchableOpacity onPress={() => openLightbox(item.image_url)} activeOpacity={0.85}>
                    <Image source={{ uri: item.image_url }} style={styles.reviewImage} />
                    <View style={styles.reviewImageHint}>
                        <Text style={styles.reviewImageHintText}>Tap to expand</Text>
                    </View>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#3e2723" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>All Reviews ({reviews.length})</Text>
                <View style={{ width: 24 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#8D6E63" />
                </View>
            ) : (
                <FlatList
                    data={reviews}
                    renderItem={renderReview}
                    keyExtractor={item => item.review_id.toString()}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Text style={styles.emptyText}>No reviews yet.</Text>
                        </View>
                    }
                />
            )}

            {/* Lightbox */}
            <Modal visible={lightboxVisible} transparent animationType="fade" onRequestClose={closeLightbox}>
                <StatusBar hidden />
                <View style={styles.lightboxBackdrop}>
                    <TouchableOpacity style={styles.lightboxClose} onPress={closeLightbox}>
                        <Text style={styles.lightboxCloseText}>✕</Text>
                    </TouchableOpacity>
                    {lightboxUri && (
                        <Image
                            source={{ uri: lightboxUri }}
                            style={styles.lightboxImage}
                            resizeMode="contain"
                        />
                    )}
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    backButton: { padding: 4 },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#3e2723',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 50,
    },
    listContent: {
        padding: 20,
    },
    reviewCard: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 12,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#f0f0f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    reviewerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    reviewerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        marginRight: 10,
    },
    reviewerAvatarPlaceholder: {
        backgroundColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
    },
    productStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9f6f4',
        borderRadius: 8,
        padding: 8,
        marginBottom: 12,
        borderLeftWidth: 3,
        borderLeftColor: '#8D6E63',
    },
    productStripImage: {
        width: 40,
        height: 40,
        borderRadius: 6,
        backgroundColor: '#eee',
        marginRight: 10,
    },
    productStripTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#3e2723',
    },
    productStripVariant: {
        fontSize: 11,
        color: '#8D6E63',
        marginTop: 2,
    },
    reviewUser: {
        fontWeight: 'bold',
        fontSize: 15,
        color: '#333',
        marginBottom: 2,
    },
    reviewDate: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
    },
    reviewRating: {
        flexDirection: 'row',
    },
    reviewComment: {
        fontSize: 14,
        color: '#555',
        lineHeight: 20,
    },
    reviewImage: {
        width: '100%',
        height: 180,
        borderRadius: 8,
        marginTop: 8,
        backgroundColor: '#f5f5f5',
    },
    reviewImageHint: {
        position: 'absolute', bottom: 8, right: 8,
        backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10,
        paddingHorizontal: 8, paddingVertical: 3,
    },
    reviewImageHintText: { color: '#fff', fontSize: 10, fontWeight: '600' },
    lightboxBackdrop: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
        justifyContent: 'center', alignItems: 'center',
    },
    lightboxImage: { width: '100%', height: '85%' },
    lightboxClose: {
        position: 'absolute', top: 48, right: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        width: 40, height: 40, borderRadius: 20,
        justifyContent: 'center', alignItems: 'center', zIndex: 10,
    },
    lightboxCloseText: { color: '#fff', fontSize: 18, fontWeight: '800' },
    reviewTagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 8,
    },
    reviewTag: {
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginRight: 6,
        marginBottom: 4,
    },
    reviewTagText: {
        fontSize: 11,
        color: '#666',
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    }
});

export default AllReviewsScreen;
