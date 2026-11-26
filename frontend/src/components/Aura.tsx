import React from 'react';

interface AuraProps {
  /** Album cover URLs from the user's current rotation. Empty → palette fallback. */
  covers?: string[];
}

/**
 * The living background: the user's own album covers, hugely blurred and
 * drifting, so the app's colour literally comes from what they listen to.
 */
export const Aura: React.FC<AuraProps> = ({ covers = [] }) => {
  const slots = [0, 1, 2, 3];
  return (
    <>
      <div className="aura" aria-hidden="true">
        {slots.map(i => {
          const url = covers.length ? covers[i % covers.length] : null;
          return (
            <div
              key={i}
              className={`aura__blob ${url ? '' : 'aura__blob--fallback'}`}
              style={url ? { backgroundImage: `url("${url}")` } : undefined}
            />
          );
        })}
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
};
