import React, { useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    Image,
    ScrollView,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { reviewsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import CustomAlert from '../components/CustomAlert';

const TAGS = ['Good Quality', 'Affordable', 'Fast Delivery', 'Safe Packaging', 'Highly Recommended'];

const RateProductScreen = ({ route, navigation }) => {
    const { product, orderId } = route.params;
    const { user } = useAuth();

    const [rating, setRating] = useState(5);
    const [selectedTags, setSelectedTags] = useState([]);
    const [comment, setComment] = useState('');
    const [image, setImage] = useState(null);
    const [submitting, setSubmitting] = useState(false);

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

    const toggleTag = (tag) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
        });
        if (!result.canceled) setImage(result.assets[0].uri);
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            showAlert('Permission Denied', 'Camera access is required to take a photo.', 'error');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
        });
        if (!result.canceled) setImage(result.assets[0].uri);
    };

    const removeImage = () => setImage(null);

    const handleSubmit = async () => {
        if (!rating) {
            showAlert('Error', 'Please select a rating', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('user_id', user.id);
            formData.append('product_id', product.product_id || product.id);
            formData.append('order_id', orderId);
            formData.append('rating', rating);
            formData.append('tags', JSON.stringify(selectedTags));
            formData.append('comment', comment);

            if (image) {
                formData.append('image', {
                    uri: image,
                    name: 'review_image.jpg',
                    type: 'image/jpeg',
                });
            }

            const response = await reviewsAPI.addReview(formData);

            if (response.success) {
                showAlert(
                    'Success',
                    'Review submitted successfully!',
                    'success',
                    false,
                    () => navigation.goBack(),
                    () => navigation.goBack()
                );
            } else {
                showAlert('Error', response.message || 'Failed to submit review', 'error');
            }
        } catch (error) {
            console.error(error);
            showAlert('Error', 'An error occurred. Please try again.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#3e2723" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Rate Product</Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAwareWrapper>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {/* Product Info */}
                <View style={styles.productCard}>
                    <Image
                        source={{ uri: product.image_url || product.image }}
                        style={styles.productImage}
                    />
                    <View style={styles.productInfo}>
                        <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>
                        {product.selected_variant ? (
                            <Text style={{ fontSize: 12, color: '#8D6E63', marginBottom: 2 }}>
                                {product.selected_variant}
                            </Text>
                        ) : null}
                        <Text style={styles.productPrice}>₱{parseFloat(product.price_at_purchase || product.price || 0).toLocaleString()}</Text>
                    </View>
                </View>

                {/* Star Rating */}
                <View style={styles.section}>
                    <Text style={styles.label}>Product Quality</Text>
                    <View style={styles.starsContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity key={star} onPress={() => setRating(star)}>
                                <Ionicons
                                    name={star <= rating ? "star" : "star-outline"}
                                    size={32}
                                    color="#FFD700"
                                    style={{ marginHorizontal: 4 }}
                                />
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Tags */}
                <View style={styles.section}>
                    <Text style={styles.label}>What did you like?</Text>
                    <View style={styles.tagsContainer}>
                        {TAGS.map(tag => (
                            <TouchableOpacity
                                key={tag}
                                style={[styles.tag, selectedTags.includes(tag) && styles.selectedTag]}
                                onPress={() => toggleTag(tag)}
                            >
                                <Text style={[styles.tagText, selectedTags.includes(tag) && styles.selectedTagText]}>
                                    {tag}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Comment */}
                <View style={styles.section}>
                    <Text style={styles.label}>Leave a Comment</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Share your experience..."
                        multiline
                        numberOfLines={4}
                        value={comment}
                        onChangeText={setComment}
                        textAlignVertical="top"
                    />
                </View>

                {/* Image Picker */}
                <View style={styles.section}>
                    <Text style={styles.label}>Add Photo</Text>
                    {image ? (
                        <View style={styles.selectedImageContainer}>
                            <Image source={{ uri: image }} style={styles.selectedImage} />
                            <TouchableOpacity style={styles.removeImageBtn} onPress={removeImage}>
                                <Ionicons name="close-circle" size={24} color="#e53935" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.photoPickerRow}>
                            <TouchableOpacity style={styles.photoOptionBtn} onPress={takePhoto}>
                                <Ionicons name="camera-outline" size={28} color="#8D6E63" />
                                <Text style={styles.photoOptionText}>Camera</Text>
                            </TouchableOpacity>
                            <View style={styles.photoPickerDivider} />
                            <TouchableOpacity style={styles.photoOptionBtn} onPress={pickImage}>
                                <Ionicons name="images-outline" size={28} color="#8D6E63" />
                                <Text style={styles.photoOptionText}>Gallery</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

            </ScrollView>
            </KeyboardAwareWrapper>

            {/* Submit Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.submitButton, submitting && styles.disabledButton]}
                    onPress={handleSubmit}
                    disabled={submitting}
                >
                    <Text style={styles.submitText}>{submitting ? 'Submitting...' : 'Submit Review'}</Text>
                </TouchableOpacity>
            </View>

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
        borderBottomColor: '#f0f0f0',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#3e2723',
    },
    content: {
        padding: 20,
    },
    productCard: {
        flexDirection: 'row',
        marginBottom: 30,
        backgroundColor: '#f9f9f9',
        padding: 10,
        borderRadius: 12,
    },
    productImage: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: '#eee',
    },
    productInfo: {
        marginLeft: 15,
        flex: 1,
        justifyContent: 'center',
    },
    productTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    productPrice: {
        fontSize: 14,
        color: '#8D6E63',
        fontWeight: 'bold',
    },
    section: {
        marginBottom: 25,
    },
    label: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 10,
    },
    starsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    tag: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#ddd',
        marginRight: 8,
        marginBottom: 8,
    },
    selectedTag: {
        backgroundColor: '#8D6E63',
        borderColor: '#8D6E63',
    },
    tagText: {
        fontSize: 13,
        color: '#666',
    },
    selectedTagText: {
        color: '#fff',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        minHeight: 100,
        backgroundColor: '#f9f9f9',
    },
    footer: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    submitButton: {
        backgroundColor: '#8D6E63',
        paddingVertical: 15,
        borderRadius: 12,
        alignItems: 'center',
    },
    disabledButton: {
        backgroundColor: '#ccc',
    },
    submitText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    addPhotoButton: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderStyle: 'dashed',
        borderRadius: 12,
        height: 100,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fafafa',
    },
    addPhotoText: {
        marginTop: 8,
        color: '#8D6E63',
        fontSize: 14,
    },
    photoPickerRow: {
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: '#ddd',
        borderStyle: 'dashed',
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#fafafa',
        height: 90,
    },
    photoOptionBtn: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    photoOptionText: {
        color: '#8D6E63',
        fontSize: 13,
        fontWeight: '600',
        marginTop: 4,
    },
    photoPickerDivider: {
        width: 1,
        backgroundColor: '#ddd',
        marginVertical: 16,
    },
    selectedImageContainer: {
        position: 'relative',
        width: 100,
        height: 100,
    },
    selectedImage: {
        width: 100,
        height: 100,
        borderRadius: 8,
    },
    removeImageBtn: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#fff',
        borderRadius: 12,
    },
});

export default RateProductScreen;
