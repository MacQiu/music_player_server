import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ImageBackground, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { usePlayer } from '../contexts/PlayerContext';
import { useData } from '../contexts/DataContext';
import { getBaseUrl } from '../api/client';
import { getLocalCoverUri } from '../utils/songStorage';
import { Colors, Spacing, FontSize, Radius } from '../constants/theme';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const COVER_SIZE = SCREEN_W - 80;
const SWIPE_THRESHOLD = 100;
const MAX_PAN = SCREEN_H - SCREEN_W;

const coverCache = new Map<string, string>();

function fmt(s: number) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function calcPanTarget(time: number, dur: number) {
  if (dur <= 0) return 0;
  return -(time / dur) * MAX_PAN;
}

export default function PlayerScreen() {
  const router = useRouter();
  const {
    currentSong, playing, currentTime, duration,
    toggle, seek, playNext, playPrevious,
    repeatMode, shuffleEnabled, toggleRepeat, toggleShuffle,
  } = usePlayer();
  const { online } = useData();
  const base = getBaseUrl();

  const dismiss = useCallback(() => {
    router.back();
  }, [router]);

  const panGesture = Gesture.Pan()
    .onEnd((e) => {
      if (e.translationY > SWIPE_THRESHOLD) {
        runOnJS(dismiss)();
      }
    });

  const panX = useSharedValue(calcPanTarget(currentTime, duration));
  const prevTimeRef = useRef(currentTime);
  const mountedRef = useRef(false);
  const slidingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (duration <= 0 || slidingRef.current) return;
    const target = calcPanTarget(currentTime, duration);

    if (!mountedRef.current) {
      mountedRef.current = true;
      panX.value = target;
      prevTimeRef.current = currentTime;
      return;
    }

    const jump = Math.abs(currentTime - prevTimeRef.current);
    prevTimeRef.current = currentTime;

    if (jump > 2) {
      panX.value = target;
    } else {
      panX.value = withTiming(target, { duration: 1000, easing: Easing.linear });
    }
  }, [currentTime, duration]);

  const panImgStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panX.value }],
  }));

  const handleSlidingStart = useCallback(() => {
    slidingRef.current = true;
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const handleValueChange = useCallback((value: number) => {
    if (slidingRef.current && duration > 0) {
      panX.value = calcPanTarget(value, duration);
    }
  }, [duration, panX]);

  const handleSlidingComplete = useCallback((value: number) => {
    // Snap panX to final position immediately
    if (duration > 0) {
      panX.value = calcPanTarget(value, duration);
    }
    prevTimeRef.current = value;
    seek(value);
    // Keep slidingRef true for a settling period so the currentTime effect
    // doesn't cause a visual jump when the player reports a slightly different time
    settleTimerRef.current = setTimeout(() => {
      slidingRef.current = false;
      settleTimerRef.current = null;
    }, 500);
  }, [seek, duration, panX]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  // Cover URI: use module-level cache, direct server URI, onError fallback
  const songId = currentSong?.id;
  const cachedUri = songId ? coverCache.get(songId) : undefined;
  const serverUri = currentSong?.cover_url ? `${base}${currentSong.cover_url}` : null;
  const initialUri = cachedUri || serverUri || null;

  const [coverUri, setCoverUri] = useState<string | null>(initialUri);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    const cached = songId ? coverCache.get(songId) : undefined;
    if (cached) {
      setCoverUri(cached);
      setCoverFailed(false);
      return;
    }

    if (!online) {
      // Offline: skip server, go straight to local cache
      setCoverFailed(false);
      if (songId) {
        getLocalCoverUri(songId).then((local) => {
          if (local) {
            setCoverUri(local);
            coverCache.set(songId, local);
          } else {
            setCoverUri(null);
          }
        });
      } else {
        setCoverUri(null);
      }
      return;
    }

    if (serverUri) {
      setCoverUri(serverUri);
      setCoverFailed(false);
    } else if (songId) {
      getLocalCoverUri(songId).then((local) => {
        if (local) {
          setCoverUri(local);
          coverCache.set(songId, local);
        } else {
          setCoverUri(null);
        }
      });
      setCoverFailed(false);
    } else {
      setCoverUri(null);
      setCoverFailed(false);
    }
  }, [songId, serverUri, online]);

  const handleCoverLoad = useCallback(() => {
    if (songId && coverUri) {
      coverCache.set(songId, coverUri);
    }
  }, [songId, coverUri]);

  const handleCoverError = useCallback(() => {
    if (coverFailed || !songId) return;
    setCoverFailed(true);
    getLocalCoverUri(songId).then((local) => {
      if (local) {
        setCoverUri(local);
        coverCache.set(songId, local);
      }
    });
  }, [coverFailed, songId]);

  if (!currentSong) {
    router.back();
    return null;
  }

  const showPanning = playing && !!coverUri;

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        {showPanning ? (
          <View style={styles.panBg}>
            <Animated.Image
              source={{ uri: coverUri }}
              style={[styles.panBgImg, { width: SCREEN_H, height: SCREEN_H }, panImgStyle]}
              resizeMode="cover"
            />
          </View>
        ) : coverUri ? (
          <ImageBackground source={{ uri: coverUri }} style={styles.bgImage} blurRadius={40}>
            <View style={styles.bgOverlay} />
          </ImageBackground>
        ) : null}

        <SafeAreaView style={styles.content}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <View style={styles.closeBtnCircle}>
              <Ionicons name="chevron-down" size={22} color={Colors.white} />
            </View>
          </TouchableOpacity>

          <View style={styles.coverArea}>
            {coverUri ? (
              <Image
                source={{ uri: coverUri }}
                style={[styles.coverImg, showPanning && { opacity: 0 }]}
                onLoad={handleCoverLoad}
                onError={handleCoverError}
              />
            ) : (
              <View style={styles.coverBlank}>
                <Text style={styles.coverBlankText}>{'\u266A'}</Text>
              </View>
            )}
          </View>

          <View style={styles.spacer} />

          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{currentSong.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{currentSong.artist || 'Unknown Artist'}</Text>
          </View>

          <View style={styles.seekArea}>
            <Slider
              style={styles.seekBar}
              minimumValue={0}
              maximumValue={duration || 1}
              value={currentTime}
              onSlidingStart={handleSlidingStart}
              onValueChange={handleValueChange}
              onSlidingComplete={handleSlidingComplete}
              minimumTrackTintColor={Colors.white}
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor={Colors.white}
            />
            <View style={styles.times}>
              <Text style={styles.time}>{fmt(currentTime)}</Text>
              <Text style={styles.time}>{fmt(duration)}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity onPress={playPrevious} style={styles.controlBtn}>
              <View style={[styles.btnCircle, showPanning && styles.btnCircleBg]}>
                <Ionicons name="play-skip-back" size={30} color={Colors.white} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={toggle} style={styles.controlBtn}>
              <View style={[styles.playBtnInner, showPanning && styles.playBtnPanning]}>
                <Ionicons name={playing ? 'pause' : 'play'} size={32} color={showPanning ? Colors.white : '#000'} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={playNext} style={styles.controlBtn}>
              <View style={[styles.btnCircle, showPanning && styles.btnCircleBg]}>
                <Ionicons name="play-skip-forward" size={30} color={Colors.white} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomRow}>
            <TouchableOpacity onPress={toggleShuffle} style={styles.bottomBtn}>
              <View style={[styles.btnCircle, showPanning && styles.btnCircleBg]}>
                <Ionicons name="shuffle" size={22} color={shuffleEnabled ? Colors.orange : 'rgba(255,255,255,0.5)'} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/lyrics')} style={styles.bottomBtn}>
              <View style={[styles.btnCircle, showPanning && styles.btnCircleBg]}>
                <Ionicons name="musical-note" size={22} color={Colors.white} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/queue')} style={styles.bottomBtn}>
              <View style={[styles.btnCircle, showPanning && styles.btnCircleBg]}>
                <Ionicons name="list" size={22} color={Colors.white} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleRepeat} style={styles.bottomBtn}>
              <View style={[styles.btnCircle, showPanning && styles.btnCircleBg]}>
                <Ionicons
                  name={repeatMode === 'song' ? 'repeat' : 'repeat'}
                  size={22}
                  color={repeatMode !== 'none' ? Colors.orange : 'rgba(255,255,255,0.5)'}
                />
                {repeatMode === 'song' && <Text style={styles.repeatOne}>1</Text>}
              </View>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, overflow: 'hidden' },

  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },

  panBg: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  panBgImg: { position: 'absolute', top: 0, left: 0 },

  content: { flex: 1 },

  closeBtn: {
    paddingHorizontal: 10, paddingTop: Spacing.md, paddingBottom: Spacing.xs,
    alignSelf: 'flex-end',
  },
  closeBtnCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  coverArea: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, paddingTop: 20,
  },
  coverImg: { width: COVER_SIZE, height: COVER_SIZE, borderRadius: Radius.md },
  coverBlank: {
    width: COVER_SIZE, height: COVER_SIZE, borderRadius: Radius.md,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  coverBlankText: { fontSize: 64, color: Colors.textMuted },

  spacer: { flex: 1 },

  info: { alignItems: 'center', paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  title: { fontSize: FontSize.title, fontWeight: '700', color: Colors.white },
  artist: { fontSize: FontSize.lg, color: 'rgba(255,255,255,0.6)', marginTop: Spacing.xs },

  seekArea: { paddingHorizontal: Spacing.xl },
  seekBar: { width: '100%', height: 40 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8 },
  time: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 32, paddingVertical: Spacing.xs,
  },
  controlBtn: { padding: Spacing.sm },
  playBtnInner: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  playBtnPanning: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  btnCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  btnCircleBg: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  bottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 40, paddingVertical: Spacing.sm, paddingBottom: Spacing.md,
  },
  bottomBtn: { padding: Spacing.sm, position: 'relative' },
  repeatOne: {
    position: 'absolute', bottom: -2, right: -2,
    fontSize: 9, fontWeight: '700', color: Colors.orange,
  },
});
