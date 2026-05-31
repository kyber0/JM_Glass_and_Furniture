import React, { useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    Platform,
    ScrollView,
    Alert,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../components/CustomAlert';
import { reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const ReportProblemScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const [issueType, setIssueType] = useState('');
    const [description, setDescription] = useState('');
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });

    const issueTypes = [
        'Bug/Glitch',
        'Order Issue',
        'Account Problem',
        'Payment Issue',
        'Other'
    ];

    const showAlert = (title, message, type = 'info', onConfirm = null) => {
        setAlertConfig({ visible: true, title, message, type, onConfirm });
    };

    const handleSubmit = async () => {
        if (!issueType) {
            showAlert('Oops!', 'Please select an issue type.', 'error');
            return;
        }
        if (!description.trim()) {
            showAlert('Oops!', 'Please provide a description of the problem.', 'error');
            return;
        }

        try {
            const response = await reportsAPI.submitReport({
                user_id: user?.user_id, // User ID is nullable in backend if not logged in
                issue_type: issueType,
                description: description.trim()
            });

            if (response.success) {
                showAlert(
                    'Report Submitted',
                    'Thank you for bringing this to our attention. Our team will review your report shortly.',
                    'success',
                    () => navigation.goBack()
                );
            } else {
                showAlert('Error', response.message || 'Failed to submit report', 'error');
            }
        } catch (error) {
            console.error('Error submitting report:', error);
            showAlert('Error', 'An unexpected error occurred.', 'error');
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.headerText} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.headerText }]}>Report a Problem</Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAwareWrapper>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    <View style={[styles.infoContainer, { backgroundColor: theme.accentBg }]}>
                        <Ionicons name="information-circle-outline" size={24} color={theme.accent} />
                        <Text style={[styles.infoText, { color: theme.accent }]}>
                            Please provide as much detail as possible so we can accurately assist you with your issue.
                        </Text>
                    </View>

                    <Text style={[styles.sectionTitle, { color: theme.text }]}>What kind of issue are you experiencing?</Text>

                    <View style={styles.chipContainer}>
                        {issueTypes.map((type, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.chip,
                                    { backgroundColor: theme.inputBg, borderColor: 'transparent' },
                                    issueType === type && [styles.chipSelected, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                                ]}
                                onPress={() => setIssueType(type)}
                            >
                                <Text style={[
                                    styles.chipText,
                                    { color: theme.textSecondary },
                                    issueType === type && [styles.chipTextSelected, { color: theme.accent }]
                                ]}>
                                    {type}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Describe the problem</Text>
                    <View style={[styles.inputContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <TextInput
                            style={[styles.textArea, { color: theme.text }]}
                            placeholder="Tell us what happened..."
                            placeholderTextColor={theme.textMuted}
                            multiline
                            numberOfLines={6}
                            textAlignVertical="top"
                            value={description}
                            onChangeText={setDescription}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.submitButton, { backgroundColor: theme.accent }, (!issueType || !description.trim()) && [styles.submitButtonDisabled, { backgroundColor: theme.border }]]}
                        onPress={handleSubmit}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.submitButtonText}>Submit Report</Text>
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAwareWrapper>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
                onConfirm={() => {
                    setAlertConfig({ ...alertConfig, visible: false });
                    if (alertConfig.onConfirm) alertConfig.onConfirm();
                }}
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

    scrollContent: { padding: 20 },

    infoContainer: {
        flexDirection: 'row',
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 25,
    },
    infoText: {
        flex: 1,
        marginLeft: 12,
        fontSize: 14,
        lineHeight: 20,
    },

    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 15 },

    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 25,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        marginRight: 10,
        marginBottom: 12,
        borderWidth: 1,
    },
    chipSelected: {
    },
    chipText: {
        fontSize: 14,
        fontWeight: '500',
    },
    chipTextSelected: {
        fontWeight: '600',
    },

    inputContainer: {
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 30,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
    },
    textArea: {
        padding: 15,
        fontSize: 15,
        minHeight: 150,
    },

    submitButton: {
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    submitButtonDisabled: {
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default ReportProblemScreen;
