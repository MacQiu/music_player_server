import React from 'react';

/** Modal header row: title with a trailing (or leading) control, bottom hairline. */
export default function Header({ left, title, right }: {
  left?: React.ReactNode;
  title: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="modal-header">
      {left}
      <div className="modal-header-title ellipsis">{title}</div>
      {right}
    </div>
  );
}
