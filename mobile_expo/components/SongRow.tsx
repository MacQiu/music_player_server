import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

export default function SongRow({
  song, onPress, onLongPress, rightElement, imgVersion, dimmed, subtitle,
  selectionMode, selected, onSelect,
}: Props) {
  const handlePress = selectionMode ? onSelect : onPress;

  return (
    <TouchableOpacity
      style={[styles.row, dimmed && styles.dimmed, selectionMode && selected && styles.rowSelected]}
      onPress={handlePress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {selectionMode && (
        <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
          {selected && <Ionicons name="checkmark" size={16} color="#000" />}
        </View>
      )}
      <CoverImage coverUrl={song.cover_url} songId={song.id} size={52} imgVersion={imgVersion} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{song.artist || 'Unknown Artist'}</Text>
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
      </View>
      {!selectionMode && rightElement}
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
  rowSelected: {
    backgroundColor: 'rgba(29,185,84,0.1)',
  },
  dimmed: {
    opacity: 0.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
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
