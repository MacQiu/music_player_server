export default function GridCard({ imgSrc, title, subtitle, round, onClick, onPlay, placeholder = '♪', dashed }) {
  return (
    <div className={`gc ${round ? 'gc--round' : ''} ${dashed ? 'gc--dashed' : ''}`} onClick={onClick}>
      <div className={`gc__img-wrap ${round ? 'gc__img-wrap--round' : ''}`}>
        {imgSrc
          ? <img className="gc__img" src={imgSrc} alt="" />
          : <div className="gc__img-blank">{placeholder}</div>}
        {onPlay && (
          <button className="gc__play" onClick={(e) => { e.stopPropagation(); onPlay(); }} title="Play">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#000"><path d="M8 5v14l11-7z"/></svg>
          </button>
        )}
      </div>
      <div className="gc__info">
        <div className="gc__title">{title}</div>
        {subtitle && <div className="gc__sub">{subtitle}</div>}
      </div>
    </div>
  );
}

export function HorizontalCard({ imgSrc, title, onClick, onPlay, placeholder = '♪' }) {
  return (
    <div className="hc" onClick={onClick}>
      <div className="hc__img">
        {imgSrc
          ? <img src={imgSrc} alt="" />
          : <div className="hc__img-blank">{placeholder}</div>}
      </div>
      <div className="hc__info">
        <span className="hc__title">{title}</span>
      </div>
      {onPlay && (
        <button className="hc__play" onClick={(e) => { e.stopPropagation(); onPlay(); }} title="Play">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#000"><path d="M8 5v14l11-7z"/></svg>
        </button>
      )}
    </div>
  );
}

export function SectionHeader({ title, showAll, onShowAll }) {
  return (
    <div className="section-hdr">
      <h2 className="section-hdr__title">{title}</h2>
      {showAll && <button className="section-hdr__more" onClick={onShowAll}>Show all</button>}
    </div>
  );
}
