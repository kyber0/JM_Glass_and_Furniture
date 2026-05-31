import React from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

/**
 * A reusable wrapper that handles keyboard avoidance consistently across the app.
 *
 * - iOS:     Uses `behavior='padding'` to push content above the keyboard.
 * - Android: Relies on `softwareKeyboardLayoutMode: "pan"` in app.json;
 *            the KeyboardAvoidingView acts as a transparent passthrough.
 *
 * Props:
 *   - style:    additional styles (default: { flex: 1 })
 *   - offset:   keyboardVerticalOffset for iOS (default: 0)
 *   - children: content to wrap
 */
const KeyboardAwareWrapper = ({ children, style, offset = 0 }) => (
    <KeyboardAvoidingView
        style={[{ flex: 1 }, style]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={offset}
    >
        {children}
    </KeyboardAvoidingView>
);

export default KeyboardAwareWrapper;
