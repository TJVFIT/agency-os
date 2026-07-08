import { Fragment, type ReactNode } from 'react';

import { tr } from '@/lib/i18n/tr';

/**
 * Minimal, dependency-free markdown renderer for the AI-written report body
 * (SPEC §6.3 REPORT_SYSTEM produces `body_md`: bullet highlights + a couple of
 * short sections). Line-based: handles #/##/### headings, `- `/`* ` bullets,
 * blank-line paragraph breaks, and inline **bold**. Anything fancier degrades
 * to plain text — good enough for a tool view and adds no dependency.
 */
export function ReportBody({ markdown }: { markdown: string }) {
  const text = (markdown ?? '').trim();
  if (!text) {
    return <p className="text-sm text-neutral-500">{tr.common.none}</p>;
  }

  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={key} className="ml-4 list-disc space-y-1 text-neutral-200">
        {items.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>,
    );
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    const key = `b${idx}`;

    if (line === '') {
      flushBullets(`${key}-flush`);
      return;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets(`${key}-flush`);
      const level = heading[1].length;
      blocks.push(
        <p
          key={key}
          className={
            level <= 2
              ? 'text-sm font-semibold text-neutral-100'
              : 'text-sm font-medium text-neutral-200'
          }
        >
          {renderInline(heading[2])}
        </p>,
      );
      return;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }

    flushBullets(`${key}-flush`);
    blocks.push(
      <p key={key} className="text-sm text-neutral-200">
        {renderInline(line)}
      </p>,
    );
  });

  flushBullets('tail-flush');

  return <div className="space-y-3">{blocks}</div>;
}

/** Render inline **bold** segments; everything else stays literal text. */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      return (
        <strong key={i} className="font-semibold text-neutral-100">
          {bold[1]}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
