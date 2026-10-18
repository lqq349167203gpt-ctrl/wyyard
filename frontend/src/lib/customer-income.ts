export const CUSTOMER_INCOME_FIELDS = [
  { key: "income_stability", label: "收入是否稳定", values: ["收入稳定", "收入不稳定"] },
  { key: "personal_annual_income", label: "个人年收入", values: ["10w以下", "10~20w", "20~30w", "30~50w", "50w以上"] },
  { key: "household_annual_income", label: "家庭年收入", values: ["20w以下", "20~30w", "30~40w", "40~50w", "50~100w", "100w以上"] },
] as const
