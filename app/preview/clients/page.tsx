'use client';

/**
 * /preview/clients — the onboarding heart of the live demo workspace.
 * Starts completely empty: a welcome hero invites the visitor to add their
 * own company, then the editor connects their social accounts. Everything
 * persists through the demo store (localStorage) — no example data anywhere.
 */

import { useState } from 'react';

import {
  Button,
  Field,
  Input,
  Label,
  PageHeader,
  Panel,
  Select,
} from '@/components/ui';
import { PLATFORMS, type Platform } from '@/lib/db/types';
import { tr } from '@/lib/i18n/tr';

import { useDemoStore, type StoreClient } from '../_demo/store';

const CHIP =
  'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-neutral-300';

const ICON_BTN =
  'flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 transition-colors duration-300 hover:bg-white/[0.06] hover:text-neutral-200';

const LANGS = ['tr', 'en'] as const;

const DEFAULT_COLOR = '#818cf8';

/** Connected social accounts — live add/remove against the store. */
function AccountsManager({ client }: { client: StoreClient }) {
  const store = useDemoStore();
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [handle, setHandle] = useState('');

  const cleanHandle = handle.trim().replace(/^@+/, '');

  function add() {
    if (!cleanHandle) return;
    store.addAccount(client.id, { platform, handle: cleanHandle });
    setHandle('');
  }

  return (
    <section className="mt-5 border-t border-white/[0.06] pt-4">
      <Label>{tr.demo.connectAccounts}</Label>
      <p className="mb-3 text-xs leading-relaxed text-neutral-500">
        {tr.demo.accountsHelp}
      </p>

      {client.accounts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {client.accounts.map((a) => (
            <span key={`${a.platform}-${a.handle}`} className={CHIP}>
              {tr.platforms[a.platform]}
              <span className="font-mono text-neutral-100">@{a.handle}</span>
              <button
                type="button"
                aria-label={tr.common.remove}
                onClick={() =>
                  store.removeAccount(client.id, a.platform, a.handle)
                }
                className="-mr-0.5 flex h-4 w-4 items-center justify-center rounded-full text-neutral-500 transition-colors duration-300 hover:bg-white/10 hover:text-red-300"
              >
                ✗
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <Label>{tr.clients.platform}</Label>
          <Select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {tr.platforms[p]}
              </option>
            ))}
          </Select>
        </label>
        <label className="block min-w-40 flex-1">
          <Label>{tr.clients.handle}</Label>
          <Input
            value={handle}
            placeholder={tr.clients.handle}
            maxLength={60}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </label>
        <Button
          variant="secondary"
          icon="+"
          disabled={!cleanHandle}
          onClick={add}
        >
          {tr.demo.addAccount}
        </Button>
      </div>
    </section>
  );
}

/** Add/edit form — creating hands off to editing so accounts come next. */
function ClientEditor({
  client,
  onCreated,
  onClose,
}: {
  client?: StoreClient;
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const store = useDemoStore();
  const [name, setName] = useState(client?.name ?? '');
  const [industry, setIndustry] = useState(client?.industry ?? '');
  const [district, setDistrict] = useState(client?.district ?? '');
  const [color, setColor] = useState(client?.colors.primary ?? DEFAULT_COLOR);
  const [langs, setLangs] = useState<string[]>(client?.langs ?? ['tr']);

  const valid = name.trim().length > 0;

  function toggleLang(lang: string) {
    setLangs((p) =>
      p.includes(lang) ? p.filter((l) => l !== lang) : [...p, lang],
    );
  }

  function save() {
    if (!valid) return;
    const patch = {
      name: name.trim(),
      industry: industry.trim(),
      district: district.trim(),
      colors: { primary: color },
      langs: langs.length > 0 ? langs : ['tr'],
    };
    if (client) {
      store.updateClient(client.id, patch);
      onClose();
    } else {
      const created = store.addClient({ ...patch, accounts: [] });
      onCreated(created.id);
    }
  }

  return (
    <Panel
      title={
        client
          ? `${client.name} — ${tr.clients.brandProfile}`
          : tr.clients.newClient
      }
      className="animate-enter mb-4"
      actions={
        <button
          onClick={onClose}
          aria-label={tr.common.close}
          className={ICON_BTN}
        >
          ✕
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={tr.demo.companyName}>
          <Input
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={tr.clients.industry}>
          <Input
            value={industry}
            maxLength={60}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </Field>
        <Field label={tr.production.district}>
          <Input
            value={district}
            maxLength={60}
            onChange={(e) => setDistrict(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>{tr.clients.primaryColor}</Label>
            <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-6 w-9 cursor-pointer appearance-none rounded-md border-none bg-transparent p-0 [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
              />
              <span className="font-mono text-xs text-neutral-400">
                {color}
              </span>
            </span>
          </label>
          <div>
            <Label>{tr.clients.langs}</Label>
            <div className="flex gap-1.5">
              {LANGS.map((lang) => (
                <label
                  key={lang}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium uppercase transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    langs.includes(lang)
                      ? 'border-indigo-300/40 bg-indigo-400/10 text-indigo-200'
                      : 'border-white/10 bg-white/[0.03] text-neutral-500 hover:border-white/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={langs.includes(lang)}
                    onChange={() => toggleLang(lang)}
                  />
                  {lang}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {client && <AccountsManager client={client} />}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {tr.common.cancel}
        </Button>
        <Button variant="primary" disabled={!valid} onClick={save}>
          {client ? tr.common.save : tr.common.create}
        </Button>
      </div>
    </Panel>
  );
}

export default function PreviewClientsPage() {
  const store = useDemoStore();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!store.hydrated) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-7 w-36 rounded-lg bg-white/[0.04]" />
        <div className="h-56 rounded-2xl bg-white/[0.03]" />
      </div>
    );
  }

  const editing = editingId
    ? store.clients.find((c) => c.id === editingId)
    : undefined;
  const editorOpen = creating || Boolean(editing);
  const isEmpty = store.clients.length === 0;

  function openCreate() {
    setEditingId(null);
    setCreating(true);
  }

  function openEdit(id: string) {
    setCreating(false);
    setEditingId(id);
  }

  function closeEditor() {
    setCreating(false);
    setEditingId(null);
  }

  function remove(client: StoreClient) {
    if (!window.confirm(tr.clients.deleteConfirm)) return;
    store.removeClient(client.id);
    if (editingId === client.id) closeEditor();
  }

  return (
    <div>
      <PageHeader title={tr.clients.title}>
        {!isEmpty && !editorOpen && (
          <Button variant="primary" icon="+" onClick={openCreate}>
            {tr.clients.newClient}
          </Button>
        )}
      </PageHeader>

      {/* Onboarding hero — the workspace starts empty on purpose. */}
      {isEmpty && !editorOpen && (
        <section className="animate-enter rounded-2xl bg-gradient-to-b from-white/[0.12] via-white/[0.05] to-white/[0.02] p-px shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)]">
          <div className="relative flex flex-col items-center gap-4 overflow-hidden rounded-[calc(1rem-1px)] bg-[#0a0a0b] px-6 py-20 text-center">
            {/* Radial brand accent — pure CSS, sits behind the content. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(32rem_18rem_at_50%_-4rem,rgba(129,140,248,0.14),transparent_70%)]"
            />
            <span className="relative inline-flex items-center gap-2 rounded-full border border-indigo-300/25 bg-indigo-400/[0.08] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-indigo-200">
              <span className="h-1 w-1 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.9)]" />
              {tr.appName}
            </span>
            <span
              aria-hidden
              className="relative flex h-14 w-14 items-center justify-center rounded-full border border-indigo-300/20 bg-indigo-400/10 text-2xl shadow-[0_0_32px_rgba(129,140,248,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]"
            >
              ✨
            </span>
            <h2 className="relative text-2xl font-semibold tracking-tight text-neutral-50">
              {tr.demo.welcomeTitle}
            </h2>
            <p className="relative max-w-md text-sm leading-relaxed text-neutral-400">
              {tr.demo.welcomeBody}
            </p>
            <Button
              variant="primary"
              icon="+"
              className="relative mt-1 px-5 py-2 text-base shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(255,255,255,0.08),0_0_48px_-8px_rgba(165,180,252,0.5)]"
              onClick={openCreate}
            >
              {tr.demo.addClientCta}
            </Button>
          </div>
        </section>
      )}

      {editorOpen && (
        <ClientEditor
          key={editing?.id ?? 'new'}
          client={editing}
          onCreated={(id) => {
            setCreating(false);
            setEditingId(id);
          }}
          onClose={closeEditor}
        />
      )}

      {!isEmpty && (
        <ul className="stagger-children grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {store.clients.map((c) => (
            <li key={c.id} className="relative">
              {/* client accent: hairline bar echoing CardTile / the clients list */}
              <span
                aria-hidden
                className="absolute inset-y-4 left-4 z-10 w-[2.5px] rounded-full opacity-70"
                style={{
                  background: c.colors.primary,
                  boxShadow: `0 0 12px ${c.colors.primary}66`,
                }}
              />
              <Panel
                className={`transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 ${
                  c.id === editingId ? 'ring-1 ring-indigo-300/20' : ''
                }`}
              >
                <div className="pl-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 truncate text-sm font-semibold tracking-tight text-neutral-100">
                      {c.name}
                    </h2>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => openEdit(c.id)}
                        aria-label={tr.common.edit}
                        title={tr.common.edit}
                        className={ICON_BTN}
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => remove(c)}
                        aria-label={tr.common.delete}
                        title={tr.common.delete}
                        className={`${ICON_BTN} hover:text-red-300`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {(c.industry || c.district) && (
                    <p className="mt-2 text-xs text-neutral-500">
                      {[c.industry, c.district].filter(Boolean).join(' · ')}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.accounts.length === 0 ? (
                      <button
                        onClick={() => openEdit(c.id)}
                        className="rounded-full border border-dashed border-white/15 px-2.5 py-0.5 text-[11px] font-medium text-neutral-500 transition-colors duration-300 hover:border-white/30 hover:text-neutral-300"
                      >
                        + {tr.demo.addAccount}
                      </button>
                    ) : (
                      c.accounts.map((a) => (
                        <span
                          key={`${a.platform}-${a.handle}`}
                          className={CHIP}
                        >
                          {tr.platforms[a.platform]}
                          <span className="font-mono text-neutral-100">
                            @{a.handle}
                          </span>
                        </span>
                      ))
                    )}
                  </div>

                  {c.langs.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.langs.map((l) => (
                        <span
                          key={l}
                          className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-300"
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
