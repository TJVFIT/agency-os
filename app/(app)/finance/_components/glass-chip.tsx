/**
 * Small tinted glass status chip for finance-domain statuses (payments, ad
 * tasks, package state). Same glow-dot chip pattern as the shared
 * StatusBadge/CardTile, but covers the payment/ad status vocabulary which
 * sits outside `CardStatus` — kept route-local rather than extending the
 * shared kit.
 */
const TONES = {
  neutral: {
    chip: 'border-white/10 bg-white/[0.05] text-neutral-300',
    dot: 'bg-neutral-400',
  },
  green: {
    chip: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  },
  red: {
    chip: 'border-red-400/25 bg-red-400/10 text-red-200',
    dot: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]',
  },
  amber: {
    chip: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
  },
  sky: {
    chip: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
    dot: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]',
  },
} as const;

export type GlassChipTone = keyof typeof TONES;

export function GlassChip({
  tone,
  children,
}: {
  tone: GlassChipTone;
  children: React.ReactNode;
}) {
  const c = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${c.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {children}
    </span>
  );
}
