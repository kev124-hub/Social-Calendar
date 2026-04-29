'use client'

import { useState, useEffect } from 'react'
import { Plus, DollarSign, ExternalLink } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import type { UGCProject, UGCStage } from '@/types/database'
import { UGCDialog } from './UGCDialog'
import { cn } from '@/lib/utils'

const STAGES: { key: UGCStage; label: string; color: string }[] = [
  { key: 'lead', label: 'Lead', color: 'bg-slate-100 border-slate-200' },
  { key: 'pitched', label: 'Pitched', color: 'bg-blue-50 border-blue-100' },
  { key: 'negotiating', label: 'Negotiating', color: 'bg-amber-50 border-amber-100' },
  { key: 'contract_signed', label: 'Contract', color: 'bg-purple-50 border-purple-100' },
  { key: 'shooting', label: 'Shooting', color: 'bg-pink-50 border-pink-100' },
  { key: 'delivered', label: 'Delivered', color: 'bg-cyan-50 border-cyan-100' },
  { key: 'invoice_sent', label: 'Invoice Sent', color: 'bg-orange-50 border-orange-100' },
  { key: 'paid', label: 'Paid', color: 'bg-green-50 border-green-100' },
]

type ViewMode = 'kanban' | 'list'

export function UGCBoard() {
  const [projects, setProjects] = useState<UGCProject[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<UGCProject | null>(null)
  const [defaultStage, setDefaultStage] = useState<UGCStage>('lead')
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')

  const supabase = createClient()

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    setLoading(true)
    const { data } = await supabase
      .from('ugc_projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setProjects(data)
    setLoading(false)
  }

  function openNew(stage: UGCStage = 'lead') {
    setEditingProject(null)
    setDefaultStage(stage)
    setDialogOpen(true)
  }

  function openEdit(project: UGCProject) {
    setEditingProject(project)
    setDialogOpen(true)
  }

  async function handleSave() {
    setDialogOpen(false)
    await loadProjects()
  }

  async function handleDelete(id: string) {
    await supabase.from('ugc_projects').delete().eq('id', id)
    setDialogOpen(false)
    await loadProjects()
  }

  async function moveStage(project: UGCProject, newStage: UGCStage) {
    await supabase.from('ugc_projects').update({ stage: newStage }).eq('id', project.id)
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, stage: newStage } : p)))
  }

  const totalPipeline = projects
    .filter((p) => !['paid'].includes(p.stage))
    .reduce((sum, p) => sum + (p.rate ?? 0), 0)

  const totalPaid = projects
    .filter((p) => p.stage === 'paid')
    .reduce((sum, p) => sum + (p.rate ?? 0), 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold">UGC Tracker</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pipeline: <strong>${totalPipeline.toLocaleString()}</strong>
            {' · '}
            Paid: <strong>${totalPaid.toLocaleString()}</strong>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-border overflow-hidden">
            {(['kanban', 'list'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  viewMode === v
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent'
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => openNew()}>
            <Plus size={14} className="mr-1" />
            New Deal
          </Button>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 p-6 h-full min-w-max">
            {STAGES.map(({ key, label, color }) => {
              const stageProjects = projects.filter((p) => p.stage === key)
              const stageTotal = stageProjects.reduce((s, p) => s + (p.rate ?? 0), 0)

              return (
                <div key={key} className={cn('flex flex-col w-60 rounded-xl border', color)}>
                  <div className="flex items-center justify-between px-3 py-3 border-b border-inherit">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{label}</span>
                        <Badge variant="secondary" className="text-xs h-5 px-1.5">
                          {stageProjects.length}
                        </Badge>
                      </div>
                      {stageTotal > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">${stageTotal.toLocaleString()}</p>
                      )}
                    </div>
                    <button onClick={() => openNew(key)} className="text-muted-foreground hover:text-foreground">
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {stageProjects.map((project) => (
                      <UGCCard
                        key={project.id}
                        project={project}
                        stages={STAGES}
                        onEdit={() => openEdit(project)}
                        onMove={(s) => moveStage(project, s)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <UGCListView projects={projects} onEdit={openEdit} />
      )}

      <UGCDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        project={editingProject}
        defaultStage={defaultStage}
      />
    </div>
  )
}

function UGCCard({
  project,
  stages,
  onEdit,
  onMove,
}: {
  project: UGCProject
  stages: typeof STAGES
  onEdit: () => void
  onMove: (s: UGCStage) => void
}) {
  const nextStage = stages.find((s, i) => stages[i - 1]?.key === project.stage)

  return (
    <div
      className="bg-white rounded-lg border border-border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onEdit}
    >
      <p className="text-sm font-semibold truncate">{project.brand_name}</p>

      {project.rate != null && (
        <p className="text-sm text-green-700 font-medium mt-0.5">${project.rate.toLocaleString()}</p>
      )}

      {project.contact_name && (
        <p className="text-xs text-muted-foreground mt-1">{project.contact_name}</p>
      )}

      {project.deadline && (
        <p className="text-xs text-muted-foreground">
          Due: {format(parseISO(project.deadline), 'MMM d')}
        </p>
      )}

      {project.deliverables && (
        <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{project.deliverables}</p>
      )}

      {nextStage && (
        <div className="mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onMove(nextStage.key)}
            className="text-xs text-primary hover:underline font-medium"
          >
            → {nextStage.label}
          </button>
        </div>
      )}
    </div>
  )
}

function UGCListView({ projects, onEdit }: { projects: UGCProject[]; onEdit: (p: UGCProject) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Brand</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stage</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rate</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Deadline</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => (
              <tr
                key={p.id}
                className={cn(
                  'border-b border-border/50 cursor-pointer hover:bg-accent/30',
                  i % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                )}
                onClick={() => onEdit(p)}
              >
                <td className="px-4 py-3 font-medium">{p.brand_name}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="capitalize text-xs">
                    {p.stage.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-green-700 font-medium">
                  {p.rate != null ? `$${p.rate.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.deadline ? format(parseISO(p.deadline), 'MMM d, yyyy') : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.contact_name ?? '—'}</td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No deals yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
