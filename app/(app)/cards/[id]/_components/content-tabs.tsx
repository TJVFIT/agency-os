'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { Button, Panel, Textarea } from '@/components/ui';
import { upsertCardContent } from '@/lib/actions/contents';
import { tr } from '@/lib/i18n/tr';
import type { CardContent } from '@/lib/db/types';

import { MediaPicker, type PickableAsset } from './media-picker';

type Lang = 'tr' | 'en';

interface DraftState {
  caption: string;
  hashtags: string;
  mediaAssetIds: string[];
}

function toDraft(content: CardContent | undefined): DraftState {
  return {
    caption: content?.caption ?? '',
    hashtags: (content?.hashtags ?? []).join(', '),
    mediaAssetIds: content?.media_asset_ids ?? [],
  };
}

function parseHashtags(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((h) => h.trim().replace(/^#/, ''))
    .filter(Boolean);
}

/** TR/EN content tabs: caption + hashtags + media, saved via upsertCardContent. */
export function ContentTabs({
  cardId,
  langs,
  contents,
  assets,
}: {
  cardId: string;
  langs: string[];
  contents: CardContent[];
  assets: PickableAsset[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Only tr/en are editable content langs (upsertCardContent contract).
  const tabs = useMemo<Lang[]>(
    () =>
      (['tr', 'en'] as const).filter((l) => l === 'tr' || langs.includes('en')),
    [langs],
  );

  const [active, setActive] = useState<Lang>('tr');
  const byLang = useMemo(() => {
    const m = new Map<string, CardContent>();
    for (const c of contents) m.set(c.lang, c);
    return m;
  }, [contents]);

  const [drafts, setDrafts] = useState<Record<Lang, DraftState>>({
    tr: toDraft(byLang.get('tr')),
    en: toDraft(byLang.get('en')),
  });
  const [savedLang, setSavedLang] = useState<Lang | null>(null);

  // Which fields carry unsaved local edits, per lang — never clobbered by a
  // re-sync. Fields left clean track the server value.
  const dirty = useRef<
    Record<Lang, Partial<Record<keyof DraftState, boolean>>>
  >({ tr: {}, en: {} });
  // Last server version (card_contents.updated_at) we synced from, per lang.
  const syncedAt = useRef<Record<Lang, string | null>>({ tr: null, en: null });

  // Re-sync when the underlying card_content changes (AI variant applied,
  // teammate save, router.refresh). Only fields the user hasn't touched are
  // overwritten, so a stale draft can never clobber fresher server text.
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const lang of ['tr', 'en'] as Lang[]) {
        const c = byLang.get(lang);
        const ver = c?.updated_at ?? null;
        if (ver === syncedAt.current[lang]) continue;
        const server = toDraft(c);
        const cur = prev[lang];
        const d = dirty.current[lang];
        next[lang] = {
          caption: d.caption ? cur.caption : server.caption,
          hashtags: d.hashtags ? cur.hashtags : server.hashtags,
          mediaAssetIds: d.mediaAssetIds
            ? cur.mediaAssetIds
            : server.mediaAssetIds,
        };
        syncedAt.current[lang] = ver;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [byLang]);

  function patch(lang: Lang, next: Partial<DraftState>) {
    setDrafts((prev) => ({ ...prev, [lang]: { ...prev[lang], ...next } }));
    for (const k of Object.keys(next) as (keyof DraftState)[]) {
      dirty.current[lang][k] = true;
    }
    setSavedLang(null);
  }

  function save(lang: Lang) {
    const d = drafts[lang];
    startTransition(async () => {
      const res = await upsertCardContent({
        cardId,
        lang,
        caption: d.caption,
        hashtags: parseHashtags(d.hashtags),
        mediaAssetIds: d.mediaAssetIds,
      });
      if (res.ok) {
        // Our local draft is now the server truth — drop dirty flags so the
        // refreshed content (new updated_at) re-syncs cleanly instead of being
        // treated as an external change to preserve.
        dirty.current[lang] = {};
        setSavedLang(lang);
        router.refresh();
      }
    });
  }

  return (
    <Panel title={tr.card.caption}>
      {tabs.length > 1 && (
        <div className="mb-3 flex gap-1">
          {tabs.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setActive(l)}
              className={`rounded-md px-3 py-1 text-xs font-medium uppercase transition-colors ${
                l === active
                  ? 'bg-neutral-100 text-neutral-950'
                  : 'text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {tabs.map((l) => {
        if (l !== active) return null;
        const d = drafts[l];
        return (
          <div key={l} className="space-y-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-400">
                {tr.card.caption}
              </span>
              <Textarea
                rows={6}
                value={d.caption}
                maxLength={4000}
                placeholder={tr.card.captionPlaceholder}
                onChange={(e) => patch(l, { caption: e.target.value })}
              />
              <span className="mt-1 block text-right text-[0.65rem] text-neutral-600">
                {d.caption.length}/4000
              </span>
            </div>

            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-400">
                {tr.card.hashtags}
              </span>
              <Textarea
                rows={2}
                value={d.hashtags}
                placeholder={tr.card.hashtagsPlaceholder}
                onChange={(e) => patch(l, { hashtags: e.target.value })}
              />
            </div>

            <MediaPicker
              assets={assets}
              selectedIds={d.mediaAssetIds}
              onChange={(ids) => patch(l, { mediaAssetIds: ids })}
            />

            <div className="flex items-center justify-end gap-2">
              {savedLang === l && (
                <span className="text-xs text-emerald-400">
                  {tr.common.saved}
                </span>
              )}
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={() => save(l)}
              >
                {pending ? tr.common.loading : tr.common.save}
              </Button>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
