import React, { createContext, useState, useEffect, useContext, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, setAuthToken } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStorageData();
    }, []);

    const loadStorageData = async () => {
        try {
            const token = await AsyncStorage.getItem('authToken');
            const userData = await AsyncStorage.getItem('userData');

            if (token && userData) {
                setAuthToken(token);
                setUser(JSON.parse(userData));
            }
        } catch (error) {
            console.log('Error loading auth data:', error);
        } finally {
            setLoading(false);
        }
    };

    const login = useCallback(async (email, password) => {
        const response = await authAPI.login(email, password);
        if (response.success) {
            setAuthToken(response.token);
            setUser(response.user);
            await AsyncStorage.setItem('authToken', response.token);
            await AsyncStorage.setItem('userData', JSON.stringify(response.user));
            return response;
        } else {
            throw new Error(response.message);
        }
    }, []);

    const loginAsGuest = useCallback(async () => {
        const response = await authAPI.loginAsGuest();
        if (response.success) {
            setAuthToken(response.token);
            setUser(response.user);
            await AsyncStorage.setItem('authToken', response.token);
            await AsyncStorage.setItem('userData', JSON.stringify(response.user));
            return response;
        } else {
            throw new Error(response.message);
        }
    }, []);

    const register = useCallback(async (userData) => {
        const response = await authAPI.register(userData);
        if (response.success) {
            // Account created — do NOT log in automatically.
            // The user will be redirected to the Login screen to sign in manually.
            return response;
        } else {
            throw new Error(response.message);
        }
    }, []);

    const updateUser = useCallback(async (updatedData, isMultipart = false) => {
        let payload;
        if (isMultipart) {
            payload = updatedData;
            payload.append('user_id', user?.id);
        } else {
            payload = { user_id: user?.id, ...updatedData };
        }

        const response = await authAPI.updateProfile(payload, isMultipart);
        if (response.success) {
            setUser(response.user);
            await AsyncStorage.setItem('userData', JSON.stringify(response.user));
            return response;
        } else {
            throw new Error(response.message);
        }
    }, [user?.id]);

    const logout = useCallback(async () => {
        await authAPI.logout();
        await AsyncStorage.removeItem('userData');
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user,
        loading,
        login,
        loginAsGuest,
        register,
        logout,
        updateUser
    }), [user, loading, login, loginAsGuest, register, logout, updateUser]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
