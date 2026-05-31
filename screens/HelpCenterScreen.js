import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    ScrollView,
    TextInput,
    LayoutAnimation,
    Platform,
    UIManager,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STATIC_FAQS = [
    { id: 1, question: 'How do I place an order?', answer: 'Browse products, tap "Add to Cart", select your options, then proceed to Checkout. Choose your address, payment method, and tap "Place Order".' },
    { id: 2, question: 'What payment methods are accepted?', answer: 'We accept Cash on Delivery (COD), GCash, and bank transfers. You can save your payment methods in your profile for faster checkout.' },
    { id: 3, question: 'Can I cancel or modify my order?', answer: 'You can cancel an order while it is still in "Pending" status via My Orders. Once processing has begun, contact our support team for assistance.' },
    { id: 4, question: 'How does installation service work?', answer: 'Some products offer an optional installation service (+₱500). Select "Delivery & Installation" when adding to cart. Our handymen will be assigned after your order is confirmed.' },
    { id: 5, question: 'How are shipping fees calculated?', answer: 'Shipping fees are calculated based on your delivery address and order subtotal. The exact fee is shown at checkout before you confirm.' },
    { id: 6, question: 'What is the return/refund policy?', answer: 'Items may be returned within 7 days of delivery if they are defective or not as described. Contact support with photos of the issue to initiate a return.' },
    { id: 7, question: 'How do I track my order?', answer: 'Go to My Orders and tap on your order to see its current status and live location (if available). You will also receive notifications for status updates.' },
    { id: 8, question: 'How do loyalty points work?', answer: 'You earn 1 point per ₱100 spent. Points can be redeemed at checkout (100 pts = ₱10 discount, up to 50% of your subtotal).' },
    { id: 9, question: 'How do I become a seller?', answer: 'Go to Menu → Become a Seller, fill in your shop details and submit for review. Once approved by admin, you can start listing products.' },
    { id: 10, question: 'How do I contact the seller?', answer: 'On any product detail page, tap the "Chat" button next to the shop name to open a direct chat with the seller.' },
];

const contactMethods = [
    { id: 1, icon: 'chatbubbles', title: 'Live Chat', subtitle: 'Average wait: 2 mins' },
    { id: 2, icon: 'mail', title: 'Email Us', subtitle: 'support@jmglass.com' },
    { id: 3, icon: 'call', title: 'Call Us', subtitle: '+63 912 345 6789' },
];

const FAQItem = ({ item, theme }) => {
    const [expanded, setExpanded] = useState(false);

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
    };

    return (
        <View style={[styles.faqCard, { backgroundColor: theme.card }]}>
            <TouchableOpacity style={styles.faqHeader} onPress={toggleExpand} activeOpacity={0.7}>
                <Text style={[styles.faqQuestion, { color: theme.text }]}>{item.question}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.accent} />
            </TouchableOpacity>
            {expanded && (
                <View style={[styles.faqContent, { backgroundColor: theme.card }]}>
                    <Text style={[styles.faqAnswer, { color: theme.textSecondary }]}>{item.answer}</Text>
                </View>
            )}
        </View>
    );
};

const HelpCenterScreen = ({ navigation }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [faqs, setFaqs] = useState([]);
    const [loading, setLoading] = useState(true);
    const { theme } = useTheme();

    useEffect(() => {
        // Load static FAQs (no backend route needed)
        setFaqs(STATIC_FAQS);
        setLoading(false);
    }, []);

    const filteredFAQs = faqs.filter(faq =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Help Center</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* Search Bar */}
                <View style={[styles.searchContainer, { backgroundColor: theme.inputBg }]}>
                    <Ionicons name="search" size={20} color={theme.textMuted} />
                    <TextInput
                        style={[styles.searchInput, { color: theme.text }]}
                        placeholder="Search for help..."
                        placeholderTextColor={theme.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={20} color={theme.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Categories / Contact Cards */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Contact Us</Text>
                <View style={styles.contactContainer}>
                    {contactMethods.map(method => (
                        <TouchableOpacity key={method.id} style={[styles.contactCard, { backgroundColor: theme.card }]} activeOpacity={0.8}>
                            <View style={[styles.iconCircle, { backgroundColor: theme.inputBg }]}>
                                <Ionicons name={method.icon} size={24} color={theme.accent} />
                            </View>
                            <Text style={[styles.contactTitle, { color: theme.text }]}>{method.title}</Text>
                            <Text style={[styles.contactSubtitle, { color: theme.textSecondary }]}>{method.subtitle}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* FAQ Section */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Frequently Asked Questions</Text>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 20 }} />
                ) : filteredFAQs.length > 0 ? (
                    filteredFAQs.map(faq => <FAQItem key={faq.id.toString()} item={faq} theme={theme} />)
                ) : (
                    <Text style={[styles.noResultsText, { color: theme.textMuted }]}>No FAQs found matching "{searchQuery}"</Text>
                )}

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

    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 15,
        height: 50,
        marginBottom: 25,
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        fontSize: 16,
    },

    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 5 },

    contactContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    contactCard: {
        flex: 1,
        borderRadius: 12,
        padding: 15,
        alignItems: 'center',
        marginHorizontal: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    iconCircle: {
        width: 46, height: 46, borderRadius: 23,
        justifyContent: 'center', alignItems: 'center', marginBottom: 10,
    },
    contactTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
    contactSubtitle: { fontSize: 11, textAlign: 'center' },

    faqCard: {
        borderRadius: 12,
        marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
        overflow: 'hidden',
    },
    faqHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    faqQuestion: {
        fontSize: 15,
        fontWeight: '600',
        flex: 1,
        paddingRight: 10,
    },
    faqContent: {
        padding: 16,
        paddingTop: 0,
    },
    faqAnswer: {
        fontSize: 14,
        lineHeight: 22,
    },
    noResultsText: {
        textAlign: 'center',
        fontSize: 15,
        marginTop: 20,
    }
});

export default HelpCenterScreen;
