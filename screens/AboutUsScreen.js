import React from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    TouchableOpacity,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const teamMembers = [
    { name: 'Keaneth Dave Berido', role: 'Team Lead', icon: 'person' },
    { name: 'Jaika Mae Bañaria', role: 'Developer', icon: 'person' },
    { name: 'Sam Canonce', role: 'Developer', icon: 'person' },
    { name: 'Anna Beatrice Miranda', role: 'Developer', icon: 'person' },
];

const AboutUsScreen = ({ navigation }) => {
    const { theme } = useTheme();
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>About Us</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Logo / Brand */}
                <View style={styles.brandSection}>
                    <View style={[styles.logoCircle, { backgroundColor: theme.accent, shadowColor: theme.accent }]}>
                        <Ionicons name="diamond" size={40} color="#fff" />
                    </View>
                    <Text style={[styles.brandName, { color: theme.text }]}>JM Glass & Furniture</Text>
                    <Text style={[styles.brandTagline, { color: theme.accent }]}>Premium Glass Solutions Since 2015</Text>
                </View>

                {/* Mission */}
                <View style={[styles.card, { backgroundColor: theme.card }]}>
                    <View style={styles.cardIconRow}>
                        <Ionicons name="flag-outline" size={20} color={theme.accent} />
                        <Text style={[styles.cardTitle, { color: theme.text }]}>Our Mission</Text>
                    </View>
                    <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                        To provide high-quality glass and furniture products with exceptional craftsmanship, reliable installation services, and outstanding customer satisfaction.
                    </Text>
                </View>

                {/* Vision */}
                <View style={[styles.card, { backgroundColor: theme.card }]}>
                    <View style={styles.cardIconRow}>
                        <Ionicons name="eye-outline" size={20} color={theme.accent} />
                        <Text style={[styles.cardTitle, { color: theme.text }]}>Our Vision</Text>
                    </View>
                    <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                        To be the leading provider of innovative glass and furniture solutions in the Philippines, transforming spaces with elegance and durability.
                    </Text>
                </View>

                {/* Stats */}
                <View style={[styles.statsRow, { backgroundColor: theme.accent }]}>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>9+</Text>
                        <Text style={styles.statLabel}>Years</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>2K+</Text>
                        <Text style={styles.statLabel}>Projects</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>500+</Text>
                        <Text style={styles.statLabel}>Clients</Text>
                    </View>
                </View>

                {/* Team */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Our Team</Text>
                {teamMembers.map((member, i) => (
                    <View key={i} style={[styles.teamCard, { backgroundColor: theme.card }]}>
                        <View style={[styles.teamAvatar, { backgroundColor: theme.accent }]}>
                            <Ionicons name={member.icon} size={24} color="#fff" />
                        </View>
                        <View style={styles.teamInfo}>
                            <Text style={[styles.teamName, { color: theme.text }]}>{member.name}</Text>
                            <Text style={[styles.teamRole, { color: theme.textSecondary }]}>{member.role}</Text>
                        </View>
                    </View>
                ))}

                {/* Contact */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Get in Touch</Text>
                <View style={[styles.card, { backgroundColor: theme.card }]}>
                    <TouchableOpacity style={[styles.contactRow, { borderBottomColor: theme.border }]}>
                        <Ionicons name="call-outline" size={20} color={theme.accent} />
                        <Text style={[styles.contactText, { color: theme.textSecondary }]}>+63 912 345 6789</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.contactRow, { borderBottomColor: theme.border }]}>
                        <Ionicons name="mail-outline" size={20} color={theme.accent} />
                        <Text style={[styles.contactText, { color: theme.textSecondary }]}>info@jmglass.com</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.contactRow, { borderBottomColor: theme.border }]}>
                        <Ionicons name="location-outline" size={20} color={theme.accent} />
                        <Text style={[styles.contactText, { color: theme.textSecondary }]}>123 Glass St, Manila, Philippines</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.contactRow, { borderBottomWidth: 0 }]}>
                        <Ionicons name="globe-outline" size={20} color={theme.accent} />
                        <Text style={[styles.contactText, { color: theme.textSecondary }]}>www.jmglass.com</Text>
                    </TouchableOpacity>
                </View>

                {/* Social */}
                <View style={styles.socialRow}>
                    <TouchableOpacity style={[styles.socialIcon, { backgroundColor: theme.inputBg }]}>
                        <Ionicons name="logo-facebook" size={24} color="#1877F2" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.socialIcon, { backgroundColor: theme.inputBg }]}>
                        <Ionicons name="logo-instagram" size={24} color="#E4405F" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.socialIcon, { backgroundColor: theme.inputBg }]}>
                        <Ionicons name="logo-twitter" size={24} color="#1DA1F2" />
                    </TouchableOpacity>
                </View>

                <Text style={[styles.copyright, { color: theme.textMuted }]}>© 2025 JM Glass & Furniture. All rights reserved.</Text>
                <View style={{ height: 30 }} />
            </ScrollView>
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
    scrollContent: { padding: 20 },

    brandSection: { alignItems: 'center', marginBottom: 30 },
    logoCircle: {
        width: 80, height: 80, borderRadius: 40,
        justifyContent: 'center', alignItems: 'center', marginBottom: 14,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    brandName: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
    brandTagline: { fontSize: 14 },

    card: {
        borderRadius: 12, padding: 18, marginBottom: 15,
    },
    cardIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    cardTitle: { fontSize: 15, fontWeight: '700', marginLeft: 8 },
    cardText: { fontSize: 14, lineHeight: 22 },

    statsRow: {
        flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
        borderRadius: 12, padding: 20, marginBottom: 25,
    },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
    statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
    statDivider: { width: 1, height: 35, backgroundColor: 'rgba(255,255,255,0.2)' },

    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },

    teamCard: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 12, padding: 14, marginBottom: 10,
    },
    teamAvatar: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center',
    },
    teamInfo: { marginLeft: 14 },
    teamName: { fontSize: 15, fontWeight: '600' },
    teamRole: { fontSize: 12, marginTop: 2 },

    contactRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
        borderBottomWidth: 1,
    },
    contactText: { fontSize: 14, marginLeft: 12 },

    socialRow: {
        flexDirection: 'row', justifyContent: 'center', marginTop: 20, marginBottom: 15,
    },
    socialIcon: {
        width: 48, height: 48, borderRadius: 24,
        justifyContent: 'center', alignItems: 'center', marginHorizontal: 10,
    },
    copyright: { textAlign: 'center', fontSize: 12, marginTop: 5 },
});

export default AboutUsScreen;
