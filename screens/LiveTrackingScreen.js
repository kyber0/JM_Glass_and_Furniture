import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { ordersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import CustomAlert from '../components/CustomAlert';

export default function LiveTrackingScreen({ route, navigation }) {
    const { order, userType = 'buyer' } = route.params;
    const { user } = useAuth();
    const { theme } = useTheme();
    const mapRef = useRef(null);

    const isDriver = userType === 'seller';

    const [currentRegion, setCurrentRegion] = useState({
        latitude: 13.4115, // Default to Nabua center
        longitude: 123.3731,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    });

    // The driver's live coordinates
    const [driverLocation, setDriverLocation] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isTracking, setIsTracking] = useState(false);

    // We parse the destination from the address string if possible, or fallback
    // In a production app, the destination would have exact lat/lng columns in DB
    const [destinationCoords] = useState({
        latitude: 13.4165,
        longitude: 123.3781
    });

    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });
    const showAlert = (title, message, type = 'info') => setAlertConfig({ visible: true, title, message, type });
    const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    // Reference to stop location watching subscription
    const locationSubscription = useRef(null);

    const { socket, joinOrderRoom, leaveOrderRoom } = useSocket();

    // Initial effect
    useEffect(() => {
        if (isDriver) {
            setupDriverTracking();
        } else {
            // For buyer: Fetch initial location and join room for live updates
            setIsTracking(true);
            fetchDriverLocation();
            joinOrderRoom(order.order_id);
            if (socket) {
                socket.on('location:update', (data) => {
                    if (data.lat && data.lng) {
                        setDriverLocation({ latitude: parseFloat(data.lat), longitude: parseFloat(data.lng) });
                        setLastUpdated(new Date());
                    }
                });
            }
        }

        return () => {
            if (locationSubscription.current) {
                locationSubscription.current.remove();
            }
            if (!isDriver) {
                leaveOrderRoom(order.order_id);
                if (socket) {
                    socket.off('location:update');
                }
            }
        };
    }, [socket]);

    // Center map when driver location updates
    useEffect(() => {
        if (driverLocation && mapRef.current) {
            mapRef.current.animateToRegion({
                ...driverLocation,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            }, 1000);
        }
    }, [driverLocation]);

    // Driver side: Request permissions and watch position
    const setupDriverTracking = async () => {
        setIsTracking(true);
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            showAlert('Permission Denied', 'Location permission is required to act as the driver.', 'error');
            setIsTracking(false);
            return;
        }

        // Get initial location
        let location = await Location.getCurrentPositionAsync({});
        updateDriverLocationProp(location.coords.latitude, location.coords.longitude);

        // Start watching position
        locationSubscription.current = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.High,
                timeInterval: 10000,
                distanceInterval: 10,
            },
            (newLocation) => {
                updateDriverLocationProp(newLocation.coords.latitude, newLocation.coords.longitude);
            }
        );
    };

    const updateDriverLocationProp = async (lat, lng) => {
        setDriverLocation({ latitude: lat, longitude: lng });
        setCurrentRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 });
        setLastUpdated(new Date());

        try {
            await ordersAPI.updateLocation(order.order_id, lat, lng);
        } catch (error) {
            console.error("Failed to push driver location to API", error);
        }
    };

    const fetchDriverLocation = async () => {
        try {
            const response = await ordersAPI.getLocation(order.order_id);
            if (response.success && response.data.current_lat && response.data.current_lng) {
                const { current_lat, current_lng, last_location_update } = response.data;
                setDriverLocation({
                    latitude: parseFloat(current_lat),
                    longitude: parseFloat(current_lng)
                });
                if (last_location_update) {
                    setLastUpdated(new Date(last_location_update));
                }
            } else {
                console.log("No location data available yet.");
            }
        } catch (error) {
            console.error("Failed to poll driver location", error);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Live Tracking</Text>
                    <Text style={styles.headerSubtitle}>Order #{order.order_id}</Text>
                </View>
                <View style={{ width: 24 }} />
            </View>

            {/* Map Area */}
            <View style={styles.mapContainer}>
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={currentRegion}
                >
                    {/* Destination Marker */}
                    <Marker
                        coordinate={destinationCoords}
                        title="Delivery Destination"
                        pinColor="red"
                    />

                    {/* Driver Marker */}
                    {driverLocation && (
                        <Marker
                            coordinate={driverLocation}
                            title="Delivery Vehicle"
                            description={isDriver ? "You are here" : "Driver is here"}
                        >
                            <View style={styles.driverMarkerContainer}>
                                <Ionicons name="car" size={24} color="#1E88E5" />
                            </View>
                        </Marker>
                    )}

                    {/* Simple line between driver and destination */}
                    {driverLocation && (
                        <Polyline
                            coordinates={[driverLocation, destinationCoords]}
                            strokeColor="#1E88E5"
                            strokeWidth={3}
                            lineDashPattern={[5, 5]}
                        />
                    )}
                </MapView>
            </View>

            {/* Bottom Status Panel */}
            <View style={[styles.bottomPanel, { backgroundColor: theme.card, shadowColor: theme.text }]}>
                <View style={styles.statusRow}>
                    <View style={styles.statusIndicator}>
                        {isTracking ? <ActivityIndicator size="small" color="#4CAF50" /> : <Ionicons name="pause-circle" size={20} color="#999" />}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.statusTitle, { color: theme.text }]}>
                            {isDriver ? 'Broadcasting Location...' : 'Tracking Delivery...'}
                        </Text>
                        <Text style={[styles.statusTime, { color: theme.textMuted }]}>
                            {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Waiting for GPS signal...'}
                        </Text>
                    </View>
                </View>
                {isDriver && (
                    <Text style={{ marginTop: 10, fontSize: 13, color: '#f44336', textAlign: 'center' }}>
                        Keep this screen open while driving to stream live locations!
                    </Text>
                )}
            </View>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={hideAlert}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    backButton: { padding: 5, marginLeft: -5 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
    headerSubtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 2 },
    mapContainer: {
        flex: 1,
        backgroundColor: '#e0e0e0',
    },
    map: {
        width: '100%',
        height: '100%',
    },
    driverMarkerContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: 5,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#1E88E5',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    bottomPanel: {
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 10,
        marginTop: -15, // Overlap map slightly
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusIndicator: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    statusTime: {
        fontSize: 13,
        marginTop: 2,
    },
});
