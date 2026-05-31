import React, { useState, useEffect, useRef } from 'react';
import {
    StyleSheet, Text, View, FlatList, TextInput,
    TouchableOpacity, Platform,
    ActivityIndicator, Image, Modal,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import { messagesAPI, BASE_URL } from '../services/api';
import CustomAlert from '../components/CustomAlert';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#6C63FF','#FF6B6B','#43C6AC','#F7971E','#2196F3','#E91E63','#00BCD4','#8BC34A'];
const avatarColor   = (str = '') => AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length];
const initials      = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const formatMsgTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getDayLabel = (ts) => {
    if (!ts) return '';
    const d   = new Date(ts);
    const now  = new Date();
    const diff = now - d;
    if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};

// ── Component ─────────────────────────────────────────────────────────────────
const ChatScreen = ({ route, navigation }) => {
    const { conversation, otherUserId, mode = 'personal', shopId = null } = route.params;

    const targetUserId = otherUserId || conversation?.other_user_id;

    // In shop mode (seller viewing a customer chat) → use the customer's real full name.
    // In personal mode (customer viewing a shop chat) → use the shop name so the customer
    //   recognises who they're talking to (e.g. "JM Glass & Furniture").
    const targetUserName = mode === 'shop'
        ? conversation?.full_name || 'Customer'
        : conversation?.shop_name || conversation?.full_name || 'User';

    // Mirror the same logic for the avatar.
    const rawImg = mode === 'shop'
        ? conversation?.profile_image || null
        : conversation?.shop_logo || conversation?.logo_url || conversation?.profile_image || null;
    const targetUserImage = rawImg
        ? (rawImg.startsWith('http') ? rawImg : `${BASE_URL}/${rawImg}`)
        : null;

    const { user }  = useAuth();
    const { theme } = useTheme();
    const [messages,  setMessages]  = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading,   setLoading]   = useState(true);
    const [sending,   setSending]   = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const flatListRef = useRef(null);

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null });
    const showAlert = (title, msg, type = 'info') => setAlertConfig({ visible: true, title, message: msg, type, showCancel: false, onConfirm: null });
    const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    // ── Data & Socket ─────────────────────────────────────────────────────────
    const { socket, joinChatRoom, leaveChatRoom } = useSocket();
    
    // Deterministic roomId matches backend formulation
    const roomId = targetUserId ? [user?.id || user?.user_id, targetUserId].sort().join('_') + '_' + (shopId || 'null') : null;

    const loadMessages = async () => {
        if (!user || !targetUserId) { setLoading(false); return; }
        try {
            // shopId filters to the specific channel (personal vs shop inbox)
            const res = await messagesAPI.getMessages(user.id, targetUserId, shopId);
            if (res.success) setMessages(res.messages || []);
        } catch (e) {
            console.error('load messages', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!targetUserId || !roomId) return;
        
        // Initial fetch
        loadMessages();
        
        // Subscribe to real-time events
        joinChatRoom(roomId);
        if (socket) {
            socket.on('message:new', loadMessages);
        }

        return () => {
            leaveChatRoom(roomId);
            if (socket) {
                socket.off('message:new', loadMessages);
            }
        };
    }, [targetUserId, roomId, socket]);

    const handleSend = async () => {
        if (!inputText.trim() || !user || !targetUserId) return;
        setSending(true);
        const optimistic = inputText.trim();
        setInputText('');
        try {
            const res = await messagesAPI.sendMessage({
                sender_id:   user.id,
                receiver_id: targetUserId,
                message:     optimistic,
                shop_id:     shopId,   // stamp the channel so the reply stays in the right inbox
            });
            if (res.success) {
                loadMessages();
            }
        } catch (e) {
            console.error('send message', e);
            showAlert('Error', 'Failed to send message. Please try again.', 'error');
        } finally {
            setSending(false);
        }
    };

    // ── Bubble rendering ──────────────────────────────────────────────────────
    const parseRequestMessage = (text) => {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        let title = lines[0] || '';
        let details = '', budget = '', service = '';
        lines.forEach(line => {
            if (line.startsWith('Details:')) details = line.replace('Details:', '').trim();
            else if (line.startsWith('Budget:')) budget = line.replace('Budget:', '').trim();
            else if (line.startsWith('Service:')) service = line.replace('Service:', '').trim();
        });
        return { title, details, budget, service };
    };

    const renderRequestCard = (item, isMe) => {
        const { title, details, budget, service } = parseRequestMessage(item.message);
        const imageUri = (() => {
            if (!item.image_url) return null;
            let path = item.image_url;
            if (path.startsWith('http')) {
                const idx = path.indexOf('uploads/');
                if (idx === -1) return path;
                path = path.substring(idx);
            }
            return `${BASE_URL}/${path}`;
        })();

        return (
            <View style={[styles.requestCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[styles.requestCardHeader, { backgroundColor: theme.accent }]}>
                    <View style={styles.requestBadge}>
                        <Ionicons name="color-wand" size={12} color="#FFCC80" />
                        <Text style={styles.requestBadgeText}>Custom Request</Text>
                    </View>
                    <Text style={styles.requestCardTitle} numberOfLines={1}>{title}</Text>
                </View>
                {imageUri && <Image source={{ uri: imageUri }} style={styles.requestCardImg} resizeMode="cover" />}
                <View style={styles.requestDetails}>
                    {details ? <View style={styles.reqRow}><Ionicons name="document-text-outline" size={13} color={theme.accent} /><Text style={[styles.reqText, { color: theme.textSecondary }]} numberOfLines={2}>{details}</Text></View> : null}
                    {budget  ? <View style={styles.reqRow}><Ionicons name="cash-outline" size={13} color="#4CAF50" /><Text style={[styles.reqText, { color: '#4CAF50', fontWeight:'600' }]}>{budget}</Text></View> : null}
                    {service ? <View style={styles.reqRow}><Ionicons name="construct-outline" size={13} color={theme.accent} /><Text style={[styles.reqText, { color: theme.textSecondary }]}>{service}</Text></View> : null}
                </View>
                <TouchableOpacity
                    style={[styles.requestViewBtn, { backgroundColor: theme.accentBg || '#efebe9' }]}
                    onPress={() => navigation.navigate('RequestDetail', { requestId: item.request_id, userType: isMe ? 'buyer' : 'seller' })}
                >
                    <Text style={[styles.requestViewBtnText, { color: theme.accent }]}>View Request Details</Text>
                    <Ionicons name="chevron-forward" size={13} color={theme.accent} />
                </TouchableOpacity>
                <Text style={[styles.requestTime, { color: theme.textMuted }]}>{formatMsgTime(item.created_at)}</Text>
            </View>
        );
    };

    const renderMessage = ({ item, index }) => {
        const isMe = item.sender_id === user.id;

        // Day separator
        const prevItem  = messages[index - 1];
        const curDay    = getDayLabel(item.created_at);
        const prevDay   = prevItem ? getDayLabel(prevItem.created_at) : null;
        const showDay   = curDay !== prevDay;

        return (
            <>
                {showDay && (
                    <View style={styles.daySeparator}>
                        <View style={[styles.dayLine, { backgroundColor: theme.border }]} />
                        <Text style={[styles.dayText, { color: theme.textMuted, backgroundColor: theme.background }]}>{curDay}</Text>
                        <View style={[styles.dayLine, { backgroundColor: theme.border }]} />
                    </View>
                )}

                {item.request_id ? (
                    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                        {renderRequestCard(item, isMe)}
                    </View>
                ) : (
                    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                        {/* Them: small avatar — real photo if available, else initials */}
                        {!isMe && (
                            targetUserImage ? (
                                <Image
                                    source={{ uri: targetUserImage }}
                                    style={styles.theirAvatar}
                                />
                            ) : (
                                <View style={[styles.theirAvatar, { backgroundColor: avatarColor(targetUserName) }]}>
                                    <Text style={styles.theirAvatarText}>{initials(targetUserName)[0]}</Text>
                                </View>
                            )
                        )}
                        <View style={[
                            styles.bubble,
                            isMe
                                ? [styles.bubbleMe, { backgroundColor: theme.accent }]
                                : [styles.bubbleThem, { backgroundColor: theme.card, borderColor: theme.border }],
                        ]}>
                            <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : { color: theme.text }]}>
                                {item.message}
                            </Text>
                            <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : { color: theme.textMuted }]}>
                                {formatMsgTime(item.created_at)}
                                {isMe && <Text>  {item.is_read ? '✓✓' : '✓'}</Text>}
                            </Text>
                        </View>
                    </View>
                )}
            </>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <KeyboardAwareWrapper>

                {/* Header */}
                <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.headerCenter} activeOpacity={0.8}>
                        {targetUserImage ? (
                            <Image source={{ uri: targetUserImage }} style={styles.headerAvatar} />
                        ) : (
                            <View style={[styles.headerAvatarFallback, { backgroundColor: avatarColor(targetUserName) }]}>
                                <Text style={styles.headerAvatarText}>{initials(targetUserName)}</Text>
                            </View>
                        )}
                        <View style={styles.headerInfo}>
                            <Text style={[styles.headerName, { color: theme.headerText }]} numberOfLines={1}>
                                {targetUserName}
                            </Text>
                            <Text style={[styles.headerStatus, { color: theme.accent }]}>Active now</Text>
                        </View>
                    </TouchableOpacity>
                    {/* Actions */}
                    <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.headerBtn}>
                        <Ionicons name="add-circle-outline" size={26} color={theme.accent} />
                    </TouchableOpacity>
                </View>

                {/* Message list */}
                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={theme.accent} />
                    </View>
                ) : messages.length === 0 ? (
                    <View style={styles.center}>
                        <View style={[styles.emptyIcon, { backgroundColor: theme.inputBg }]}>
                            <Ionicons name="chatbubble-ellipses-outline" size={48} color={theme.textMuted} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: theme.text }]}>Start the conversation</Text>
                        <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                            Say hello to {targetUserName}!
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={item => item.message_id.toString()}
                        contentContainerStyle={styles.msgList}
                        keyboardShouldPersistTaps="handled"
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        showsVerticalScrollIndicator={false}
                    />
                )}

                {/* Input bar */}
                <View style={[styles.inputBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
                    {/* '+' attachment button — only shown in personal/customer mode */}
                    {mode !== 'shop' && (
                        <TouchableOpacity style={[styles.inputAction, { backgroundColor: theme.inputBg }]} onPress={() => setMenuVisible(true)}>
                            <Ionicons name="add" size={22} color={theme.accent} />
                        </TouchableOpacity>
                    )}
                    <View style={[styles.inputWrap, { backgroundColor: theme.inputBg }]}>
                        <TextInput
                            style={[styles.input, { color: theme.text }]}
                            placeholder="Type a message…"
                            placeholderTextColor={theme.textMuted}
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            maxLength={1000}
                        />
                    </View>
                    <TouchableOpacity
                        style={[styles.sendBtn, { backgroundColor: inputText.trim() ? theme.accent : theme.border }]}
                        onPress={handleSend}
                        disabled={!inputText.trim() || sending}
                        activeOpacity={0.85}
                    >
                        {sending
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Ionicons name="send" size={18} color="#fff" style={{ marginLeft: 2 }} />
                        }
                    </TouchableOpacity>
                </View>
            </KeyboardAwareWrapper>

            {/* Options menu — only available in personal/customer mode */}
            {mode !== 'shop' && (
                <Modal transparent visible={menuVisible} animationType="slide" onRequestClose={() => setMenuVisible(false)}>
                    <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
                        <View style={[styles.menuSheet, { backgroundColor: theme.card }]}>
                            <View style={[styles.menuHandle, { backgroundColor: theme.border }]} />
                            <Text style={[styles.menuTitle, { color: theme.text }]}>Attachments</Text>
                            <TouchableOpacity
                                style={[styles.menuItem, { backgroundColor: theme.inputBg }]}
                                onPress={() => {
                                    setMenuVisible(false);
                                    navigation.navigate('RequestCustomization', { sellerId: targetUserId });
                                }}
                            >
                                <View style={[styles.menuItemIcon, { backgroundColor: theme.accentBg || '#efebe9' }]}>
                                    <Ionicons name="create-outline" size={22} color={theme.accent} />
                                </View>
                                <View>
                                    <Text style={[styles.menuItemTitle, { color: theme.text }]}>Request Custom Item</Text>
                                    <Text style={[styles.menuItemSub, { color: theme.textMuted }]}>Send a customization request</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>
            )}

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                onConfirm={() => { hideAlert(); alertConfig.onConfirm?.(); }}
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
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 10,
        borderBottomWidth: 1, gap: 10,
    },
    headerBtn: { padding: 4 },
    headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerAvatar: { width: 42, height: 42, borderRadius: 21 },
    headerAvatarFallback: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
    headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    headerInfo: { flex: 1 },
    headerName: { fontSize: 16, fontWeight: '700' },
    headerStatus: { fontSize: 11, fontWeight: '500', marginTop: 1 },

    /* Messages */
    msgList: { paddingHorizontal: 14, paddingVertical: 16, gap: 4 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },

    /* Day separator */
    daySeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 8 },
    dayLine: { flex: 1, height: 1 },
    dayText: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8 },

    /* Message rows */
    msgRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-end', gap: 8 },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowThem: { justifyContent: 'flex-start' },

    /* Their avatar bubble */
    theirAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginBottom: 2 },
    theirAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },

    /* Bubble */
    bubble: { maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
    bubbleMe: { borderBottomRightRadius: 6 },
    bubbleThem: { borderBottomLeftRadius: 6, borderWidth: 1 },
    bubbleText: { fontSize: 15, lineHeight: 21 },
    bubbleTextMe: { color: '#fff' },
    bubbleTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
    bubbleTimeMe: { color: 'rgba(255,255,255,0.70)' },

    /* Empty */
    emptyIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
    emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },

    /* Input bar */
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 8,
        paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1,
    },
    inputAction: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    inputWrap: { flex: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
    input: { fontSize: 15, maxHeight: 120 },
    sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },

    /* Request card */
    requestCard: { width: 260, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
    requestCardHeader: { paddingHorizontal: 12, paddingVertical: 10 },
    requestBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
    requestBadgeText: { color: '#FFCC80', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    requestCardTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
    requestCardImg: { width: '100%', height: 150 },
    requestDetails: { padding: 12, gap: 6 },
    reqRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    reqText: { flex: 1, fontSize: 12, lineHeight: 17 },
    requestViewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 10, marginTop: 2, paddingVertical: 9, borderRadius: 10, gap: 4 },
    requestViewBtnText: { fontSize: 13, fontWeight: '700' },
    requestTime: { fontSize: 10, textAlign: 'right', paddingHorizontal: 12, paddingBottom: 8 },

    /* Options menu */
    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    menuSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    menuHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
    menuTitle: { fontSize: 16, fontWeight: '800', marginBottom: 16 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 14 },
    menuItemIcon: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    menuItemTitle: { fontSize: 15, fontWeight: '700' },
    menuItemSub: { fontSize: 12, marginTop: 2 },
});

export default ChatScreen;
