import { useState, useCallback, useMemo } from 'react';

export function useMultiSelect() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enterSelectionMode = useCallback((initialId?: string) => {
    setSelectionMode(true);
    setSelectedIds(initialId ? new Set([initialId]) : new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  return {
    selectionMode,
    selectedIds,
    selectedCount,
    enterSelectionMode,
    exitSelectionMode,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
  };
}
