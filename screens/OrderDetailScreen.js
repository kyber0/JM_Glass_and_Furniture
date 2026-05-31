import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, Alert, TextInput } from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ordersAPI, shopAPI, paymentVerificationsAPI, workersAPI, BASE_URL } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import EDDBanner from '../components/EDDBanner';


const OrderDetailScreen = ({ route, navigation }) => {
    const { order, userType = 'buyer' } = route.params;
    const { user } = useAuth();
    const [status, setStatus] = useState(order.status);
    const [updating, setUpdating] = useState(false);

    // Payment verification state
    const [paymentInfo, setPaymentInfo] = useState(null);
    const [proofModalVisible, setProofModalVisible] = useState(false);
    const [uploadingProof, setUploadingProof] = useState(false);
    const [rejectModalVisible, setRejectModalVisible] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    // QR code state (buyer view)
    const [qrToken, setQrToken] = useState(null);
    const [qrLoading, setQrLoading] = useState(false);
    const [qrError, setQrError] = useState(null);

    // Live order data — updated via socket when worker scans QR
    const [liveOrder, setLiveOrder] = useState(order);

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

    const isSeller = userType === 'seller';

    // Fetch payment info + QR token when relevant
    useEffect(() => {
        loadPaymentInfo();
        if (!isSeller && ['processing', 'shipped'].includes(status)) {
            loadQRToken();
        }
    }, [status]);

    // 🟢 Real-time Socket Listener
    const { socket } = useSocket();
    useEffect(() => {
        if (!socket) return;
        const handleOrderUpdate = async () => {
            loadPaymentInfo();
            // Re-fetch the full order to get latest status, worker info, points earned
            try {
                const res = await ordersAPI.getUserOrders(user.id);
                if (res?.success) {
                    const fresh = (res.data || []).find(o => o.order_id === order.order_id);
                    if (fresh) {
                        setLiveOrder(fresh);
                        setStatus(fresh.status);
                        if (!isSeller && ['processing', 'shipped'].includes(fresh.status)) {
                            loadQRToken();
                        }
                    }
                }
            } catch (_) {}
        };
        socket.on('order:update', handleOrderUpdate);
        return () => socket.off('order:update', handleOrderUpdate);
    }, [socket, status, isSeller]);

    const loadQRToken = async () => {
        setQrLoading(true);
        setQrError(null);
        try {
            const res = await workersAPI.getOrderQRToken(order.order_id);
            if (res?.success) setQrToken(res.token);
            else setQrError(res?.message || 'Could not load QR');
        } catch (e) {
            setQrError('Could not load QR code');
        } finally {
            setQrLoading(false);
        }
    };

    const loadPaymentInfo = async () => {
        try {
            const res = await paymentVerificationsAPI.getOrderPaymentInfo(order.order_id);
            if (res.success) setPaymentInfo(res.data);
        } catch (_) {}
    };

    // Helper to format currency
    const formatPrice = (price) => {
        if (typeof price === 'number') return `₱${price.toLocaleString()}`;
        const num = parseFloat(price);
        return isNaN(num) ? price : `₱${num.toLocaleString()}`;
    };

    // Exact items subtotal = sum of base_price * qty per item
    // base_price is the product price WITHOUT installation fee (stored since the DB migration)
    // Fallback for legacy orders: subtract installation_fee from price_at_purchase
    const calculateSubtotal = () => {
        return (order.items || []).reduce((sum, item) => {
            const base = typeof item.base_price === 'number' && item.base_price > 0
                ? item.base_price
                : Math.max(0, parseFloat(item.price_at_purchase || item.price || 0) - parseFloat(item.installation_fee || 0));
            return sum + base * item.quantity;
        }, 0);
    };

    // Exact installation total = sum of installation_fee * qty per item
    const calculateInstallTotal = () => {
        return (order.items || []).reduce((sum, item) => {
            return sum + parseFloat(item.installation_fee || 0) * item.quantity;
        }, 0);
    };

    const subtotal = calculateSubtotal();
    // Assuming flat delivery fee logic if it applies, or just rely on total
    const deliveryFee = order.total_amount > subtotal ? order.total_amount - subtotal : 0;
    // For simplicity, we can also just show the stored total amount

    const handleUpdateStatus = async (newStatus) => {
        setUpdating(true);
        try {
            const response = await shopAPI.updateOrderStatus(order.order_id, newStatus);
            if (response.success) {
                setStatus(newStatus);
                setTimeout(() => showAlert('Success', `Order marked as ${newStatus}`, 'success'), 500);

            } else {
                setTimeout(() => showAlert('Error', response.message, 'error'), 500);
            }
        } catch (error) {
            setTimeout(() => showAlert('Error', 'Failed to update order status', 'error'), 500);
        } finally {
            setUpdating(false);
        }
    };


    // Extract service info from selected_variant string
    // Format: "Size - Color - ServiceType - InstallationTier"
    const parseVariant = (variant = '') => {
        const parts = variant.split(' - ').map(p => p.trim());
        const serviceIdx = parts.findIndex(p =>
            p.toLowerCase() === 'delivery' ||
            p.toLowerCase() === 'installation'
        );
        return {
            specs: serviceIdx > 0 ? parts.slice(0, serviceIdx).join(' · ') : parts.join(' · '),
            serviceType: serviceIdx >= 0 ? parts[serviceIdx] : null,
            installationTier: serviceIdx >= 0 && parts[serviceIdx + 1] ? parts[serviceIdx + 1] : null,
        };
    };

    // Parse vehicle info from shipping address string
    // Format: "Name, Phone, Address | Vehicle: VehicleName"
    let addressDisplay = order.shipping_address || 'No address provided';
    let vehicleDisplay = null;

    if (order.shipping_address?.includes(' | Vehicle: ')) {
        const [addrPart, vehiclePart] = order.shipping_address.split(' | Vehicle: ');
        addressDisplay = addrPart;
        vehicleDisplay = vehiclePart; // e.g. "Truck"
    } else if (order.shipping_address?.includes(' | Delivery: ')) {
        // Legacy format: "Address | Delivery: Truck (₱800)"
        const [addrPart, delivPart] = order.shipping_address.split(' | Delivery: ');
        addressDisplay = addrPart;
        vehicleDisplay = delivPart;
    }

    // Exact fee resolution from DB columns
    const itemsTotal   = calculateSubtotal();
    const installTotal = calculateInstallTotal();
    const deliveryFeeExact = parseFloat(order.delivery_fee || 0);
    const hasInstallation  = installTotal > 0 || order.items?.some(i => i.selected_variant?.toLowerCase().includes('installation'));
    const hasInstallItems  = order.items?.filter(i => i.selected_variant?.toLowerCase().includes('installation')) || [];

    const confirmStatusChange = (nextStatus) => {
        showAlert(
            'Confirm Update',
            `Change order status to ${nextStatus}?`,
            'info',
            true,
            () => handleUpdateStatus(nextStatus),
            'Confirm',
            'Cancel'
        );
    };

    // Phase 7.4: Professional E-Receipt Generation
    const handleDownloadReceipt = async () => {
        try {
            const dateStr = new Date(order.created_at).toLocaleString();
            let itemsHtml = '';
            order.items.forEach(item => {
                const priceNum = typeof item.price === 'number' ? item.price : parseFloat((item.price || '0').toString().replace(/[^0-9.]/g, ''));
                itemsHtml += `
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">
                            <strong>${item.title || 'Product'}</strong><br/>
                            <small style="color: #666;">${item.selected_variant || ''}</small>
                        </td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">PHP ${priceNum.toLocaleString()}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">PHP ${(priceNum * item.quantity).toLocaleString()}</td>
                    </tr>
                `;
            });

            const html = `
                <html>
                <head>
                    <style>
                        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 40px; }
                        .header { text-align: center; margin-bottom: 40px; }
                        .header h1 { color: #8D6E63; margin: 0; font-size: 28px; }
                        .header p { margin: 5px 0; color: #666; }
                        .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
                        .invoice-details div { flex: 1; }
                        .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                        .table th { padding: 10px; background-color: #f8f9fa; border-bottom: 2px solid #ddd; text-align: left; }
                        .table th.right { text-align: right; }
                        .table th.center { text-align: center; }
                        .summary { float: right; width: 300px; }
                        .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                        .summary-row.total { font-size: 18px; font-weight: bold; border-bottom: none; border-top: 2px solid #333; position: relative; top: 1px; }
                        .footer { margin-top: 80px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>JM Glass & Furniture</h1>
                        <p>Official E-Receipt</p>
                    </div>
                    
                    <div class="invoice-details">
                        <div>
                            <strong>Billed To:</strong><br/>
                            ${order.buyer_name || 'Customer'}<br/>
                            ${order.shipping_address || 'Address not registered'}
                        </div>
                        <div style="text-align: right;">
                            <strong>Order Number:</strong> #JM-${order.order_id}<br/>
                            <strong>Date:</strong> ${dateStr}<br/>
                            <strong>Payment Method:</strong> ${order.payment_method || 'N/A'}<br/>
                            <strong>Status:</strong> ${status.toUpperCase()}
                        </div>
                    </div>

                    <table class="table">
                        <thead>
                            <tr>
                                <th>Item Description</th>
                                <th class="center">Qty</th>
                                <th class="right">Unit Price</th>
                                <th class="right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>

                    <div class="summary">
                        <div class="summary-row">
                            <span>Subtotal:</span>
                            <span>PHP ${calculateSubtotal().toLocaleString()}</span>
                        </div>
                        <div class="summary-row">
                            <span>Delivery Fee:</span>
                            <span>PHP ${Math.max(0, order.total_amount - calculateSubtotal()).toLocaleString()}</span>
                        </div>
                        <div class="summary-row total">
                            <span>Total Paid:</span>
                            <span style="color: #8D6E63;">PHP ${parseFloat(order.total_amount || 0).toLocaleString()}</span>
                        </div>
                    </div>
                    
                    <div style="clear: both;"></div>

                    <div class="footer">
                        <p>Thank you for shopping with JM Glass & Furniture.</p>
                        <p>This is a system-generated e-receipt and does not require a physical signature.</p>
                    </div>
                </body>
                </html>
            `;

            const { uri } = await Print.printToFileAsync({ html });

            // Share or Download
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
            } else {
                showAlert('Saved', 'PDF Receipt generated successfully, but sharing is not available on this device.', 'success');
            }
        } catch (error) {
            console.error('Error generating PDF:', error);
            showAlert('Error', 'Failed to generate receipt.', 'error');
        }
    };

    const handleCancelOrder = async () => {
        showAlert(
            'Cancel Order',
            'Are you sure you want to cancel this order?',
            'warning',
            true,
            async () => {
                setUpdating(true);
                try {
                    const response = await ordersAPI.cancelOrder(order.order_id);
                    if (response.success) {
                        setStatus('cancelled');
                        setTimeout(() => showAlert('Success', 'Order cancelled successfully', 'success'), 500);

                    } else {
                        setTimeout(() => showAlert('Error', response.message, 'error'), 500);
                    }
                } catch (error) {
                    setTimeout(() => showAlert('Error', 'Failed to cancel order', 'error'), 500);
                } finally {
                    setUpdating(false);
                }
            },
            'Yes',
            'No'
        );
    };

    const getStatusColor = (s) => {
        switch (s) {
            case 'pending': return '#FF9800';
            case 'processing': return '#2196F3';
            case 'shipped': return '#9C27B0';
            case 'delivered': return '#4CAF50';
            case 'cancelled': return '#F44336';
            default: return '#757575';
        }
    };

    // ── Payment helpers ──────────────────────────────────────────────────────
    const isCOD = (order.payment_method || '').toLowerCase().includes('cash') ||
                  (order.payment_method || '').toLowerCase() === 'cod';

    const paymentStatus = paymentInfo?.payment_status || order.payment_status || 'unpaid';

    const handleUploadProof = async () => {
        const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm !== 'granted') {
            showAlert('Permission Needed', 'Please allow photo library access to upload payment proof.', 'warning');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
        });
        if (result.canceled || !result.assets?.length) return;

        setUploadingProof(true);
        try {
            const asset = result.assets[0];
            const formData = new FormData();
            formData.append('order_id', String(order.order_id));
            formData.append('proof', {
                uri: asset.uri,
                name: `proof_${order.order_id}.jpg`,
                type: 'image/jpeg',
            });
            const res = await paymentVerificationsAPI.submitProof(formData);
            if (res.success) {
                showAlert('✅ Proof Submitted', 'Your payment proof has been submitted. The seller will verify it shortly.', 'success');
                loadPaymentInfo();
            } else {
                showAlert('Error', res.message || 'Failed to submit proof', 'error');
            }
        } catch (err) {
            showAlert('Error', 'Failed to upload payment proof', 'error');
        } finally {
            setUploadingProof(false);
        }
    };

    const handleConfirmCashPaid = () => {
        showAlert(
            'Confirm Cash Payment',
            `Confirm that you paid ₱${parseFloat(order.total_amount).toLocaleString()} in cash to the seller/rider?`,
            'info', true,
            async () => {
                try {
                    const res = await paymentVerificationsAPI.confirmCash(order.order_id, user.id);
                    if (res.success) {
                        showAlert('✅ Confirmed!', 'Cash payment confirmed.', 'success');
                        loadPaymentInfo();
                    }
                } catch (_) {
                    showAlert('Error', 'Could not confirm payment', 'error');
                }
            },
            'Yes, I Have Paid', 'Cancel'
        );
    };

    const handleSellerVerify = () => {
        showAlert(
            'Verify Payment',
            'Confirm that you have received the payment for this order?',
            'info', true,
            async () => {
                try {
                    const res = await paymentVerificationsAPI.verify(order.order_id, user.id);
                    if (res.success) {
                        showAlert('✅ Payment Verified!', 'Payment has been marked as verified.', 'success');
                        loadPaymentInfo();
                    }
                } catch (_) {
                    showAlert('Error', 'Could not verify payment', 'error');
                }
            },
            'Confirm', 'Cancel'
        );
    };

    const handleSellerReject = async () => {
        if (!rejectReason.trim()) {
            Alert.alert('Required', 'Please enter a reason for rejection.');
            return;
        }
        try {
            const res = await paymentVerificationsAPI.reject(order.order_id, rejectReason);
            if (res.success) {
                setRejectModalVisible(false);
                setRejectReason('');
                showAlert('Rejected', 'Payment proof has been rejected. The buyer has been notified.', 'info');
                loadPaymentInfo();
            }
        } catch (_) {
            showAlert('Error', 'Could not reject payment proof', 'error');
        }
    };

    // Payment banner removed — system is COD only; payment collected in person by worker.
    const renderPaymentStatusBanner = () => null;


    const renderActionButtons = () => {
        if (updating) return <ActivityIndicator size="small" color="#8D6E63" />;

        if (isSeller) {
            if (status === 'pending') {
                return (
                    <TouchableOpacity style={styles.actionButton} onPress={() => confirmStatusChange('processing')}>
                        <Text style={styles.actionText}>Process Order</Text>
                    </TouchableOpacity>
                );
            }
            if (status === 'processing') {
                return (
                    <TouchableOpacity style={styles.actionButton} onPress={() => confirmStatusChange('shipped')}>
                        <Text style={styles.actionText}>Mark as Shipped</Text>
                    </TouchableOpacity>
                );
            }
            // Seller: after shipped, field worker handles delivery via QR
            if (status === 'shipped') {
                return (
                    <View style={styles.workerInfoBanner}>
                        <Ionicons name="qr-code-outline" size={20} color="#5D4037" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.workerInfoTitle}>Awaiting Field Worker Confirmation</Text>
                            <Text style={styles.workerInfoSub}>
                                {order.delivery_man_name
                                    ? `Courier ${order.delivery_man_name} will scan the customer's QR to confirm delivery.`
                                    : 'The assigned courier will scan the customer\'s QR to confirm delivery.'}
                            </Text>
                        </View>
                    </View>
                );
            }
            // Seller: COD — worker collects payment on delivery, no online verification needed
            if (status === 'delivered') {
                return (
                    <View style={styles.workerInfoBanner}>
                        <Ionicons name="cash-outline" size={20} color="#2E7D32" />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.workerInfoTitle, { color: '#2E7D32' }]}>COD — Cash Collected on Delivery</Text>
                            <Text style={styles.workerInfoSub}>
                                Payment is collected in person by the field worker upon delivery.
                            </Text>
                        </View>
                    </View>
                );
            }
        } else {
            // Buyer Actions
            if (status === 'pending') {
                return (
                    <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleCancelOrder}>
                        <Text style={styles.actionText}>Cancel Order</Text>
                    </TouchableOpacity>
                );
            }
            if (status === 'delivered') {
                return (
                    <View style={styles.workerInfoBanner}>
                        <Ionicons name="qr-code-outline" size={20} color="#1565C0" />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.workerInfoTitle, { color: '#1565C0' }]}>Almost Done!</Text>
                            <Text style={styles.workerInfoSub}>
                                The worker will scan your QR code to confirm delivery and complete the order.
                            </Text>
                        </View>
                    </View>
                );
            }
            if (status === 'completed') {
                const workerName   = liveOrder.handyman_name || liveOrder.delivery_man_name || null;
                const workerRole   = liveOrder.handyman_name ? 'Handyman' : liveOrder.delivery_man_name ? 'Delivery Man' : null;
                const ptsEarned    = liveOrder.points_earned > 0 ? liveOrder.points_earned : null;
                const completedAt  = liveOrder.completed_at
                    ? new Date(liveOrder.completed_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : null;
                return (
                    <View style={styles.completionCard}>
                        {/* Header */}
                        <View style={styles.completionHeader}>
                            <Ionicons name="checkmark-done-circle" size={40} color="#2E7D32" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.completionTitle}>Order Completed!</Text>
                                <Text style={styles.completionOrderId}>#{`JM-${liveOrder.order_id}`}</Text>
                            </View>
                        </View>
                        {/* Timestamp */}
                        {completedAt && (
                            <View style={styles.completionRow}>
                                <Ionicons name="time-outline" size={16} color="#555" />
                                <Text style={styles.completionRowText}>{completedAt}</Text>
                            </View>
                        )}
                        {/* Worker */}
                        {workerName && (
                            <View style={styles.completionRow}>
                                <Ionicons name={workerRole === 'Handyman' ? 'construct-outline' : 'car-outline'} size={16} color="#555" />
                                <Text style={styles.completionRowText}>
                                    Completed by <Text style={{ fontWeight: '800' }}>{workerName}</Text>{` (${workerRole})`}
                                </Text>
                            </View>
                        )}
                        {/* Points earned */}
                        {ptsEarned && (
                            <View style={[styles.completionRow, styles.pointsBadge]}>
                                <Ionicons name="trophy" size={15} color="#FF9800" />
                                <Text style={styles.pointsBadgeText}>+{ptsEarned} loyalty points earned!</Text>
                            </View>
                        )}
                        {/* Actions */}
                        <View style={styles.completionActions}>
                            <TouchableOpacity
                                style={[styles.completionBtn, { backgroundColor: '#5D4037' }]}
                                onPress={handleDownloadReceipt}
                            >
                                <Ionicons name="document-text-outline" size={17} color="#fff" />
                                <Text style={styles.completionBtnText}>E-Receipt</Text>
                            </TouchableOpacity>
                            {liveOrder.review_count === 0 && (
                                <TouchableOpacity
                                    style={[styles.completionBtn, { backgroundColor: '#1565C0' }]}
                                    onPress={() => navigation.navigate('RateProduct', { order: liveOrder })}
                                >
                                    <Ionicons name="star-outline" size={17} color="#fff" />
                                    <Text style={styles.completionBtnText}>Rate Order</Text>
                                </TouchableOpacity>
                            )}
                            {!liveOrder.has_dispute && (
                                <TouchableOpacity
                                    style={[styles.completionBtn, { backgroundColor: '#B71C1C' }]}
                                    onPress={() => navigation.navigate('FileDispute', { order: liveOrder })}
                                >
                                    <Ionicons name="alert-circle-outline" size={17} color="#fff" />
                                    <Text style={styles.completionBtnText}>File Dispute</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                );
            }
        }
        return null;
    };


    const STEPS = [
        {
            key: 'pending',
            title: 'Order Placed',
            sellerTitle: 'Order Received',
            icon: 'receipt-outline',
            sub: 'Awaiting seller confirmation',
            sellerSub: 'New order in your queue',
            tsKey: null,
        },
        {
            key: 'processing',
            title: 'Preparing',
            sellerTitle: 'Processing',
            icon: 'construct-outline',
            sub: 'Your items are being prepared',
            sellerSub: 'Items prepared for dispatch',
            tsKey: 'processed_at',
        },
        {
            key: 'shipped',
            title: 'In Transit',
            sellerTitle: 'Out for Delivery',
            icon: 'car-outline',
            sub: 'Your order is on the way',
            sellerSub: 'Courier dispatched',
            tsKey: 'shipped_at',
        },
        {
            key: 'delivered',
            title: 'Arrived',
            sellerTitle: 'Delivered',
            icon: 'home-outline',
            sub: 'Package arrived — please confirm',
            sellerSub: 'Awaiting buyer confirmation',
            tsKey: 'delivered_at',
        },
        {
            key: 'completed',
            title: 'Completed',
            sellerTitle: 'Completed',
            icon: 'checkmark-circle-outline',
            sub: 'Thank you for your order!',
            sellerSub: 'Order closed successfully',
            tsKey: 'completed_at',
        },
    ];

    const getStepIndex = (s) => {
        if (s === 'cancelled') return -1;
        const index = STEPS.findIndex(step => step.key === s);
        return index >= 0 ? index : 0;
    };

    const fmtTs = (ts) => {
        if (!ts) return null;
        const d = new Date(ts);
        return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const renderTrackingStepper = () => {
        if (status === 'cancelled') {
            return (
                <View style={styles.cancelledContainer}>
                    <View style={styles.cancelledIconWrap}>
                        <Ionicons name="close-circle" size={44} color="#F44336" />
                    </View>
                    <Text style={styles.cancelledTitle}>Order Cancelled</Text>
                    <Text style={styles.cancelledSub}>This order has been cancelled and will not be fulfilled.</Text>
                </View>
            );
        }

        const currentIndex = getStepIndex(status);

        return (
            <View style={styles.trackingContainer}>
                <View style={styles.trackingHeader}>
                    <Text style={styles.sectionTitle}>{isSeller ? 'Order Progress' : 'Track Your Order'}</Text>
                    {!isSeller && status !== 'completed' && (
                        <View style={styles.liveBadge}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>Live</Text>
                        </View>
                    )}
                </View>

                <View style={styles.stepperWrapper}>
                    {STEPS.map((step, index) => {
                        const isCompleted = index < currentIndex;
                        const isCurrent   = index === currentIndex;
                        const isLast      = index === STEPS.length - 1;
                        const isActive    = isCompleted || isCurrent;
                        const ts          = fmtTs(order[step.tsKey]);

                        // Worker context lines
                        let workerLine = null;
                        if (isSeller) {
                            if (step.key === 'processing' && order.handyman_name && isActive) {
                                workerLine = { icon: 'construct-outline', label: `Installer: ${order.handyman_name}`, color: '#6D4C41' };
                            }
                            if (step.key === 'shipped' && order.delivery_man_name && isActive) {
                                workerLine = { icon: 'person-outline', label: `Courier: ${order.delivery_man_name}`, color: '#1565C0' };
                            }
                        } else {
                            if (step.key === 'shipped' && order.delivery_man_name && isActive) {
                                workerLine = { icon: 'person-outline', label: `Courier: ${order.delivery_man_name}`, color: '#1565C0' };
                            }
                        }

                        return (
                            <View key={step.key} style={styles.stepItem}>
                                {/* Left column: circle + line */}
                                <View style={styles.stepIndicator}>
                                    <View style={[
                                        styles.stepCircle,
                                        isCompleted ? styles.stepCircleDone
                                            : isCurrent ? styles.stepCircleCurrent
                                            : styles.stepCircleInactive,
                                    ]}>
                                        {isCompleted
                                            ? <Ionicons name="checkmark" size={14} color="#fff" />
                                            : <Ionicons name={step.icon} size={14} color={isCurrent ? '#fff' : '#bbb'} />
                                        }
                                    </View>
                                    {!isLast && (
                                        <View style={[
                                            styles.stepLine,
                                            isCompleted ? styles.stepLineActive : styles.stepLineInactive,
                                        ]} />
                                    )}
                                </View>

                                {/* Right column: text */}
                                <View style={styles.stepContent}>
                                    <View style={styles.stepTitleRow}>
                                        <Text style={[
                                            styles.stepTitle,
                                            isCurrent  ? styles.stepTitleCurrent
                                                : isCompleted ? styles.stepTitleCompleted
                                                : styles.stepTitleInactive,
                                        ]}>
                                            {isSeller ? step.sellerTitle : step.title}
                                        </Text>
                                        {ts && isActive && (
                                            <Text style={styles.stepTs}>{index === 0 ? fmtTs(order.created_at) : ts}</Text>
                                        )}
                                        {!ts && index === 0 && (
                                            <Text style={styles.stepTs}>{fmtTs(order.created_at)}</Text>
                                        )}
                                    </View>

                                    {isActive && (
                                        <Text style={[styles.stepSub, !isCurrent && { opacity: 0.55 }]}>
                                            {isSeller ? step.sellerSub : step.sub}
                                        </Text>
                                    )}

                                    {workerLine && (
                                        <View style={styles.stepWorkerRow}>
                                            <Ionicons name={workerLine.icon} size={11} color={workerLine.color} />
                                            <Text style={[styles.stepWorkerText, { color: workerLine.color }]}>
                                                {workerLine.label}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#3e2723" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Order Details</Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAwareWrapper>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {/* ── Estimated Delivery Banner ── */}
                {order.estimated_delivery_date && !['completed','cancelled'].includes(order.status) && (
                    <EDDBanner
                        eddMin={order.estimated_delivery_date}
                        delayed={!!order.edd_extended}
                        style={{ marginBottom: 4 }}
                    />
                )}

                {/* Order Status Header */}
                <View style={[styles.section, { paddingBottom: 12 }]}>
                    <View style={styles.rowBetween}>
                        <Text style={styles.label}>Order ID</Text>
                        <Text style={styles.value}>#{order.order_id}</Text>
                    </View>
                    <View style={styles.rowBetween}>
                        <Text style={styles.label}>Date Placed</Text>
                        <Text style={styles.value}>{new Date(order.created_at).toLocaleString()}</Text>
                    </View>
                </View>

                {/* Real-time Tracking Stepper */}
                {renderTrackingStepper()}

                {/* Buyer QR Code — shown to field worker for confirmation */}
                {!isSeller && ['processing', 'shipped'].includes(status) && (
                    <View style={styles.qrSection}>
                        <View style={styles.qrHeader}>
                            <Ionicons name="qr-code-outline" size={22} color="#5D4037" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.qrTitle}>Show this QR to your courier / installer</Text>
                                <Text style={styles.qrSub}>They will scan it to confirm delivery &amp; payment</Text>
                            </View>
                        </View>
                        {qrLoading ? (
                            <ActivityIndicator size="large" color="#8D6E63" style={{ marginVertical: 24 }} />
                        ) : qrError ? (
                            <View style={styles.qrError}>
                                <Text style={styles.qrErrorText}>{qrError}</Text>
                                <TouchableOpacity style={styles.qrRefreshBtn} onPress={loadQRToken}>
                                    <Ionicons name="refresh-outline" size={14} color="#5D4037" />
                                    <Text style={styles.qrRefreshText}>Refresh QR</Text>
                                </TouchableOpacity>
                            </View>
                        ) : qrToken ? (
                            <View style={styles.qrBox}>
                                <QRCode
                                    value={qrToken}
                                    size={200}
                                    color="#3e2723"
                                    backgroundColor="#fff"
                                />
                                <Text style={styles.qrOrderLabel}>Order #JM-{order.order_id}</Text>
                                <TouchableOpacity style={styles.qrRefreshBtn} onPress={loadQRToken}>
                                    <Ionicons name="refresh-outline" size={14} color="#5D4037" />
                                    <Text style={styles.qrRefreshText}>Refresh QR</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}
                    </View>
                )}

                {/* Payment Status Banner */}
                {renderPaymentStatusBanner()}

                {/* Phase 8: Geolocation Live Tracking */}
                {status === 'shipped' && (
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#FF9800', marginTop: 15, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
                        onPress={() => navigation.navigate('LiveTracking', { order, userType })}
                    >
                        <Ionicons name="map-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.actionText}>
                            {userType === 'seller' ? 'Start GPS Delivery Broadcast' : 'Track Delivery Live'}
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Shipping Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Shipping Information</Text>
                    {isSeller && order.buyer_name && (
                        <View style={styles.infoRow}>
                            {order.buyer_profile_image ? (
                                <Image
                                    source={{ uri: order.buyer_profile_image.startsWith('http') ? order.buyer_profile_image : `${BASE_URL}/${order.buyer_profile_image}` }}
                                    style={styles.buyerAvatar}
                                />
                            ) : (
                                <View style={[styles.buyerAvatar, styles.buyerAvatarPlaceholder]}>
                                    <Ionicons name="person" size={12} color="#fff" />
                                </View>
                            )}
                            <Text style={styles.infoText}>{order.buyer_name}</Text>
                        </View>
                    )}
                    <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={18} color="#666" />
                        <Text style={styles.infoText}>{addressDisplay}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Ionicons name="call-outline" size={18} color="#666" />
                        <Text style={styles.infoText}>{/* Phone is usually inside address string in this app logic */ 'Contact via Chat'}</Text>
                    </View>
                    {vehicleDisplay && (
                        <View style={[styles.infoRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' }]}>
                            <Ionicons name="car-outline" size={18} color="#4CAF50" />
                            <Text style={[styles.infoText, { color: '#4CAF50', fontWeight: '600' }]}>
                                {vehicleDisplay}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Payment Method */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Payment Method</Text>
                    <View style={styles.infoRow}>
                        <Ionicons name="card-outline" size={18} color="#666" />
                        <Text style={styles.infoText}>{order.payment_method || 'Cash on Delivery'}</Text>
                    </View>
                </View>

                {/* Assigned Installer / Handyman */}
                {order.handyman_name ? (
                    <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#8D6E63', paddingLeft: 14 }]}>
                        <Text style={styles.sectionTitle}>Assigned Installer 🔧</Text>
                        <View style={styles.infoRow}>
                            <Ionicons name="person-circle-outline" size={20} color="#8D6E63" />
                            <Text style={[styles.infoText, { fontWeight: '700', color: '#3e2723' }]}>{order.handyman_name}</Text>
                        </View>
                        {order.handyman_phone ? (
                            <View style={styles.infoRow}>
                                <Ionicons name="call-outline" size={18} color="#666" />
                                <Text style={styles.infoText}>{order.handyman_phone}</Text>
                            </View>
                        ) : null}
                        <View style={styles.infoRow}>
                            <Ionicons
                                name={order.handyman_status === 'available' ? 'checkmark-circle' : order.handyman_status === 'busy' ? 'time' : 'moon'}
                                size={16}
                                color={order.handyman_status === 'available' ? '#4CAF50' : order.handyman_status === 'busy' ? '#FF9800' : '#9E9E9E'}
                            />
                            <Text style={[styles.infoText, { color: order.handyman_status === 'available' ? '#4CAF50' : order.handyman_status === 'busy' ? '#FF9800' : '#9E9E9E', fontWeight: '600' }]}>
                                {order.handyman_status === 'available' ? 'Available' : order.handyman_status === 'busy' ? 'On Duty' : 'Off Duty'}
                            </Text>
                        </View>
                    </View>
                ) : null}

                {/* Order Items */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Items ({order.items.length})</Text>
                    {order.items.map((item, index) => {
                        const { specs, serviceType, installationTier } = parseVariant(item.selected_variant);
                        const isInstall = serviceType?.toLowerCase() === 'installation';
                        return (
                            <View key={index} style={styles.itemRow}>
                                <Image source={{ uri: item.image || item.image_url || 'https://via.placeholder.com/80' }} style={styles.itemImage} resizeMode="cover" />
                                <View style={styles.itemDetails}>
                                    <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>

                                    {/* Variant specs (color, size) */}
                                    {!!specs && (
                                        <Text style={styles.itemVariant}>{specs}</Text>
                                    )}

                                    {/* Service type + installation tier chips */}
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4 }}>
                                        {serviceType && (
                                            <View style={[
                                                styles.serviceChip,
                                                isInstall
                                                    ? { backgroundColor: '#FBE9E7', borderColor: '#FF5722' }
                                                    : { backgroundColor: '#E3F2FD', borderColor: '#2196F3' }
                                            ]}>
                                                <Ionicons
                                                    name={isInstall ? 'construct-outline' : 'car-outline'}
                                                    size={11}
                                                    color={isInstall ? '#E64A19' : '#1976D2'}
                                                />
                                                <Text style={[styles.serviceChipText, { color: isInstall ? '#E64A19' : '#1976D2' }]}>
                                                    {serviceType}
                                                </Text>
                                            </View>
                                        )}
                                        {isInstall && installationTier && (
                                            <View style={{ backgroundColor: '#EDE7F6', borderColor: '#7E57C2', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                <Ionicons name="hammer-outline" size={11} color="#512DA8" />
                                                <Text style={{ fontSize: 11, color: '#512DA8', fontWeight: '600' }}>
                                                    {installationTier.charAt(0).toUpperCase() + installationTier.slice(1)} install
                                                </Text>
                                            </View>
                                        )}
                                        {isInstall && !installationTier && (
                                            <View style={{ backgroundColor: '#FFF3E0', borderColor: '#FF9800', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                                                <Text style={{ fontSize: 11, color: '#E65100' }}>
                                                    {parseFloat(item.installation_fee) > 0
                                                        ? `Install: ${formatPrice(item.installation_fee)}`
                                                        : 'Install fee: see order total'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    <View style={styles.rowBetween}>
                                        <Text style={styles.itemPrice}>
                                            {formatPrice(item.base_price > 0 ? item.base_price : (item.price_at_purchase || item.price))}
                                        </Text>
                                        <Text style={styles.itemQty}>x{item.quantity}</Text>
                                    </View>
                                    {item.request_id && (
                                        <TouchableOpacity
                                            style={{ marginTop: 8, padding: 8, backgroundColor: '#EFEBE9', borderRadius: 6, alignItems: 'center' }}
                                            onPress={() => navigation.navigate('RequestDetail', { requestId: item.request_id, userType })}
                                        >
                                            <Text style={{ color: '#5D4037', fontSize: 12, fontWeight: 'bold' }}>View Request Details</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>

                {/* Order Summary */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Order Summary</Text>

                    {/* Items subtotal (base product prices only) */}
                    <View style={styles.rowBetween}>
                        <Text style={styles.summaryLabel}>Items Subtotal</Text>
                        <Text style={styles.summaryValue}>{formatPrice(itemsTotal)}</Text>
                    </View>

                    {/* Delivery Fee — exact from DB */}
                    <View style={styles.rowBetween}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Ionicons name="car-outline" size={14} color="#666" />
                            <Text style={styles.summaryLabel}>
                                Delivery Fee{vehicleDisplay ? ` (${vehicleDisplay})` : ''}
                            </Text>
                        </View>
                        <Text style={styles.summaryValue}>
                            {deliveryFeeExact > 0 ? formatPrice(deliveryFeeExact) : 'Included in total'}
                        </Text>
                    </View>

                    {/* Installation Fee — exact sum from items */}
                    {hasInstallation && (
                        <View style={styles.rowBetween}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <Ionicons name="construct-outline" size={14} color="#E64A19" />
                                <Text style={[styles.summaryLabel, { color: '#E64A19' }]}>Installation Fee</Text>
                            </View>
                            <Text style={[styles.summaryValue, { color: '#E64A19' }]}>
                                {installTotal > 0 ? formatPrice(installTotal) : 'Included in total'}
                            </Text>
                        </View>
                    )}

                    {/* Discount */}
                    {order.discount_amount > 0 && (
                        <View style={styles.rowBetween}>
                            <Text style={[styles.summaryLabel, { color: '#E91E63' }]}>Discount</Text>
                            <Text style={[styles.summaryValue, { color: '#E91E63' }]}>- {formatPrice(order.discount_amount)}</Text>
                        </View>
                    )}

                    {/* Points Redeemed */}
                    {order.points_redeemed > 0 && (
                        <View style={styles.rowBetween}>
                            <Text style={[styles.summaryLabel, { color: '#FF9800' }]}>⭐ Points Redeemed</Text>
                            <Text style={[styles.summaryValue, { color: '#FF9800' }]}>- ₱{(order.points_redeemed / 100).toLocaleString()}</Text>
                        </View>
                    )}

                    <View style={[styles.rowBetween, styles.totalRow]}>
                        <Text style={styles.totalLabel}>Total</Text>
                        <Text style={styles.totalValue}>{formatPrice(order.total_amount)}</Text>
                    </View>
                </View>

                {/* Actions */}
                {renderActionButtons() && (
                    <View style={styles.footerActions}>
                        {renderActionButtons()}
                    </View>
                )}

            </ScrollView>
            </KeyboardAwareWrapper>

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

            {/* Reject Proof Modal */}
            <Modal visible={rejectModalVisible} transparent animationType="slide" onRequestClose={() => setRejectModalVisible(false)}>
                <View style={styles.rejectOverlay}>
                    <View style={styles.rejectModal}>
                        <Text style={styles.rejectTitle}>Reject Payment Proof</Text>
                        <Text style={styles.rejectSubtitle}>Please provide a reason so the buyer can resubmit.</Text>
                        <View style={styles.rejectInputWrap}>
                            <TextInput
                                style={styles.rejectInput}
                                placeholder="e.g. Screenshot is blurry, wrong amount shown..."
                                placeholderTextColor="#aaa"
                                value={rejectReason}
                                onChangeText={setRejectReason}
                                multiline
                                numberOfLines={3}
                            />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                            <TouchableOpacity
                                style={[styles.actionButton, { flex: 1, backgroundColor: '#9E9E9E' }]}
                                onPress={() => { setRejectModalVisible(false); setRejectReason(''); }}
                            >
                                <Text style={styles.actionText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, { flex: 1, backgroundColor: '#F44336' }]}
                                onPress={handleSellerReject}
                            >
                                <Text style={styles.actionText}>Reject</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#3e2723' },
    scrollContent: { padding: 16 },
    section: {
        backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    label: { fontSize: 14, color: '#666' },
    value: { fontSize: 14, fontWeight: '500', color: '#333' },
    statusBadge: {
        alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 8,
    },
    statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

    /* Tracking Stepper Styles */
    trackingContainer: {
        backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16,
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    trackingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    liveBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2E7D32' },
    liveText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },

    stepperWrapper: { gap: 0 },
    stepItem: { flexDirection: 'row', minHeight: 64 },
    stepIndicator: { width: 32, alignItems: 'center' },
    stepCircle: {
        width: 32, height: 32, borderRadius: 16,
        justifyContent: 'center', alignItems: 'center', zIndex: 2,
    },
    stepCircleDone: { backgroundColor: '#8D6E63' },
    stepCircleCurrent: {
        backgroundColor: '#5D4037',
        shadowColor: '#8D6E63', shadowOpacity: 0.5, shadowRadius: 6, elevation: 4,
    },
    stepCircleInactive: { backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#e0e0e0' },
    stepLine: { width: 2, flex: 1, marginVertical: 2, zIndex: 1 },
    stepLineActive: { backgroundColor: '#8D6E63' },
    stepLineInactive: { backgroundColor: '#eeeeee' },
    stepContent: { flex: 1, paddingLeft: 14, paddingBottom: 24, paddingTop: 4 },
    stepTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    stepTitle: { fontSize: 14, fontWeight: '700' },
    stepTitleCurrent: { color: '#3e2723' },
    stepTitleCompleted: { color: '#5D4037' },
    stepTitleInactive: { color: '#bdbdbd', fontWeight: '500' },
    stepTs: { fontSize: 11, color: '#9E9E9E', fontWeight: '500' },
    stepSub: { fontSize: 12, color: '#757575', marginTop: 1, marginBottom: 4 },
    stepWorkerRow: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#F3F4F6', borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 4,
    },
    stepWorkerText: { fontSize: 12, fontWeight: '700' },

    cancelledContainer: { backgroundColor: '#fff', borderRadius: 16, padding: 28, marginBottom: 16, alignItems: 'center' },
    cancelledIconWrap: {
        width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFEBEE',
        justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    },
    cancelledTitle: { fontSize: 18, fontWeight: '800', color: '#B71C1C', marginBottom: 6 },
    cancelledSub: { fontSize: 13, color: '#757575', textAlign: 'center', lineHeight: 20 },

    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    buyerAvatar: { width: 24, height: 24, borderRadius: 12 },
    buyerAvatarPlaceholder: { backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
    infoText: { marginLeft: 10, fontSize: 14, color: '#444', flex: 1 },
    itemRow: { flexDirection: 'row', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 12 },
    itemImage: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#eee' },
    itemDetails: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    itemTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
    itemVariant: { fontSize: 12, color: '#777', marginBottom: 4 },
    itemPrice: { fontSize: 14, fontWeight: '500', color: '#3e2723' },
    itemQty: { fontSize: 14, color: '#555' },
    serviceChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    serviceChipText: { fontSize: 11, fontWeight: '600' },
    summaryLabel: { fontSize: 14, color: '#666' },
    summaryValue: { fontSize: 14, color: '#333' },
    totalRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee' },
    totalLabel: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    totalValue: { fontSize: 18, fontWeight: 'bold', color: '#8D6E63' },
    footerActions: { marginTop: 10, marginBottom: 30 },
    actionButton: {
        backgroundColor: '#8D6E63', padding: 16, borderRadius: 12, alignItems: 'center',
    },
    cancelButton: { backgroundColor: '#F44336' },
    actionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    completedMessageContainer: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F5E9', padding: 16, borderRadius: 12,
    },
    completedMessageText: { color: '#2E7D32', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },

    // ── Premium Completion Card ──────────────────────────────────────────────
    completionCard: {
        backgroundColor: '#F1F8E9', borderRadius: 20, padding: 20, width: '100%',
        borderWidth: 1.5, borderColor: '#A5D6A7',
        shadowColor: '#2E7D32', shadowOpacity: 0.1, shadowRadius: 10, elevation: 3,
    },
    completionHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
    completionTitle: { fontSize: 18, fontWeight: '900', color: '#1B5E20' },
    completionOrderId: { fontSize: 13, fontWeight: '600', color: '#388E3C' },
    completionRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#C8E6C9',
    },
    completionRowText: { fontSize: 13, color: '#333', flex: 1, lineHeight: 18 },
    pointsBadge: {
        backgroundColor: '#FFF8E1', borderRadius: 10, paddingHorizontal: 12,
        borderTopWidth: 0, marginTop: 8,
    },
    pointsBadgeText: { fontSize: 13, fontWeight: '800', color: '#E65100' },
    completionActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    completionBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 12, borderRadius: 12,
    },
    completionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // Payment status banner
    paymentBanner: {
        flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, gap: 8,
    },
    paymentBannerText: { fontSize: 14, fontWeight: '600', flex: 1 },

    // Proof image displayed in seller view
    proofContainer: {
        backgroundColor: '#fff', borderRadius: 12, padding: 14,
        borderWidth: 1, borderColor: '#e0e0e0',
    },
    proofLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
    proofImage: { width: '100%', height: 220, borderRadius: 8, backgroundColor: '#f0f0f0' },

    // Reject modal
    rejectOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    rejectModal: {
        backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 24, paddingBottom: 40,
    },
    rejectTitle: { fontSize: 18, fontWeight: '700', color: '#3e2723', marginBottom: 6 },
    rejectSubtitle: { fontSize: 13, color: '#666', marginBottom: 14 },
    rejectInputWrap: {
        borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
        backgroundColor: '#fafafa', padding: 12,
    },
    rejectInput: { fontSize: 14, color: '#333', minHeight: 70, textAlignVertical: 'top' },

    // Worker info banner (seller view — after shipped)
    workerInfoBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        backgroundColor: '#FFF8F0', borderWidth: 1.5, borderColor: '#D7CCC8',
        borderRadius: 14, padding: 14, marginBottom: 16,
    },
    workerInfoTitle: { fontSize: 14, fontWeight: '800', color: '#5D4037', marginBottom: 3 },
    workerInfoSub:   { fontSize: 12, color: '#8D6E63', lineHeight: 18 },

    // Buyer QR section
    qrSection: {
        backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16,
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
        alignItems: 'center',
    },
    qrHeader:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, alignSelf: 'stretch', marginBottom: 20 },
    qrTitle:        { fontSize: 14, fontWeight: '800', color: '#3e2723', marginBottom: 2 },
    qrSub:          { fontSize: 12, color: '#8D6E63' },
    qrBox:          { alignItems: 'center', gap: 14 },
    qrOrderLabel:   { fontSize: 13, fontWeight: '700', color: '#5D4037' },
    qrError:        { alignItems: 'center', gap: 12, paddingVertical: 12 },
    qrErrorText:    { fontSize: 13, color: '#B71C1C', textAlign: 'center' },
    qrRefreshBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#8D6E63' },
    qrRefreshText:  { fontSize: 12, fontWeight: '700', color: '#5D4037' },
});

export default OrderDetailScreen;
