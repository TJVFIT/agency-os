'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Panel, Textarea } from '@/components/ui';
import { updateClientAction } from '@/lib/actions/clients';
import type { BrandProfile } from '@/lib/db/domain';
import { tr } from '@/lib/i18n/tr';

import { SaveIndicator, type SaveState } from './save-state';
import { StringList } from './string-list';

export function BrandProfileEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: BrandProfile;
}) {
  const [voice, setVoice] = useState(initial.voice);
  const [toneRules, setToneRules] = useState<string[]>(initial.tone_rules);
  const [bannedWords, setBannedWords] = useState<string[]>(
    initial.banned_words,
  );
  const [signatureItems, setSignatureItems] = useState<string[]>(
    initial.signature_items,
  );
  const [sampleCaptions, setSampleCaptions] = useState<string[]>(
    initial.sample_captions,
  );
  const [emojiOk, setEmojiOk] = useState(initial.emoji_ok);
  const [state, setState] = useState<SaveState>('idle');
  const [pending, startTransition] = useTransition();

  function save() {
    setState('saving');
    startTransition(async () => {
      const res = await updateClientAction({
        clientId,
        brandProfile: {
          voice,
          tone_rules: toneRules,
          banned_words: bannedWords,
          signature_items: signatureItems,
          emoji_ok: emojiOk,
          sample_captions: sampleCaptions,
        },
      });
      setState(res.ok ? 'saved' : 'error');
    });
  }

  return (
    <Panel
      title={tr.clients.brandProfile}
      actions={
        <div className="flex items-center gap-2">
          <SaveIndicator state={state} />
          <Button variant="primary" onClick={save} disabled={pending}>
            {tr.common.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label={tr.clients.voice}>
          <Textarea
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            placeholder={tr.clients.voicePlaceholder}
            rows={2}
          />
        </Field>

        <StringList
          label={tr.clients.toneRules}
          items={toneRules}
          onChange={setToneRules}
        />

        <StringList
          label={tr.clients.bannedWords}
          items={bannedWords}
          onChange={setBannedWords}
        />

        <StringList
          label={tr.clients.signatureItems}
          items={signatureItems}
          onChange={setSignatureItems}
        />

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={emojiOk}
            onChange={(e) => setEmojiOk(e.target.checked)}
            className="h-4 w-4 rounded border-white/15 bg-white/[0.03] accent-neutral-200"
          />
          <span className="text-sm text-neutral-200">{tr.clients.emojiOk}</span>
        </label>

        <StringList
          label={tr.clients.sampleCaptions}
          items={sampleCaptions}
          onChange={setSampleCaptions}
          multiline
        />
      </div>
    </Panel>
  );
}
