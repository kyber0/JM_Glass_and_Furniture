import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    ScrollView,
    Keyboard,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSearchHistory, clearSearchHistory, removeSearchItem } from '../utils/searchHistory';
import { useTheme } from '../context/ThemeContext';

const { height } = Dimensions.get('window');

const popularSearches = ['Window', 'Door', 'Mirror', 'Table', 'Partition', 'Cabinet'];
const categories = ['Window', 'Door', 'Cabinets', 'Sink', 'Shower Enclosure'];

const SearchSuggestions = ({ visible, onSelect, onClose }) => {
    const { theme } = useTheme();
    const [recentSearches, setRecentSearches] = useState([]);

    useEffect(() => {
        if (visible) loadHistory();
    }, [visible]);

    const loadHistory = async () => {
        const history = await getSearchHistory();
        setRecentSearches(history);
    };

    const handleClearAll = async () => {
        await clearSearchHistory();
        setRecentSearches([]);
    };

    const handleRemoveItem = async (item) => {
        const updated = await removeSearchItem(item);
        setRecentSearches(updated);
    };

    if (!visible) return null;

    return (
        // Absolutely-positioned overlay — no Modal, so keyboard stays open
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Tap-outside-to-close backdrop (doesn't dismiss keyboard) */}
            <TouchableOpacity
                style={styles.backdrop}
                activeOpacity={1}
                onPress={onClose}
            />

            {/* Suggestions panel */}
            <View style={[styles.container, { backgroundColor: theme.card }]}>
                <ScrollView
                    keyboardShouldPersistTaps="always"
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Categories */}
                    <Text style={[styles.sectionTitle, { color: theme.accent }]}>Categories</Text>
                    <View style={styles.chipContainer}>
                        {categories.map((cat, i) => (
                            <TouchableOpacity
                                key={i}
                                style={[styles.chip, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
                                onPress={() => onSelect(cat)}
                            >
                                <Ionicons name="pricetag-outline" size={14} color={theme.accent} style={{ marginRight: 4 }} />
                                <Text style={[styles.chipText, { color: theme.accent }]}>{cat}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Recent Searches */}
                    {recentSearches.length > 0 && (
                        <>
                            <View style={styles.headerRow}>
                                <Text style={[styles.sectionTitle, { color: theme.accent }]}>Recent Searches</Text>
                                <TouchableOpacity onPress={handleClearAll}>
                                    <Text style={[styles.clearText, { color: theme.textMuted }]}>Clear</Text>
                                </TouchableOpacity>
                            </View>
                            {recentSearches.map((item, i) => (
                                <TouchableOpacity
                                    key={`recent-${i}`}
                                    style={[styles.listItem, { borderBottomColor: theme.border }]}
                                    onPress={() => onSelect(item)}
                                >
                                    <Ionicons name="time-outline" size={20} color={theme.textMuted} style={{ marginRight: 12 }} />
                                    <Text style={[styles.itemText, { color: theme.text }]}>{item}</Text>
                                    <TouchableOpacity style={{ marginLeft: 'auto', padding: 4 }} onPress={() => handleRemoveItem(item)}>
                                        <Ionicons name="close" size={16} color={theme.textMuted} />
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            ))}
                        </>
                    )}

                    {/* Popular */}
                    <View style={[styles.headerRow, { marginTop: 20 }]}>
                        <Text style={[styles.sectionTitle, { color: theme.accent }]}>Popular</Text>
                        <Ionicons name="trending-up" size={16} color="#FF7043" />
                    </View>
                    <View style={styles.chipContainer}>
                        {popularSearches.map((item, i) => (
                            <TouchableOpacity
                                key={`pop-${i}`}
                                style={[styles.popularChip, { backgroundColor: theme.card, borderColor: theme.border }]}
                                onPress={() => onSelect(item)}
                            >
                                <Text style={[styles.popularText, { color: '#E64A19' }]}>{item}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={{ height: 20 }} />
                </ScrollView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    // Full-screen absolutely-positioned wrapper
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        top: 110,   // leave the header+search bar area open
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    container: {
        marginTop: 100,   // sits just below the search bar
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        maxHeight: height * 0.55,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 10,
    },
    scrollContent: { padding: 20 },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 10,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    clearText: { fontSize: 12 },
    chipContainer: { flexDirection: 'row', flexWrap: 'wrap' },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        marginBottom: 8,
        borderWidth: 1,
    },
    chipText: { fontSize: 13, fontWeight: '500' },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    itemText: { fontSize: 15, flex: 1 },
    popularChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        marginRight: 8,
        marginBottom: 8,
        borderWidth: 1,
    },
    popularText: { fontSize: 13 },
});

export default SearchSuggestions;
