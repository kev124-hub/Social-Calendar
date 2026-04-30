// Load saved values
chrome.storage.local.get('token').then(({ token }) => {
  if (token) document.getElementById('token').value = token
})

document.getElementById('save').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim()
  const status = document.getElementById('status')

  if (!token) {
    status.textContent = 'Please enter a token'
    status.className = 'status err'
    return
  }

  await chrome.storage.local.set({ token })
  status.textContent = '✓ Saved'
  status.className = 'status ok'
  setTimeout(() => { status.textContent = '' }, 2000)
})
