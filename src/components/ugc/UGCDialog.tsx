'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { UGCProject, UGCStage } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDelete: (id: string) => void
  project: UGCProject | null
  defaultStage: UGCStage
}

const STAGES: UGCStage[] = [
  'lead', 'pitched', 'negotiating', 'contract_signed',
  'shooting', 'delivered', 'invoice_sent', 'paid',
]

const STAGE_LABELS: Record<UGCStage, string> = {
  lead: 'Lead',
  pitched: 'Pitched',
  negotiating: 'Negotiating',
  contract_signed: 'Contract Signed',
  shooting: 'Shooting',
  delivered: 'Delivered',
  invoice_sent: 'Invoice Sent',
  paid: 'Paid',
}

export function UGCDialog({ open, onClose, onSave, onDelete, project, defaultStage }: Props) {
  const [brandName, setBrandName] = useState('')
  const [contactName, setContactName] = useState('')
  const [stage, setStage] = useState<UGCStage>(defaultStage)
  const [rate, setRate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [deliverables, setDeliverables] = useState('')
  const [deadline, setDeadline] = useState('')
  const [briefText, setBriefText] = useState('')
  const [briefUrl, setBriefUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    if (project) {
      setBrandName(project.brand_name)
      setContactName(project.contact_name ?? '')
      setStage(project.stage)
      setRate(project.rate != null ? String(project.rate) : '')
      setPaymentMethod(project.payment_method ?? '')
      setDeliverables(project.deliverables ?? '')
      setDeadline(project.deadline ?? '')
      setBriefText(project.brief_text ?? '')
      setBriefUrl(project.brief_url ?? '')
      setNotes(project.notes ?? '')
    } else {
      setBrandName('')
      setContactName('')
      setStage(defaultStage)
      setRate('')
      setPaymentMethod('')
      setDeliverables('')
      setDeadline('')
      setBriefText('')
      setBriefUrl('')
      setNotes('')
    }
  }, [open, project, defaultStage])

  async function handleSave() {
    if (!brandName.trim()) return
    setSaving(true)

    const payload = {
      brand_name: brandName.trim(),
      contact_name: contactName || null,
      stage,
      rate: rate ? parseFloat(rate) : null,
      payment_method: paymentMethod || null,
      deliverables: deliverables || null,
      deadline: deadline || null,
      brief_text: briefText || null,
      brief_url: briefUrl || null,
      notes: notes || null,
    }

    if (project) {
      await supabase.from('ugc_projects').update(payload).eq('id', project.id)
    } else {
      await supabase.from('ugc_projects').insert(payload)
    }

    setSaving(false)
    onSave()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Deal' : 'New UGC Deal'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium block mb-1">Brand *</label>
            <input
              autoFocus
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Brand name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Contact</label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Stage</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as UGCStage)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Rate ($)</label>
              <input
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="0"
                min="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Payment method</label>
              <input
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="PayPal, bank transfer…"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Deliverables</label>
            <textarea
              value={deliverables}
              onChange={(e) => setDeliverables(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="2 Reels, 1 Story set…"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Brief</label>
            <textarea
              value={briefText}
              onChange={(e) => setBriefText(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Brief details…"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Brief URL</label>
            <input
              value={briefUrl}
              onChange={(e) => setBriefUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Link to brief doc"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {project && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(project.id)}>
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !brandName.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
