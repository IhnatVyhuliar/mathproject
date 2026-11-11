// File helpers for the web version's local backend (see localApi.js).

// Saves `value` as a .json file in the browser's downloads.
export function download(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Opens the file picker; resolves to the chosen file's text, or null if canceled.
export function pickText() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      input.remove()
      if (file) file.text().then(resolve, reject)
      else resolve(null)
    })
    input.addEventListener('cancel', () => {
      input.remove()
      resolve(null)
    })
    document.body.appendChild(input)
    input.click()
  })
}

export function confirm(message) {
  return window.confirm(message)
}
