import type { Platform } from '@/types/database'

const configs: Record<Platform, { bg: string; fg: string; symbol: string; gradient?: string }> = {
  instagram: {
    bg: 'transparent',
    fg: '#fff',
    symbol: '',
    gradient: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
  },
  tiktok: { bg: '#010101', fg: '#fff', symbol: '♪' },
  linkedin: { bg: '#0A66C2', fg: '#fff', symbol: 'in' },
  any: { bg: '#6366f1', fg: '#fff', symbol: '✦' },
}

export function PlatformIcon({
  platform,
  size = 18,
}: {
  platform: Platform
  size?: number
}) {
  const cfg = configs[platform]
  const r = Math.round(size * 0.28)
  const fontSize = platform === 'linkedin' ? Math.round(size * 0.45) : Math.round(size * 0.55)

  if (platform === 'instagram') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: r,
          background: cfg.gradient,
          flexShrink: 0,
        }}
      >
        {/* Camera lens */}
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
          <rect x="2" y="2" width="20" height="20" rx="6" stroke="white" strokeWidth="2.5"/>
          <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="2.5"/>
          <circle cx="18" cy="6" r="1.5" fill="white"/>
        </svg>
      </span>
    )
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: r,
        background: cfg.bg,
        color: cfg.fg,
        fontSize,
        fontWeight: 700,
        fontFamily: platform === 'linkedin' ? 'Arial, sans-serif' : 'inherit',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {cfg.symbol}
    </span>
  )
}

export const PLATFORM_COLORS: Record<Platform, string> = {
  instagram: '#e1306c',
  tiktok: '#010101',
  linkedin: '#0A66C2',
  any: '#6366f1',
}
