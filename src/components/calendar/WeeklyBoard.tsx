'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { addDays, format, isSameDay, isToday, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SocialPost, Idea } from '@/types/database'
import { PostCard } from './PostCard'
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

// ─────────────────────────────────────────────
// ID helpers
// ─────────────────────────────────────────────
const toPostId = (id: string) => `post-${id}`
const toIdeaId = (id: string) => `idea-${id}`

function parseItemId(id: string): { type: 'post' | 'idea'; rawId: string } | null {
  if (id.startsWith('post-')) return { type: 'post', rawId: id.slice(5) }
  if (id.startsWith('idea-')) return { type: 'idea', rawId: id.slice(5) }
  return null
}

// ─────────────────────────────────────────────
// DroppableColumn — makes empty columns droppable
// ─────────────────────────────────────────────
function DroppableColumn({
  dateKey,
  children,
  className,
}: {
  dateKey: string
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dateKey}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isOver && 'ring-2 ring-inset ring-blue-200 rounded-md bg-blue-50/20'
      )}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────
// SortablePostCard
// ─────────────────────────────────────────────
function SortablePostCard({ post, onClick }: { post: SocialPost; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: toPostId(post.id) })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      <PostCard post={post} onClick={onClick} />
    </div>
  )
}

// ─────────────────────────────────────────────
// SortableIdeaCard
// ─────────────────────────────────────────────
function SortableIdeaCard({ idea }: { idea: Idea }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: toIdeaId(idea.id) })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      <IdeaCard idea={idea} />
    </div>
  )
}

// ─────────────────────────────────────────────
// WeeklyBoard
// ─────────────────────────────────────────────
export function WeeklyBoard({
  weekStart,
  posts,
  ideas,
  onAddPost,
  onPostClick,
  onMovePost,
  onMoveIdea,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const [activeId, setActiveId] = useState<string | null>(null)

  // Ordered item IDs per column date key
  const [colOrder, setColOrder] = useState<Record<string, string[]>>({})

  // Sync colOrder with props — preserve existing order, add new, remove deleted
  useEffect(() => {
    setColOrder((prev) => {
      const next: Record<string, string[]> = {}
      const allDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      for (const day of allDays) {
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
        const added = allNew.filter((id) => !keptSet.has(id))
        next[key] = [...kept, ...added]
      }
      return next
    })
  }, [posts, ideas, weekStart])

  function findItemColumn(itemId: string): string | null {
    for (const [dateKey, items] of Object.entries(colOrder)) {
      if (items.includes(itemId)) return dateKey
    }
    return null
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return

    const activeItemId = active.id as string
    const overId = over.id as string
    const activeDateKey = findItemColumn(activeItemId)
    if (!activeDateKey) return

    // Determine target column: over a column drop zone or over another card
    let overDateKey: string | null = null
    if (overId.startsWith('day-')) {
      overDateKey = overId.slice(4)
    } else {
      overDateKey = findItemColumn(overId)
    }
    if (!overDateKey) return

    if (activeDateKey === overDateKey) {
      // Same column — reorder in local state only
      const items = colOrder[activeDateKey] ?? []
      const oldIndex = items.indexOf(activeItemId)
      const newIndex = items.indexOf(overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
      setColOrder((prev) => ({
        ...prev,
        [activeDateKey]: arrayMove(items, oldIndex, newIndex),
      }))
    } else {
      // Cross-column — move to new day
      const parsed = parseItemId(activeItemId)
      if (!parsed) return
      const newDate = parseISO(overDateKey)

      // Optimistic local update
      setColOrder((prev) => ({
        ...prev,
        [activeDateKey]: (prev[activeDateKey] ?? []).filter((id) => id !== activeItemId),
        [overDateKey]: [...(prev[overDateKey] ?? []), activeItemId],
      }))

      if (parsed.type === 'post') {
        await onMovePost(parsed.rawId, newDate)
      } else {
        await onMoveIdea(parsed.rawId, newDate)
      }
    }
  }

  const activePost = activeId?.startsWith('post-')
    ? posts.find((p) => p.id === activeId.slice(5)) ?? null
    : null
  const activeIdea = activeId?.startsWith('idea-')
    ? ideas.find((i) => i.id === activeId.slice(5)) ?? null
    : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex overflow-hidden bg-gray-50/50">
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const dayPosts = posts.filter(
            (p) => p.scheduled_at && isSameDay(parseISO(p.scheduled_at), day)
          )
          const dayIdeas = ideas.filter(
            (i) => i.date_start && isSameDay(parseISO(i.date_start), day)
          )
          const todayCol = isToday(day)
          const readyCount = dayPosts.filter(
            (p) => p.stage === 'scheduled' || p.stage === 'published'
          ).length
          const colItems = colOrder[dateKey] ?? []
          const postMap = new Map(dayPosts.map((p) => [toPostId(p.id), p]))
          const ideaMap = new Map(dayIdeas.map((i) => [toIdeaId(i.id), i]))

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'flex flex-col min-w-0 flex-1',
                todayCol ? 'bg-white' : 'bg-transparent'
              )}
            >
              {/* Column header */}
              <div className="px-3 pt-4 pb-2 shrink-0">
                <p
                  className={cn(
                    'text-[13px] font-semibold leading-none',
                    todayCol ? 'text-blue-600' : 'text-gray-800'
                  )}
                >
                  {format(day, 'EEEE')}
                </p>
                <p
                  className={cn(
                    'text-[12px] mt-0.5 leading-none',
                    todayCol ? 'text-blue-400' : 'text-gray-400'
                  )}
                >
                  {format(day, 'MMM d')}
                </p>
                {dayPosts.length > 0 && (
                  <div className="mt-2">
                    <div className="h-0.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                        style={{ width: `${(readyCount / dayPosts.length) * 100}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      {readyCount}/{dayPosts.length} ready
                    </p>
                  </div>
                )}
              </div>

              {/* Add post button */}
              <button
                onClick={() => onAddPost(day)}
                className="flex items-center gap-1 mx-2 mb-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors shrink-0"
              >
                <Plus size={11} />
                Add post
              </button>

              {/* Sortable + droppable card list */}
              <SortableContext items={colItems} strategy={verticalListSortingStrategy}>
                <DroppableColumn
                  dateKey={dateKey}
                  className="flex-1 overflow-y-auto px-2 pb-3 space-y-1.5 min-h-0"
                >
                  {colItems.map((id) => {
                    const post = postMap.get(id)
                    if (post) {
                      return (
                        <SortablePostCard
                          key={id}
                          post={post}
                          onClick={() => onPostClick(post)}
                        />
                      )
                    }
                    const idea = ideaMap.get(id)
                    if (idea) {
                      return <SortableIdeaCard key={id} idea={idea} />
                    }
                    return null
                  })}
                </DroppableColumn>
              </SortableContext>
            </div>
          )
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activePost && (
          <div className="shadow-xl rotate-1 opacity-95 w-40">
            <PostCard post={activePost} onClick={() => {}} />
          </div>
        )}
        {activeIdea && (
          <div className="shadow-xl rotate-1 opacity-95 w-40">
            <IdeaCard idea={activeIdea} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
