'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Calendar, Kanban, Briefcase, Lightbulb, ImagePlay,
  Settings, Menu, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { PlatformIcon } from '@/components/ui/PlatformIcon'
import { cn } from '@/lib/utils'
import type { Platform } from '@/types/database'

const NAV_ITEMS = [
  { href: '/calendar',    label: 'Calendar',         icon: Calendar },
  { href: '/pipeline',    label: 'Content Pipeline', icon: Kanban },
  { href: '/ugc',         label: 'UGC Tracker',      icon: Briefcase },
  { href: '/ideas',       label: 'Ideas',            icon: Lightbulb },
  { href: '/inspiration', label: 'Inspiration',      icon: ImagePlay },
]

const PLATFORMS: { platform: Platform; label: string; href: string }[] = [
  { platform: 'instagram', label: 'Instagram', href: '/pipeline?platform=instagram' },
  { platform: 'tiktok',    label: 'TikTok',    href: '/pipeline?platform=tiktok' },
  { platform: 'linkedin',  label: 'LinkedIn',  href: '/pipeline?platform=linkedin' },
]

function navLinkClass(active: boolean, collapsed: boolean) {
  return cn(
    'relative flex items-center rounded-[10px] transition-all duration-150',
    collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
    active
      ? 'bg-[#f1ccff] text-black font-semibold'
      : 'text-[#333] hover:text-black hover:bg-[#f1ccff]/20',
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  function toggleCollapse() {
    setCollapsed(c => {
      localStorage.setItem('sidebar-collapsed', String(!c))
      return !c
    })
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
              className={navLinkClass(active, col)}
            >
              <Icon size={19} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
              {!col && <span className="text-[15px] font-medium leading-none">{label}</span>}
            </Link>
          )
        })}
      </>
    )
  }

  function SettingsLink({ col }: { col: boolean }) {
    const active = pathname.startsWith('/settings')
    return (
      <Link
        href="/settings"
        onClick={() => setMobileOpen(false)}
        title={col ? 'Settings' : undefined}
        className={navLinkClass(active, col)}
      >
        <Settings size={19} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
        {!col && <span className="text-[15px] font-medium leading-none">Settings</span>}
      </Link>
    )
  }

  const desktopContent = (
    <div className="relative flex flex-col h-full bg-white">
      {/* Brand */}
      <div className={cn(
        'flex items-center pt-5 pb-4',
        collapsed ? 'justify-center px-2' : 'justify-between px-4',
      )}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-white text-xs font-bold font-serif tracking-tight">MJ</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight text-black tracking-tight truncate">Mustache Journey</p>
              <p className="text-[13px] text-[#7b7b7b] mt-0.5">Social Calendar</p>
            </div>
          )}
        </div>
      </div>

      {/* Platforms */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <p className="text-[11px] font-semibold text-[#bcbcbc] uppercase tracking-widest mb-2.5 px-1">Platforms</p>
          <div className="flex items-center gap-2">
            {PLATFORMS.map(({ platform, label, href }) => (
              <Link key={platform} href={href} title={label} className="hover:scale-110 transition-transform">
                <PlatformIcon platform={platform} size={30} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {!collapsed && <div className="mx-4 border-t border-[#d6d6d6] mb-2" />}

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto pt-1">
        {!collapsed && (
          <p className="text-[11px] font-semibold text-[#bcbcbc] uppercase tracking-widest mb-2 px-2">Navigate</p>
        )}
        {collapsed && <div className="h-2" />}
        <NavItems col={collapsed} />
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-[#d6d6d6] space-y-0.5">
        <SettingsLink col={collapsed} />
        <button
          onClick={toggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex w-full items-center rounded-[10px] transition-all duration-150',
            'text-[#bcbcbc] hover:text-black hover:bg-[#f1ccff]/20',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
          )}
        >
          {collapsed
            ? <ChevronRight size={17} />
            : (
              <>
                <ChevronLeft size={17} className="shrink-0" />
                <span className="text-[15px] font-medium leading-none">Collapse</span>
              </>
            )
          }
        </button>
      </div>
    </div>
  )

  const mobileContent = (
    <div className="relative flex flex-col h-full bg-white">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-white text-xs font-bold font-serif tracking-tight">MJ</span>
          </div>
          <div>
            <p className="text-[15px] font-semibold leading-tight text-black tracking-tight">Mustache Journey</p>
            <p className="text-[13px] text-[#7b7b7b] mt-0.5">Social Calendar</p>
          </div>
        </div>
        <button className="text-[#bcbcbc] hover:text-black transition-colors" onClick={() => setMobileOpen(false)}>
          <X size={18} />
        </button>
      </div>

      {/* Platforms */}
      <div className="px-4 pb-4">
        <p className="text-[11px] font-semibold text-[#bcbcbc] uppercase tracking-widest mb-2.5 px-1">Platforms</p>
        <div className="flex items-center gap-2">
          {PLATFORMS.map(({ platform, label, href }) => (
            <Link key={platform} href={href} onClick={() => setMobileOpen(false)} title={label} className="hover:scale-110 transition-transform">
              <PlatformIcon platform={platform} size={30} />
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-4 border-t border-[#d6d6d6] mb-2" />

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto pt-1">
        <p className="text-[11px] font-semibold text-[#bcbcbc] uppercase tracking-widest mb-2 px-2">Navigate</p>
        <NavItems col={false} />
      </nav>

      <div className="px-2 py-3 border-t border-[#d6d6d6]">
        <SettingsLink col={false} />
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden md:flex flex-col shrink-0 h-screen sticky top-0 overflow-hidden',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[3.75rem]' : 'w-64',
        'bg-white border-r border-[#d6d6d6]',
      )}>
        {desktopContent}
      </aside>

      {/* Mobile top bar */}
      <div className={cn(
        'md:hidden fixed top-0 left-0 right-0 z-40 h-14',
        'flex items-center justify-between px-4',
        'bg-white/90 backdrop-blur-xl',
        'border-b border-[#d6d6d6]',
      )}>
        <button onClick={() => setMobileOpen(true)} className="text-[#7b7b7b] hover:text-black transition-colors">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center">
            <span className="text-white text-xs font-bold font-serif">MJ</span>
          </div>
          <span className="text-[15px] font-semibold text-black">Mustache Journey</span>
        </div>
        <div className="w-8" />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <aside
            className="relative flex flex-col w-72 max-w-[85vw] h-full shadow-2xl overflow-hidden bg-white border-r border-[#d6d6d6]"
            onClick={e => e.stopPropagation()}
          >
            {mobileContent}
          </aside>
        </div>
      )}
    </>
  )
}
