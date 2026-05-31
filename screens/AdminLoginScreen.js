import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ActivityIndicator, Platform, StatusBar,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';

const AdminLoginScreen = ({ onCancel }) => {
    const { login, logout } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            setError('Please enter your email and password.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            // AuthContext.login calls the API and sets the user in context
            const response = await login(email.trim(), password);
            // If logged in user is NOT admin, reject them
            if (response?.user?.role !== 'admin') {
                await logout(); // clear the session immediately
                setError('Access denied. Only administrators can log in during maintenance.');
            }
            // If admin → checkMaintenance (via useEffect on user change in App.js)
            //          will detect role=admin, clear the maintenance gate automatically.
        } catch (e) {
            const msg = e?.message || '';
            if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')) {
                setError('Invalid email or password.');
            } else {
                setError('Could not connect to the server. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#1a0a00" />
            <LinearGradient
                colors={['#1a0a00', '#3e1a00', '#5d2b00']}
                style={StyleSheet.absoluteFill}
            />

            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <KeyboardAwareWrapper
                    style={styles.kav}
                >
                    {/* Back button */}
                    <TouchableOpacity style={styles.backBtn} onPress={onCancel}>
                        <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.backText}>Back to maintenance</Text>
                    </TouchableOpacity>

                    <View style={styles.card}>
                        {/* Icon */}
                        <View style={styles.iconWrap}>
                            <Ionicons name="shield-checkmark" size={36} color="#FF7043" />
                        </View>

                        <Text style={styles.title}>Admin Login</Text>
                        <Text style={styles.subtitle}>
                            This portal is restricted to administrators only.
                        </Text>

                        {/* Error */}
                        {!!error && (
                            <View style={styles.errorBox}>
                                <Ionicons name="alert-circle" size={15} color="#ef5350" />
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        {/* Email */}
                        <View style={styles.inputWrap}>
                            <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Admin email"
                                placeholderTextColor="rgba(255,255,255,0.35)"
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </View>

                        {/* Password */}
                        <View style={styles.inputWrap}>
                            <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Password"
                                placeholderTextColor="rgba(255,255,255,0.35)"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                            />
                            <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={18}
                                    color="rgba(255,255,255,0.5)"
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Submit */}
                        <TouchableOpacity
                            style={[styles.loginBtn, loading && { opacity: 0.7 }]}
                            onPress={handleLogin}
                            disabled={loading}
                            activeOpacity={0.85}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <View style={styles.loginBtnRow}>
                                    <Ionicons name="log-in-outline" size={18} color="#fff" />
                                    <Text style={styles.loginBtnText}>Sign In as Admin</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAwareWrapper>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safe: { flex: 1 },
    kav: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    backBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginBottom: 28, alignSelf: 'flex-start',
        paddingVertical: 6, paddingHorizontal: 2,
    },
    backText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '500' },
    card: {
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 24,
        padding: 28,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    iconWrap: {
        width: 68, height: 68, borderRadius: 20,
        backgroundColor: 'rgba(255,112,67,0.2)',
        justifyContent: 'center', alignItems: 'center',
        alignSelf: 'center', marginBottom: 20,
        borderWidth: 1, borderColor: 'rgba(255,112,67,0.35)',
    },
    title: { fontSize: 24, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 6 },
    subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginBottom: 24, lineHeight: 19 },
    errorBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        backgroundColor: 'rgba(239,83,80,0.15)', borderRadius: 10,
        padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,83,80,0.3)',
    },
    errorText: { color: '#ef9a9a', fontSize: 13, flex: 1, lineHeight: 18 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 14, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        marginBottom: 14, paddingHorizontal: 14,
        height: 52,
    },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: '#fff', fontSize: 15 },
    eyeBtn: { padding: 4 },
    loginBtn: {
        backgroundColor: '#FF7043', borderRadius: 14,
        paddingVertical: 16, marginTop: 8,
        shadowColor: '#FF7043', shadowOpacity: 0.5, shadowRadius: 10, elevation: 5,
    },
    loginBtnRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

export default AdminLoginScreen;
