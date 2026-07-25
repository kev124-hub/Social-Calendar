'use client'

// src/components/calendar/WeeklyBoard.tsx — Riviera Glass rewrite.
//
// FUNCTIONALITY IS UNCHANGED from the current file: same dnd-kit setup, same
// colOrder sync effect, same handleDragEnd semantics (same-column reorder is
// local, cross-column calls onMovePost / onMoveIdea), same mobile scroll-snap
// and press-and-hold touch sensor, same scrollIntoView on today's column.
//
// What changed is presentation:
//   · weekday columns tinted blue, weekend columns yellow (dayTint)
//   · 30px Playfair day numbers (the old 13px labels were the readability gripe)
//   · media-forward glass cards with a 3D tilt on hover
//   · >2 cards collapse into a stacked deck that fans out on click
//   · cards stagger in on mount (45ms apart)

import { useState, useEffect, useRef } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable, closestCorners, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { addDays, format, isSameDay, isToday, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import type { SocialPost, Idea } from '@/types/database'
import { GLASS, INK, MOTION, PLATFORM, STAGE, dayTint, TODAY_BORDER } from '@/lib/glass'
import { IdeaCard } from './IdeaCard'

interface Props {
  weekStart: Date
  posts: SocialPost[]
  ideas: Idea[]
  onAddPost: (date: Date) => void
  onPostClick: (post: SocialPost) => void
  onMovePost: (postId: string, newDate: Date) => Promise<void>
  onMoveIdea: (ideaId: string, newDate: Date) => Promise<void>
}

const toPostId = (id: string) => `post-${id}`
const toIdeaId = (id: string) => `idea-${id}`
function parseItemId(id: string): { type: 'post' | 'idea'; rawId: string } | null {
  if (id.startsWith('post-')) return { type: 'post', rawId: id.slice(5) }
  if (id.startsWith('idea-')) return { type: 'idea', rawId: id.slice(5) }
  return null
}

/* ─────────────── Glass post card ─────────────── */
export function GlassPostCard({
  post, onClick, index = 0, dragging = false,
}: {
  post: SocialPost
  onClick: () => void
  index?: number
  dragging?: boolean
}) {
  const pf = PLATFORM[post.platform as keyof typeof PLATFORM] ?? PLATFORM.instagram
  const stage = STAGE[post.stage as keyof typeof STAGE] ?? STAGE.idea

  return (
    <div style={{ animation: `glass-fade-up .55s ${MOTION.ease} both`, animationDelay: `${index * MOTION.staggerMs}ms` }}>
      <button
        onClick={onClick}
        className="group w-full overflow-hidden text-left"
        style={{
          borderRadius: 14,
          background: GLASS.card,
          border: `1px solid ${GLASS.hairline}`,
          boxShadow: dragging ? GLASS.shadowCardHover : GLASS.shadowCard,
          transformStyle: 'preserve-3d',
          transition: MOTION.cardHover,
          transform: dragging ? 'rotate(2deg) scale(1.03)' : undefined,
        }}
        onMouseEnter={(e) => {
          if (dragging) return
          e.currentTarget.style.transform = MOTION.tilt
          e.currentTarget.style.boxShadow = GLASS.shadowCardHover
          e.currentTarget.style.background = GLASS.cardHover
        }}
        onMouseLeave={(e) => {
          if (dragging) return
          e.currentTarget.style.transform = ''
          e.currentTarget.style.boxShadow = GLASS.shadowCard
          e.currentTarget.style.background = GLASS.card
        }}
      >
        {/* Media first — 58px strip, striped placeholder when there is none */}
        <div className={cn('relative h-[58px]', !post.media_url && 'glass-thumb-placeholder')}>
          {post.media_url && <img src={post.media_url} alt="" className="h-full w-full object-cover" />}
          {!post.media_url && (
            <span
              className="absolute bottom-[6px] left-[7px] tracking-[.06em]"
              style={{ fontFamily: 'var(--font-mono-num)', fontSize: 9, color: INK.tertiary }}
            >
              {(post.post_type ?? 'POST').toUpperCase()}
            </span>
          )}
          <span
            className="absolute right-[6px] top-[6px] h-2 w-2 rounded-full"
            style={{ background: pf.fill, boxShadow: '0 0 0 1.5px rgba(255,255,255,.9)' }}
          />
        </div>

        <div className="flex flex-col gap-[6px] px-[9px] pb-[9px] pt-2">
          <p
            className="m-0 font-semibold leading-[1.35]"
            style={{ fontSize: 12.5, color: INK.primary, overflowWrap: 'anywhere', textWrap: 'pretty' }}
          >
            {post.title ?? `${post.platform} ${post.post_type ?? ''}`}
          </p>
          {/* flex-wrap + shrink-0 so "Scheduled" never clips in a narrow column */}
          <div className="flex flex-wrap items-center gap-[5px]">
            {post.scheduled_at && (
              <span style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, fontWeight: 500, color: INK.tertiary }}>
                {format(parseISO(post.scheduled_at), 'HH:mm')}
              </span>
            )}
            <span
              className="ml-auto shrink-0 whitespace-nowrap rounded-full px-[7px] py-[2px] text-[10px] font-semibold"
              style={{ background: stage.bg, color: stage.fg }}
            >
              {stage.label}
            </span>
          </div>
        </div>
      </button>
    </div>
  )
}

/* ─────────────── dnd wrappers (unchanged behaviour) ─────────────── */
function DroppableColumn({
  dateKey, children, className,
}: { dateKey: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dateKey}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(className, 'rounded-[12px] transition-shadow')}
      style={isOver ? { boxShadow: 'inset 0 0 0 2px rgba(20,16,20,.45)', background: 'rgba(255,255,255,.28)' } : undefined}
    >
      {children}
    </div>
  )
}

function SortablePostCard({ post, onClick, index }: { post: SocialPost; onClick: () => void; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: toPostId(post.id) })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
    >
      <GlassPostCard post={post} onClick={onClick} index={index} />
    </div>
  )
}

function SortableIdeaCard({ idea }: { idea: Idea }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: toIdeaId(idea.id) })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
    >
      <IdeaCard idea={idea} />
    </div>
  )
}

/* ─────────────── Board ─────────────── */
export function WeeklyBoard({
  weekStart, posts, ideas, onAddPost, onPostClick, onMovePost, onMoveIdea,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null) // dateKey of the fanned-out deck

  const todayColRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 640) return
    todayColRef.current?.scrollIntoView({ inline: 'start', block: 'nearest' })
  }, [weekStart])

  const [colOrder, setColOrder] = useState<Record<string, string[]>>({})
  useEffect(() => {
    setColOrder((prev) => {
      const next: Record<string, string[]> = {}
      for (const day of Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))) {
        const key = format(day, 'yyyy-MM-dd')
        const dayPostIds = posts
          .filter((p) => p.scheduled_at && isSameDay(parseISO(p.scheduled_at), day))
          .map((p) => toPostId(p.id))
        const dayIdeaIds = ideas
          .filter((i) => i.date_start && isSameDay(parseISO(i.date_start), day))
          .map((i) => toIdeaId(i.id))
        const allNew = [...dayPostIds, ...dayIdeaIds]
        const allNewSet = new Set(allNew)
        const kept = (prev[key] ?? []).filter((id) => allNewSet.has(id))
        const keptSet = new Set(kept)
        next[key] = [...kept, ...allNew.filter((id) => !keptSet.has(id))]
      }
      return next
    })
  }, [posts, ideas, weekStart])

  function findItemColumn(itemId: string): string | null {
    for (const [dateKey, items] of Object.entries(colOrder)) if (items.includes(itemId)) return dateKey
    return null
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function handleDragStart({ active }: DragStartEvent) { setActiveId(active.id as string) }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const activeItemId = active.id as string
    const overId = over.id as string
    const activeDateKey = findItemColumn(activeItemId)
    if (!activeDateKey) return

    const overDateKey = overId.startsWith('day-') ? overId.slice(4) : findItemColumn(overId)
    if (!overDateKey) return

    if (activeDateKey === overDateKey) {
      const items = colOrder[activeDateKey] ?? []
      const oldIndex = items.indexOf(activeItemId)
      const newIndex = items.indexOf(overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
      setColOrder((prev) => ({ ...prev, [activeDateKey]: arrayMove(items, oldIndex, newIndex) }))
    } else {
      const parsed = parseItemId(activeItemId)
      if (!parsed) return
      const newDate = parseISO(overDateKey)
      setColOrder((prev) => ({
        ...prev,
        [activeDateKey]: (prev[activeDateKey] ?? []).filter((id) => id !== activeItemId),
        [overDateKey]: [...(prev[overDateKey] ?? []), activeItemId],
      }))
      if (parsed.type === 'post') await onMovePost(parsed.rawId, newDate)
      else await onMoveIdea(parsed.rawId, newDate)
    }
  }

  const activePost = activeId?.startsWith('post-') ? posts.find((p) => p.id === activeId.slice(5)) ?? null : null
  const activeIdea = activeId?.startsWith('idea-') ? ideas.find((i) => i.id === activeId.slice(5)) ?? null : null

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden p-[14px] sm:overflow-hidden"
        style={{ background: GLASS.wash, perspective: 1400 }}
      >
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const dayPosts = posts.filter((p) => p.scheduled_at && isSameDay(parseISO(p.scheduled_at), day))
          const dayIdeas = ideas.filter((i) => i.date_start && isSameDay(parseISO(i.date_start), day))
          const todayCol = isToday(day)
          const tint = dayTint(day.getDay())
          const readyCount = dayPosts.filter((p) => p.stage === 'scheduled' || p.stage === 'published').length
          const colItems = colOrder[dateKey] ?? []
          const postMap = new Map(dayPosts.map((p) => [toPostId(p.id), p]))
          const ideaMap = new Map(dayIdeas.map((i) => [toIdeaId(i.id), i]))

          const isOpen = expanded === dateKey
          const visible = isOpen ? colItems : colItems.slice(0, 2)
          const hidden = colItems.length - visible.length

          return (
            <div
              key={day.toISOString()}
              ref={todayCol ? todayColRef : undefined}
              className="mx-[5px] flex min-w-[44vw] shrink-0 snap-start flex-col gap-[9px] px-[9px] pb-[13px] pt-[11px] sm:min-w-0 sm:flex-1 sm:shrink"
              style={{
                minWidth: 0,
                borderRadius: 18,
                backdropFilter: 'blur(12px)',
                background: tint.bg,
                border: `1px solid ${todayCol ? TODAY_BORDER : tint.border}`,
              }}
            >
              {/* Header — big readable date */}
              <div className="flex items-baseline gap-[7px]">
                <span style={{ fontFamily: 'var(--font-playfair)', fontSize: 30, fontWeight: 600, lineHeight: 1, color: INK.primary }}>
                  {format(day, 'd')}
                </span>
                <span
                  className="tracking-[.14em]"
                  style={{ fontFamily: 'var(--font-mono-num)', fontSize: 11, fontWeight: 500, color: todayCol ? INK.primary : 'rgba(21,15,25,.70)' }}
                >
                  {format(day, 'EEE').toUpperCase()}
                </span>
                {dayPosts.length > 0 && (
                  <span
                    className="ml-auto rounded-full px-[6px] py-[2px]"
                    style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, fontWeight: 700, color: INK.primary, background: 'rgba(255,255,255,.82)' }}
                  >
                    {dayPosts.length}
                  </span>
                )}
              </div>

              {/* Ready progress */}
              {dayPosts.length > 0 && (
                <div>
                  <div className="h-[4px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.75)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(readyCount / dayPosts.length) * 100}%`,
                        background: INK.primary,
                        transition: `width .9s ${MOTION.ease}`,
                      }}
                    />
                  </div>
                  <p className="m-0 mt-[5px]" style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, fontWeight: 500, color: '#4a4450' }}>
                    {readyCount}/{dayPosts.length} ready
                  </p>
                </div>
              )}

              <SortableContext items={colItems} strategy={verticalListSortingStrategy}>
                <DroppableColumn dateKey={dateKey} className="min-h-0 flex-1 space-y-[9px] overflow-y-auto">
                  {visible.map((id, i) => {
                    const post = postMap.get(id)
                    if (post) return <SortablePostCard key={id} post={post} index={i} onClick={() => onPostClick(post)} />
                    const idea = ideaMap.get(id)
                    return idea ? <SortableIdeaCard key={id} idea={idea} /> : null
                  })}
                </DroppableColumn>
              </SortableContext>

              {/* Stacked deck — fans the column open */}
              {(hidden > 0 || isOpen) && (
                <button
                  onClick={() => setExpanded(isOpen ? null : dateKey)}
                  className="relative h-[40px] w-full"
                  type="button"
                >
                  <span className="absolute inset-x-[6px] top-[8px] bottom-0 rounded-[12px]" style={{ background: 'rgba(255,255,255,.50)', border: '1px solid rgba(255,255,255,.70)' }} />
                  <span className="absolute inset-x-[3px] inset-y-[4px] rounded-[12px]" style={{ background: 'rgba(255,255,255,.68)', border: '1px solid rgba(255,255,255,.80)' }} />
                  <span
                    className="absolute inset-x-0 bottom-[8px] top-0 flex items-center justify-center rounded-[12px] transition-transform hover:-translate-y-[4px]"
                    style={{ background: 'rgba(255,255,255,.94)', border: '1px solid rgba(20,16,20,.35)' }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono-num)', fontSize: 11, fontWeight: 600, color: INK.primary }}>
                      {hidden > 0 ? `+ ${hidden} more` : 'collapse'}
                    </span>
                  </span>
                </button>
              )}

              <button
                onClick={() => onAddPost(day)}
                type="button"
                className="mt-[2px] rounded-[11px] py-[6px] text-[11px] font-medium transition-colors"
                style={{ border: '1px dashed rgba(27,20,31,.32)', color: '#4a4450' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.70)'; e.currentTarget.style.borderColor = INK.primary }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = 'rgba(27,20,31,.32)' }}
              >
                + post
              </button>
            </div>
          )
        })}
      </div>

      {/* Pickup feel: lifted, rotated, shadowed ghost */}
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {activePost && <div className="w-40"><GlassPostCard post={activePost} onClick={() => {}} dragging /></div>}
        {activeIdea && <div className="w-40 rotate-2 opacity-95 shadow-xl"><IdeaCard idea={activeIdea} /></div>}
      </DragOverlay>
    </DndContext>
  )
}
