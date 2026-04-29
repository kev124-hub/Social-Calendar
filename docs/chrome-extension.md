# Chrome Extension Spec

Manifest V3 extension for clipping web content directly to the Inspiration Board.

---

## Purpose
When Kevin is browsing the web and finds something inspiring — an image, a travel idea, a competitor post, a visual reference — he can click the extension and save it to his Inspiration Board without leaving the page.

---

## What It Captures
- **Page URL + title** (automatic)
- **Auto-screenshot** of the visible viewport
- **User-selected images** — user can click images on the page to include them
- **Notes field** — free text for Kevin's thoughts

---

## User Flow
1. Kevin is on a webpage
2. Clicks the extension icon in Chrome toolbar
3. Popup appears with:
   - Page title (editable)
   - Page URL (shown, not editable)
   - Screenshot thumbnail (automatic)
   - Image selector: shows images found on the page, Kevin clicks to toggle which to include
   - Notes textarea
   - Tags input (comma-separated)
   - Trip/date attachment (optional dropdown: trip name or date)
   - **Save to Board** button
4. Clicking Save sends data to the app API and closes the popup
5. Item appears in Inspiration Board

---

## Architecture

### Files
```
extension/
  manifest.json
  popup.html
  popup.js
  popup.css
  background.js      -- service worker
  content.js         -- injected into pages to find images
  icons/
    icon16.png
    icon48.png
    icon128.png
```

### manifest.json (key fields)
```json
{
  "manifest_version": 3,
  "name": "MJ Social Calendar Clipper",
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

### Auth
- On first use, extension prompts Kevin to enter his app URL + an API token
- Token stored in `chrome.storage.local`
- All saves go to `POST https://[app-url]/api/inspirations` with Bearer token header

### API Endpoint
`POST /api/inspirations`
```json
{
  "type": "url_clip",
  "title": "string",
  "source_url": "string",
  "screenshot": "base64 string",
  "selected_images": ["url1", "url2"],
  "notes": "string",
  "tags": ["tag1", "tag2"],
  "trip_name": "string | null",
  "date_start": "ISO date | null",
  "date_end": "ISO date | null"
}
```

---

## Development & Installation
- During development: load unpacked from `extension/` directory in Chrome
- For production: can be distributed as a `.crx` or published to Chrome Web Store
- Chrome Web Store publication is optional — sideloading works fine for personal use
