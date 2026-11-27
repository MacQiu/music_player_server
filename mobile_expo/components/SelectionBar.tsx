import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, Radius } from '../constants/theme';

export type SelectionAction = 'addToPlaylist' | 'download' | 'deleteLocal' | 'removeFromPlaylist';

interface Props {
  selectedCount: number;
  totalCount: number;
  actions: SelectionAction[];
  onAction: (action: SelectionAction) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClose: () => void;
}

const ACTION_CONFIG: Record<SelectionAction, { icon: string; label: string; color?: string }> = {
  addToPlaylist: { icon: 'add-circle-outline', label: 'Add to Playlist' },
  download: { icon: 'download-outline', label: 'Download' },
  deleteLocal: { icon: 'trash-outline', label: 'Delete Local', color: '#ef4444' },
  removeFromPlaylist: { icon: 'remove-circle-outline', label: 'Remove', color: '#ef4444' },
};

export default function SelectionBar({
  selectedCount, totalCount, actions, onAction, onSelectAll, onDeselectAll, onClose,
}: Props) {
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.count}>{selectedCount} selected</Text>
        <TouchableOpacity onPress={allSelected ? onDeselectAll : onSelectAll}>
          <Text style={styles.selectToggle}>{allSelected ? 'Deselect All' : 'Select All'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.actionsRow}>
        {actions.map(action => {
          const cfg = ACTION_CONFIG[action];
          return (
            <TouchableOpacity key={action} style={styles.actionBtn}
              onPress={() => onAction(action)} disabled={selectedCount === 0}>
              <Ionicons name={cfg.icon as any} size={22}
                color={selectedCount === 0 ? Colors.surface3 : (cfg.color || Colors.accent)} />
              <Text style={[styles.actionLabel,
                selectedCount === 0 && { color: Colors.surface3 },
                cfg.color && selectedCount > 0 && { color: cfg.color },
              ]}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  closeBtn: { padding: Spacing.xs },
  count: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  selectToggle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.accent },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionBtn: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  actionLabel: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: '600',
  },
});
