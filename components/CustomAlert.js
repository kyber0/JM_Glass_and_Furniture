import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const CustomAlert = ({
    visible,
    title,
    message,
    onClose,
    onConfirm,
    type = 'error', // 'error', 'success', 'info', 'warning'
    confirmText = 'OK',
    cancelText = 'Cancel',
    showCancel = false
}) => {
    const getIconDetails = () => {
        switch (type) {
            case 'success':
                return { name: 'checkmark-circle', color: '#4CAF50' };
            case 'warning':
                return { name: 'warning', color: '#FF9800' };
            case 'info':
                return { name: 'information-circle', color: '#2196F3' };
            case 'error':
            default:
                // using system theme colors for error
                return { name: 'close-circle', color: '#e53935' };
        }
    };

    const icon = getIconDetails();

    return (
        <Modal
            transparent={true}
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.alertBox}>
                    <View style={styles.iconContainer}>
                        <Ionicons name={icon.name} size={50} color={icon.color} />
                    </View>

                    <Text style={styles.title}>{title || (type === 'error' ? 'Error' : 'Alert')}</Text>
                    <Text style={styles.message}>{message}</Text>

                    <View style={styles.buttonContainer}>
                        {showCancel && (
                            <TouchableOpacity
                                style={[styles.button, styles.cancelButton]}
                                onPress={onClose}
                            >
                                <Text style={styles.cancelButtonText}>{cancelText}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[
                                styles.button,
                                { backgroundColor: type === 'error' ? '#8D6E63' : icon.color },
                                showCancel && styles.halfButton
                            ]}
                            onPress={onConfirm || onClose}
                        >
                            <Text style={styles.buttonText}>{confirmText}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    alertBox: {
        width: '80%',
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 10,
    },
    iconContainer: {
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#3e2723', // Theme dark brown
        marginBottom: 10,
        textAlign: 'center',
    },
    message: {
        fontSize: 15,
        color: '#666',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    buttonContainer: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 10,
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
        minWidth: 100,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
        marginHorizontal: 5,
    },
    halfButton: {
        flex: 1,
    },
    cancelButton: {
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#ddd',
        flex: 1,
    },
    cancelButtonText: {
        color: '#666',
        fontSize: 16,
        fontWeight: 'bold',
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    }
});

export default CustomAlert;
