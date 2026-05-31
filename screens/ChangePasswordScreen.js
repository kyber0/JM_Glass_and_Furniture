import React, { useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    Platform,
    ScrollView,
} from 'react-native';
import KeyboardAwareWrapper from '../components/KeyboardAwareWrapper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../components/CustomAlert';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const ChangePasswordScreen = ({ navigation }) => {
    const { user } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });

    const showAlert = (title, message, type = 'info', onConfirm = null) => {
        setAlertConfig({ visible: true, title, message, type, onConfirm });
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            showAlert('Oops!', 'Please fill in all fields.', 'error');
            return;
        }
        if (newPassword.length < 6) {
            showAlert('Oops!', 'New password must be at least 6 characters.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showAlert('Oops!', 'New password and confirm password do not match.', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await api.auth.changePassword({
                user_id: user?.id,
                current_password: currentPassword,
                new_password: newPassword,
            });

            if (response.success) {
                showAlert('Success!', 'Your password has been changed successfully.', 'success', () => navigation.goBack());
            } else {
                showAlert('Error', response.message || 'Failed to change password.', 'error');
            }
        } catch (error) {
            showAlert('Error', 'Current password is incorrect.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const PasswordField = ({ label, value, onChangeText, show, onToggle }) => (
        <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.passwordRow}>
                <TextInput
                    style={styles.passwordInput}
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={!show}
                    placeholder="••••••••"
                    placeholderTextColor="#bbb"
                />
                <TouchableOpacity onPress={onToggle} style={styles.eyeButton}>
                    <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color="#999" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#3e2723" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Change Password</Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAwareWrapper>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.card}>
                        <PasswordField
                            label="Current Password"
                            value={currentPassword}
                            onChangeText={setCurrentPassword}
                            show={showCurrent}
                            onToggle={() => setShowCurrent(!showCurrent)}
                        />
                        <PasswordField
                            label="New Password"
                            value={newPassword}
                            onChangeText={setNewPassword}
                            show={showNew}
                            onToggle={() => setShowNew(!showNew)}
                        />
                        <PasswordField
                            label="Confirm New Password"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            show={showConfirm}
                            onToggle={() => setShowConfirm(!showConfirm)}
                        />
                    </View>

                    <View style={styles.tipsCard}>
                        <Text style={styles.tipsTitle}>Password Tips</Text>
                        <Text style={styles.tip}>• At least 6 characters long</Text>
                        <Text style={styles.tip}>• Mix of letters, numbers, and symbols</Text>
                        <Text style={styles.tip}>• Avoid using personal information</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                        onPress={handleChangePassword}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.submitButtonText}>{loading ? 'Updating...' : 'Update Password'}</Text>
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
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
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 15, paddingVertical: 15,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3e2723' },
    scrollContent: { padding: 20 },

    card: {
        backgroundColor: '#fff', borderRadius: 14,
        padding: 20, marginBottom: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },
    fieldGroup: { marginBottom: 18 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: '#777', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    passwordRow: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 10,
        backgroundColor: '#fafafa',
    },
    passwordInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 15, fontSize: 15, color: '#333' },
    eyeButton: { padding: 12 },

    tipsCard: {
        backgroundColor: '#f5f0eb', borderRadius: 12, padding: 16, marginBottom: 24,
    },
    tipsTitle: { fontSize: 13, fontWeight: '700', color: '#8D6E63', marginBottom: 8 },
    tip: { fontSize: 13, color: '#5D4037', lineHeight: 22 },

    submitButton: {
        backgroundColor: '#8D6E63', borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    },
    submitButtonDisabled: { backgroundColor: '#ccc' },
    submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default ChangePasswordScreen;
