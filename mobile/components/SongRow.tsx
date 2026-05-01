import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import CoverImage from './CoverImage';
import { Colors, Radius, FontSize, Spacing } from '../constants/theme';
import type { Song } from '../contexts/PlayerContext';

interface Props {
  song: Song;
  onPress: () => void;
  onLongPress?: () => void;
  rightElement?: React.ReactNode;
  imgVersion?: number;
  dimmed?: boolean;
  subtitle?: string;
}

export default function SongRow({ song, onPress, onLongPress, rightElement, imgVersion, dimmed, subtitle }: Props) {
  return (
    <TouchableOpacity
      style={[styles.row, dimmed && styles.dimmed]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <CoverImage coverUrl={song.cover_url} songId={song.id} size={52} imgVersion={imgVersion} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{song.artist || 'Unknown Artist'}</Text>
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
      </View>
      {rightElement}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dimmed: {
    opacity: 0.5,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  artist: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 10,
    fontStyle: 'italic',
  },
});
