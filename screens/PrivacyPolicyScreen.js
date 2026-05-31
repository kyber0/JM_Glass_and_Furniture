import React from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const Section = ({ title, children, theme }) => (
    <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme?.text }]}>{title}</Text>
        <Text style={[styles.sectionBody, { color: theme?.textSecondary }]}>{children}</Text>
    </View>
);

const PrivacyPolicyScreen = ({ navigation }) => {
    const { theme } = useTheme();
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Privacy Policy</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                <View style={[styles.heroBanner, { backgroundColor: theme.card }]}>
                    <Ionicons name="shield-checkmark" size={36} color={theme.accent} />
                    <Text style={[styles.heroTitle, { color: theme.text }]}>Your Privacy Matters</Text>
                    <Text style={[styles.heroSubtitle, { color: theme.accent }]}>Last updated: February 2026</Text>
                </View>

                <Section title="1. Information We Collect" theme={theme}>
                    We collect information you provide directly to us, such as when you create an account, place an order, or contact support. This includes your name, email address, phone number, and delivery address.
                </Section>

                <Section title="2. How We Use Your Information" theme={theme}>
                    We use the information we collect to process your orders, send order confirmations and updates, respond to your comments and questions, and improve our services and customer experience.
                </Section>

                <Section title="3. Sharing of Information" theme={theme}>
                    We do not sell, trade, or rent your personal information to third parties. We may share information with trusted service providers who assist us in operating our application, as long as they agree to keep this information confidential.
                </Section>

                <Section title="4. Data Security" theme={theme}>
                    We take reasonable measures to help protect your personal information from loss, theft, misuse, unauthorized access, disclosure, alteration, and destruction. However, no internet transmission is completely secure.
                </Section>

                <Section title="5. Cookies and Tracking" theme={theme}>
                    Our app may use local storage and session tokens to keep you logged in and enhance your experience. These are not shared with advertisers.
                </Section>

                <Section title="6. Your Rights" theme={theme}>
                    You have the right to access, update, or delete your personal information at any time through your account settings. For additional requests, please contact our support team.
                </Section>

                <Section title="7. Children's Privacy" theme={theme}>
                    Our services are not directed to individuals under the age of 13. We do not knowingly collect personal information from children.
                </Section>

                <Section title="8. Changes to This Policy" theme={theme}>
                    We may update this Privacy Policy from time to time. We will notify you of any significant changes by updating the date at the top of this page.
                </Section>

                <Section title="9. Contact Us" theme={theme}>
                    If you have any questions about this Privacy Policy, please contact us at support@jmglass.com or call us at +63 912 345 6789.
                </Section>

                <View style={{ height: 40 }} />
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

    heroBanner: {
        borderRadius: 14,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    heroTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
    heroSubtitle: { fontSize: 13 },

    section: { marginBottom: 22 },
    sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
    sectionBody: { fontSize: 14, lineHeight: 22 },
});

export default PrivacyPolicyScreen;
