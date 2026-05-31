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
import * as Location from 'expo-location';
import { geocodeAPI } from '../services/api';

const BG_IMAGE = 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?q=80&w=1992&auto=format&fit=crop';

// ── Input field ───────────────────────────────────────────────────────────────
const InputField = ({ icon, placeholder, value, onChangeText, keyboardType, autoCapitalize, secureTextEntry, rightIcon, onRightIconPress, suffix }) => (
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
        {suffix}
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
        marginBottom: 12, paddingHorizontal: 14, height: 52,
    },
    icon: { marginRight: 10 },
    input: { flex: 1, color: '#fff', fontSize: 15 },
    eye: { padding: 4 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
const SignUpScreen = ({ navigation }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [location, setLocation] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const { register } = useAuth();

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
        ]).start();
    }, []);

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'error' });
    const showAlert = (message, title = 'Error', type = 'error') => setAlertConfig({ visible: true, title, message, type });
    const hideAlert = () => {
        const wasSuccess = alertConfig.type === 'success';
        setAlertConfig(a => ({ ...a, visible: false }));
        if (wasSuccess) navigation.replace('Login');
    };

    const detectLocation = async () => {
        setIsLocating(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return showAlert('Permission denied', 'Location', 'warning');

            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = pos.coords;

            // 1. Prioritize OpenStreetMap (via backend proxy)
            // OSM actually has barangay polygon data for this rural area, whereas Google Maps fails.
            const res = await geocodeAPI.reverse(latitude, longitude);
            
            if (res.success && res.address) {
                setLocation(res.address);
                setIsLocating(false);
                return;
            }

            // 2. Fallback to Native Device Geocoder (Google Maps/Apple Maps)
            const [nativeAddr] = await Location.reverseGeocodeAsync({ latitude, longitude });
            
            if (nativeAddr) {
                // Smart formatter to filter out generic "Unnamed Road" and Google Plus Codes (like 8856+HM)
                const isValidName = (str) => str && !str.toLowerCase().includes('unnamed') && !str.includes('+');
                
                const parts = [
                    isValidName(nativeAddr.name) ? nativeAddr.name : null,
                    nativeAddr.streetNumber,
                    isValidName(nativeAddr.street) ? nativeAddr.street : null,
                    nativeAddr.district,
                    nativeAddr.city,
                    nativeAddr.subregion,
                    nativeAddr.region,
                    nativeAddr.country
                ].filter(Boolean);

                const deduped = parts.filter((item, index) => parts.indexOf(item) === index);
                let formattedNative = deduped.join(', ');
                
                if (formattedNative) {
                    setLocation(formattedNative);
                    setIsLocating(false);
                    return;
                }
            }

            showAlert('Could not determine your exact address. Please type it manually.', 'Location', 'warning');
        } catch (e) {
            showAlert('Failed to detect location.', 'Error', 'error');
        } finally {
            setIsLocating(false);
        }
    };

    const handleSignUp = async () => {
        if (!name || !email || !password || !confirmPassword || !location)
            return showAlert('Please fill in all fields.', 'Missing Fields', 'warning');
        if (password !== confirmPassword)
            return showAlert('Passwords do not match.', 'Error', 'error');
        setIsSubmitting(true);
        try {
            await register({ email, password, full_name: name, address: location, phone: '' });
            setAlertConfig({
                visible: true,
                title: 'Account Created!',
                message: 'Your account has been created successfully. Please log in to continue.',
                type: 'success',
            });
        } catch (e) {
            showAlert(e.message || 'Sign up failed', 'Error', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const DetectBtn = (
        <TouchableOpacity
            onPress={detectLocation}
            disabled={isLocating}
            style={styles.detectBtn}
        >
            <Ionicons name={isLocating ? 'reload' : 'locate'} size={13} color="#C8A97E" />
            <Text style={styles.detectBtnText}>{isLocating ? '...' : 'Detect'}</Text>
        </TouchableOpacity>
    );

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
                        <Text style={styles.cardTitle}>Create Account</Text>
                        <Text style={styles.cardSub}>Join us and start shopping</Text>

                        <InputField
                            icon="person-outline"
                            placeholder="Full name"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                        />
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
                        <InputField
                            icon="shield-checkmark-outline"
                            placeholder="Confirm password"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry={!showConfirm}
                            rightIcon={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                            onRightIconPress={() => setShowConfirm(v => !v)}
                        />
                        <InputField
                            icon="location-outline"
                            placeholder="Your address / barangay"
                            value={location}
                            onChangeText={setLocation}
                            autoCapitalize="words"
                            suffix={DetectBtn}
                        />

                        {/* Service notice */}
                        <View style={styles.notice}>
                            <Ionicons name="information-circle-outline" size={15} color="#C8A97E" />
                            <Text style={styles.noticeText}>Delivery & installation available in select areas only.</Text>
                        </View>

                        {/* Sign Up button */}
                        <TouchableOpacity
                            onPress={handleSignUp}
                            disabled={isSubmitting}
                            style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 12, marginTop: 6 }}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={['#C8A97E', '#8D6E63']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={styles.primaryBtn}
                            >
                                {isSubmitting
                                    ? <Text style={styles.primaryBtnText}>Creating account...</Text>
                                    : <><Ionicons name="person-add-outline" size={18} color="#fff" /><Text style={styles.primaryBtnText}>Create Account</Text></>
                                }
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.divider}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>or sign up with</Text>
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

                        {/* Login link */}
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>Already have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                                <Text style={styles.footerLink}>Sign In</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                    <View style={{ height: 20 }} />
                </ScrollView>
            </KeyboardAwareWrapper>

            <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} type={alertConfig.type} onClose={hideAlert} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1a0f07' },
    bgImage: { ...StyleSheet.absoluteFillObject },
    scroll: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 10 },
    logoArea: { alignItems: 'center', paddingTop: 20, marginBottom: 10 },
    logo: { width: 130, height: 130, marginBottom: -20 },
    brandName: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '300', letterSpacing: 4 },
    card: {
        marginHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 28, padding: 24,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)',
    },
    cardTitle: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 4 },
    cardSub: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },
    detectBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(200,169,126,0.15)',
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 10, marginLeft: 4,
        borderWidth: 1, borderColor: 'rgba(200,169,126,0.3)',
    },
    detectBtnText: { color: '#C8A97E', fontSize: 11, fontWeight: '700' },
    notice: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        backgroundColor: 'rgba(200,169,126,0.1)',
        borderRadius: 10, padding: 10, marginBottom: 6,
        borderWidth: 1, borderColor: 'rgba(200,169,126,0.2)',
    },
    noticeText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, flex: 1, lineHeight: 17 },
    primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, gap: 8 },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
    dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
    dividerText: { color: 'rgba(255,255,255,0.35)', fontSize: 12 },
    socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 18 },
    socialBtn: {
        width: 52, height: 52, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center', borderWidth: 1,
    },
    footer: { flexDirection: 'row', justifyContent: 'center' },
    footerText: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
    footerLink: { color: '#C8A97E', fontSize: 13, fontWeight: '700' },
});

export default SignUpScreen;
