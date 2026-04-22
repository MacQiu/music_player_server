import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CoverImage from './CoverImage';
import { usePlayer } from '../contexts/PlayerContext';
import { Colors, Spacing, FontSize, Radius } from '../constants/theme';

interface Props {
  onPress: () => void;
}

export default function MiniPlayer({ onPress }: Props) {
  const { currentSong, playing, toggle, currentTime, duration } = usePlayer();

  if (!currentSong) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No song selected</Text>
      </View>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.85}>
      <CoverImage coverUrl={currentSong.cover_url} size={44} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{currentSong.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{currentSong.artist || 'Unknown Artist'}</Text>
      </View>
      <TouchableOpacity onPress={(e) => { e.stopPropagation; toggle(); }} style={styles.playBtn}>
        <Ionicons name={playing ? 'pause' : 'play'} size={22} color={Colors.text} />
      </TouchableOpacity>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    position: 'relative',
  },
  empty: {
    backgroundColor: Colors.surface2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  artist: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  playBtn: {
    padding: Spacing.sm,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
});
