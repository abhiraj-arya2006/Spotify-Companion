/**
 * Renders a 1080×1920 (9:16) story card of the user's Music DNA onto a canvas
 * and returns it as a PNG. Spotify's image CDN sends CORS headers, so artwork can
 * be drawn without tainting the canvas; any image that fails to load is replaced
 * with an initial instead of breaking the export.
 */
import type { ArtistProfile, MusicDNA } from '../types';

export interface StoryCardData {
  displayName: string;
  avatarUrl: string | null;
  archetype: string;
  gems: Array<{ name: string; image: string | null; popularity: number }>;
  footer: string;
}

const W = 1080;
const H = 1920;
const M = 96; // side margin

const C = {
  ink: '#0C0A1A',
  bone: '#EDEAF7',
  muted: '#BDB6D6',
  dim: '#9C95BA',
  phosphor: '#3DF5A0',
  ultraviolet: '#8B6CFF',
};

const DISPLAY = 'Unbounded, "Hanken Grotesk", sans-serif';
const SANS = '"Hanken Grotesk", system-ui, sans-serif';

/** The five least-popular artists among the user's favourites. */
export function hiddenGems(dna: MusicDNA, count = 5): ArtistProfile[] {
  const seen = new Set<string>();
  return [...dna.coreArtists, ...dna.currentFavourites, ...dna.allTimeArtists]
    .filter(a => (seen.has(a.artist_id) ? false : (seen.add(a.artist_id), true)))
    .sort((a, b) => a.popularity - b.popularity)
    .slice(0, count);
}

function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 6000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  // Not supported everywhere; harmless where missing
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

function grain(ctx: CanvasRenderingContext2D) {
  const n = document.createElement('canvas');
  n.width = n.height = 160;
  const nctx = n.getContext('2d')!;
  const data = nctx.createImageData(160, 160);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  nctx.putImageData(data, 0, 0);
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = ctx.createPattern(n, 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

function roundImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  fallback: string,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    // cover-fit
    const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const w = img.width * s;
    const h = img.height * s;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = '#27233F';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = C.dim;
    ctx.font = `700 ${Math.round(r * 0.9)}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallback.charAt(0).toUpperCase(), cx, cy + r * 0.05);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

export async function renderStoryCard(d: StoryCardData): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`900 120px Unbounded`),
    document.fonts.load(`600 40px Unbounded`),
    document.fonts.load(`700 44px "Hanken Grotesk"`),
    document.fonts.load(`500 32px "Hanken Grotesk"`),
  ]).catch(() => {});

  const [avatar, ...gemImages] = await Promise.all([loadImage(d.avatarUrl), ...d.gems.map(g => loadImage(g.image))]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // --- Aura background -------------------------------------------------------
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  blob(ctx, 160, 380, 950, C.phosphor, 0.42);
  blob(ctx, 1000, 980, 1000, C.ultraviolet, 0.55);
  blob(ctx, 220, 1700, 850, '#FF5FA2', 0.22);
  blob(ctx, 980, 1820, 700, '#3D7BF5', 0.35);
  const vignette = ctx.createLinearGradient(0, 0, 0, H);
  vignette.addColorStop(0, 'rgba(12,10,26,0.15)');
  vignette.addColorStop(0.55, 'rgba(12,10,26,0.35)');
  vignette.addColorStop(1, 'rgba(12,10,26,0.75)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  grain(ctx);

  // --- Brand -------------------------------------------------------------------
  ctx.fillStyle = C.phosphor;
  [26, 44, 34, 18].forEach((h, i) => ctx.fillRect(M + i * 14, 168 - h, 8, h));
  ctx.fillStyle = C.bone;
  ctx.font = `600 38px ${DISPLAY}`;
  setTracking(ctx, -1);
  ctx.fillText('Companion', M + 76, 164);

  // --- Who --------------------------------------------------------------------
  const avatarR = 92;
  const avatarCy = 340;
  roundImage(ctx, avatar, d.displayName, M + avatarR, avatarCy, avatarR);
  ctx.strokeStyle = C.phosphor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(M + avatarR, avatarCy, avatarR + 10, 0, Math.PI * 2);
  ctx.stroke();

  const nameX = M + avatarR * 2 + 48;
  setTracking(ctx, 0);
  ctx.fillStyle = C.bone;
  ctx.font = `700 50px ${SANS}`;
  ctx.fillText(ellipsize(ctx, d.displayName, W - nameX - M), nameX, avatarCy - 6);
  ctx.fillStyle = C.muted;
  ctx.font = `500 34px ${SANS}`;
  ctx.fillText('My Music DNA', nameX, avatarCy + 46);

  // --- Archetype -----------------------------------------------------------------
  let y = 640;
  ctx.fillStyle = C.muted;
  ctx.font = `500 42px ${SANS}`;
  ctx.fillText('I listen like', M, y);

  const title = d.archetype.replace(/^The /, 'the ');
  let size = 150;
  let lines: string[] = [];
  setTracking(ctx, -4);
  do {
    ctx.font = `900 ${size}px ${DISPLAY}`;
    lines = wrap(ctx, title, W - M * 2);
    size -= 8;
  } while ((lines.length > 3 || lines.some(l => ctx.measureText(l).width > W - M * 2)) && size > 70);
  const lineH = (size + 8) * 0.98;
  y += 40;
  ctx.fillStyle = C.bone;
  for (const line of lines) {
    y += lineH;
    // maxWidth makes the canvas condense a line rather than let it overflow;
    // measureText can under-report width when letterSpacing is set.
    ctx.fillText(line, M, y, W - M * 2);
  }
  setTracking(ctx, 0);

  // --- Hidden gems --------------------------------------------------------------
  y = Math.max(y + 120, 1060);
  ctx.fillStyle = C.bone;
  ctx.font = `700 44px ${SANS}`;
  ctx.fillText(d.gems.length ? 'Hidden gems in my rotation' : 'Still discovering my hidden gems', M, y);
  ctx.fillStyle = C.phosphor;
  ctx.fillRect(M, y + 26, 72, 6);

  y += 70;
  // Rows shrink to fit whatever space a long archetype title left above the footer
  const footerTop = H - 190;
  const rowH = Math.min(124, (footerTop - y) / Math.max(d.gems.length, 1));
  const r = Math.min(44, rowH * 0.36);
  d.gems.forEach((g, i) => {
    const cy = y + i * rowH + r;
    roundImage(ctx, gemImages[i] ?? null, g.name, M + r, cy, r);
    const tx = M + r * 2 + 32;
    ctx.fillStyle = C.bone;
    const k = r / 44; // text scales with the row
    ctx.font = `600 ${Math.round(44 * k)}px ${SANS}`;
    ctx.fillText(ellipsize(ctx, g.name, W - tx - M), tx, cy - 2 * k);
    ctx.fillStyle = C.dim;
    ctx.font = `500 ${Math.round(30 * k)}px ${SANS}`;
    ctx.fillText(`Popularity ${g.popularity} out of 100`, tx, cy + 40 * k);
  });

  // --- Footer ---------------------------------------------------------------------
  ctx.fillStyle = C.dim;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText(d.footer, M, H - 110);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not export the card'))), 'image/png'),
  );
}
