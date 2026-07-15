import { PageHeader, Panel } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';

export const metadata = { title: `${tr.manual.title} — ${tr.appName}` };

const m = tr.manual;

export default function ManualPage() {
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <PageHeader title={m.title} />
      <p className="animate-enter mb-5 max-w-2xl text-sm leading-relaxed text-neutral-400">
        {m.intro}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Quick start */}
        <Panel title={m.quickStart.title} className="md:col-span-2">
          <ol className="space-y-2.5">
            {m.quickStart.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-neutral-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[11px] font-semibold text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </Panel>

        {/* Pipeline */}
        <Panel title={m.pipeline.title}>
          <p className="mb-3 text-xs text-neutral-500">{m.pipeline.note}</p>
          <ul className="space-y-2">
            {m.pipeline.stages.map((s, i) => (
              <li key={s.name} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-300/70 shadow-[0_0_8px_rgba(165,180,252,0.7)]" />
                <span>
                  <span className="font-medium text-neutral-200">{s.name}</span>
                  {i < m.pipeline.stages.length - 1 && (
                    <span aria-hidden className="mx-1 text-neutral-600">
                      →
                    </span>
                  )}
                  <span className="block text-xs text-neutral-500">{s.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Sections */}
        <Panel title={m.sections.title}>
          <ul className="space-y-2">
            {m.sections.items.map((it) => (
              <li key={it.name} className="text-sm">
                <span className="font-medium text-neutral-200">{it.name}</span>
                <span className="block text-xs text-neutral-500">{it.desc}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Automation */}
        <Panel title={m.automation.title}>
          <p className="mb-3 text-xs text-neutral-500">{m.automation.note}</p>
          <ul className="space-y-2.5">
            {m.automation.modes.map((mode) => (
              <li key={mode.name} className="text-sm">
                <span className="font-medium text-neutral-200">{mode.name}</span>
                <span className="block text-xs text-neutral-500">{mode.desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90">
            {m.automation.killSwitch}
          </p>
        </Panel>

        {/* Notifications */}
        <Panel title={m.notifications.title}>
          <ul className="space-y-2">
            {m.notifications.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-300">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500" />
                <span className="leading-relaxed">{it}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <p className="mt-5 text-center text-xs text-neutral-600">{m.portalNote}</p>
    </div>
  );
}
