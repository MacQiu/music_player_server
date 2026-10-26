import type { IconType } from 'react-icons';
import {
  IoClose, IoAddCircleOutline, IoDownloadOutline, IoTrashOutline, IoRemoveCircleOutline,
} from 'react-icons/io5';
import { Colors } from '../constants/theme';

export type SelectionAction = 'addToPlaylist' | 'download' | 'deleteLocal' | 'removeFromPlaylist';

interface Props {
  selectedCount: number;
  totalCount: number;
  actions: SelectionAction[];
  onAction: (action: SelectionAction) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClose: () => void;
  busy?: boolean;
}

const ACTION_CONFIG: Record<SelectionAction, { icon: IconType; label: string; color?: string }> = {
  addToPlaylist: { icon: IoAddCircleOutline, label: 'Add to Playlist' },
  download: { icon: IoDownloadOutline, label: 'Download' },
  deleteLocal: { icon: IoTrashOutline, label: 'Delete Local', color: '#ef4444' },
  removeFromPlaylist: { icon: IoRemoveCircleOutline, label: 'Remove', color: '#ef4444' },
};

export default function SelectionBar({
  selectedCount, totalCount, actions, onAction, onSelectAll, onDeselectAll, onClose, busy,
}: Props) {
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const disabled = selectedCount === 0 || !!busy;

  return (
    <div className="selection-bar">
      <div className="selection-top">
        <button className="icon-btn" onClick={onClose} aria-label="Close selection">
          <IoClose size={22} />
        </button>
        <span className="selection-count">{busy ? 'Working...' : `${selectedCount} selected`}</span>
        <button className="link-accent" onClick={allSelected ? onDeselectAll : onSelectAll}>
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="selection-actions">
        {actions.map(action => {
          const cfg = ACTION_CONFIG[action];
          const Icon = cfg.icon;
          const color = disabled ? Colors.surface3 : (cfg.color || Colors.accent);
          return (
            <button key={action} className="selection-action" onClick={() => onAction(action)} disabled={disabled}>
              <Icon size={22} color={color} />
              <span style={{ color: disabled ? Colors.surface3 : (cfg.color || Colors.text) }}>{cfg.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
