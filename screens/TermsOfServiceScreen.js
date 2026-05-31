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

const TermsOfServiceScreen = ({ navigation }) => {
    const { theme } = useTheme();
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Terms of Service</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                <View style={[styles.heroBanner, { backgroundColor: theme.card }]}>
                    <Ionicons name="document-text" size={36} color={theme.accent} />
                    <Text style={[styles.heroTitle, { color: theme.text }]}>Terms of Service</Text>
                    <Text style={[styles.heroSubtitle, { color: theme.accent }]}>Last updated: February 2026</Text>
                </View>

                <Section title="1. Acceptance of Terms" theme={theme}>
                    By accessing and using the JM Glass & Furniture application, you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the app.
                </Section>

                <Section title="2. Use of the Application" theme={theme}>
                    You agree to use this application only for lawful purposes and in a manner that does not infringe the rights of others. You must not use the app to conduct any fraudulent, abusive, or illegal activity.
                </Section>

                <Section title="3. Account Responsibilities" theme={theme}>
                    You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Notify us immediately of any unauthorized use of your account.
                </Section>

                <Section title="4. Product Listings and Orders" theme={theme}>
                    All product descriptions, prices, and availability are subject to change without notice. We reserve the right to refuse or cancel orders at our sole discretion, including in cases of pricing errors.
                </Section>

                <Section title="5. Seller Responsibilities" theme={theme}>
                    Sellers are responsible for the accuracy of their product listings, timely fulfillment of orders, and compliance with all applicable laws. JM Glass & Furniture is not liable for seller actions.
                </Section>

                <Section title="6. Returns and Refunds" theme={theme}>
                    Returns and refunds are subject to our return policy. Items must be reported within 7 days of delivery for consideration. We reserve the right to assess each claim individually.
                </Section>

                <Section title="7. Intellectual Property" theme={theme}>
                    All content in this application, including logos, text, and images, is the property of JM Glass & Furniture and is protected by applicable intellectual property laws.
                </Section>

                <Section title="8. Limitation of Liability" theme={theme}>
                    JM Glass & Furniture shall not be liable for any indirect, incidental, or consequential damages arising from your use of, or inability to use, the application or its services.
                </Section>

                <Section title="9. Changes to Terms" theme={theme}>
                    We reserve the right to modify these Terms of Service at any time. Continued use of the application after changes are posted constitutes your acceptance of the modified terms.
                </Section>

                <Section title="10. Contact Us" theme={theme}>
                    For any questions regarding these Terms of Service, please contact us at support@jmglass.com or call +63 912 345 6789.
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

export default TermsOfServiceScreen;
