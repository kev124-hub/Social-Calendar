import { Sidebar } from '@/components/layout/Sidebar'

export const dynamic = 'force-dynamic'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {/* pt-14 on mobile offsets the fixed top bar; md:pt-0 removes it on desktop */}
      <main className="flex-1 overflow-y-auto bg-background pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
