const APP_URL = 'https://claude-social-calendar.vercel.app'

// Create context menu for images on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clip-image',
    title: 'Save to MJ Inspiration',
    contexts: ['image'],
  })
  chrome.contextMenus.create({
    id: 'clip-page',
    title: 'Save to MJ Inspiration',
    contexts: ['page', 'link'],
  })
})

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { token } = await chrome.storage.local.get('token')
  if (!token) {
    chrome.runtime.openOptionsPage()
    return
  }

  if (info.menuItemId === 'clip-image') {
    await clipImage(token, info.srcUrl, tab?.url, tab?.title)
  } else if (info.menuItemId === 'clip-page') {
    const url = info.linkUrl ?? tab?.url
    const title = info.linkUrl ? info.linkUrl : tab?.title
    await clipUrl(token, url, title)
  }
})

async function clipImage(token, imageUrl, pageUrl, pageTitle) {
  try {
    const domain = pageUrl ? new URL(pageUrl).hostname : ''
    const res = await fetch(`${APP_URL}/api/inspirations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        type: 'image',
        title: pageTitle ?? domain,
        image_url: imageUrl,
        source_url: pageUrl,
        clipped_via_extension: true,
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    notify('Image saved to Inspiration Board')
  } catch (err) {
    notify('Failed to save: ' + err.message, true)
  }
}

async function clipUrl(token, url, title) {
  try {
    const res = await fetch(`${APP_URL}/api/inspirations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        type: 'url_clip',
        title: title ?? url,
        source_url: url,
        clipped_via_extension: true,
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    notify('Page saved to Inspiration Board')
  } catch (err) {
    notify('Failed to save: ' + err.message, true)
  }
}

function notify(message, isError = false) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon-48.png',
    title: isError ? 'MJ Clipper — Error' : 'MJ Clipper',
    message,
  })
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SAVE') {
    chrome.storage.local.get('token').then(({ token }) => {
      if (!token) { sendResponse({ ok: false, error: 'Not configured' }); return }

      fetch(`${APP_URL}/api/inspirations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...msg.payload, clipped_via_extension: true }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text())
          sendResponse({ ok: true })
        })
        .catch((err) => sendResponse({ ok: false, error: err.message }))
    })
    return true // keep channel open for async response
  }
})
