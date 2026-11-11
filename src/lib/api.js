import { API_METHODS } from './apiMethods.js'

export class ApiError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ApiError'
  }
}

// Wraps the preload bridge: resolves to the value, rejects with ApiError.
// Returns null when there is no bridge (plain browser).
export function createBridgeApi(bridge = globalThis.window?.scoreboard) {
  if (!bridge) return null
  const api = {}
  for (const name of API_METHODS) {
    api[name] = async (...args) => {
      let result
      try {
        result = await bridge.invoke(name, ...args)
      } catch {
        throw new ApiError('Błąd komunikacji z aplikacją')
      }
      if (result && result.ok) return result.value
      throw new ApiError(result?.error || 'Błąd komunikacji z aplikacją')
    }
  }
  return api
}
