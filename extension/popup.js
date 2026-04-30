let currentType = 'url_clip'

document.getElementById('options-btn').addEventListener('click', () => chrome.runtime.openOptionsPage())
document.getElementById('go-options')?.addEventListener('click', () => chrome.runtime.openOptionsPage())

// Type tabs
document.querySelectorAll('.type-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.type-tab').forEach((t) => t.classList.remove('active'))
    tab.classList.add('active')
    currentType = tab.dataset.type
    // Hide URL field for text notes
    document.getElementById('url-field').style.display = currentType === 'text_note' ? 'none' : ''
  })
})

async function init() {
  const { token } = await chrome.storage.local.get('token')
  if (!token) {
    document.getElementById('setup').style.display = 'flex'
    document.getElementById('main').style.display = 'none'
    return
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) {
    document.getElementById('title').value = tab.title ?? ''
    document.getElementById('url').value = tab.url ?? ''

    // Auto-detect video
    if (tab.url && (tab.url.includes('youtube.com') || tab.url.includes('youtu.be') || tab.url.includes('vimeo.com'))) {
      document.querySelector('[data-type="video_link"]').click()
    }
  }
}

document.getElementById('save').addEventListener('click', async () => {
  const btn = document.getElementById('save')
  const status = document.getElementById('status')
  const title = document.getElementById('title').value.trim()
  const url = document.getElementById('url').value.trim()
  const notes = document.getElementById('notes').value.trim()
  const tags = document.getElementById('tags').value.split(',').map((t) => t.trim()).filter(Boolean)
  const trip_name = document.getElementById('trip').value.trim() || null

  if (!title && !url && !notes) {
    setStatus('Add a title, URL, or note', 'err')
    return
  }

  btn.disabled = true
  btn.textContent = 'Saving…'
  status.className = 'status'
  status.textContent = ''

  const payload = {
    type: currentType,
    title: title || null,
    source_url: url || null,
    notes: notes || null,
    tags,
    trip_name,
  }

  chrome.runtime.sendMessage({ type: 'SAVE', payload }, (res) => {
    btn.disabled = false
    btn.textContent = 'Save to Board'
    if (res?.ok) {
      setStatus('Saved!', 'ok')
      setTimeout(() => window.close(), 1000)
    } else {
      setStatus(res?.error ?? 'Something went wrong', 'err')
    }
  })
})

function setStatus(msg, type) {
  const el = document.getElementById('status')
  el.textContent = msg
  el.className = 'status ' + type
}

init()
