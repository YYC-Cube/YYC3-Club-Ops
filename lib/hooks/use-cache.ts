"use client"

import { useState, useEffect, useCallback } from "react"

interface CacheOptions {
  ttl?: number // Time to live in milliseconds
  maxSize?: number
}

interface CacheItem<T> {
  data: T
  timestamp: number
  ttl: number
}

class Cache<T> {
  private cache = new Map<string, CacheItem<T>>()
  private maxSize: number

  constructor(maxSize = 100) {
    this.maxSize = maxSize
  }

  set(key: string, data: T, ttl = 5 * 60 * 1000): void {
    // Remove oldest items if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
  }

  get(key: string): T | null {
    const item = this.cache.get(key)

    if (!item) {
      return null
    }

    // Check if item has expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key)
      return null
    }

    return item.data
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  has(key: string): boolean {
    const item = this.cache.get(key)
    if (!item) return false

    // Check if expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key)
      return false
    }

    return true
  }
}

const globalCache = new Cache<any>()

export function useCache<T>(options: CacheOptions = {}) {
  const { ttl = 5 * 60 * 1000, maxSize: _maxSize = 100 } = options

  const setCache = useCallback(
    (key: string, data: T) => {
      globalCache.set(key, data, ttl)
    },
    [ttl],
  )

  const getCache = useCallback((key: string): T | null => {
    return globalCache.get(key)
  }, [])

  const deleteCache = useCallback((key: string) => {
    globalCache.delete(key)
  }, [])

  const clearCache = useCallback(() => {
    globalCache.clear()
  }, [])

  const hasCache = useCallback((key: string): boolean => {
    return globalCache.has(key)
  }, [])

  return {
    setCache,
    getCache,
    deleteCache,
    clearCache,
    hasCache,
  }
}

export function useCachedData<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions = {}) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const { getCache, setCache } = useCache<T>(options)

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      // Check cache first
      if (!forceRefresh) {
        const cachedData = getCache(key)
        if (cachedData) {
          setData(cachedData)
          return cachedData
        }
      }

      setLoading(true)
      setError(null)

      try {
        const result = await fetcher()
        setData(result)
        setCache(key, result)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error")
        setError(error)
        throw error
      } finally {
        setLoading(false)
      }
    },
    [key, fetcher, getCache, setCache],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 既有合法模式（父子实例同步/路由镜像），结构化改造排入专项
    fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    refetch: () => fetchData(true),
    fetchData,
  }
}
