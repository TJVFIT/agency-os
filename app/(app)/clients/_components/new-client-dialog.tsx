'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Field, Input, Label } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { createClientAction } from '@/lib/actions/clients';
import { tr } from '@/lib/i18n/tr';

const LANGS = ['tr', 'en'] as const;
type Lang = (typeof LANGS)[number];

/** Lowercase-kebab slug from a display name (Turkish chars folded to ASCII). */
function slugify(name: string): string {
  const map: Record<string, string> = {
    ç: 'c',
    ğ: 'g',
    ı: 'i',
    ö: 'o',
    ş: 's',
    ü: 'u',
    İ: 'i',
  };
  return name
    .toLowerCase()
    .replace(/[çğıöşüİ]/g, (ch) => map[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function NewClientDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [langs, setLangs] = useState<Lang[]>(['tr', 'en']);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setName('');
    setSlug('');
    setSlugEdited(false);
    setLangs(['tr', 'en']);
    setError(null);
  }

  function onName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function toggleLang(l: Lang) {
    setLangs((prev) =>
      prev.includes(l)
        ? prev.length > 1
          ? prev.filter((x) => x !== l)
          : prev
        : [...prev, l],
    );
  }

  function onSubmit(formData: FormData) {
    setError(null);
    const industry = String(formData.get('industry') || '').trim();
    startTransition(async () => {
      const res = await createClientAction({
        name: name.trim(),
        slug: slug.trim(),
        industry: industry || undefined,
        langs,
      });
      if (!res.ok) {
        setError(
          res.error === 'slugTaken'
            ? tr.errors.slugTaken
            : tr.errors.validation,
        );
        return;
      }
      setOpen(false);
      reset();
      if (res.data) router.push(`/clients/${res.data.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {tr.clients.newClient}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tr.clients.newClient}
      >
        <form action={onSubmit} className="space-y-3">
          <Field label={tr.clients.name}>
            <Input
              value={name}
              onChange={(e) => onName(e.target.value)}
              required
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field label={tr.clients.slug}>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
              required
              pattern="[a-z0-9-]+"
              maxLength={60}
              className="font-mono"
            />
          </Field>
          <Field label={tr.clients.industry}>
            <Input name="industry" placeholder="restaurant" maxLength={60} />
          </Field>
          <div>
            <Label>{tr.clients.langs}</Label>
            <div className="flex gap-2">
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => toggleLang(l)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium uppercase transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    langs.includes(l)
                      ? 'border-indigo-300/40 bg-indigo-400/10 text-indigo-200'
                      : 'border-white/10 bg-white/[0.03] text-neutral-500 hover:border-white/20'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              {tr.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={pending || !name.trim() || !slug.trim()}
            >
              {pending ? tr.common.loading : tr.common.create}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
