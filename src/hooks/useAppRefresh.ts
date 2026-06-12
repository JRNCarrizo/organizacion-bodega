import { useEffect, useState } from 'react'

const listeners = new Set<() => void>()

export function notifyAppRefresh(): void {
  listeners.forEach(listener => listener())
}

export function useAppRefresh() {
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const listener = () => setRefreshKey(key => key + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  return { refreshKey, refresh: notifyAppRefresh }
}
