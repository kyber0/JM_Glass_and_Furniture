/**
 * components/AddressAutocompleteInput.js
 *
 * A TextInput with a live OpenStreetMap Nominatim typeahead dropdown.
 * Philippines-only suggestions. Minimum 3 characters before searching.
 *
 * Props:
 *   value                   {string}   – controlled address text
 *   onChangeText            {fn}       – called when user types in main field
 *   onAddressSelect         {fn}       – called with (label, lat, lng) when suggestion picked
 *   additionalDetails       {string}   – controlled value for the extra details field
 *   onAdditionalDetailsChange {fn}    – called when the extra details field changes
 *   placeholder             {string}
 *   style                   {object}   – extra styles for the outer container
 *   inputStyle              {object}   – extra styles for the TextInput
 *   theme                   {object}   – app theme object
 *   editable                {bool}     – default true
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    TextInput,
    TouchableOpacity,
    Text,
    ActivityIndicator,
    StyleSheet,
    Keyboard,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { geocodeAPI } from '../services/api';

const AddressAutocompleteInput = ({
    value,
    onChangeText,
    onAddressSelect,
    additionalDetails = '',
    onAdditionalDetailsChange,
    placeholder = 'Start typing your address...',
    style,
    inputStyle,
    theme = {},
    editable = true,
}) => {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading]         = useState(false);
    const [showDrop, setShowDrop]       = useState(false);
    const debounceRef = useRef(null);

    const {
        text       = '#111',
        inputBg    = '#f5f5f5',
        border     = '#ddd',
        accent     = '#8D6E63',
        card       = '#fff',
        textMuted  = '#999',
    } = theme;

    useEffect(() => {
        // Clear previous debounce
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!value || value.length < 3) {
            setSuggestions([]);
            setShowDrop(false);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await geocodeAPI.autocomplete(value);
                if (res.success && res.results?.length > 0) {
                    setSuggestions(res.results);
                    setShowDrop(true);
                } else {
                    setSuggestions([]);
                    setShowDrop(false);
                }
            } catch {
                setSuggestions([]);
                setShowDrop(false);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(debounceRef.current);
    }, [value]);

    const handleSelect = (item) => {
        Keyboard.dismiss();
        setSuggestions([]);
        setShowDrop(false);
        if (onAddressSelect) onAddressSelect(item.label, item.lat, item.lng);
    };

    return (
        <View style={[styles.wrapper, style]}>
            {/* Input row */}
            <View style={[styles.inputRow, { borderColor: border, backgroundColor: inputBg }]}>
                <Ionicons name="location-outline" size={16} color={accent} style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.input, { color: text }, inputStyle]}
                    value={value}
                    onChangeText={(t) => {
                        if (onChangeText) onChangeText(t);
                        // If user clears or edits after picking, hide dropdown
                        if (!t || t.length < 3) {
                            setSuggestions([]);
                            setShowDrop(false);
                        }
                    }}
                    placeholder={placeholder}
                    placeholderTextColor={textMuted}
                    editable={editable}
                    autoCorrect={false}
                    autoCapitalize="words"
                    multiline={false}
                />
                {loading && (
                    <ActivityIndicator size="small" color={accent} style={{ marginLeft: 6 }} />
                )}
                {!loading && value?.length > 0 && (
                    <TouchableOpacity onPress={() => {
                        if (onChangeText) onChangeText('');
                        setSuggestions([]);
                        setShowDrop(false);
                    }}>
                        <Ionicons name="close-circle" size={16} color={textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Dropdown suggestions — plain View+map avoids VirtualizedList nesting warning */}
            {showDrop && suggestions.length > 0 && (
                <View style={[styles.dropdown, { backgroundColor: card, borderColor: border }]}>
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        style={{ maxHeight: 220 }}
                    >
                        {suggestions.map((item, index) => (
                            <TouchableOpacity
                                key={index.toString()}
                                style={[
                                    styles.suggestionRow,
                                    { borderBottomColor: border },
                                    index === suggestions.length - 1 && { borderBottomWidth: 0 }
                                ]}
                                onPress={() => handleSelect(item)}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="location" size={14} color={accent} style={{ marginRight: 8, marginTop: 1 }} />
                                <Text style={[styles.suggestionText, { color: text }]} numberOfLines={2}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Additional details input — house no., floor, landmark, etc. */}
            {editable && (
                <View style={[styles.detailsRow, { borderColor: border, backgroundColor: inputBg, marginTop: 8 }]}>
                    <Ionicons name="document-text-outline" size={15} color={textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                        style={[styles.input, { color: text, flex: 1 }, inputStyle]}
                        value={additionalDetails}
                        onChangeText={onAdditionalDetailsChange}
                        placeholder="House / Unit no., Floor, Landmark (optional)"
                        placeholderTextColor={textMuted}
                        autoCorrect={false}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        position: 'relative',
        zIndex: 999,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 46,
    },
    input: {
        flex: 1,
        fontSize: 14,
        padding: 0,
    },
    dropdown: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        borderWidth: 1,
        borderRadius: 10,
        marginTop: 4,
        maxHeight: 220,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 8,
        overflow: 'hidden',
    },
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    suggestionText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
    },
    detailsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 44,
    },
});

export default AddressAutocompleteInput;
