import React, { useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, Image, TouchableOpacity,
  Dimensions, Animated, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const BG_IMAGE = 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?q=80&w=1992&auto=format&fit=crop';

const FEATURES = [
  { icon: 'cube-outline', label: 'Custom furniture & glass' },
  { icon: 'construct-outline', label: 'Expert installation' },
  { icon: 'star-outline', label: 'Premium quality materials' },
];

const GetStartedScreen = ({ navigation }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Background */}
      <Image source={{ uri: BG_IMAGE }} style={styles.bgImage} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'rgba(30,15,5,0.6)', 'rgba(20,10,3,0.92)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Logo */}
        <Animated.View style={[styles.logoArea, { opacity: fadeAnim }]}>
          <Image
            source={require('../assets/JM_logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>JM GLASS & FURNITURE</Text>
          <View style={styles.brandRule} />
        </Animated.View>

        {/* Bottom card */}
        <Animated.View style={[
          styles.card,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }
        ]}>
          <Text style={styles.headline}>Design.{'\n'}Customize.{'\n'}Install.</Text>
          <Text style={styles.sub}>
            Your doors, windows, and furniture — crafted to your exact vision.
          </Text>

          {/* Feature pills */}
          <View style={styles.features}>
            {FEATURES.map((f, i) => (
              <View key={i} style={styles.featurePill}>
                <Ionicons name={f.icon} size={14} color="#C8A97E" />
                <Text style={styles.featureText}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.cta}
            onPress={() => navigation?.navigate('Login')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#C8A97E', '#8D6E63']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation?.navigate('SignUp')} style={styles.signupLink}>
            <Text style={styles.signupLinkText}>New here? <Text style={styles.signupLinkBold}>Create an account</Text></Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0f07' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  safe: { flex: 1, justifyContent: 'space-between' },

  // Logo
  logoArea: { alignItems: 'center', paddingTop: 30 },
  logo: { width: 220, height: 220, marginBottom: -20 },
  brandName: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '300', letterSpacing: 4 },
  brandRule: { width: 40, height: 1.5, backgroundColor: '#C8A97E', marginTop: 10, borderRadius: 2 },

  // Card
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 28,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  headline: { fontSize: 38, fontWeight: '900', color: '#fff', lineHeight: 46, marginBottom: 12 },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 21, marginBottom: 22 },

  // Features
  features: { gap: 8, marginBottom: 26 },
  featurePill: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(200,169,126,0.12)',
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 20, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(200,169,126,0.25)',
  },
  featureText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },

  // CTA
  cta: { borderRadius: 16, overflow: 'hidden', marginBottom: 14, shadowColor: '#C8A97E', shadowOpacity: 0.5, shadowRadius: 12, elevation: 6 },
  ctaGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  // Sign up link
  signupLink: { alignItems: 'center' },
  signupLinkText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  signupLinkBold: { color: '#C8A97E', fontWeight: '700' },
});

export default GetStartedScreen;
