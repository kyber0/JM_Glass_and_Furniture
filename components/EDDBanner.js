/**
 * components/EDDBanner.js
 * Reusable Estimated Delivery Date banner.
 *
 * Props:
 *   eddMin   {string}  YYYY-MM-DD — earliest delivery date
 *   eddMax   {string}  YYYY-MM-DD — latest delivery date  (optional, derived if missing)
 *   delayed  {boolean} true = no workers available, date was pushed out
 *   compact  {boolean} smaller height variant for order cards
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export default function EDDBanner({ eddMin, eddMax, delayed, compact = false, style }) {
    if (!eddMin) return null;

    const sameMonth = eddMax && new Date(eddMin).getUTCMonth() === new Date(eddMax).getUTCMonth();

    // "May 5 – 7, 2026"  or  "May 5 – Jun 3, 2026"
    let label;
    if (!eddMax) {
        label = `By ${fmtDate(eddMin)}`;
    } else if (sameMonth) {
        const dMin = new Date(eddMin);
        const dMax = new Date(eddMax);
        label = `${MONTH[dMin.getUTCMonth()]} ${dMin.getUTCDate()} – ${dMax.getUTCDate()}, ${dMax.getUTCFullYear()}`;
    } else {
        label = `${fmtDate(eddMin)} – ${fmtDate(eddMax)}`;
    }

    const bg      = delayed ? '#FFF3E0' : '#E8F5E9';
    const border  = delayed ? '#FFB74D' : '#81C784';
    const iconClr = delayed ? '#E65100' : '#2E7D32';
    const textClr = delayed ? '#BF360C' : '#1B5E20';
    const subClr  = delayed ? '#E65100' : '#388E3C';

    return (
        <View style={[styles.wrap, { backgroundColor: bg, borderColor: border }, compact && styles.wrapCompact, style]}>
            <Ionicons
                name={delayed ? 'warning-outline' : 'car-outline'}
                size={compact ? 16 : 20}
                color={iconClr}
                style={styles.icon}
            />
            <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: textClr }, compact && styles.labelCompact]}>
                    {delayed ? '⚠️ Estimated Delivery' : '🚚 Estimated Delivery'}
                </Text>
                <Text style={[styles.date, { color: subClr }, compact && styles.dateCompact]}>
                    {label}
                    {delayed ? ' (delayed — no workers available)' : ''}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 10,
    },
    wrapCompact: {
        borderRadius: 10,
        paddingVertical: 7,
        paddingHorizontal: 10,
        gap: 7,
    },
    icon: { marginTop: 1 },
    label: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginBottom: 1,
    },
    labelCompact: { fontSize: 10 },
    date: {
        fontSize: 15,
        fontWeight: '800',
    },
    dateCompact: { fontSize: 12, fontWeight: '700' },
});
