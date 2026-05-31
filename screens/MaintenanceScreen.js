import React from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Dimensions, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_W } = Dimensions.get('window');

const MaintenanceScreen = ({ message, onRetry, isRetrying, onAdminLogin }) => {
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#1a0a00" />
            <LinearGradient
                colors={['#1a0a00', '#3e1a00', '#5d2b00']}
                style={StyleSheet.absoluteFill}
            />

            {/* Animated icon area */}
            <View style={styles.iconWrap}>
                <View style={styles.iconOuter}>
                    <View style={styles.iconInner}>
                        <Ionicons name="construct" size={52} color="#FF7043" />
                    </View>
                </View>
                {/* Orbiting dots */}
                {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                    <View
                        key={i}
                        style={[
                            styles.orbitDot,
                            {
                                transform: [
                                    { rotate: `${deg}deg` },
                                    { translateX: 60 },
                                ],
                                opacity: [1, 0.7, 0.5, 0.7, 0.5, 0.8][i],
                                backgroundColor: i % 2 === 0 ? '#FF7043' : '#FF9800',
                            },
                        ]}
                    />
                ))}
            </View>

            <SafeAreaView style={styles.content} edges={['top', 'bottom']}>
                <View style={styles.textArea}>
                    {/* Status badge */}
                    <View style={styles.statusBadge}>
                        <View style={styles.statusDot} />
                        <Text style={styles.statusBadgeText}>Under Maintenance</Text>
                    </View>

                    <Text style={styles.title}>We'll be right back!</Text>
                    <Text style={styles.subtitle}>
                        {message || 'We are currently performing scheduled maintenance to improve your experience. Please check back soon.'}
                    </Text>

                    {/* Info cards */}
                    <View style={styles.infoRow}>
                        {[
                            { icon: 'time-outline', label: 'Temporary', sub: 'This won\'t take long' },
                            { icon: 'shield-checkmark-outline', label: 'Secure', sub: 'Your data is safe' },
                            { icon: 'refresh-outline', label: 'Coming back', sub: 'Better than ever' },
                        ].map((item, i) => (
                            <View key={i} style={styles.infoCard}>
                                <Ionicons name={item.icon} size={22} color="#FF9800" />
                                <Text style={styles.infoLabel}>{item.label}</Text>
                                <Text style={styles.infoSub}>{item.sub}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Retry button */}
                    <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={onRetry}
                        disabled={isRetrying}
                        activeOpacity={0.8}
                    >
                        {isRetrying ? (
                            <View style={styles.retryContent}>
                                <Ionicons name="reload" size={18} color="#fff" />
                                <Text style={styles.retryText}>Checking...</Text>
                            </View>
                        ) : (
                            <View style={styles.retryContent}>
                                <Ionicons name="refresh" size={18} color="#fff" />
                                <Text style={styles.retryText}>Try Again</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Admin login link */}
                    <TouchableOpacity
                        style={styles.adminBtn}
                        onPress={onAdminLogin}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="shield-checkmark-outline" size={15} color="rgba(255,255,255,0.55)" />
                        <Text style={styles.adminBtnText}>Admin Login</Text>
                    </TouchableOpacity>

                    <Text style={styles.footer}>JM Glass &amp; Furniture</Text>
                </View>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    iconWrap: {
        position: 'absolute',
        top: '18%',
        alignSelf: 'center',
        width: 140,
        height: 140,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconOuter: {
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: 'rgba(255,112,67,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,112,67,0.3)',
    },
    iconInner: {
        width: 82,
        height: 82,
        borderRadius: 41,
        backgroundColor: 'rgba(255,112,67,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    orbitDot: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    content: { flex: 1, justifyContent: 'flex-end', paddingBottom: 30 },
    textArea: {
        marginHorizontal: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,112,67,0.2)',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 5,
        marginBottom: 16,
        gap: 7,
        borderWidth: 1,
        borderColor: 'rgba(255,112,67,0.4)',
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#FF7043',
    },
    statusBadgeText: { color: '#FF7043', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    title: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 10, lineHeight: 32 },
    subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 21, marginBottom: 22 },
    infoRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    infoCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 14,
        padding: 12,
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    infoLabel: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
    infoSub: { color: 'rgba(255,255,255,0.5)', fontSize: 10, textAlign: 'center' },
    retryBtn: {
        backgroundColor: '#FF7043',
        borderRadius: 14,
        paddingVertical: 15,
        marginBottom: 12,
        shadowColor: '#FF7043',
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 6,
    },
    retryContent: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    retryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    adminBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        marginBottom: 6,
    },
    adminBtnText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600' },
    footer: { color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', fontWeight: '600' },
});

export default MaintenanceScreen;
