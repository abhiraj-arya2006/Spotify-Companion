import React from 'react';

/**
 * Minimal, safe renderer for the subset of Markdown Gemini uses in chat:
 * headings (#, ##, ###), **bold**, and "* " / "- " bullets.
 * Builds React elements directly — no HTML injection.
 */
export const RichText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('\n').map((rawLine, i) => {
      const heading = rawLine.match(/^\s*#{1,3}\s+(.*)$/);
      if (heading) {
        return (
          <div key={i} className="font-display text-[0.95em] font-semibold text-bone mt-3 first:mt-0">
            {inline(heading[1])}
          </div>
        );
      }
      const bullet = rawLine.match(/^(\s*)[*-]\s+(.*)$/);
      if (bullet) {
        return (
          <div key={i} className="flex gap-2" style={{ paddingLeft: `${Math.min(bullet[1].length, 6) * 0.5}rem` }}>
            <span className="text-phosphor" aria-hidden="true">•</span>
            <span>{inline(bullet[2])}</span>
          </div>
        );
      }
      return rawLine.trim() ? <div key={i}>{inline(rawLine)}</div> : <div key={i} className="h-2" />;
    })}
  </>
);

function inline(line: string): React.ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-bone">{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}
