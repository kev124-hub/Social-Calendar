// src/lib/glass.ts
// Riviera Glass design tokens. Single source of truth for the redesign.
// Values are literal so they can be used in inline styles as well as Tailwind
// arbitrary values (e.g. bg-[var(--glass-panel)]).

export const INK = {
  primary: '#150f19',   // titles, day numbers, body
  strong: '#241f28',    // labels, semibold meta
  secondary: '#3d3743', // supporting copy
  tertiary: '#5d5660',  // LIGHTEST text allowed on glass — never go paler
} as const;

export const GLASS = {
  // Page / app-shell wash. Apply to the app container, not to body.
  wash: [
    'radial-gradient(760px 460px at 4% 0%, rgba(214,164,240,.80), transparent 62%)',
    'radial-gradient(700px 460px at 98% 6%, rgba(104,180,220,.78), transparent 62%)',
    'radial-gradient(760px 500px at 72% 102%, rgba(134,200,226,.60), transparent 62%)',
    '#e7ecf0',
  ].join(','),

  panel: 'rgba(255,255,255,.60)',      // large frosted panels
  panelSoft: 'rgba(255,255,255,.46)',  // sidebar / header
  card: 'rgba(255,255,255,.88)',       // post cards, month rows
  cardHover: '#ffffff',
  hairline: 'rgba(255,255,255,.90)',   // border on frosted surfaces
  blur: 'blur(14px)',                  // backdrop-filter for panels

  shadowCard: '0 3px 8px rgba(63,43,80,.10)',
  shadowCardHover: '0 26px 42px rgba(63,43,80,.28)',
  shadowPanel: '0 16px 32px rgba(18,52,72,.16)',
  shadowLift: '0 14px 24px rgba(18,52,72,.20)',
} as const;

// Weekday vs weekend colour split. Mon–Fri = blue, Sat/Sun = warm yellow.
// This is the redesign's core legibility device — do not tint per-weekday.
export function dayTint(dow: number) {
  const weekend = dow === 0 || dow === 6;
  return {
    bg: weekend ? 'rgba(252,222,130,.62)' : 'rgba(74,152,206,.52)',
    border: weekend ? 'rgba(140,98,10,.42)' : 'rgba(9,66,94,.40)',
  };
}

export const TODAY_BORDER = 'rgba(20,16,20,.62)'; // today = dark outline, never its own hue

export const PLATFORM = {
  instagram: { label: 'Instagram', code: 'IG', fill: '#f1ccff', ink: '#7b2f9e', chip: 'rgba(226,180,246,.55)' },
  tiktok:    { label: 'TikTok',    code: 'TT', fill: '#91e0ff', ink: '#0b4f6c', chip: 'rgba(126,196,231,.50)' },
  linkedin:  { label: 'LinkedIn',  code: 'LI', fill: '#ffd8a8', ink: '#8a4b06', chip: 'rgba(252,222,130,.60)' },
} as const;

// Stage chips: filled ink pills, never pale-on-pale.
export const STAGE = {
  idea:      { label: 'Idea',      bg: '#eae4de', fg: '#3d3743' },
  scripted:  { label: 'Scripted',  bg: '#efe1f7', fg: '#5f2a7e' },
  shot:      { label: 'Shot',      bg: '#dceefa', fg: '#0b4f6c' },
  editing:   { label: 'Editing',   bg: '#f7ebd8', fg: '#7a4c07' },
  scheduled: { label: 'Scheduled', bg: '#141014', fg: '#f7f3ef' },
  published: { label: 'Live',      bg: '#dcf2e5', fg: '#0d5136' },
} as const;

export const STAT = {
  ready:  { tint: 'rgba(196,240,214,.55)', ink: '#0d5136' },
  behind: { tint: 'rgba(255,205,190,.55)', ink: '#8a2b12' },
  queued: { tint: 'rgba(145,224,255,.50)', ink: '#0b4f6c' },
} as const;

export const RADIUS = {
  card: 14,
  panel: 20,
  chipPill: 99,
  control: 13,
} as const;

// Motion. Everything is transform/opacity only.
export const MOTION = {
  ease: 'cubic-bezier(.2,.8,.2,1)',
  cardHover: 'transform .30s cubic-bezier(.2,.8,.2,1), box-shadow .30s ease',
  tilt: 'translateY(-7px) rotateX(7deg) rotateY(-5deg) scale(1.04)',
  liftSmall: 'translateY(-4px)',
  staggerMs: 45,
} as const;
