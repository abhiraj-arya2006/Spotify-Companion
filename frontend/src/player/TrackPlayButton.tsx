import React from 'react';
import { Music2, Play } from 'lucide-react';
import { usePlayer, type PlayableTrack } from './PlayerContext';

/**
 * Cover art that doubles as a play button. Plays `queue` starting at `index`,
 * so next/previous in the player walk the same list the user is looking at.
 */
export const TrackPlayButton: React.FC<{
  queue: PlayableTrack[];
  index: number;
  className?: string;
}> = ({ queue, index, className = 'h-11 w-11' }) => {
  const { play, current, isPlaying } = usePlayer();
  const track = queue[index];
  if (!track) return null;
  const isCurrent = current?.uri === track.uri;

  return (
    <button
      type="button"
      onClick={() => play(queue, index)}
      aria-label={isCurrent ? `Playing ${track.name}` : `Play ${track.name}`}
      className={`group relative shrink-0 overflow-hidden rounded-lg bg-neutral-800 ${className}`}
    >
      {track.image ? (
        <img src={track.image} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Music2 className="m-auto h-4 w-4 text-neutral-500" />
      )}
      <span
        className={`absolute inset-0 flex items-center justify-center bg-ink/55 transition-opacity ${
          isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
        }`}
        aria-hidden="true"
      >
        {isCurrent && isPlaying ? (
          <span className="eq text-phosphor">
            <span /><span /><span /><span />
          </span>
        ) : (
          <Play className="ml-0.5 h-4 w-4 fill-bone text-bone" />
        )}
      </span>
    </button>
  );
};
