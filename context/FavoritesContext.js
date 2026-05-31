import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { favoritesAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const FavoritesContext = createContext();

export const useFavorites = () => {
    return useContext(FavoritesContext);
};

export const FavoritesProvider = ({ children }) => {
    const { user } = useAuth();
    const [favorites, setFavorites] = useState([]);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'error' });

    const showAlert = (message, title = 'Error', type = 'error') => {
        setAlertConfig({ visible: true, title, message, type });
    };

    const hideAlert = () => {
        setAlertConfig({ ...alertConfig, visible: false });
    };

    const fetchFavorites = useCallback(async () => {
        if (!user) {
            setFavorites([]);
            return;
        }
        try {
            const response = await favoritesAPI.getFavorites(user.id);
            if (response.success) {
                setFavorites(response.favorites);
            }
        } catch (error) {
            console.error('Error fetching favorites:', error);
        }
    }, [user]);

    useEffect(() => {
        fetchFavorites();
    }, [fetchFavorites]);

    const toggleFavorite = useCallback(async (productOrId) => {
        if (!user) {
            showAlert("Please login to manage favorites", "Action Required", "warning");
            return;
        }

        let productId;
        if (typeof productOrId === 'object') {
            productId = productOrId.product_id || productOrId.id;
        } else {
            productId = productOrId;
        }

        const isFav = favorites.some(f => f.product_id == productId);

        try {
            if (isFav) {
                // Remove
                await favoritesAPI.removeFavorite(user.id, productId);
                setFavorites(prev => prev.filter(f => f.product_id != productId));
            } else {
                // Add
                const response = await favoritesAPI.addFavorite(user.id, productId);
                if (response && response.success === false) {
                    showAlert(response.message || "Failed to add favorite");
                } else {
                    fetchFavorites(); // Refresh to get full object
                }
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
            // Show the actual error message from the backend if it exists
            const errorMsg = error.response?.data?.message || error.message || 'Something went wrong';
            showAlert(errorMsg, "Action Not Allowed", "error");
        }
    }, [user, favorites, fetchFavorites]);

    const isFavorite = useCallback(
        (id) => {
            return favorites.some(f => f.product_id == id);
        },
        [favorites]
    );

    return (
        <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite, refreshFavorites: fetchFavorites }}>
            {children}
            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={hideAlert}
            />
        </FavoritesContext.Provider>
    );
};
