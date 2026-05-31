import AsyncStorage from '@react-native-async-storage/async-storage';

const SEARCH_HISTORY_KEY = '@search_history';

export const saveSearch = async (query) => {
    try {
        if (!query || !query.trim()) return;
        const q = query.trim();

        const existing = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
        let history = existing ? JSON.parse(existing) : [];

        // Remove existing item to put it at the top
        history = history.filter(item => item.toLowerCase() !== q.toLowerCase());

        history.unshift(q);

        // Keep only top 10
        if (history.length > 10) history = history.slice(0, 10);

        await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('Failed to save search history', e);
    }
};

export const getSearchHistory = async () => {
    try {
        const existing = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
        return existing ? JSON.parse(existing) : [];
    } catch (e) {
        console.error('Failed to fetch search history', e);
        return [];
    }
};

export const clearSearchHistory = async () => {
    try {
        await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (e) {
        console.error('Failed to clear search history', e);
    }
};

export const removeSearchItem = async (query) => {
    try {
        const existing = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
        if (existing) {
            let history = JSON.parse(existing);
            history = history.filter(item => item !== query);
            await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
            return history;
        }
        return [];
    } catch (e) {
        console.error('Failed to remove search item', e);
        return [];
    }
};
