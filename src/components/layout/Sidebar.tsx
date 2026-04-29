'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Calendar,
  Kanban,
  Briefcase,
  Lightbulb,
  ImagePlay,
  Settings,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/calendar',    label: 'Calendar',         icon: Calendar },
  { href: '/pipeline',    label: 'Content Pipeline', icon: Kanban },
  { href: '/ugc',         label: 'UGC Tracker',      icon: Briefcase },
  { href: '/ideas',       label: 'Ideas',            icon: Lightbulb },
  { href: '/inspiration', label: 'Inspiration',      icon: ImagePlay },
]

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navContent = (
    <>
      {/* Brand */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground text-xs font-bold">MJ</span>
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">Mustache Journey</p>
            <p className="text-xs text-muted-foreground">Social Calendar</p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          className="md:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(false)}
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Settings */}
      <div className="px-3 py-4 border-t border-border">
        <Link
          href="/settings"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <Settings size={16} />
          Settings
        </Link>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-background h-screen sticky top-0">
        {navContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 bg-background border-b border-border">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-bold">MJ</span>
          </div>
          <span className="font-semibold text-sm">Mustache Journey</span>
        </div>
        <div className="w-8" /> {/* spacer */}
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex"
          onClick={() => setMobileOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />
          {/* Drawer */}
          <aside
            className="relative flex flex-col w-72 max-w-[85vw] bg-background h-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}
