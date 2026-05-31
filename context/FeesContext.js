import React, { createContext, useContext, useState, useEffect } from 'react';
import { feesAPI } from '../services/api';

const FeesContext = createContext(null);

// Default values used while loading or on network error
const DEFAULTS = {
    installation_basic_min: 300,
    installation_basic_max: 500,
    installation_standard_min: 800,
    installation_standard_max: 1500,
    installation_complex_min: 1500,
    installation_complex_max: 5000,
    fragile_surcharge_min: 100,
    fragile_surcharge_max: 500,
    default_shipping_base: 500,
    // ₱150,000 threshold: realistic for glass/furniture where single items can be ₱15k–₱80k+
    // Only large commercial/bulk orders benefit. Fully configurable via admin dashboard.
    free_shipping_threshold: 150000,
};

export const FeesProvider = ({ children }) => {
    const [fees, setFees] = useState(DEFAULTS);
    const [vehicleTiers, setVehicleTiers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadFees = async () => {
            try {
                const [feesRes, vehiclesRes] = await Promise.all([
                    feesAPI.getAll(),
                    feesAPI.getVehicles(),
                ]);
                if (feesRes.success) {
                    setFees({ ...DEFAULTS, ...feesRes.fees });
                }
                if (vehiclesRes.success) {
                    setVehicleTiers(vehiclesRes.data || []);
                }
            } catch (err) {
                console.warn('[FeesContext] Failed to load fees, using defaults:', err.message);
            } finally {
                setLoading(false);
            }
        };
        loadFees();
    }, []);

    // Convenience getters
    const installationFees = {
        basic:    { min: fees.installation_basic_min,    max: fees.installation_basic_max },
        standard: { min: fees.installation_standard_min, max: fees.installation_standard_max },
        complex:  { min: fees.installation_complex_min,  max: fees.installation_complex_max },
    };

    const fragileSurcharge = {
        min: fees.fragile_surcharge_min,
        max: fees.fragile_surcharge_max,
        mid: Math.round((fees.fragile_surcharge_min + fees.fragile_surcharge_max) / 2),
    };

    /**
     * Get installation fee for a given tier name
     * @param {'basic'|'standard'|'complex'} tier
     * @returns {{ min: number, max: number, label: string }}
     */
    const getInstallationTier = (tier = 'basic') => {
        const t = installationFees[tier?.toLowerCase()] || installationFees.basic;
        return { ...t, label: `₱${t.min.toLocaleString()} – ₱${t.max.toLocaleString()}` };
    };

    return (
        <FeesContext.Provider value={{
            fees,
            vehicleTiers,
            loading,
            installationFees,
            fragileSurcharge,
            defaultShippingBase: fees.default_shipping_base,
            freeShippingThreshold: fees.free_shipping_threshold,
            getInstallationTier,
        }}>
            {children}
        </FeesContext.Provider>
    );
};

export const useFees = () => {
    const ctx = useContext(FeesContext);
    if (!ctx) throw new Error('useFees must be used inside <FeesProvider>');
    return ctx;
};

export default FeesContext;
