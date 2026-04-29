import { Resend } from 'resend'

const FROM = `Mustache Journey <${process.env.NOTIFICATION_FROM_EMAIL ?? 'noreply@mustachejourney.com'}>`
const TO   = process.env.NOTIFICATION_EMAIL ?? 'hello@mustachejourney.com'

export async function sendNotificationEmail(subject: string, body: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email')
    return
  }

  // Lazy-initialize so build doesn't fail without the key
  const resend = new Resend(process.env.RESEND_API_KEY)

  const { error } = await resend.emails.send({
    from: FROM,
    to: TO,
    subject,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="margin-bottom: 16px;">
          <span style="background: #6366f1; color: white; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">
            MUSTACHE JOURNEY
          </span>
        </div>
        <div style="font-size: 15px; line-height: 1.6; color: #111;">${body.replace(/\n/g, '<br>')}</div>
        <div style="margin-top: 24px; font-size: 12px; color: #999;">
          You're receiving this from your Social Calendar app.
        </div>
      </div>
    `,
  })
  if (error) console.error('Resend error:', error)
}
