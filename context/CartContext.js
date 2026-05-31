import React, { createContext, useState, useContext, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { cartAPI } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
    const { user } = useAuth();
    const [cartItems, setCartItems] = useState([]);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'error' });

    const showAlert = (message, title = 'Error', type = 'error') => {
        setAlertConfig({ visible: true, title, message, type });
    };

    const hideAlert = () => {
        setAlertConfig({ ...alertConfig, visible: false });
    };

    const fetchCart = useCallback(async () => {
        if (!user) return;
        try {
            const response = await cartAPI.getCart(user.id);
            if (response.success) {
                setCartItems(response.data);
            }
        } catch (error) {
            console.error('Fetch Cart Error:', error);
        }
    }, [user]);

    // Fetch cart on login
    React.useEffect(() => {
        if (user) {
            fetchCart();
        } else {
            setCartItems([]); // Clear local cart on logout or init empty
        }
    }, [user, fetchCart]);

    const addToCart = useCallback(async (product) => {
        if (user) {
            try {
                if (!product?.serviceType) {
                    showAlert('Please choose Delivery or Installation before adding to cart.');
                    return;
                }
                const response = await cartAPI.addToCart({
                    user_id: user.id,
                    product_id: product.product_id ?? product.id,
                    listing_id: product.listing_id ?? product.listingId ?? product.selectedListingId,
                    quantity: product.quantity || 1,
                    selected_size: product.selectedSize,
                    selected_color: product.selectedColor,
                    service_type: product.serviceType
                });

                if (response && response.success === false) {
                    showAlert(response.message || "Failed to add to cart");
                } else {
                    fetchCart();
                }
            } catch (error) {
                console.error('Add to Cart Error:', error);
                const errorMsg = error.response?.data?.message || error.message || 'Something went wrong';
                showAlert(errorMsg, "Action Not Allowed", "error");
            }
        } else {
            setCartItems((currentItems) => {
                const targetId = product.cartId || product.id;
                const existingItem = currentItems.find((item) => (item.cartId || item.id) === targetId);
                if (existingItem) {
                    return currentItems.map((item) =>
                        (item.cartId || item.id) === targetId
                            ? { ...item, quantity: item.quantity + (product.quantity || 1) }
                            : item
                    );
                }
                return [...currentItems, { ...product, quantity: product.quantity || 1 }];
            });
        }
    }, [user, fetchCart]);

    const removeFromCart = useCallback(async (cartId) => {
        if (user) {
            // cartId in backend cart is "db_123", we need to extract 123
            const dbId = parseInt(cartId.toString().replace('db_', ''));
            try {
                await cartAPI.removeCartItem(dbId, user.id);
                fetchCart();
            } catch (error) {
                console.error('Remove Cart Item Error:', error);
            }
        } else {
            setCartItems((currentItems) => currentItems.filter((item) => (item.cartId || item.id) !== cartId));
        }
    }, [user, fetchCart]);

    const updateQuantity = useCallback(async (cartId, change) => {
        if (user) {
            const dbId = parseInt(cartId.toString().replace('db_', ''));
            const item = cartItems.find(i => i.cartId === cartId);
            if (!item) return;
            const newQuantity = item.quantity + change;

            if (newQuantity < 1) return; // distinct from delete?

            try {
                await cartAPI.updateCartItem(dbId, newQuantity, user.id);
                fetchCart();
            } catch (error) {
                console.error('Update Cart Quantity Error:', error);
            }
        } else {
            setCartItems((currentItems) =>
                currentItems.map((item) => {
                    if ((item.cartId || item.id) === cartId) {
                        const newQuantity = Math.max(1, item.quantity + change);
                        return { ...item, quantity: newQuantity };
                    }
                    return item;
                })
            );
        }
    }, [user, cartItems, fetchCart]);

    const clearCart = useCallback(async () => {
        if (user) {
            try {
                await cartAPI.clearCart(user.id);
                setCartItems([]);
            } catch (error) {
                console.error('Clear Cart Error:', error);
            }
        } else {
            setCartItems([]);
        }
    }, [user]);

    const cartCount = useMemo(() => {
        return cartItems.length;
    }, [cartItems]);

    const getCartTotal = useCallback(() => {
        const INSTALLATION_FEE = 500;
        return cartItems.reduce((total, item) => {
            const priceStr = item.price ? item.price.toString() : '0';
            const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
            const installFee = item.serviceType === 'Installation' ? INSTALLATION_FEE : 0;
            return total + (price + installFee) * item.quantity;
        }, 0);
    }, [cartItems]);

    const value = useMemo(() => ({
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        getCartTotal
    }), [cartItems, addToCart, removeFromCart, updateQuantity, clearCart, cartCount, getCartTotal]);

    return (
        <CartContext.Provider value={value}>
            {children}
            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={hideAlert}
            />
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
};
