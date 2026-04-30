'use client'

import { useEffect, useState, useCallback } from 'react'

export default function ExtensionAuthPage() {
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)

  const fetchKey = useCallback(async () => {
    const res = await fetch('/api/extension-key')
    if (res.status === 401) { setToken(null); setLoading(false); return }
    const { key } = await res.json()
    setToken(key ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchKey() }, [fetchKey])

  async function copy() {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function regenerate() {
    setRegenerating(true)
    const res = await fetch('/api/extension-key', { method: 'POST' })
    const { key } = await res.json()
    setToken(key)
    setRegenerating(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
      Loading…
    </div>
  )

  if (!token) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Not signed in</h1>
      <p className="text-muted-foreground text-sm">Sign in to your MJ Calendar first, then come back to this page.</p>
      <a href="/login" className="text-sm font-medium underline">Go to login</a>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 max-w-md mx-auto">
      <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center text-background font-bold font-serif text-lg">
        MJ
      </div>

      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold">Extension Setup</h1>
        <p className="text-sm text-muted-foreground">Copy your API key and paste it into the MJ Clipper extension settings.</p>
      </div>

      <div className="w-full space-y-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your API Key</label>
        <div className="flex gap-2">
          <input
            type="password"
            readOnly
            value={token}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-muted font-mono truncate"
          />
          <button
            onClick={copy}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              copied
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-foreground text-background border-transparent hover:opacity-90'
            }`}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          This key never expires. If you lose it or suspect it&apos;s compromised, use Regenerate below.
        </p>
      </div>

      <ol className="w-full text-sm text-muted-foreground space-y-2 border border-border rounded-lg p-4">
        <li className="flex gap-3"><span className="font-semibold text-foreground shrink-0">1.</span>Copy the key above</li>
        <li className="flex gap-3"><span className="font-semibold text-foreground shrink-0">2.</span>Click the MJ Clipper icon in Chrome → gear icon → Settings</li>
        <li className="flex gap-3"><span className="font-semibold text-foreground shrink-0">3.</span>Paste the key and click Save</li>
        <li className="flex gap-3"><span className="font-semibold text-foreground shrink-0">4.</span>Right-click any image → &quot;Save to MJ Inspiration&quot;</li>
      </ol>

      <button
        onClick={regenerate}
        disabled={regenerating}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors disabled:opacity-50"
      >
        {regenerating ? 'Regenerating…' : 'Regenerate key'}
      </button>
    </div>
  )
}
