import React from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Image, Alert } from 'react-native';
import { BASE_URL } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const menuItems = [
    {
        id: '1',
        title: 'My Profile',
        icon: 'person-circle-outline',
    },
    {
        id: '2',
        title: 'Messages',
        icon: 'chatbubbles-outline',
    },
    {
        id: '3',
        title: 'My Orders',
        icon: 'receipt-outline',
    },
    {
        id: '4',
        title: 'Become a Seller',
        icon: 'storefront-outline',
    },
    {
        id: '5',
        title: 'About Us',
        icon: 'information-circle-outline',
    },
    {
        id: '7',
        title: 'Settings',
        icon: 'settings-outline',
    },
    {
        id: '8',
        title: 'Privacy Policy',
        icon: 'shield-checkmark-outline',
    },
];

const MenuScreen = ({ navigation }) => {
    const { user, logout } = useAuth();
    const { theme } = useTheme();

    const handleLogout = async () => {
        await logout();
        navigation.reset({
            index: 0,
            routes: [{ name: 'GetStarted' }],
        });
    };

    const [alertConfig, setAlertConfig] = React.useState({ visible: false, title: '', message: '', type: 'error' });
    const showAlert = (message, title = 'Attention') => setAlertConfig({ visible: true, title, message, type: 'warning' });
    const hideAlert = () => setAlertConfig({ ...alertConfig, visible: false });

    const renderItem = ({ item }) => (
        <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.6}
            onPress={() => {
                const requiresAuth = ['My Profile', 'Messages', 'My Orders', 'Become a Seller', 'My Shop', 'Settings'];
                if (user?.role === 'guest' && requiresAuth.includes(item.title)) {
                    showAlert(`Please log in or register to access ${item.title}.`, "Account Required");
                    return;
                }

                if (item.title === 'My Profile') {
                    navigation.navigate('Profile');
                } else if (item.title === 'Messages') {
                    navigation.navigate('Messages');
                } else if (item.title === 'My Orders') {
                    navigation.navigate('MyOrders');
                } else if (item.title === 'Become a Seller') {
                    navigation.navigate('BecomeSeller');
                } else if (item.title === 'My Shop') {
                    navigation.navigate('MyShop');
                } else if (item.title === 'About Us') {
                    navigation.navigate('AboutUs');
                } else if (item.title === 'Settings') {
                    navigation.navigate('Settings');
                } else if (item.title === 'Privacy Policy') {
                    navigation.navigate('PrivacyPolicy');
                }
            }}
        >
            <View style={styles.menuItemLeft}>
                <View style={[styles.iconCircle, { backgroundColor: theme.accentBg }]}>
                    <Ionicons name={item.icon} size={22} color={theme.icon} />
                </View>
                <Text style={[styles.menuItemText, { color: theme.text }]}>{item.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={styles.headerRow}>
                <Text style={[styles.header, { color: theme.headerText }]}>Menu</Text>
                <View style={styles.headerRight}>
                    <TouchableOpacity
                        style={[styles.iconButton, { borderColor: theme.accent }]}
                        onPress={() => navigation.navigate('Cart')}
                    >
                        <Ionicons name="cart-outline" size={22} color={theme.icon} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.iconButton, styles.helpButton, { borderColor: theme.accent }]}
                        onPress={() => navigation.navigate('HelpCenter')}
                    >
                        <Ionicons name="help-circle-outline" size={22} color={theme.icon} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Avatar Section */}
            <TouchableOpacity
                style={[styles.avatarSection, { borderBottomColor: theme.border }]}
                activeOpacity={0.8}
                onPress={() => {
                    if (user?.role === 'guest') {
                        showAlert('Please log in or register to view your profile.', 'Account Required');
                    } else {
                        navigation.navigate('Profile');
                    }
                }}
            >
                <View style={[styles.avatarCircle, { backgroundColor: theme.accent }, user?.profile_image ? { backgroundColor: 'transparent' } : {}]}>
                    {user?.profile_image ? (
                        <Image
                            source={{ uri: user.profile_image.startsWith('http') ? user.profile_image : `${BASE_URL}/${user.profile_image}` }}
                            style={styles.avatarImageReal}
                        />
                    ) : (
                        <Ionicons name="person" size={36} color="#fff" />
                    )}
                </View>
                <View style={styles.avatarInfo}>
                    <Text style={[styles.avatarName, { color: theme.headerText }]}>{user?.role === 'guest' ? 'Guest Explorer' : (user?.full_name || 'Sign in to view profile')}</Text>
                    <Text style={[styles.avatarEmail, { color: theme.textSecondary }]}>{user?.role === 'guest' ? 'Awaiting Login' : user?.email}</Text>
                </View>
                {user?.role !== 'guest' && (
                    <View>
                        <Ionicons name="create-outline" size={20} color={theme.accent} />
                    </View>
                )}
            </TouchableOpacity>

            {/* Menu Items */}
            <FlatList
                data={user?.role === 'seller'
                    ? menuItems.map(item => item.title === 'Become a Seller' ? { ...item, title: 'My Shop', icon: 'storefront' } : item)
                    : menuItems
                }
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                showsVerticalScrollIndicator={false}
            />

            {/* Footer */}
            <View style={styles.footer}>
                <TouchableOpacity style={[styles.logoutButton, { borderColor: user?.role === 'guest' ? theme.accent : theme.danger }]} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={20} color={user?.role === 'guest' ? theme.accent : theme.danger} />
                    <Text style={[styles.logoutText, { color: user?.role === 'guest' ? theme.accent : theme.danger }]}>
                        {user?.role === 'guest' ? 'Log In / Register' : 'Log Out'}
                    </Text>
                </TouchableOpacity>
                <Text style={[styles.versionText, { color: theme.textMuted }]}>JM Glass & Furniture v1.0</Text>
            </View>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 15,
    },
    header: {
        fontSize: 26,
        fontWeight: '700',
        color: '#3e2723',
        letterSpacing: 0.5,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: '#8D6E63',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
    helpButton: {
        // any specific styles for help button if needed separately
    },
    /* ── Avatar ── */
    avatarSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    avatarCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#8D6E63',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    avatarImageReal: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    avatarInfo: {
        flex: 1,
    },
    avatarName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#3e2723',
        marginBottom: 2,
    },
    avatarEmail: {
        fontSize: 13,
        color: '#999',
    },

    /* ── Menu Items ── */
    listContent: {
        paddingTop: 10,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f0eb',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    menuItemText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#333',
    },
    separator: {
        height: 1,
        backgroundColor: '#f0f0f0',
        marginLeft: 74,
    },

    /* ── Footer ── */
    footer: {
        alignItems: 'center',
        paddingBottom: 20,
        paddingTop: 10,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 30,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: '#e53935',
        marginBottom: 12,
    },
    logoutText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#e53935',
        marginLeft: 8,
    },
    versionText: {
        fontSize: 12,
        color: '#bbb',
    },
});

export default MenuScreen;
