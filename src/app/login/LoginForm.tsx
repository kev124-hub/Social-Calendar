'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError) setError(urlError)
  }, [searchParams])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-bold text-lg">MJ</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Mustache Journey</h1>
          <p className="text-muted-foreground text-sm mt-1">Social Calendar</p>
        </div>

        {sent ? (
          <div className="text-center space-y-2">
            <p className="text-sm font-medium">Check your email</p>
            <p className="text-sm text-muted-foreground">
              We sent a magic link to <strong>{email}</strong>
            </p>
            <button
              onClick={() => { setSent(false); setError('') }}
              className="text-xs text-muted-foreground underline mt-2"
            >
              Send again
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@mustachejourney.com"
                required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {error && (
              <p className="text-destructive text-xs bg-destructive/10 px-3 py-2 rounded-md">
                {error.replace(/_/g, ' ')}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send magic link'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
