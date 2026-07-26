import { Sidebar } from '@/components/layout/Sidebar'

export const dynamic = 'force-dynamic'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // The Riviera Glass wash lives on the app container, not on <body>, and sits
    // behind the sidebar as well as the main column — the sidebar becomes a
    // translucent frosted panel in Stage 2 and needs the gradient behind it.
    // h-dvh, not h-screen. On iOS Safari 100vh is the *large* viewport height —
    // it excludes the URL bar and bottom toolbar, so a 100vh shell is taller
    // than what you can actually see, and overflow-hidden makes the excess
    // unreachable: the bottom of every column (including "+ post") is cut off
    // with no way to scroll to it. 100dvh tracks the visible viewport instead.
    <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--glass-wash)' }}>
      <Sidebar />
      {/* Mobile offset for the fixed top bar (incl. top safe-area inset);
          md:pt-0 removes it on desktop. Side insets keep content clear of a
          landscape notch. */}
      <main className="flex-1 overflow-y-auto pt-[calc(3.5rem+env(safe-area-inset-top))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:pt-0 md:pl-0 md:pr-0">
        {children}
      </main>
    </div>
  )
}
