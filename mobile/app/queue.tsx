import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CoverImage from '../components/CoverImage';
import { usePlayer, Song } from '../contexts/PlayerContext';
import { Colors, Spacing, FontSize, Radius } from '../constants/theme';

function QueueItem({ song, onPress, style, removable, onRemove }: {
  song: Song;
  onPress?: () => void;
  style?: any;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.item, style]} onPress={onPress} activeOpacity={0.7}>
      <CoverImage coverUrl={song.cover_url} size={36} />
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.itemArtist} numberOfLines={1}>{song.artist || 'Unknown'}</Text>
      </View>
      {removable && (
        <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
          <Ionicons name="close" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function QueueScreen() {
  const router = useRouter();
  const { currentSong, sourceList, sourceIndex, manualQueue, removeFromQueue, jumpToQueueIndex } = usePlayer();

  const songsAbove = sourceIndex > 0 ? sourceList.slice(0, sourceIndex) : [];
  const songsBelow = sourceIndex >= 0 ? sourceList.slice(sourceIndex + 1) : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={28} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Queue</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        {songsAbove.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Previously in Queue</Text>
            {songsAbove.map((song, idx) => (
              <QueueItem key={`above-${song.id}-${idx}`} song={song}
                style={styles.historyItem}
                onPress={() => { jumpToQueueIndex(idx, 'above'); router.back(); }} />
            ))}
          </View>
        )}

        {currentSong && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Now Playing</Text>
            <QueueItem song={currentSong} style={styles.currentItem} />
          </View>
        )}

        {manualQueue.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Added to Queue</Text>
            {manualQueue.map((song, idx) => (
              <QueueItem key={`manual-${song.id}-${idx}`} song={song} removable
                onRemove={() => removeFromQueue(idx)}
                onPress={() => { jumpToQueueIndex(idx, 'manual'); router.back(); }} />
            ))}
          </View>
        )}

        {songsBelow.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Playing Next</Text>
            {songsBelow.map((song, idx) => (
              <QueueItem key={`below-${song.id}-${idx}`} song={song}
                onPress={() => { jumpToQueueIndex(idx, 'below'); router.back(); }} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  body: { flex: 1, padding: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
  },
  historyItem: { opacity: 0.5 },
  currentItem: { backgroundColor: Colors.surface2 },
  itemInfo: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  itemArtist: { fontSize: 11, color: Colors.textMuted },
  removeBtn: { padding: Spacing.sm },
});
