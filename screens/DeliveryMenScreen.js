import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    Modal, TextInput, ActivityIndicator, ScrollView, Clipboard,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { workersAPI, shopAPI, ordersAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';
import { useTheme } from '../context/ThemeContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    available:   { label: 'Available',   color: '#2e7d32', bg: '#e8f5e9', icon: 'checkmark-circle' },
    on_delivery: { label: 'On Delivery', color: '#1565C0', bg: '#E3F2FD', icon: 'car'             },
    off:         { label: 'Off Duty',    color: '#546e7a', bg: '#eceff1', icon: 'moon'            },
};


const AVATAR_COLORS = ['#1565C0','#E65100','#2E7D32','#6C3483','#00838F','#558B2F'];

const avatarColor = (id) => AVATAR_COLORS[Math.abs(id || 0) % AVATAR_COLORS.length];
const initials    = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// ── Component ─────────────────────────────────────────────────────────────────

const DeliveryMenScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const [shopId,      setShopId]      = useState(null);
    const [deliveryMen, setDeliveryMen] = useState([]);
    const [loading,     setLoading]     = useState(true);

    const [modalVisible, setModalVisible] = useState(false);
    const [editing,  setEditing]  = useState(null);
    const [form, setForm] = useState({ full_name: '', phone: '', plate_number: '', status: 'available' });
    const [saving, setSaving] = useState(false);

    const [credModal,   setCredModal]   = useState(false);
    const [credentials, setCredentials] = useState(null);

    const [workloadSheet, setWorkloadSheet] = useState(null);
    const [workloadOrders, setWorkloadOrders] = useState([]);
    const [loadingOrders,  setLoadingOrders]  = useState(false);

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null });
    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) =>
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    // ── Data ──────────────────────────────────────────────────────────────────
    const loadDeliveryMen = useCallback(async () => {
        if (!user) return;
        try {
            const shopRes = await shopAPI.getMyShop(user.id);
            if (!shopRes.success || !shopRes.shop) return;
            const sid = shopRes.shop.shop_id;
            setShopId(sid);
            const res = await workersAPI.getByShop(sid);
            if (res.success) setDeliveryMen(res.delivery_men || []);
        } catch (e) {
            console.error('Load delivery men error:', e);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => {
        setLoading(true);
        loadDeliveryMen();
    }, [loadDeliveryMen]));

    // ── Stats ─────────────────────────────────────────────────────────────────
    const stats = [
        { label: 'Total',       value: deliveryMen.length,                                         color: theme.accent, icon: 'people',                bg: theme.accentBg || '#efebe9' },
        { label: 'Available',   value: deliveryMen.filter(d => d.status === 'available').length,   color: '#2e7d32',    icon: 'checkmark-circle',      bg: '#e8f5e9' },
        { label: 'On Delivery', value: deliveryMen.filter(d => d.status === 'on_delivery').length, color: '#E65100',    icon: 'car',                   bg: '#FFF3E0' },
        { label: 'Off Duty',    value: deliveryMen.filter(d => d.status === 'off').length,         color: '#546e7a',    icon: 'moon',                  bg: '#eceff1' },
    ];

    // ── Workload ──────────────────────────────────────────────────────────────
    const openWorkload = async (item) => {
        setWorkloadSheet(item);
        setLoadingOrders(true);
        try {
            const res = await ordersAPI.getForDelivery(item.delivery_man_id);
            setWorkloadOrders(res.success ? res.orders : []);
        } catch {
            setWorkloadOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    };

    // ── Form ──────────────────────────────────────────────────────────────────
    const openAdd = () => {
        setEditing(null);
        setForm({ full_name: '', phone: '', plate_number: '', status: 'available' });
        setModalVisible(true);
    };

    const openEdit = (item) => {
        setEditing(item);
        setForm({ full_name: item.full_name, phone: item.phone || '', plate_number: item.plate_number || '', status: item.status });
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!form.full_name.trim()) {
            showAlert('Required', "Please enter the delivery man's name.", 'warning');
            return;
        }
        setSaving(true);
        try {
            if (editing) {
                await workersAPI.updateDeliveryMan(editing.delivery_man_id, {
                    full_name: form.full_name, phone: form.phone, plate_number: form.plate_number, status: form.status,
                });
                setModalVisible(false);
                loadDeliveryMen();
            } else {
                const res = await workersAPI.createDeliveryMan(shopId, {
                    full_name: form.full_name, phone: form.phone, plate_number: form.plate_number
                });
                if (res?.success) {
                    setModalVisible(false);
                    setCredentials(res.credentials);
                    setCredModal(true);
                    loadDeliveryMen();
                } else {
                    showAlert('Error', res?.message || 'Failed.', 'error');
                }
            }
        } catch {
            showAlert('Error', 'Failed to save. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (item) => {
        showAlert(
            'Remove Delivery Man',
            `Deactivate ${item.full_name}'s login account? All their order assignments will also be affected.`,
            'warning', true,
            async () => { await workersAPI.deactivate(item.user_id); loadDeliveryMen(); }
        );
    };

    const handleCycleStatus = async (item) => {
        const order = ['available', 'on_delivery', 'off'];
        const next  = order[(order.indexOf(item.status) + 1) % order.length];
        await workersAPI.updateDeliveryMan(item.delivery_man_id, { status: next }).catch(() => {});
        setDeliveryMen(prev => prev.map(d => d.delivery_man_id === item.delivery_man_id ? { ...d, status: next } : d));
    };

    // ── Render Card ───────────────────────────────────────────────────────────
    const renderItem = ({ item }) => {
        const cfg        = STATUS_CONFIG[item.status] || STATUS_CONFIG.available;
        const ac         = avatarColor(item.delivery_man_id);
        const orderCount = parseInt(item.active_order_count) || 0;

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: cfg.color }]}
                onPress={() => openWorkload(item)}
                activeOpacity={0.85}
            >
                {/* Avatar */}
                <View style={[styles.avatar, { backgroundColor: ac }]}>
                    <Text style={styles.avatarText}>{initials(item.full_name)}</Text>
                    {/* Status dot */}
                    <View style={[styles.statusDot, { backgroundColor: cfg.color, borderColor: theme.card }]} />
                </View>

                {/* Info */}
                <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                        <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={1}>{item.full_name}</Text>
                        {orderCount > 0 && (
                            <View style={styles.orderBadge}>
                                <Ionicons name="receipt-outline" size={10} color="#fff" />
                                <Text style={styles.orderBadgeText}>{String(orderCount)}</Text>
                            </View>
                        )}
                    </View>

                    {!!item.phone && (
                        <View style={styles.infoRow}>
                            <Ionicons name="call-outline" size={12} color={theme.textMuted} />
                            <Text style={[styles.infoText, { color: theme.textMuted }]}>{item.phone}</Text>
                        </View>
                    )}

                    <View style={styles.infoRow}>
                        <View style={[styles.statusChip, { backgroundColor: cfg.bg }]}>
                            <Ionicons name="car-outline" size={11} color={cfg.color} />
                            <Text style={[styles.statusChipText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        {!!item.plate_number && (
                            <Text style={[styles.infoText, { color: theme.textMuted, marginLeft: 6 }]}>{item.plate_number}</Text>
                        )}
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.cardRight}>
                    <TouchableOpacity
                        style={[styles.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.color }]}
                        onPress={() => handleCycleStatus(item)}
                    >
                        <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                        <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                    <View style={styles.actionRow}>
                        <TouchableOpacity onPress={() => openEdit(item)} style={[styles.actionBtn, { backgroundColor: theme.inputBg }]}>
                            <Ionicons name="pencil-outline" size={15} color={theme.accent} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.actionBtn, { backgroundColor: '#ffebee' }]}>
                            <Ionicons name="trash-outline" size={15} color="#e53935" />
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.headerBg }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: theme.headerText }]}>{'Delivery Team'}</Text>
                    {!loading && (
                        <Text style={[styles.headerSub, { color: theme.accent }]}>
                            {String(deliveryMen.length)}{' member'}{deliveryMen.length !== 1 ? 's' : ''}
                        </Text>
                    )}
                </View>
                <TouchableOpacity onPress={openAdd} style={[styles.addBtn, { backgroundColor: theme.accent }]}>
                    <Ionicons name="add" size={22} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Stats */}
            {!loading && deliveryMen.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
                    {stats.map(s => (
                        <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
                            <Ionicons name={s.icon} size={22} color={s.color} />
                            <Text style={[styles.statValue, { color: s.color }]}>{String(s.value)}</Text>
                            <Text style={[styles.statLabel, { color: s.color, opacity: 0.7 }]}>{s.label}</Text>
                        </View>
                    ))}
                </ScrollView>
            )}

            {loading ? (
                <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
            ) : (
                <FlatList
                    data={deliveryMen}
                    renderItem={renderItem}
                    keyExtractor={item => String(item.delivery_man_id)}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <View style={[styles.emptyIcon, { backgroundColor: theme.inputBg }]}>
                                <Ionicons name="car-outline" size={52} color={theme.textMuted} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>{'No delivery men yet'}</Text>
                            <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                                {'Add your delivery personnel so you can assign orders to them.'}
                            </Text>
                            <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: theme.accent }]} onPress={openAdd}>
                                <Ionicons name="person-add-outline" size={18} color="#fff" />
                                <Text style={styles.emptyBtnText}>{'Add First Delivery Man'}</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
            <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setModalVisible(false)} />
                    <View style={[styles.modal, { backgroundColor: theme.card }]}>
                        <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />

                        {/* Modal Header with avatar preview */}
                        <View style={styles.modalHeaderRow}>
                            <View style={[styles.modalAvatar, { backgroundColor: form.full_name ? avatarColor(form.full_name.charCodeAt(0)) : theme.inputBg }]}>
                                <Text style={styles.modalAvatarText}>
                                    {form.full_name ? initials(form.full_name) : '?'}
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.modalTitle, { color: theme.text }]}>
                                    {editing ? 'Edit Delivery Man' : 'Add Delivery Man'}
                                </Text>
                                <Text style={[styles.modalSub, { color: theme.textMuted }]}>
                                    {editing ? 'Editing ' + editing.full_name : 'Login credentials auto-generated on creation.'}
                                </Text>
                            </View>
                        </View>

                        <KeyboardAwareWrapper>
                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            {/* Name */}
                            <Text style={[styles.label, { color: theme.textSecondary }]}>{'Full Name *'}</Text>
                            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                                <Ionicons name="person-outline" size={17} color={theme.textMuted} style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.inputField, { color: theme.text }]}
                                    placeholder="e.g. Juan dela Cruz"
                                    placeholderTextColor={theme.textMuted}
                                    value={form.full_name}
                                    onChangeText={t => setForm(p => ({ ...p, full_name: t }))}
                                />
                            </View>

                            {/* Phone */}
                            <Text style={[styles.label, { color: theme.textSecondary }]}>{'Phone Number'}</Text>
                            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                                <Ionicons name="call-outline" size={17} color={theme.textMuted} style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.inputField, { color: theme.text }]}
                                    placeholder="09XX XXX XXXX"
                                    placeholderTextColor={theme.textMuted}
                                    value={form.phone}
                                    onChangeText={t => setForm(p => ({ ...p, phone: t }))}
                                    keyboardType="phone-pad"
                                />
                            </View>
                            
                            {/* Plate Number */}
                            <Text style={[styles.label, { color: theme.textSecondary }]}>{'Plate Number'}</Text>
                            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                                <Ionicons name="barcode-outline" size={17} color={theme.textMuted} style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.inputField, { color: theme.text }]}
                                    placeholder="e.g. ABC 123"
                                    placeholderTextColor={theme.textMuted}
                                    value={form.plate_number}
                                    onChangeText={t => setForm(p => ({ ...p, plate_number: t }))}
                                />
                            </View>

                            {/* Status — only when editing */}
                            {!!editing && (
                                <>
                                    <Text style={[styles.label, { color: theme.textSecondary }]}>{'Status'}</Text>
                                    <View style={styles.statusRow}>
                                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                            <TouchableOpacity
                                                key={key}
                                                style={[
                                                    styles.statusOption,
                                                    { borderColor: theme.border, backgroundColor: theme.inputBg },
                                                    form.status === key && { borderColor: cfg.color, backgroundColor: cfg.bg },
                                                ]}
                                                onPress={() => setForm(p => ({ ...p, status: key }))}
                                            >
                                                <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                                                <Text style={[styles.statusOptionText, { color: form.status === key ? cfg.color : theme.textMuted }]}>
                                                    {cfg.label}
                                                </Text>
                                                {form.status === key && (
                                                    <View style={[styles.statusCheck, { backgroundColor: cfg.color }]}>
                                                        <Ionicons name="checkmark" size={10} color="#fff" />
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}

                            {/* Buttons */}
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.cancelBtn, { borderColor: theme.border }]}
                                    onPress={() => setModalVisible(false)}
                                >
                                    <Text style={[styles.cancelText, { color: theme.textSecondary }]}>{'Cancel'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.saveBtn, { backgroundColor: theme.accent, shadowColor: theme.accent }, saving && { opacity: 0.6 }]}
                                    onPress={handleSave}
                                    disabled={saving}
                                >
                                    {saving
                                        ? <ActivityIndicator size="small" color="#fff" />
                                        : <>
                                            <Ionicons name={editing ? 'save-outline' : 'person-add-outline'} size={17} color="#fff" />
                                            <Text style={styles.saveText}>{editing ? 'Save Changes' : 'Add Delivery Man'}</Text>
                                          </>
                                    }
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                        </KeyboardAwareWrapper>
                    </View>
                </View>
            </Modal>
            
            {/* ── Credential Modal ─────────────────────────────────────────────── */}
            <Modal visible={credModal} transparent animationType="fade" onRequestClose={() => setCredModal(false)}>
                <View style={styles.credOverlay}>
                    <View style={[styles.credCard, { backgroundColor: theme.card }]}>
                        <Ionicons name="key" size={36} color="#F57F17" style={{ alignSelf: 'center' }} />
                        <Text style={[styles.credTitle, { color: theme.text }]}>{'Credentials Ready!'}</Text>
                        <Text style={[styles.credNote, { color: theme.textMuted }]}>
                            {'Share with the worker. They must change their password on first login.'}
                        </Text>
                        {!!credentials && (
                            <View style={[styles.credBox, { backgroundColor: theme.inputBg || '#f5f5f5', borderColor: theme.border }]}>
                                <View style={styles.credField}>
                                    <Text style={[styles.credLabel, { color: theme.textMuted }]}>{'USERNAME'}</Text>
                                    <Text style={[styles.credValue, { color: theme.text }]}>{credentials.username || ''}</Text>
                                </View>
                                <View style={[{ height: 1, backgroundColor: theme.border }]} />
                                <View style={styles.credField}>
                                    <Text style={[styles.credLabel, { color: theme.textMuted }]}>{'TEMP PASSWORD'}</Text>
                                    <Text style={[styles.credValue, { color: '#1565C0' }]}>{credentials.temp_password || ''}</Text>
                                </View>
                            </View>
                        )}
                        <TouchableOpacity
                            style={[styles.copyBtn, { backgroundColor: '#1565C0' }]}
                            onPress={() => {
                                if (credentials) {
                                    Clipboard.setString('Username: ' + credentials.username + '\nPassword: ' + credentials.temp_password);
                                    showAlert('Copied!', 'Credentials copied to clipboard.', 'success');
                                }
                            }}
                        >
                            <Ionicons name="copy-outline" size={16} color="#fff" />
                            <Text style={styles.copyText}>{'Copy to Clipboard'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.doneBtn, { borderColor: theme.border }]} onPress={() => setCredModal(false)}>
                            <Text style={[styles.doneText, { color: theme.textSecondary }]}>{'Done'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Workload Sheet ──────────────────────────────────────────────── */}
            <Modal visible={!!workloadSheet} transparent animationType="slide" onRequestClose={() => setWorkloadSheet(null)}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setWorkloadSheet(null)} />
                    <View style={[styles.workloadSheet, { backgroundColor: theme.card }]}>
                        <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />

                        {!!workloadSheet && (() => {
                            const cfg = STATUS_CONFIG[workloadSheet.status] || STATUS_CONFIG.available;
                            return (
                                <View style={[styles.workloadHeader, { backgroundColor: cfg.bg, borderRadius: 16, marginBottom: 20 }]}>
                                    <View style={[styles.workloadAvatar, { backgroundColor: avatarColor(workloadSheet.delivery_man_id) }]}>
                                        <Text style={styles.workloadAvatarText}>{initials(workloadSheet.full_name)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.workloadName, { color: theme.text }]}>{workloadSheet.full_name}</Text>
                                        <Text style={[styles.workloadSpec, { color: cfg.color }]}>
                                            {cfg.label.toUpperCase()}
                                        </Text>
                                        {!!workloadSheet.phone && (
                                            <View style={styles.infoRow}>
                                                <Ionicons name="call-outline" size={11} color={theme.textMuted} />
                                                <Text style={[styles.infoText, { color: theme.textMuted }]}>{workloadSheet.phone}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={[styles.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
                                        <Ionicons name={cfg.icon} size={13} color={cfg.color} />
                                        <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                                    </View>
                                </View>
                            );
                        })()}

                        <Text style={[styles.sheetSectionTitle, { color: theme.textMuted }]}>{'Active Deliveries'}</Text>

                        {loadingOrders ? (
                            <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 24 }} />
                        ) : workloadOrders.length === 0 ? (
                            <View style={styles.workloadEmpty}>
                                <Ionicons name="checkmark-circle" size={44} color="#2e7d32" />
                                <Text style={[styles.workloadEmptyTitle, { color: theme.text }]}>{'All clear!'}</Text>
                                <Text style={[styles.workloadEmptyText, { color: theme.textMuted }]}>{'No active orders assigned'}</Text>
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {workloadOrders.map(order => (
                                    <View key={order.order_id} style={[styles.orderRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
                                        <View style={[styles.orderIcon, { backgroundColor: theme.accentBg || '#efebe9' }]}>
                                            <Ionicons name="car-outline" size={18} color={theme.accent} />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={[styles.orderRowId, { color: theme.text }]}>{'Order #' + order.order_id}</Text>
                                            <Text style={[styles.orderRowBuyer, { color: theme.textMuted }]}>{order.buyer_name}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <View style={[styles.orderStatusPill, { backgroundColor: STATUS_CONFIG.on_delivery.bg }]}>
                                                <Text style={[styles.orderStatusText, { color: STATUS_CONFIG.on_delivery.color }]}>{order.status}</Text>
                                            </View>
                                            <Text style={[styles.orderAmount, { color: theme.accent }]}>
                                                {'₱' + parseFloat(order.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </ScrollView>
                        )}

                        <TouchableOpacity
                            style={[styles.sheetClose, { backgroundColor: theme.inputBg }]}
                            onPress={() => setWorkloadSheet(null)}
                        >
                            <Ionicons name="close-circle-outline" size={18} color={theme.textSecondary} />
                            <Text style={[styles.sheetCloseText, { color: theme.textSecondary }]}>{'Close'}</Text>
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
                onConfirm={() => { hideAlert(); alertConfig.onConfirm?.(); }}
                onCancel={hideAlert}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1 },

    /* Header */
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
    },
    iconBtn: { padding: 6 },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    headerSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
    addBtn: {
        width: 38, height: 38, borderRadius: 19,
        justifyContent: 'center', alignItems: 'center',
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
    },

    /* Stats */
    statsRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
    statCard: {
        alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18,
        borderRadius: 16, gap: 4, minWidth: 80,
    },
    statValue: { fontSize: 24, fontWeight: '800' },
    statLabel: { fontSize: 11, fontWeight: '600' },

    /* List */
    list: { padding: 16, paddingBottom: 40, gap: 12 },

    /* Card */
    card: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 16, padding: 14, borderWidth: 1, borderLeftWidth: 4,
        gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    },
    avatar: {
        width: 52, height: 52, borderRadius: 16,
        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
    statusDot: {
        position: 'absolute', bottom: -2, right: -2,
        width: 14, height: 14, borderRadius: 7, borderWidth: 2,
    },
    cardBody: { flex: 1, gap: 4 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardName: { fontSize: 15, fontWeight: '700', flex: 1 },
    orderBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#e65100', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
    },
    orderBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    infoText: { fontSize: 12 },
    statusChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    },
    statusChipText: { fontSize: 11, fontWeight: '600' },
    cardRight: { alignItems: 'flex-end', gap: 8, flexShrink: 0 },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    },
    statusPillText: { fontSize: 11, fontWeight: '700' },
    actionRow: { flexDirection: 'row', gap: 6 },
    actionBtn: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

    /* Empty */
    empty: { alignItems: 'center', marginTop: 70, paddingHorizontal: 40 },
    emptyIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 19, fontWeight: '800', marginBottom: 8 },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
    emptyBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 24, paddingVertical: 13, borderRadius: 30,
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

    /* Modal */
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '90%' },
    modalHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
    modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    modalAvatar: { width: 54, height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    modalAvatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
    modalTitle: { fontSize: 18, fontWeight: '800' },
    modalSub: { fontSize: 12, marginTop: 2 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderRadius: 12, paddingHorizontal: 12,
    },
    inputIcon: { marginRight: 10 },
    inputField: { flex: 1, paddingVertical: 12, fontSize: 15 },
    statusRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    statusOption: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        gap: 4, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, position: 'relative',
    },
    statusOptionText: { fontSize: 11, fontWeight: '700' },
    statusCheck: {
        position: 'absolute', top: 4, right: 4,
        width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
    cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    cancelText: { fontWeight: '700', fontSize: 14 },
    saveBtn: {
        flex: 2, borderRadius: 12, paddingVertical: 14,
        alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
    },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },

    /* Workload Sheet */
    workloadSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '78%' },
    workloadHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
    workloadAvatar: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    workloadAvatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
    workloadName: { fontSize: 16, fontWeight: '800' },
    workloadSpec: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    sheetSectionTitle: {
        fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: 1, marginBottom: 14,
    },
    workloadEmpty: { alignItems: 'center', paddingVertical: 32, gap: 6 },
    workloadEmptyTitle: { fontSize: 16, fontWeight: '700' },
    workloadEmptyText: { fontSize: 13 },
    orderRow: {
        flexDirection: 'row', alignItems: 'center',
        padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10,
    },
    orderIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    orderRowId: { fontSize: 14, fontWeight: '700' },
    orderRowBuyer: { fontSize: 12, marginTop: 2 },
    orderStatusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginBottom: 2 },
    orderStatusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    orderAmount: { fontSize: 13, fontWeight: '700' },
    sheetClose: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        marginTop: 16, paddingVertical: 13, borderRadius: 12,
    },
    sheetCloseText: { fontSize: 15, fontWeight: '600' },

    /* Cred Modal */
    credOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    credCard:    { width: '100%', borderRadius: 24, padding: 24, gap: 12, maxWidth: 380 },
    credTitle:   { fontSize: 20, fontWeight: '800', textAlign: 'center' },
    credNote:    { fontSize: 13, textAlign: 'center', lineHeight: 20 },
    credBox:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    credField:   { padding: 16, gap: 4 },
    credLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
    credValue:   { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
    copyBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
    copyText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
    doneBtn:     { borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
    doneText:    { fontWeight: '700', fontSize: 14 },
});

export default DeliveryMenScreen;
