"""客户档案在统计列表、导出中的共用文字口径。"""


def format_work_info(customer) -> str:
    parts = [getattr(customer, field, "") or "" for field in ("work_status", "work_description", "income_stability")]
    for field, label in (("personal_annual_income", "个人年收入"), ("household_annual_income", "家庭年收入")):
        value = getattr(customer, field, "")
        if value:
            parts.append(f"{label}：{value}")
    return " · ".join(part.strip() for part in parts if part.strip())
