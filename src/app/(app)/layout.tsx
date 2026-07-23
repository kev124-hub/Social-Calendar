import { Sidebar } from '@/components/layout/Sidebar'

export const dynamic = 'force-dynamic'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {/* Mobile offset for the fixed top bar (incl. top safe-area inset);
          md:pt-0 removes it on desktop. Side insets keep content clear of a
          landscape notch. */}
      <main className="flex-1 overflow-y-auto bg-background pt-[calc(3.5rem+env(safe-area-inset-top))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:pt-0 md:pl-0 md:pr-0">
        {children}
      </main>
    </div>
  )
}
