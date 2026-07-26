'use client'

// src/components/layout/Sidebar.tsx — Riviera Glass restyle.
//
// FUNCTIONALITY UNCHANGED: same NAV_ITEMS / PLATFORMS, same collapse toggle
// persisted to localStorage('sidebar-collapsed'), same mobile top bar + drawer,
// same safe-area handling for standalone PWA.
//
// Presentation: frosted translucent surfaces over the app wash, near-black
// labels, platform rows as tinted chips, publish-health block at the bottom.
// Active nav item = solid white pill with an ink dot (no pale-on-pale).
//
// Two deliberate departures from the design bundle:
//  · No `/home` nav entry. The bundle adds one, but the route does not exist
//    and the dashboard home is out of scope — shipping it would 404.
//  · `counts` and `health` are accepted but nothing passes them. The real
//    Sidebar is rendered by a server layout with no props and no endpoint
//    reports either value, so the platform counts and the health block are
//    absent rather than filled with placeholder numbers.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Calendar, Kanban, Briefcase, Lightbulb, ImagePlay,
  Settings, Menu, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Platform } from '@/types/database'
import { GLASS, INK, PLATFORM } from '@/lib/glass'
import { PublishHealth, type PublishHealthData } from '@/components/ui/PublishHealth'

const NAV_ITEMS = [
  { href: '/calendar',    label: 'Calendar',         icon: Calendar },
  { href: '/pipeline',    label: 'Content Pipeline', icon: Kanban },
  { href: '/ugc',         label: 'UGC Tracker',      icon: Briefcase },
  { href: '/ideas',       label: 'Ideas',            icon: Lightbulb },
  { href: '/inspiration', label: 'Inspiration',      icon: ImagePlay },
]

// Platform includes 'any' — a filter value, not a brand — and glass.ts's
// PLATFORM map deliberately has no entry for it. The bundle's Sidebar typed
// this array as Platform and so failed to compile on PLATFORM[platform].
type RealPlatform = Exclude<Platform, 'any'>

const PLATFORMS: { platform: RealPlatform; label: string; href: string }[] = [
  { platform: 'instagram', label: 'Instagram', href: '/pipeline?platform=instagram' },
  { platform: 'tiktok',    label: 'TikTok',    href: '/pipeline?platform=tiktok' },
  { platform: 'linkedin',  label: 'LinkedIn',  href: '/pipeline?platform=linkedin' },
]

const railStyle = (active: boolean) => ({
  background: active ? 'rgba(255,255,255,.86)' : 'rgba(255,255,255,.28)',
  border: `1px solid ${GLASS.hairline}`,
  color: active ? INK.primary : 'rgba(27,20,31,.68)',
  fontWeight: active ? 600 : 500,
})

export function Sidebar({ counts, health }: { counts?: Partial<Record<RealPlatform, number>>; health?: PublishHealthData }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  function toggleCollapse() {
    setCollapsed((c) => {
      localStorage.setItem('sidebar-collapsed', String(!c))
      return !c
    })
  }

  function Brand({ col }: { col: boolean }) {
    return (
      <div className={cn('flex items-center gap-[11px] px-1 pb-4 pt-1', col && 'justify-center')}>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
          style={{
            background: 'linear-gradient(150deg,#f1ccff,#91e0ff)',
            border: '1px solid rgba(255,255,255,.8)',
            boxShadow: '0 8px 18px rgba(123,47,158,.18)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-playfair)', fontSize: 14, fontWeight: 600, color: INK.primary }}>MJ</span>
        </div>
        {!col && (
          <div className="min-w-0">
            <p className="m-0 truncate text-[14px] font-semibold" style={{ color: INK.primary }}>Mustache Journey</p>
            <p className="m-0 mt-[2px] text-[12px]" style={{ color: INK.tertiary }}>Social Calendar</p>
          </div>
        )}
      </div>
    )
  }

  function NavItems({ col }: { col: boolean }) {
    return (
      <>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              title={col ? label : undefined}
              className={cn(
                'flex items-center rounded-[11px] transition-transform hover:translate-x-[3px]',
                col ? 'justify-center p-[9px]' : 'gap-[11px] px-[10px] py-[9px]',
              )}
              style={railStyle(active)}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
              {!col && <span className="text-[14px] leading-none">{label}</span>}
            </Link>
          )
        })}
      </>
    )
  }

  function Platforms() {
    return (
      <div className="flex flex-col gap-[9px]">
        <p className="m-0 px-1 tracking-[.16em]" style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, color: '#7a7280' }}>
          PLATFORMS
        </p>
        {PLATFORMS.map(({ platform, label, href }) => (
          <Link
            key={platform}
            href={href}
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-[10px] rounded-[11px] px-[9px] py-2 transition-transform hover:translate-x-[4px]"
            style={{ background: 'rgba(255,255,255,.62)', border: `1px solid ${GLASS.hairline}` }}
          >
            <span
              className="h-[10px] w-[10px] shrink-0 rounded-[3px]"
              style={{ background: PLATFORM[platform].fill, boxShadow: '0 0 0 1px rgba(20,16,20,.12)' }}
            />
            <span className="flex-1 text-[13px] font-medium" style={{ color: INK.strong }}>{label}</span>
            {typeof counts?.[platform] === 'number' && (
              <span style={{ fontFamily: 'var(--font-mono-num)', fontSize: 12, fontWeight: 600, color: INK.tertiary }}>
                {counts[platform]}
              </span>
            )}
          </Link>
        ))}
      </div>
    )
  }

  // Publish health lives in its own component and must degrade gracefully.
  // Pass whatever the status read returned; nulls render as "unknown", never
  // as a placeholder number. See src/components/ui/PublishHealth.tsx.

  // `withCollapse` is false for the mobile drawer. The bundle renders one panel
  // for both surfaces, which put the collapse toggle in the drawer — a control
  // the current app doesn't have there and that would silently change the
  // desktop sidebar's width from a screen where it isn't visible.
  const panel = (col: boolean, withCollapse = true) => (
    <div
      className="flex h-full flex-col gap-[22px] px-3 py-[18px]"
      style={{ background: GLASS.panelSoft, backdropFilter: 'blur(18px)', borderRight: `1px solid ${GLASS.hairline}` }}
    >
      <Brand col={col} />
      {!col && <Platforms />}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {!col && (
          <p className="m-0 mb-[6px] px-1 tracking-[.16em]" style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, color: '#7a7280' }}>
            NAVIGATE
          </p>
        )}
        <NavItems col={col} />
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        {health && <PublishHealth data={health} collapsed={col} />}
        <Link
          href="/settings"
          onClick={() => setMobileOpen(false)}
          title={col ? 'Settings' : undefined}
          className={cn('flex items-center rounded-[11px]', col ? 'justify-center p-[9px]' : 'gap-[11px] px-[10px] py-[9px]')}
          style={railStyle(pathname.startsWith('/settings'))}
        >
          <Settings size={18} className="shrink-0" />
          {!col && <span className="text-[14px] leading-none">Settings</span>}
        </Link>
        {withCollapse && (
          <button
            onClick={toggleCollapse}
            title={col ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn('flex items-center rounded-[11px]', col ? 'justify-center p-[9px]' : 'gap-[11px] px-[10px] py-[9px]')}
            style={{ background: 'rgba(255,255,255,.28)', border: `1px solid ${GLASS.hairline}`, color: INK.tertiary }}
          >
            {col ? <ChevronRight size={17} /> : <><ChevronLeft size={17} className="shrink-0" /><span className="text-[14px] leading-none">Collapse</span></>}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <aside
        className={cn(
          // h-dvh for the same reason as the app shell in (app)/layout.tsx:
          // 100vh overshoots the visible viewport in mobile browsers.
          'sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden md:flex',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-[3.75rem]' : 'w-64',
        )}
      >
        {panel(collapsed)}
      </aside>

      {/* Mobile top bar — grows by the top safe-area inset so its content
          clears the notch in standalone (installed PWA) mode */}
      <div
        className={cn(
          'fixed left-0 right-0 top-0 z-40 md:hidden',
          'h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]',
          'flex items-center justify-between px-4',
        )}
        style={{ background: 'rgba(255,255,255,.72)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${GLASS.hairline}` }}
      >
        <button onClick={() => setMobileOpen(true)} style={{ color: INK.secondary }}><Menu size={20} /></button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'linear-gradient(150deg,#f1ccff,#91e0ff)' }}>
            <span style={{ fontFamily: 'var(--font-playfair)', fontSize: 12, fontWeight: 600, color: INK.primary }}>MJ</span>
          </div>
          <span className="text-[15px] font-semibold" style={{ color: INK.primary }}>Mustache Journey</span>
        </div>
        <div className="w-8" />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(20,16,20,.28)', backdropFilter: 'blur(4px)' }} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 z-10" style={{ color: INK.tertiary }} onClick={() => setMobileOpen(false)}>
              <X size={18} />
            </button>
            {panel(false, false)}
          </aside>
        </div>
      )}
    </>
  )
}
