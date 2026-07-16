import { PageHeader, Panel } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';

export const metadata = { title: `${tr.manual.title} — ${tr.appName}` };

const m = tr.manual;

/** Spring easing shared by every hover transition on this page. */
const SPRING = 'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]';

/** Soft outer-shadow lift on panel hover (double bezel comes from <Panel>). */
const PANEL_HOVER =
  'transition-shadow duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.75)]';

/** Rounded-full count badge — tabular-nums, neutral glass tint. */
function CountChip({ value }: { value: number }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      {value}
    </span>
  );
}

/** One-line explainer under a panel title. */
function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs leading-relaxed text-neutral-500">{children}</p>
  );
}

export default function ManualPage() {
  const steps = m.quickStart.steps;
  const stages = m.pipeline.stages;
  const modes = m.automation.modes;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <PageHeader title={m.title}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-indigo-300/80 shadow-[0_0_6px_rgba(165,180,252,0.7)]"
          />
          {m.subtitle}
        </span>
      </PageHeader>

      <p className="animate-enter mb-4 max-w-2xl text-sm leading-relaxed text-neutral-400">
        {m.intro}
      </p>

      <div className="stagger-children grid gap-4 md:grid-cols-2">
        {/* Quick start */}
        <Panel
          title={m.quickStart.title}
          actions={<CountChip value={steps.length} />}
          className={`md:col-span-2 ${PANEL_HOVER}`}
        >
          <ol className="stagger-children grid gap-2.5 md:grid-cols-2">
            {steps.map((step, i) => (
              <li
                key={i}
                className={`flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${SPRING} hover:border-white/[0.12] hover:bg-white/[0.05] ${
                  steps.length % 2 === 1 && i === steps.length - 1
                    ? 'md:col-span-2'
                    : ''
                }`}
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[11px] font-semibold tabular-nums text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </Panel>

        {/* Pipeline */}
        <Panel
          title={m.pipeline.title}
          actions={<CountChip value={stages.length} />}
          className={PANEL_HOVER}
        >
          <SectionNote>{m.pipeline.note}</SectionNote>
          <div className="relative">
            <span
              aria-hidden
              className="absolute bottom-2 left-[9px] top-2 w-px bg-gradient-to-b from-indigo-300/25 via-white/[0.08] to-emerald-300/25"
            />
            <ol className="stagger-children space-y-3">
              {stages.map((s, i) => {
                const isLast = i === stages.length - 1;
                return (
                  <li key={s.name} className="relative flex items-start gap-3">
                    <span
                      aria-hidden
                      className="z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0a0a0b] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isLast
                            ? 'bg-emerald-300/90 shadow-[0_0_8px_rgba(110,231,183,0.7)]'
                            : 'bg-indigo-300/70 shadow-[0_0_8px_rgba(165,180,252,0.7)]'
                        }`}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-neutral-200">
                        {s.name}
                      </span>
                      <span className="block text-xs leading-relaxed text-neutral-500">
                        {s.desc}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </Panel>

        {/* Sections */}
        <Panel
          title={m.sections.title}
          actions={<CountChip value={m.sections.items.length} />}
          className={PANEL_HOVER}
        >
          <ul className="stagger-children -mx-2 space-y-1">
            {m.sections.items.map((it) => (
              <li
                key={it.name}
                className={`flex items-start gap-3 rounded-xl border border-transparent px-2 py-1.5 ${SPRING} hover:border-white/[0.08] hover:bg-white/[0.03]`}
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  {it.name.charAt(0)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-200">
                    {it.name}
                  </span>
                  <span className="block text-xs leading-relaxed text-neutral-500">
                    {it.desc}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Automation */}
        <Panel
          title={m.automation.title}
          actions={<CountChip value={modes.length} />}
          className={PANEL_HOVER}
        >
          <SectionNote>{m.automation.note}</SectionNote>
          <ul className="stagger-children space-y-2">
            {modes.map((mode, i) => (
              <li
                key={mode.name}
                className={`rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${SPRING} hover:border-white/[0.12] hover:bg-white/[0.05]`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-200">
                    {mode.name}
                  </span>
                  <span aria-hidden className="flex items-center gap-1">
                    {modes.map((_, j) => (
                      <span
                        key={j}
                        className={`h-1.5 w-1.5 rounded-full ${
                          j <= i
                            ? 'bg-indigo-300/80 shadow-[0_0_6px_rgba(165,180,252,0.6)]'
                            : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
                  {mode.desc}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2.5 text-xs leading-relaxed text-amber-200/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <span
              aria-hidden
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
            />
            <span>{m.automation.killSwitch}</span>
          </p>
        </Panel>

        {/* Notifications */}
        <Panel
          title={m.notifications.title}
          actions={<CountChip value={m.notifications.items.length} />}
          className={PANEL_HOVER}
        >
          <ul className="stagger-children space-y-2.5">
            {m.notifications.items.map((it, i) => {
              const sep = it.indexOf(':');
              const label = sep > 0 ? it.slice(0, sep) : null;
              const rest = sep > 0 ? it.slice(sep + 1).trim() : it;
              return (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  {label ? (
                    <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                      {label}
                    </span>
                  ) : (
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500"
                    />
                  )}
                  <span className="leading-relaxed text-neutral-400">
                    {rest}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <p className="animate-enter mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center text-xs leading-relaxed text-neutral-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        {m.portalNote}
      </p>
    </div>
  );
}
