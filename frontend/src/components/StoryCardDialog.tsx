import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share2, X } from 'lucide-react';
import { getProfile } from '../api/client';
import { hiddenGems, renderStoryCard } from '../lib/storyCard';
import type { MusicDNA } from '../types';

/** Renders the Music DNA story card and offers native share (phones) or download. */
export const StoryCardDialog: React.FC<{ dna: MusicDNA; onClose: () => void }> = ({ dna, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const profile = await getProfile().then(r => r.profile).catch(() => null);
        const png = await renderStoryCard({
          displayName: profile?.display_name || 'A Companion listener',
          avatarUrl: profile?.images?.[0]?.url ?? null,
          archetype: dna.listeningPersonality.type,
          gems: hiddenGems(dna).map(a => ({ name: a.artist_name, image: a.image_url, popularity: a.popularity })),
          footer: `Find your Music DNA at ${window.location.host}`,
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(png);
        setFile(new File([png], 'my-music-dna.png', { type: 'image/png' }));
        setUrl(objectUrl);
      } catch (e) {
        console.error('Story card failed:', e);
        if (!cancelled) setError('The card could not be drawn. Please try again.');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [dna]);

  // Escape closes; focus starts on the close button
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const share = async () => {
    if (!file) return;
    setShareError(null);
    try {
      await navigator.share({ files: [file], title: 'My Music DNA' });
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setShareError('Sharing failed. Download the image and post it instead.');
    }
  };

  // Portal to <body>: the page content sits in its own stacking layer, which
  // would otherwise put the nav dock and player above this dialog.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-card-title"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-full w-full max-w-sm flex-col rounded-[28px] bg-ink-2 p-5 ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <h2 id="story-card-title" className="font-display text-lg font-bold text-bone">
            Your story card
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-neutral-400 hover:bg-white/10 hover:text-bone"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
          <div className="aspect-[9/16] h-[min(62vh,560px)] overflow-hidden rounded-2xl bg-white/5">
            {url ? (
              <img src={url} alt={`Story card: ${dna.listeningPersonality.type}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-neutral-400">
                {error ?? (
                  <>
                    <span className="eq scale-125 text-phosphor" aria-hidden="true"><span /><span /><span /><span /></span>
                    Drawing your card…
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          {canShare && (
            <button
              type="button"
              onClick={share}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-phosphor px-4 py-3 text-sm font-bold text-ink"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          )}
          <a
            href={url ?? undefined}
            download="my-music-dna.png"
            aria-disabled={!url}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold ${
              canShare ? 'bg-white/10 text-bone' : 'bg-phosphor text-ink'
            } ${url ? '' : 'pointer-events-none opacity-50'}`}
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
        <p className="mt-3 text-center text-xs text-neutral-500">
          {shareError ?? '1080 × 1920, sized for Instagram and TikTok stories.'}
        </p>
      </div>
    </div>,
    document.body,
  );
};
