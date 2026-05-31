import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultTheme as NavigationDefaultTheme, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';

const ThemeContext = createContext();

export const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'fil', label: 'Filipino' },
    { code: 'ceb', label: 'Cebuano' },
];

export const ThemeProvider = ({ children }) => {
    const [darkMode, setDarkMode] = useState(false);
    const [language, setLanguage] = useState('en');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPreferences();
    }, []);

    const loadPreferences = async () => {
        try {
            const storedDark = await AsyncStorage.getItem('darkMode');
            const storedLang = await AsyncStorage.getItem('language');
            if (storedDark !== null) setDarkMode(JSON.parse(storedDark));
            if (storedLang !== null) setLanguage(storedLang);
        } catch (e) {
            console.error('Load preferences error:', e);
        } finally {
            setLoading(false);
        }
    };

    const toggleDarkMode = useCallback(async (value) => {
        setDarkMode(value);
        await AsyncStorage.setItem('darkMode', JSON.stringify(value));
    }, []);

    const changeLanguage = useCallback(async (code) => {
        setLanguage(code);
        await AsyncStorage.setItem('language', code);
    }, []);

    const theme = darkMode ? darkTheme : lightTheme;

    // Map to React Navigation Theme format
    const baseNavTheme = darkMode ? NavigationDarkTheme : NavigationDefaultTheme;
    const navigationTheme = {
        ...baseNavTheme,
        colors: {
            ...baseNavTheme.colors,
            primary: theme.accent,
            background: theme.background,
            card: theme.headerBg,
            text: theme.text,
            border: theme.border,
            notification: theme.danger,
        },
    };

    return (
        <ThemeContext.Provider value={{ darkMode, toggleDarkMode, language, changeLanguage, theme, navigationTheme, loading }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);

// ─── Light Theme ───────────────────────────────────────────────────────────────
export const lightTheme = {
    dark: false,
    background: '#f5f5f5',
    card: '#ffffff',
    text: '#333333',
    textSecondary: '#888888',
    textMuted: '#aaaaaa',
    headerBg: '#ffffff',
    headerText: '#3e2723',
    border: '#f0f0f0',
    accent: '#8D6E63',
    accentDark: '#5D4037',
    accentBg: '#f5f0eb',
    inputBg: '#fafafa',
    inputBorder: '#e8e8e8',
    sectionBg: '#ffffff',
    tabBar: '#ffffff',
    icon: '#5D4037',
    danger: '#e53935',
    switch: '#8D6E63',
};

// ─── Dark Theme ────────────────────────────────────────────────────────────────
export const darkTheme = {
    dark: true,
    background: '#121212',
    card: '#1e1e1e',
    text: '#eeeeee',
    textSecondary: '#aaaaaa',
    textMuted: '#666666',
    headerBg: '#1a1a1a',
    headerText: '#e0c9b4',
    border: '#2c2c2c',
    accent: '#A1887F',
    accentDark: '#BCAAA4',
    accentBg: '#2a1f1a',
    inputBg: '#2a2a2a',
    inputBorder: '#3c3c3c',
    sectionBg: '#1e1e1e',
    tabBar: '#1a1a1a',
    icon: '#BCAAA4',
    danger: '#ef5350',
    switch: '#A1887F',
};
