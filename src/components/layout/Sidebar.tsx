'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, Kanban, Briefcase, Lightbulb, ImagePlay, Settings, Menu, X } from 'lucide-react'
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

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navContent = (
    <div className="flex flex-col h-full bg-[#0f0f0f] text-white">
      {/* Brand */}
      <div className="flex items-center justify-between px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-[#0f0f0f] text-xs font-bold font-serif tracking-tight">MJ</span>
          </div>
          <div>
            <p className="font-bold text-sm leading-tight text-white">Mustache Journey</p>
            <p className="text-xs text-zinc-500 font-medium">Social Calendar</p>
          </div>
        </div>
        <button className="md:hidden text-zinc-500 hover:text-white" onClick={() => setMobileOpen(false)}>
          <X size={18} />
        </button>
      </div>

      {/* Platform quick-links */}
      <div className="px-4 pb-4">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2.5 px-1">Platforms</p>
        <div className="flex items-center gap-2">
          {PLATFORMS.map(({ platform, label, href }) => (
            <Link
              key={platform}
              href={href}
              onClick={() => setMobileOpen(false)}
              title={label}
              className="hover:scale-110 transition-transform"
            >
              <PlatformIcon platform={platform} size={30} />
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-4 border-t border-white/8 mb-3" />

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2 px-2 pt-1">Navigate</p>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                active
                  ? 'bg-white text-[#0f0f0f] shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/8'
              )}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Settings */}
      <div className="px-3 py-4 border-t border-white/8">
        <Link
          href="/settings"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
            pathname.startsWith('/settings')
              ? 'bg-white text-[#0f0f0f] shadow-sm'
              : 'text-zinc-400 hover:text-white hover:bg-white/8'
          )}
        >
          <Settings size={16} strokeWidth={pathname.startsWith('/settings') ? 2.5 : 2} />
          Settings
        </Link>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0 bg-[#0f0f0f]">
        {navContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 bg-[#0f0f0f] border-b border-white/10">
        <button onClick={() => setMobileOpen(true)} className="text-zinc-400 hover:text-white">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
            <span className="text-[#0f0f0f] text-xs font-bold font-serif">MJ</span>
          </div>
          <span className="font-bold text-sm text-white">Mustache Journey</span>
        </div>
        <div className="w-8" />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside
            className="relative flex flex-col w-72 max-w-[85vw] h-full shadow-2xl bg-[#0f0f0f]"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}
