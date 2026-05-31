import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { BASE_URL } from '../services/api';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const { user, isSeller, shop } = useAuth();
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (!user) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
            return;
        }

        // Initialize connection
        const newSocket = io(BASE_URL, {
            // ngrok might block websockets sometimes, so fallback to polling is allowed by default
            transports: ['websocket', 'polling'],
        });

        newSocket.on('connect', () => {
            console.log(`[Socket] Connected: ${newSocket.id}`);
            // Always join personal user room (for notifications, personal orders, etc.)
            newSocket.emit('join:user', { userId: user.id || user.user_id });
            
            // If user is a seller and has a shop, join shop room (for shop orders, requests)
            if (isSeller && shop?.shop_id) {
                newSocket.emit('join:shop', { shopId: shop.shop_id });
            }
        });

        newSocket.on('disconnect', () => {
            console.log('[Socket] Disconnected');
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
            setSocket(null);
        };
    }, [user, isSeller, shop]); // Reconnect if auth/shop state changes

    // Helpers to be used by specific screens
    const joinChatRoom = (roomId) => {
        if (socket && roomId) {
            socket.emit('join:chat', { roomId });
            console.log(`[Socket] Joined chat room: ${roomId}`);
        }
    };

    const leaveChatRoom = (roomId) => {
        if (socket && roomId) {
            socket.emit('leave:chat', { roomId });
            console.log(`[Socket] Left chat room: ${roomId}`);
        }
    };

    const joinOrderRoom = (orderId) => {
        if (socket && orderId) {
            socket.emit('join:order', { orderId });
            console.log(`[Socket] Joined order room: ${orderId}`);
        }
    };

    const leaveOrderRoom = (orderId) => {
        if (socket && orderId) {
            socket.emit('leave:order', { orderId });
            console.log(`[Socket] Left order room: ${orderId}`);
        }
    };

    return (
        <SocketContext.Provider value={{ socket, joinChatRoom, leaveChatRoom, joinOrderRoom, leaveOrderRoom }}>
            {children}
        </SocketContext.Provider>
    );
};
