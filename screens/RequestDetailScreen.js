import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, Image, TouchableOpacity, Dimensions, ActivityIndicator, TextInput, Modal, Platform } from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { customRequestsAPI, BASE_URL } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import { useFees } from '../context/FeesContext';
import EDDBanner from '../components/EDDBanner';


const { width } = Dimensions.get('window');

const STATUS_COLORS = {
    pending:     '#FF9800',
    negotiating: '#4A90D9',
    accepted:    '#4CAF50',
    in_progress: '#795548',
    ready:       '#00BCD4',
    rejected:    '#F44336',
    completed:   '#9C27B0',
};

const RequestDetailScreen = ({ route, navigation }) => {
    const { request: initialRequest, requestId: routeRequestId, userType } = route.params;
    const { getInstallationTier } = useFees();
    const [request, setRequest] = useState(null);
    const [loading, setLoading] = useState(true);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'info',
        showCancel: false, onConfirm: null
    });
    // Quote sheet state (seller)
    const [quoteModal, setQuoteModal] = useState(false);
    const [quotePrice, setQuotePrice] = useState('');
    const [quoteFragility, setQuoteFragility] = useState('none');
    const [quoteComplexity, setQuoteComplexity] = useState('standard');
    const [quoteNotes, setQuoteNotes] = useState('');
    const [quoteSending, setQuoteSending] = useState(false);
    // Lightbox state
    const [lightboxUri, setLightboxUri] = useState(null);

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    };

    const hideAlert = () => {
        setAlertConfig({ ...alertConfig, visible: false });
    };

    const loadRequest = async () => {
        try {
            if (routeRequestId) {
                const res = await customRequestsAPI.getRequest(routeRequestId);
                if (res.success) setRequest(res.request);
            } else if (initialRequest) {
                // If full request passed, use it directly
                if (initialRequest.request_id) {
                    // Try fetching fresh from backend for full data
                    const res = await customRequestsAPI.getRequest(initialRequest.request_id);
                    if (res.success) setRequest(res.request);
                    else setRequest(initialRequest);
                } else {
                    setRequest(initialRequest);
                }
            }
        } catch (e) {
            console.error(e);
            if (initialRequest) setRequest(initialRequest);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRequest();
    }, []);

    const { socket } = useSocket();
    useEffect(() => {
        if (!socket) return;
        socket.on('request:update', loadRequest);
        return () => socket.off('request:update', loadRequest);
    }, [socket]);

    let images = [];
    if (request) {
        try {
            images = typeof request.images === 'string' ? JSON.parse(request.images) : (request.images || []);
        } catch (e) { images = []; }
    }

    const handleStatusUpdate = async (newStatus, extraData = {}) => {
        try {
            const response = await customRequestsAPI.updateStatusWithQuote(request.request_id, { status: newStatus, ...extraData });
            if (response.success) {
                setRequest(prev => ({ ...prev, status: newStatus, ...extraData }));
                showAlert('Success', `Request status updated to ${newStatus}.`, 'success');
            }
        } catch (error) {
            showAlert('Error', 'Failed to update status.', 'error');
        }
    };

    const handleSendQuote = async () => {
        if (!quotePrice || isNaN(parseFloat(quotePrice))) {
            showAlert('Required', 'Please enter a valid quoted price.', 'warning');
            return;
        }
        setQuoteSending(true);
        try {
            const res = await customRequestsAPI.quote(request.request_id, {
                quoted_price: parseFloat(quotePrice),
                fragility_level: quoteFragility,
                installation_complexity: quoteComplexity,
                negotiation_notes: quoteNotes.trim() || null,
            });
            if (res.success) {
                setRequest(prev => ({
                    ...prev,
                    status: 'negotiating',
                    quoted_price: parseFloat(quotePrice),
                    fragility_level: quoteFragility,
                    installation_complexity: quoteComplexity,
                    negotiation_notes: quoteNotes.trim() || null,
                }));
                setQuoteModal(false);
                showAlert('Quote Sent! 💬', 'Your price quote has been sent to the customer.', 'success');
            } else {
                showAlert('Error', res.message || 'Failed to send quote.', 'error');
            }
        } catch (e) {
            showAlert('Error', 'Failed to send quote.', 'error');
        } finally {
            setQuoteSending(false);
        }
    };

    const handleChat = () => {
        if (userType === 'seller') {
            navigation.navigate('Chat', {
                otherUserId: request.user_id,
                conversation: {
                    other_user_id: request.user_id,
                    full_name: request.user_name || 'Customer'
                }
            });
        } else {
            navigation.navigate('Chat', {
                otherUserId: request.shop_owner_id,
                conversation: {
                    other_user_id: request.shop_owner_id,
                    full_name: request.shop_name
                }
            });
        }
    };

    const proceedToCheckout = (paymentPhase) => {
        const finalPrice = parseFloat(request.quoted_price || request.budget || 0);
        const itemPrice  = finalPrice * 0.5;
        const phaseLabel = paymentPhase === 'downpayment' ? '50% Downpayment' : '50% Final Balance';

        const customCartItem = {
            id: `custom_${request.request_id}_${paymentPhase}`,
            product_id:  request.product_id || 1,
            title:       `${phaseLabel} - Custom Request REQ-${request.request_id}`,
            price:       itemPrice,
            quantity:    1,
            image_url:   request.product_image || (images[0] ? (images[0].startsWith('http') ? images[0] : `${BASE_URL}/${images[0]}`) : null),
            shop_id:     request.shop_id,
            shop_name:   request.shop_name,
            shop_lat:    request.shop_lat   || null,
            shop_lng:    request.shop_lng   || null,
            fragility_level: request.fragility_level || 'none',
            serviceType: request.service_type,
            selectedSize: '',
            selectedColor: '',
            isCustomPayment:  true,
            customRequestId:  request.request_id,
            paymentPhase:     paymentPhase
        };

        navigation.navigate('Checkout', { selectedItems: [customCartItem] });
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#8D6E63" />
                </View>
            </SafeAreaView>
        );
    }

    if (!request) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text>Request not found.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#3e2723" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Request Details</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* ── EDD Banner (for accepted / in-progress / ready requests) ── */}
                {request.estimated_completion_date && ['accepted','in_progress','ready'].includes(request.status) && (
                    <EDDBanner
                        eddMin={request.estimated_completion_date}
                        delayed={false}
                        style={{ marginBottom: 14 }}
                    />
                )}

                {/* Status Banner */}
                <View style={[styles.statusBanner, { backgroundColor: STATUS_COLORS[request.status] || '#999' }]}>
                    <Ionicons
                        name={
                            request.status === 'accepted' || request.status === 'completed' ? 'checkmark-circle'
                            : request.status === 'rejected' ? 'close-circle'
                            : request.status === 'negotiating' ? 'chatbubbles'
                            : request.status === 'in_progress' ? 'hammer'
                            : request.status === 'ready' ? 'cube'
                            : 'time'
                        }
                        size={22} color="#fff"
                    />
                    <Text style={styles.statusBannerText}>
                        {request.status === 'in_progress' ? 'IN PROGRESS'
                         : request.status === 'negotiating' ? 'PRICE NEGOTIATION'
                         : request.status === 'ready' ? 'READY FOR DELIVERY'
                         : request.status.toUpperCase()}
                    </Text>
                </View>

                {/* Info Card */}
                <View style={styles.card}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Request ID</Text>
                        <Text style={styles.value}>REQ-{request.request_id}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                        <Text style={styles.label}>Date</Text>
                        <Text style={styles.value}>{new Date(request.created_at).toLocaleDateString()}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                        <Text style={styles.label}>{userType === 'seller' ? 'Customer' : 'Shop'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end', marginLeft: 16 }}>
                            {userType === 'seller' && (
                                request.user_profile_image ? (
                                    <Image
                                        source={{ uri: request.user_profile_image.startsWith('http') ? request.user_profile_image : `${BASE_URL}/${request.user_profile_image}` }}
                                        style={{ width: 24, height: 24, borderRadius: 12, marginRight: 8 }}
                                    />
                                ) : (
                                    <View style={{ width: 24, height: 24, borderRadius: 12, marginRight: 8, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' }}>
                                        <Ionicons name="person" size={12} color="#fff" />
                                    </View>
                                )
                            )}
                            <Text style={[styles.value, { maxWidth: '100%', flexShrink: 1 }]} numberOfLines={1}>
                                {userType === 'seller'
                                    ? (request.user_name || request.full_name || request.user_email || 'Anonymous')
                                    : (request.shop_name || 'Shop')}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── BRANCH: Reference-based vs Fully Custom ── */}
                {request.product_title ? (
                    <>
                        {/* Reference Product Card */}
                        <Text style={styles.sectionTitle}>Reference Product</Text>
                        <View style={styles.productCard}>
                            <Image
                                source={{ uri: request.product_image || 'https://via.placeholder.com/100' }}
                                style={styles.productImage}
                            />
                            <View style={styles.productInfo}>
                                <Text style={styles.productTitle}>{request.product_title}</Text>
                                <Text style={styles.productSubtitle}>Base Design</Text>
                            </View>
                        </View>

                        {/* Design Reference Images (below product) */}
                        {images.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>Design References</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
                                    {images.map((imgPath, index) => {
                                        const uri = imgPath.startsWith('http') ? imgPath : `${BASE_URL}/${imgPath}`;
                                        return (
                                            <TouchableOpacity key={index} onPress={() => setLightboxUri(uri)} activeOpacity={0.85}>
                                                <Image source={{ uri }} style={styles.refImage} />
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        {/* Fully Custom Banner */}
                        <View style={styles.customBanner}>
                            <Ionicons name="color-wand" size={22} color="#8D6E63" />
                            <Text style={styles.customBannerText}>Completely Custom Design</Text>
                        </View>
                        {/* Design Reference Images — prominent, top position */}
                        {images.length > 0 ? (
                            <>
                                <Text style={styles.sectionTitle}>Design References</Text>
                                <View style={styles.customImageGrid}>
                                    {images.map((imgPath, index) => {
                                        const uri = imgPath.startsWith('http') ? imgPath : `${BASE_URL}/${imgPath}`;
                                        return (
                                            <TouchableOpacity key={index} onPress={() => setLightboxUri(uri)} activeOpacity={0.85}>
                                                <Image
                                                    source={{ uri }}
                                                    style={styles.customRefImage}
                                                    resizeMode="cover"
                                                />
                                                <View style={styles.zoomHint}>
                                                    <Ionicons name="expand-outline" size={14} color="#fff" />
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </>
                        ) : (
                            <View style={styles.noImagePlaceholder}>
                                <Ionicons name="image-outline" size={36} color="#ccc" />
                                <Text style={styles.noImageText}>No design reference images attached</Text>
                            </View>
                        )}
                    </>
                )}

                {/* Seller Quote / Negotiation Card — always visible once a quote exists */}
                {request.quoted_price > 0 && (

                    <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#8D6E63' }]}>
                        <Text style={{ fontSize: 13, color: '#8D6E63', fontWeight: '700', marginBottom: 8 }}>
                            {request.status === 'negotiating' ? `💬 Seller's Price Quote`
                            : request.status === 'pending' ? `📋 Initial Quote`
                            : `✅ Agreed Price`}
                        </Text>
                        <View style={styles.row}>
                            <Text style={styles.label}>Quoted Price</Text>
                            <Text style={[styles.value, { color: '#4CAF50', fontWeight: 'bold', fontSize: 16 }]}>
                                ₱{parseFloat(request.quoted_price || 0).toLocaleString('en-PH')}
                            </Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>50% Downpayment</Text>
                            <Text style={[styles.value, { color: '#795548', fontWeight: '600' }]}>
                                ₱{(parseFloat(request.quoted_price || 0) * 0.5).toLocaleString('en-PH')}
                            </Text>
                        </View>
                        {request.fragility_level && request.fragility_level !== 'none' && (
                            <View style={styles.row}>
                                <Text style={styles.label}>Fragility</Text>
                                <Text style={styles.value}>
                                    {request.fragility_level === 'low' ? '🟡' : request.fragility_level === 'medium' ? '🟠' : '🔴'} {request.fragility_level.charAt(0).toUpperCase() + request.fragility_level.slice(1)}
                                </Text>
                            </View>
                        )}
                        {request.service_type === 'Installation' && request.installation_complexity && (
                            <View style={styles.row}>
                                <Text style={styles.label}>Install Complexity</Text>
                                <Text style={styles.value}>{request.installation_complexity}</Text>
                            </View>
                        )}
                        {request.negotiation_notes ? (
                            <>
                                <View style={styles.divider} />
                                <Text style={[styles.label, { marginBottom: 4 }]}>Seller Note</Text>
                                <Text style={{ fontSize: 13, color: '#555', lineHeight: 20 }}>{request.negotiation_notes}</Text>
                            </>
                        ) : null}
                    </View>
                )}

                {/* Details Card (shared by both types) */}
                <Text style={styles.sectionTitle}>Request Details</Text>
                <View style={styles.card}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Service Type</Text>
                        <Text style={styles.value}>{request.service_type || 'Delivery'}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                        <Text style={styles.label}>Budget</Text>
                        <Text style={[styles.value, { color: '#4CAF50', fontWeight: 'bold' }]}>
                            {request.budget ? `₱${parseFloat(request.budget).toLocaleString('en-PH')}` : 'Not specified'}
                        </Text>
                    </View>
                    {/* Customer-submitted fragility level */}
                    {request.fragility_level && request.fragility_level !== 'none' && (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <Text style={styles.label}>Fragility Level</Text>
                                <Text style={styles.value}>
                                    {request.fragility_level === 'low' ? '🟡 Low (+₱100)'
                                        : request.fragility_level === 'medium' ? '🟠 Medium (+₱300)'
                                        : '🔴 High (+₱500)'}
                                </Text>
                            </View>
                        </>
                    )}
                    {/* Customer-submitted installation complexity + fee estimate */}
                    {request.service_type === 'Installation' && request.installation_complexity && (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <Text style={styles.label}>Install Complexity</Text>
                                <Text style={styles.value}>
                                    {request.installation_complexity === 'basic' ? '🔧 Basic'
                                        : request.installation_complexity === 'complex' ? '🏗️ Complex'
                                        : '⚙️ Standard'}
                                </Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <Text style={styles.label}>Est. Install Fee</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Ionicons name="construct-outline" size={13} color="#e65100" />
                                    <Text style={[styles.value, { color: '#e65100', fontWeight: '700' }]}>
                                        {getInstallationTier(request.installation_complexity).label}
                                    </Text>
                                </View>
                            </View>
                        </>
                    )}
                    <View style={styles.divider} />
                    <Text style={styles.label}>Description</Text>
                    <Text style={styles.description}>{request.details}</Text>
                </View>
            </ScrollView>

            {/* Bottom Actions */}
            <View style={styles.footer}>
                {userType === 'seller' && (request.status === 'pending' || request.status === 'negotiating' || request.status === 'in_progress') && (
                    <View style={styles.actionRow}>
                        {(request.status === 'pending' || request.status === 'negotiating') && (
                            <>
                                <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleStatusUpdate('rejected')}>
                                    <Text style={styles.actionBtnText}>Reject</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => setQuoteModal(true)}>
                                    <Text style={styles.actionBtnText}>{request.status === 'negotiating' ? 'Revise Quote' : 'Send Quote'}</Text>
                                </TouchableOpacity>
                            </>
                        )}
                        {request.status === 'in_progress' && (
                            <TouchableOpacity style={[styles.actionBtn, styles.completeBtn]} onPress={() => handleStatusUpdate('ready')}>
                                <Text style={styles.actionBtnText}>Mark Ready for Delivery</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Buyer Checkout Actions */}
                {userType === 'buyer' && (request.status === 'negotiating') && (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.actionBtn, styles.acceptBtn]}
                            onPress={() => handleStatusUpdate('accepted')}
                        >
                            <Text style={styles.actionBtnText}>
                                ✅ Accept Quote (₱{parseFloat(request.quoted_price || 0).toLocaleString('en-PH')})
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
                {userType === 'buyer' && (request.status === 'accepted' || request.status === 'ready') && (
                    <View style={styles.actionRow}>
                        {request.status === 'accepted' && (
                            <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn, { padding: 18 }]} onPress={() => proceedToCheckout('downpayment')}>
                                <Text style={styles.actionBtnText}>Pay 50% Downpayment (₱{(parseFloat(request.quoted_price || request.budget || 0) * 0.5).toLocaleString('en-PH')})</Text>
                            </TouchableOpacity>
                        )}
                        {request.status === 'ready' && (
                            <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn, { padding: 18 }]} onPress={() => proceedToCheckout('final_balance')}>
                                <Text style={styles.actionBtnText}>Pay Final Balance (₱{(parseFloat(request.quoted_price || request.budget || 0) * 0.5).toLocaleString('en-PH')})</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {!(userType === 'seller' && (request.status === 'completed' || request.status === 'ready')) && (
                    <TouchableOpacity style={[styles.chatBtn]} onPress={handleChat}>
                        <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
                        <Text style={styles.chatBtnText}>Chat with {userType === 'seller' ? 'Customer' : 'Seller'}</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Lightbox — full-screen image viewer ───────────────────── */}
            <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
                <View style={styles.lightboxOverlay}>
                    <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxUri(null)}>
                        <Ionicons name="close-circle" size={36} color="#fff" />
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

            {/* ── Quote Sheet Modal (Seller) ─────────────────────────────── */}
            <Modal visible={quoteModal} transparent animationType="slide" onRequestClose={() => setQuoteModal(false)}>
                <KeyboardAwareWrapper style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} activeOpacity={1} onPress={() => setQuoteModal(false)} />
                    <View style={styles.quoteSheet}>
                        <Text style={styles.quoteSheetTitle}>💬 Send a Price Quote</Text>

                        <Text style={styles.quoteLabel}>Final Price (₱)</Text>
                        <TextInput
                            style={styles.quoteInput}
                            placeholder="e.g. 8500"
                            keyboardType="numeric"
                            value={quotePrice}
                            onChangeText={setQuotePrice}
                        />

                        <Text style={styles.quoteLabel}>Fragility Level</Text>
                        <View style={styles.quoteChipRow}>
                            {[
                                { key: 'none', label: '⚪ None' },
                                { key: 'low',  label: '🟡 Low' },
                                { key: 'medium', label: '🟠 Med' },
                                { key: 'high', label: '🔴 High' },
                            ].map(({ key, label }) => (
                                <TouchableOpacity key={key} style={[styles.quoteChip, quoteFragility === key && styles.quoteChipActive]} onPress={() => setQuoteFragility(key)}>
                                    <Text style={[styles.quoteChipText, quoteFragility === key && { color: '#fff' }]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {request?.service_type === 'Installation' && (
                            <>
                                <Text style={styles.quoteLabel}>Installation Complexity</Text>
                                <View style={styles.quoteChipRow}>
                                    {[
                                        { key: 'basic',    label: '🔧 Basic' },
                                        { key: 'standard', label: '⚙️ Standard' },
                                        { key: 'complex',  label: '🏗️ Complex' },
                                    ].map(({ key, label }) => (
                                        <TouchableOpacity key={key} style={[styles.quoteChip, quoteComplexity === key && styles.quoteChipActive]} onPress={() => setQuoteComplexity(key)}>
                                            <Text style={[styles.quoteChipText, quoteComplexity === key && { color: '#fff' }]}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}

                        <Text style={styles.quoteLabel}>Note to Customer (optional)</Text>
                        <TextInput
                            style={[styles.quoteInput, { height: 80, textAlignVertical: 'top' }]}
                            placeholder="e.g. Price includes custom glass panel..."
                            value={quoteNotes}
                            onChangeText={setQuoteNotes}
                            multiline
                        />

                        <TouchableOpacity
                            style={[
                                styles.actionBtn,
                                styles.acceptBtn,
                                { marginTop: 12, flex: 0, alignSelf: 'stretch', paddingVertical: 15 }
                            ]}
                            onPress={handleSendQuote}
                            disabled={quoteSending}
                        >
                            {quoteSending
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.actionBtnText}>Send Quote</Text>
                            }
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.actionBtn,
                                { backgroundColor: '#eee', marginTop: 8, flex: 0, alignSelf: 'stretch', paddingVertical: 15 }
                            ]}
                            onPress={() => setQuoteModal(false)}
                        >
                            <Text style={[styles.actionBtnText, { color: '#555' }]}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAwareWrapper>
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
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3e2723' },
    backBtn: { padding: 4 },
    content: { padding: 16, paddingBottom: 280 },
    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        gap: 8,
    },
    statusBannerText: { color: '#fff', fontWeight: 'bold', fontSize: 16, letterSpacing: 0.5 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#3e2723', marginBottom: 10, marginTop: 10 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    label: { color: '#888', fontSize: 14 },
    value: { color: '#333', fontSize: 14, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
    divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 12 },
    description: { color: '#444', fontSize: 14, lineHeight: 22, marginTop: 4 },
    productCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#eee',
    },
    productImage: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#eee' },
    productInfo: { marginLeft: 12, flex: 1 },
    productTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
    productSubtitle: { fontSize: 13, color: '#888' },
    // Fully Custom Request Styles
    customBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f5f2',
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e8e0d8',
        justifyContent: 'center',
        gap: 8,
    },
    customBannerText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#8D6E63',
    },
    customImageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 20,
    },
    customRefImage: {
        width: (width - 32 - 10) / 2,
        height: 150,
        borderRadius: 12,
        backgroundColor: '#eee',
    },
    noImagePlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
        backgroundColor: '#fafafa',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#eee',
        borderStyle: 'dashed',
        marginBottom: 20,
    },
    noImageText: {
        fontSize: 14,
        color: '#999',
        marginTop: 10,
    },
    imageScroll: { marginBottom: 20 },
    refImage: { width: 100, height: 100, borderRadius: 8, marginRight: 10, backgroundColor: '#eee' },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        elevation: 10,
    },
    actionRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    actionBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    acceptBtn: { backgroundColor: '#4CAF50' },
    rejectBtn: { backgroundColor: '#F44336' },
    completeBtn: { backgroundColor: '#8D6E63' },
    actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    chatBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 10,
        backgroundColor: '#8D6E63',
        gap: 8,
    },
    chatBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    // Quote Sheet Modal
    quoteSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: 36,
    },
    quoteSheetTitle: { fontSize: 18, fontWeight: '700', color: '#3e2723', marginBottom: 16 },
    quoteLabel: { fontSize: 13, color: '#666', fontWeight: '600', marginBottom: 6, marginTop: 12 },
    quoteInput: {
        borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
        padding: 12, fontSize: 15, backgroundColor: '#fafafa', color: '#333',
    },
    quoteChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    quoteChip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
        borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f5f5f5',
    },
    quoteChipActive: { backgroundColor: '#8D6E63', borderColor: '#8D6E63' },
    quoteChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
    // Lightbox
    lightboxOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.93)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    lightboxImage: {
        width: '100%',
        height: '85%',
    },
    lightboxClose: {
        position: 'absolute',
        top: 50,
        right: 16,
        zIndex: 10,
    },
    // Zoom hint badge on image thumbnails
    zoomHint: {
        position: 'absolute',
        bottom: 6,
        right: 6,
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderRadius: 6,
        padding: 3,
    },
});

export default RequestDetailScreen;