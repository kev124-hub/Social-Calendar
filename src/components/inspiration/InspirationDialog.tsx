'use client'

import { useState, useRef } from 'react'
import { X, Upload, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { InspirationItemType } from '@/types/database'

const TYPES: { value: InspirationItemType; label: string }[] = [
  { value: 'image', label: 'Image' },
  { value: 'video_link', label: 'Video' },
  { value: 'url_clip', label: 'URL' },
  { value: 'text_note', label: 'Note' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
}

export function InspirationDialog({ open, onClose, onSave }: Props) {
  const [type, setType] = useState<InspirationItemType>('image')
  const [title, setTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')
  const [tripName, setTripName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  function reset() {
    setType('image')
    setTitle('')
    setSourceUrl('')
    setNotes('')
    setTags('')
    setTripName('')
    setFile(null)
    setPreview(null)
    setError(null)
  }

  function handleFile(f: File) {
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''))
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }

  async function handleSave() {
    if (type === 'image' && !file) { setError('Choose an image'); return }
    if ((type === 'video_link' || type === 'url_clip') && !sourceUrl.trim()) { setError('Enter a URL'); return }
    if (type === 'text_note' && !notes.trim() && !title.trim()) { setError('Add a title or note'); return }

    setSaving(true)
    setError(null)

    let imagePath: string | null = null

    try {
      if (type === 'image' && file) {
        const ext = file.name.split('.').pop()
        const path = `${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('inspirations')
          .upload(path, file, { upsert: false })
        if (uploadError) throw uploadError
        imagePath = path
      }

      const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean)

      const { error: insertError } = await supabase.from('inspirations').insert({
        type,
        title: title.trim() || null,
        source_url: sourceUrl.trim() || null,
        image_path: imagePath,
        notes: notes.trim() || null,
        tags: tagArray,
        trip_name: tripName.trim() || null,
      })
      if (insertError) throw insertError

      reset()
      onSave()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to Inspiration Board</DialogTitle>
        </DialogHeader>

        {/* Type selector */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => { setType(t.value); setError(null) }}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                type === t.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 py-1">
          {/* Image upload */}
          {type === 'image' && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
              />
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="" className="w-full max-h-48 object-cover rounded-lg" />
                  <button
                    onClick={() => { setFile(null); setPreview(null) }}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Upload size={20} />
                  <span className="text-sm">Click to upload image</span>
                </button>
              )}
            </div>
          )}

          {/* URL field */}
          {(type === 'video_link' || type === 'url_clip') && (
            <div>
              <label className="text-sm font-medium block mb-1">
                {type === 'video_link' ? 'Video URL' : 'URL'}
              </label>
              <input
                autoFocus
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder={type === 'video_link' ? 'https://youtube.com/watch?v=...' : 'https://...'}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-sm font-medium block mb-1">Title</label>
            <input
              autoFocus={type !== 'video_link' && type !== 'url_clip'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'text_note' ? 'Note title' : 'Optional'}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={type === 'text_note' ? 4 : 2}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Tags</label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="f1, monaco, travel"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Trip</label>
              <input
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder="Monaco GP 2026"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => { reset(); onClose() }}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={14} className="animate-spin mr-1.5" />Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
