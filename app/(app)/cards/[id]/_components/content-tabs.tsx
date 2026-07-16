'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { Button, Label, Panel, Textarea } from '@/components/ui';
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
        // Reconcile dirty flags against what we actually saved (`d`): clear a
        // field only if the live draft still equals the saved value. If the
        // user kept typing while the save was in flight, that field stays
        // dirty so the post-refresh re-sync won't clobber the new keystrokes.
        setDrafts((prev) => {
          const cur = prev[lang];
          dirty.current[lang] = {
            caption: cur.caption !== d.caption,
            hashtags: cur.hashtags !== d.hashtags,
            mediaAssetIds:
              cur.mediaAssetIds.join(',') !== d.mediaAssetIds.join(','),
          };
          return prev; // no value change — only dirty-flag reconciliation
        });
        setSavedLang(lang);
        router.refresh();
      }
    });
  }

  return (
    <Panel title={tr.card.caption}>
      {tabs.length > 1 && (
        <div className="mb-4 inline-flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {tabs.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setActive(l)}
              aria-pressed={l === active}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold uppercase tracking-wide transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40 ${
                l === active
                  ? 'bg-neutral-50 text-neutral-950 shadow-[0_2px_8px_rgba(255,255,255,0.12)]'
                  : 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200'
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
          <div key={l} className="animate-enter space-y-4">
            <div>
              <Label>{tr.card.caption}</Label>
              <Textarea
                rows={6}
                value={d.caption}
                maxLength={4000}
                placeholder={tr.card.captionPlaceholder}
                onChange={(e) => patch(l, { caption: e.target.value })}
              />
              <span className="mt-1 block text-right text-[11px] tabular-nums text-neutral-600">
                {d.caption.length}/4000
              </span>
            </div>

            <div>
              <Label>{tr.card.hashtags}</Label>
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

            <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] pt-3">
              {savedLang === l && (
                <span className="animate-enter inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">
                  ✓ {tr.common.saved}
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
