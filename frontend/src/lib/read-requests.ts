// 只复用进行中的安全读取，不保存业务结果；写入/切账号后新请求不会复用旧读取。
const pending = new Map<string, Promise<unknown>>()

export function clearPendingReads() { pending.clear() }

export function reusePendingRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = pending.get(key)
  if (existing) return existing as Promise<T>
  const promise = load().finally(() => { if (pending.get(key) === promise) pending.delete(key) })
  pending.set(key, promise)
  return promise
}
