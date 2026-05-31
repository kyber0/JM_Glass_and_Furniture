import React, { useState } from 'react';
import {
    StyleSheet, Text, View, TouchableOpacity,
    Switch, ScrollView, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../components/CustomAlert';
import { useTheme, LANGUAGES } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SettingsScreen = ({ navigation }) => {
    const { theme, darkMode, toggleDarkMode, language, changeLanguage } = useTheme();

    const [pushNotifications, setPushNotifications] = useState(true);
    const [emailNotifications, setEmailNotifications] = useState(false);
    const [orderUpdates, setOrderUpdates] = useState(true);
    const [promotions, setPromotions] = useState(true);
    const [langModalVisible, setLangModalVisible] = useState(false);

    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'info', showCancel: false, onConfirm: null
    });

    const showAlert = (title, message, type = 'info', showCancel = false, onConfirm = null) => {
        setAlertConfig({ visible: true, title, message, type, showCancel, onConfirm });
    };
    const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const currentLang = LANGUAGES.find(l => l.code === language)?.label || 'English';

    const settingsSections = [
        {
            title: 'Notifications',
            items: [
                { label: 'Push Notifications', type: 'toggle', value: pushNotifications, onToggle: setPushNotifications, icon: 'notifications-outline' },
                { label: 'Email Notifications', type: 'toggle', value: emailNotifications, onToggle: setEmailNotifications, icon: 'mail-outline' },
                { label: 'Order Updates', type: 'toggle', value: orderUpdates, onToggle: setOrderUpdates, icon: 'cube-outline' },
                { label: 'Promotions & Deals', type: 'toggle', value: promotions, onToggle: setPromotions, icon: 'pricetag-outline' },
            ],
        },
        {
            title: 'Appearance',
            items: [
                { label: 'Dark Mode', type: 'toggle', value: darkMode, onToggle: toggleDarkMode, icon: 'moon-outline' },
                {
                    label: 'Language', type: 'nav', subtitle: currentLang,
                    icon: 'language-outline', action: () => setLangModalVisible(true)
                },
            ],
        },
        {
            title: 'Account',
            items: [
                { label: 'Change Password', type: 'nav', icon: 'lock-closed-outline', action: () => navigation.navigate('ChangePassword') },
                { label: 'Shipping Addresses', type: 'nav', icon: 'location-outline', action: () => navigation.navigate('ShippingAddresses') },
                { label: 'Payment Methods', type: 'nav', icon: 'card-outline', action: () => navigation.navigate('PaymentMethods') },
                { label: 'Linked Accounts', type: 'nav', icon: 'link-outline' },
            ],
        },
        {
            title: 'Support',
            items: [
                { label: 'Help Center', type: 'nav', icon: 'help-circle-outline', action: () => navigation.navigate('HelpCenter') },
                { label: 'Report a Problem', type: 'nav', icon: 'flag-outline', action: () => navigation.navigate('ReportProblem') },
                { label: 'Rate the App', type: 'nav', icon: 'star-outline' },
            ],
        },
        {
            title: 'Data & Privacy',
            items: [
                { label: 'Privacy Policy', type: 'nav', icon: 'shield-checkmark-outline', action: () => navigation.navigate('PrivacyPolicy') },
                { label: 'Terms of Service', type: 'nav', icon: 'document-text-outline', action: () => navigation.navigate('TermsOfService') },
                {
                    label: 'Clear Cache', type: 'action', icon: 'trash-outline', action: async () => {
                        await AsyncStorage.multiRemove(['cachedProducts', 'cachedCart']);
                        showAlert('Cache Cleared', 'App cache has been cleared.', 'success');
                    }
                },
                {
                    label: 'Delete Account', type: 'danger', icon: 'close-circle-outline',
                    action: () => showAlert('Delete Account', 'Are you sure? This action cannot be undone.', 'error', true,
                        () => showAlert('Submitted', 'Your account has been queued for deletion.', 'info'))
                },
            ],
        },
    ];

    const renderItem = (item, i, isLast) => (
        <TouchableOpacity
            key={i}
            style={[
                styles.settingItem,
                { borderBottomColor: theme.border },
                isLast && { borderBottomWidth: 0 }
            ]}
            activeOpacity={item.type === 'toggle' ? 1 : 0.6}
            onPress={() => { if (item.action) item.action(); }}
        >
            <View style={styles.settingLeft}>
                <View style={[
                    styles.settingIconCircle,
                    { backgroundColor: item.type === 'danger' ? (darkMode ? '#3a1210' : '#fdecea') : theme.accentBg }
                ]}>
                    <Ionicons
                        name={item.icon}
                        size={18}
                        color={item.type === 'danger' ? theme.danger : theme.icon}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.settingLabel, { color: item.type === 'danger' ? theme.danger : theme.text }]}>
                        {item.label}
                    </Text>
                    {item.subtitle && <Text style={[styles.settingSubtitle, { color: theme.accent }]}>{item.subtitle}</Text>}
                </View>
            </View>
            {item.type === 'toggle' ? (
                <Switch
                    value={item.value}
                    onValueChange={item.onToggle}
                    trackColor={{ false: theme.border, true: '#c8a98a' }}
                    thumbColor={item.value ? theme.accent : '#f4f3f4'}
                />
            ) : (
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            )}
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Settings</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {settingsSections.map((section, si) => (
                    <View key={si} style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: theme.accent }]}>{section.title}</Text>
                        <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
                            {section.items.map((item, ii) => renderItem(item, ii, ii === section.items.length - 1))}
                        </View>
                    </View>
                ))}
                <Text style={[styles.versionText, { color: theme.textMuted }]}>JM Glass & Furniture v1.0.0</Text>
                <View style={{ height: 30 }} />
            </ScrollView>

            {/* Language Picker Modal */}
            <Modal visible={langModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.modalTitle, { color: theme.text }]}>Select Language</Text>
                            <TouchableOpacity onPress={() => setLangModalVisible(false)}>
                                <Ionicons name="close" size={22} color={theme.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={LANGUAGES}
                            keyExtractor={item => item.code}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.langOption, { borderBottomColor: theme.border }]}
                                    onPress={() => {
                                        changeLanguage(item.code);
                                        setLangModalVisible(false);
                                    }}
                                >
                                    <Text style={[styles.langText, { color: theme.text }]}>{item.label}</Text>
                                    {language === item.code && (
                                        <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                showCancel={alertConfig.showCancel}
                onConfirm={() => { hideAlert(); if (alertConfig.onConfirm) alertConfig.onConfirm(); }}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 15, paddingVertical: 15,
        borderBottomWidth: 1,
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    scrollContent: { padding: 15 },

    section: { marginBottom: 20 },
    sectionTitle: {
        fontSize: 13, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 0.5,
        marginBottom: 8, marginLeft: 5,
    },
    sectionCard: { borderRadius: 12, overflow: 'hidden' },

    settingItem: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, paddingHorizontal: 15,
        borderBottomWidth: 1,
    },
    settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    settingIconCircle: {
        width: 34, height: 34, borderRadius: 17,
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    settingLabel: { fontSize: 15 },
    settingSubtitle: { fontSize: 12, marginTop: 2 },

    // Language modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 20, borderBottomWidth: 1,
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    langOption: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1,
    },
    langText: { fontSize: 16 },

    versionText: { textAlign: 'center', fontSize: 12, marginTop: 10 },
});

export default SettingsScreen;
