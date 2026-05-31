import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { notificationsAPI } from '../services/api';

const NotificationContext = createContext({ unreadCount: 0, refreshCount: () => { } });

export const NotificationProvider = ({ children }) => {
    const { user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);

    const refreshCount = useCallback(async () => {
        if (!user?.id) {
            setUnreadCount(0);
            return;
        }
        try {
            const response = await notificationsAPI.getUnreadCount(user.id);
            if (response?.success) {
                setUnreadCount(Number(response.count) || 0);
            }
        } catch (err) {
            // non-critical, silently fail
        }
    }, [user?.id]);

    // Poll every 15 seconds while the app is open
    useEffect(() => {
        refreshCount();
        const interval = setInterval(refreshCount, 15000);
        return () => clearInterval(interval);
    }, [refreshCount]);

    return (
        <NotificationContext.Provider value={{ unreadCount, refreshCount }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => useContext(NotificationContext);
