import React from 'react';
import { View, Text, TouchableOpacity, Image, ImageBackground, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { usePlayer } from '../contexts/PlayerContext';
import { getBaseUrl } from '../api/client';
import { Colors, Spacing, FontSize, Radius } from '../constants/theme';

function fmt(s: number) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

export default function PlayerScreen() {
  const router = useRouter();
  const {
    currentSong, playing, currentTime, duration,
    toggle, seek, playNext, playPrevious,
    repeatMode, shuffleEnabled, toggleRepeat, toggleShuffle,
  } = usePlayer();
  const base = getBaseUrl();

  if (!currentSong) {
    router.back();
    return null;
  }

  const coverUri = currentSong.cover_url ? `${base}${currentSong.cover_url}` : null;

  return (
    <View style={styles.container}>
      {coverUri && (
        <ImageBackground source={{ uri: coverUri }} style={styles.bgImage} blurRadius={40}>
          <View style={styles.bgOverlay} />
        </ImageBackground>
      )}

      <SafeAreaView style={styles.content}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={28} color={Colors.white} />
        </TouchableOpacity>

        <View style={styles.coverArea}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverImg} />
          ) : (
            <View style={styles.coverBlank}>
              <Text style={styles.coverBlankText}>{'\u266A'}</Text>
            </View>
          )}
        </View>

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
            onSlidingComplete={seek}
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
            <Ionicons name="play-skip-back" size={30} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggle} style={styles.playBtn}>
            <Ionicons name={playing ? 'pause' : 'play'} size={32} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={playNext} style={styles.controlBtn}>
            <Ionicons name="play-skip-forward" size={30} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomRow}>
          <TouchableOpacity onPress={toggleShuffle} style={styles.bottomBtn}>
            <Ionicons name="shuffle" size={22} color={shuffleEnabled ? Colors.orange : 'rgba(255,255,255,0.5)'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/lyrics')} style={styles.bottomBtn}>
            <Ionicons name="musical-note" size={22} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/queue')} style={styles.bottomBtn}>
            <Ionicons name="list" size={22} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleRepeat} style={styles.bottomBtn}>
            <Ionicons
              name={repeatMode === 'song' ? 'repeat' : 'repeat'}
              size={22}
              color={repeatMode !== 'none' ? Colors.orange : 'rgba(255,255,255,0.5)'}
            />
            {repeatMode === 'song' && <Text style={styles.repeatOne}>1</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const COVER_SIZE = Dimensions.get('window').width - 80;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  content: { flex: 1 },
  closeBtn: { padding: Spacing.lg, alignSelf: 'flex-start' },
  coverArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  coverImg: { width: COVER_SIZE, height: COVER_SIZE, borderRadius: Radius.md },
  coverBlank: {
    width: COVER_SIZE, height: COVER_SIZE, borderRadius: Radius.md,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  coverBlankText: { fontSize: 64, color: Colors.textMuted },
  info: { alignItems: 'center', paddingHorizontal: Spacing.xl, marginTop: Spacing.lg },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white },
  artist: { fontSize: FontSize.md, color: 'rgba(255,255,255,0.6)', marginTop: Spacing.xs },
  seekArea: { paddingHorizontal: Spacing.xl, marginTop: Spacing.lg },
  seekBar: { width: '100%', height: 40 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8 },
  time: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 32, paddingVertical: Spacing.sm,
  },
  controlBtn: { padding: Spacing.sm },
  playBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  bottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 40, paddingVertical: Spacing.lg, paddingBottom: Spacing.xl,
  },
  bottomBtn: { padding: Spacing.sm, position: 'relative' },
  repeatOne: {
    position: 'absolute', bottom: 2, right: 0,
    fontSize: 9, fontWeight: '700', color: Colors.orange,
  },
});
