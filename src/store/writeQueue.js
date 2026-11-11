// Serial write queue. A failed write drops everything queued after it and
// rolls the store back to the snapshot taken before that write.
export function createWriteQueue({ revert, onError }) {
  let items = []
  let running = false
  let waiters = []

  const settle = () => {
    const w = waiters
    waiters = []
    w.forEach((r) => r())
  }

  async function run() {
    if (running) return
    running = true
    try {
      while (items.length) {
        const { send, snapshot } = items.shift()
        try {
          await send()
        } catch (err) {
          items = []
          revert(snapshot)
          onError(err)
        }
      }
    } finally {
      running = false
      settle()
    }
  }

  return {
    enqueue(send, snapshot) {
      items.push({ send, snapshot })
      run().catch((err) => console.error(err))
    },
    isIdle: () => !running && items.length === 0,
    whenIdle() {
      if (!running && items.length === 0) return Promise.resolve()
      return new Promise((r) => waiters.push(r))
    },
  }
}
