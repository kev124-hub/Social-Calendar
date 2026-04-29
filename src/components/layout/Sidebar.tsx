'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Calendar,
  Kanban,
  Briefcase,
  Lightbulb,
  ImagePlay,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/pipeline', label: 'Content Pipeline', icon: Kanban },
  { href: '/ugc', label: 'UGC Tracker', icon: Briefcase },
  { href: '/ideas', label: 'Ideas', icon: Lightbulb },
  { href: '/inspiration', label: 'Inspiration', icon: ImagePlay },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col w-60 shrink-0 border-r border-border bg-background h-screen sticky top-0">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <span className="text-primary-foreground text-xs font-bold">MJ</span>
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">Mustache Journey</p>
          <p className="text-xs text-muted-foreground">Social Calendar</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
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
    </aside>
  )
}
