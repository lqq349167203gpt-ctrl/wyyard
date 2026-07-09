import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 根据最大值动态计算 YAxis 宽度
export function calcYAxisWidth(data: Record<string, string | number>[], keys: string[]): number {
  let max = 0
  for (const row of data) {
    for (const k of keys) {
      const v = Number(row[k]) || 0
      if (v > max) max = v
    }
  }
  if (max >= 10000) return 42
  if (max >= 1000) return 36
  if (max >= 100) return 30
  if (max >= 10) return 24
  return 20
}
