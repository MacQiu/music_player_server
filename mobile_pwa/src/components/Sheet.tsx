import React from 'react';
import { createPortal } from 'react-dom';

/** Bottom action sheet with a dimmed backdrop (stand-in for RN's transparent Modal). */
export default function Sheet({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        {title && <div className="sheet-title ellipsis">{title}</div>}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SheetItem({ icon, label, onClick, color, disabled }: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <button className="sheet-item" onClick={onClick} disabled={disabled} style={color ? { color } : undefined}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function SheetDivider() {
  return <div className="sheet-divider" />;
}
