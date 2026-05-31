import React, { useState, useRef, useEffect } from 'react';
import {
    StyleSheet, Text, View, Image, TextInput, TouchableOpacity,
    Platform, ScrollView, Animated, StatusBar,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import CustomAlert from '../components/CustomAlert';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BG_IMAGE = 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?q=80&w=1992&auto=format&fit=crop';

// ── Themed input field ────────────────────────────────────────────────────────
const InputField = ({ icon, placeholder, value, onChangeText, keyboardType, autoCapitalize, secureTextEntry, rightIcon, onRightIconPress }) => (
    <View style={iStyles.wrap}>
        <Ionicons name={icon} size={18} color="rgba(200,169,126,0.8)" style={iStyles.icon} />
        <TextInput
            style={iStyles.input}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize || 'none'}
            secureTextEntry={secureTextEntry}
        />
        {rightIcon && (
            <TouchableOpacity onPress={onRightIconPress} style={iStyles.eye}>
                <Ionicons name={rightIcon} size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
        )}
    </View>
);
const iStyles = StyleSheet.create({
    wrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 14, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        marginBottom: 14, paddingHorizontal: 14, height: 52,
    },
    icon: { marginRight: 10 },
    input: { flex: 1, color: '#fff', fontSize: 15 },
    eye: { padding: 4 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
const LoginScreen = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const { login, loginAsGuest } = useAuth();

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
        ]).start();

        // Check biometric availability
        LocalAuthentication.hasHardwareAsync().then(has => {
            if (has) LocalAuthentication.isEnrolledAsync().then(setBiometricAvailable);
        });
    }, []);

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'error' });
    const showAlert = (message, title = 'Error', type = 'error') => setAlertConfig({ visible: true, title, message, type });
    const hideAlert = () => setAlertConfig(a => ({ ...a, visible: false }));

    const handleLogin = async () => {
        if (!email || !password) return showAlert('Please enter both email and password.', 'Missing Fields', 'warning');
        setIsSubmitting(true);
        try {
            await login(email, password);
            // Save credentials for biometric login
            await SecureStore.setItemAsync('bio_email', email);
            await SecureStore.setItemAsync('bio_password', password);
        }
        catch (e) { showAlert(e.message || 'Login failed', 'Error', 'error'); }
        finally { setIsSubmitting(false); }
    };

    const handleBiometricLogin = async () => {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Sign in to JM Glass & Furniture',
                fallbackLabel: 'Use Password',
            });
            if (result.success) {
                const storedEmail = await SecureStore.getItemAsync('bio_email');
                const storedPassword = await SecureStore.getItemAsync('bio_password');
                if (storedEmail && storedPassword) {
                    setIsSubmitting(true);
                    try { await login(storedEmail, storedPassword); }
                    catch (e) { showAlert('Biometric login failed. Please use your password.', 'Error', 'error'); }
                    finally { setIsSubmitting(false); }
                } else {
                    showAlert('No saved credentials. Please log in with your password first.', 'Setup Required', 'info');
                }
            }
        } catch (e) {
            showAlert('Biometric authentication failed.', 'Error', 'error');
        }
    };

    const handleGuestLogin = async () => {
        setIsSubmitting(true);
        try { await loginAsGuest(); }
        catch (e) { showAlert(e.message || 'Guest login failed', 'Error', 'error'); }
        finally { setIsSubmitting(false); }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            <Image source={{ uri: BG_IMAGE }} style={styles.bgImage} resizeMode="cover" />
            <LinearGradient
                colors={['rgba(0,0,0,0.2)', 'rgba(20,10,3,0.75)', 'rgba(15,7,2,0.97)']}
                locations={[0, 0.4, 1]}
                style={StyleSheet.absoluteFill}
            />

            <KeyboardAwareWrapper>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <SafeAreaView edges={['top']}>
                        {/* Logo */}
                        <Animated.View style={[styles.logoArea, { opacity: fadeAnim }]}>
                            <Image source={require('../assets/JM_logo.png')} style={styles.logo} resizeMode="contain" />
                            <Text style={styles.brandName}>JM GLASS & FURNITURE</Text>
                        </Animated.View>
                    </SafeAreaView>

                    {/* Card */}
                    <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                        <Text style={styles.cardTitle}>Welcome back</Text>
                        <Text style={styles.cardSub}>Sign in to your account</Text>

                        <InputField
                            icon="mail-outline"
                            placeholder="Email address"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                        />
                        <InputField
                            icon="lock-closed-outline"
                            placeholder="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPass}
                            rightIcon={showPass ? 'eye-off-outline' : 'eye-outline'}
                            onRightIconPress={() => setShowPass(v => !v)}
                        />

                        {/* Login button */}
                        <TouchableOpacity
                            onPress={handleLogin}
                            disabled={isSubmitting}
                            style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={['#C8A97E', '#8D6E63']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={styles.primaryBtn}
                            >
                                {isSubmitting
                                    ? <Text style={styles.primaryBtnText}>Signing in...</Text>
                                    : <><Ionicons name="log-in-outline" size={18} color="#fff" /><Text style={styles.primaryBtnText}>Sign In</Text></>
                                }
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Biometric Login */}
                        {biometricAvailable && (
                            <TouchableOpacity
                                style={styles.biometricBtn}
                                onPress={handleBiometricLogin}
                                disabled={isSubmitting}
                            >
                                <Ionicons name="finger-print" size={20} color="rgba(200,169,126,0.9)" />
                                <Text style={styles.biometricBtnText}>Use Biometric Login</Text>
                            </TouchableOpacity>
                        )}

                        {/* Guest */}
                        <TouchableOpacity
                            style={styles.guestBtn}
                            onPress={handleGuestLogin}
                            disabled={isSubmitting}
                        >
                            <Ionicons name="person-outline" size={16} color="rgba(200,169,126,0.8)" />
                            <Text style={styles.guestBtnText}>Continue as Guest</Text>
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.divider}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>or continue with</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        {/* Social */}
                        <View style={styles.socialRow}>
                            {[
                                { icon: 'logo-facebook', color: '#1877F2', bg: 'rgba(24,119,242,0.12)' },
                                { icon: 'logo-google', color: '#DB4437', bg: 'rgba(219,68,55,0.12)' },
                            ].map((s, i) => (
                                <TouchableOpacity key={i} style={[styles.socialBtn, { backgroundColor: s.bg, borderColor: s.color + '40' }]}>
                                    <Ionicons name={s.icon} size={22} color={s.color} />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Sign up link */}
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>Don't have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                                <Text style={styles.footerLink}>Sign Up</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </ScrollView>
            </KeyboardAwareWrapper>

            <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} type={alertConfig.type} onClose={hideAlert} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1a0f07' },
    bgImage: { ...StyleSheet.absoluteFillObject },
    scroll: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 30 },
    logoArea: { alignItems: 'center', paddingTop: 20, marginBottom: 10 },
    logo: { width: 140, height: 140, marginBottom: -20 },
    brandName: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '300', letterSpacing: 4 },
    card: {
        marginHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 28, padding: 26,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)',
    },
    cardTitle: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 4 },
    cardSub: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24 },
    primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, gap: 8 },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    guestBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderWidth: 1, borderColor: 'rgba(200,169,126,0.3)', borderRadius: 14,
        paddingVertical: 13, marginBottom: 20,
    },
    guestBtnText: { color: 'rgba(200,169,126,0.8)', fontSize: 14, fontWeight: '600' },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
    dividerText: { color: 'rgba(255,255,255,0.35)', fontSize: 12 },
    socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 22 },
    socialBtn: {
        width: 52, height: 52, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center', borderWidth: 1,
    },
    biometricBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderWidth: 1, borderColor: 'rgba(200,169,126,0.4)', borderRadius: 14,
        paddingVertical: 13, marginBottom: 12,
        backgroundColor: 'rgba(200,169,126,0.07)',
    },
    biometricBtnText: { color: 'rgba(200,169,126,0.9)', fontSize: 14, fontWeight: '600' },
    footer: { flexDirection: 'row', justifyContent: 'center' },
    footerText: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
    footerLink: { color: '#C8A97E', fontSize: 13, fontWeight: '700' },
});

export default LoginScreen;
