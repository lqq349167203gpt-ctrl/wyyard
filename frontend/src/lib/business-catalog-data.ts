// 由 shared/business-catalog.json 生成，请修改源文件后运行 python3 scripts/generate-business-catalog.py。

export const BUSINESS_LABELS = {
  "learning": "沙龙技能学习",
  "legacy_learning": "过往课程"
} as const

export const MEMBERSHIP_CATALOG = [
  {
    "name": "次卡",
    "price": 198,
    "count": 1,
    "duration_months": 1
  },
  {
    "name": "体验会员",
    "price": 398,
    "count": 4,
    "duration_months": 1
  },
  {
    "name": "30次卡",
    "price": 3999,
    "count": 30,
    "duration_months": 1
  },
  {
    "name": "60次卡",
    "price": 5999,
    "count": 60,
    "duration_months": 6
  },
  {
    "name": "定制化",
    "price": 0,
    "count": null,
    "duration_months": null
  }
] as const

export const LEARNING_CATALOG = [
  {
    "activity_name": "OH卡技能梳理",
    "payment_name": "OH卡技能梳理",
    "legacy": false,
    "price": 0,
    "duration_months": 12,
    "description": ""
  },
  {
    "activity_name": "禅茶静心训练",
    "payment_name": "禅茶静心训练",
    "legacy": false,
    "price": 0,
    "duration_months": 12,
    "description": ""
  },
  {
    "activity_name": "觉醒游戏训练",
    "payment_name": "觉醒游戏训练",
    "legacy": false,
    "price": 0,
    "duration_months": 12,
    "description": ""
  },
  {
    "activity_name": "疗愈师课程",
    "payment_name": "疗愈师课程：自爱力构建",
    "legacy": true,
    "price": 20000,
    "duration_months": 12,
    "description": "线上课程 · 48节精品课"
  },
  {
    "activity_name": "商业框架陪跑",
    "payment_name": "商业框架陪跑：自觉力提升",
    "legacy": true,
    "price": 36800,
    "duration_months": 3,
    "description": "线下深度学习"
  },
  {
    "activity_name": "落地赋能班",
    "payment_name": "落地赋能班：自洽力整合",
    "legacy": true,
    "price": 58000,
    "duration_months": 24,
    "description": "线下实战落地"
  }
] as const

export const OFFLINE_COURSE_TYPES = [
  "主理人训练",
  "商业落地三个月",
  "商业落地一年"
] as const

export const OH_READING_TYPES = [
  "OH卡情感梳理",
  "余老师情感类",
  "余老师商业梳理"
] as const
