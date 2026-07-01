/**
 * 疗愈老师身份标签 — customer.positions 的枚举常量
 * 所有页面统一引用此处，新增身份只改这一个文件
 */

export const POSITION_ACHIEVER = "成就君"
export const POSITION_ENERGY_TEACHER = "能量结老师"
export const POSITION_COURSE_TEACHER = "课程老师"
export const POSITION_COURSE_DEPT = "课程部"

/** 疗愈老师身份（用于 healing-identities 页面、detail-view 标签展示） */
export const HEALING_POSITIONS = [
  POSITION_ACHIEVER,
  POSITION_ENERGY_TEACHER,
  POSITION_COURSE_TEACHER,
] as const

/** 活动类型 → 默认老师身份映射 */
export const ACTIVITY_POSITION_MAP: Record<string, string> = {
  class: POSITION_COURSE_TEACHER,
  gcs: POSITION_ACHIEVER,
  ocr: POSITION_ACHIEVER,
  ers: POSITION_ACHIEVER,
  eks: POSITION_ENERGY_TEACHER,
  ics: POSITION_COURSE_TEACHER,
}
