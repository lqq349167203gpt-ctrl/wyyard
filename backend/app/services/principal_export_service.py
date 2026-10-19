"""组织/俱乐部导出汇总：复用页面统计，不接受客户端传入数量。"""

from app.services.principal_mobile_service import overview_metrics


def export_group(query) -> str:
    if query.tab == "conversion":
        return ""
    if query.export_group:
        return query.export_group
    if query.export_view == "traffic":
        return "traffic"
    if query.export_view in {"invite_arrivals", "invite_initiated"}:
        return "invite"
    if query.tab == "orders" and query.include_overview:
        return "deals"
    return "courses" if query.tab == "overview" else ""


def summary_rows(result: dict, query, group: str) -> list[list]:
    """保留各维度自己的统计口径，不把多标签、多老师等重叠数量相加冒充总数。"""
    if not group:
        return []
    summary = result.get("summary") or {}
    breakdown = result.get("breakdown") or {}
    rows = []

    def add(category, label, value, unit):
        rows.append([category, label, f"{value or 0} {unit}"])

    def options(category, items, unit="人"):
        for item in items or []:
            add(category, item.get("label") or item["key"], item.get("count"), unit)

    if group == "traffic":
        add("总数", "引流人数", summary.get("引流人数"), "人")
        options("引流人", breakdown.get("traffic"))
        filters = breakdown.get("traffic_filters") or {}
        for key, label in (("identity", "会员身份"), ("upsell", "升单情况"), ("stage", "跟进阶段"),
                           ("source", "流量来源"), ("tag", "客户标签")):
            options(label, filters.get(key))
    elif group == "invite":
        metrics = overview_metrics(breakdown, query.breakdown)
        add("总数", "邀约到店", metrics["invite_total"], "次")
        for key, label in (("cancel_count", "取消"), ("no_show_count", "未到店"), ("arrive_count", "已到店")):
            add("到店状态", label, metrics["invite"][key]["times"], "次")
        add("总数", "发起邀约", metrics["initiated_times"], "次")
        for item in breakdown.get("invite_inviters") or []:
            add("邀约人 · 发起邀约", item["label"], item.get("initiated_count"), "次")
        for item in breakdown.get("invite_traffic", breakdown.get("traffic", [])):
            add("引流人 · 邀约到店", item["label"], item.get("invite_count"), "次")
    elif group == "deals":
        add("总数", "成交量", summary.get("交易笔数"), "笔")
        add("总数", "总成交人数", summary.get("成交人数"), "人")
        options("付费项目", breakdown.get("deals"), "笔")
        for product in breakdown.get("deals") or []:
            options(f"卡种 · {product['label']}", product.get("subtypes"), "笔")
        options("购买类型", breakdown.get("buys"), "笔")
    elif group == "courses":
        add("总数", "课程数", summary.get("课程数"), "场")
        add("总数", "课时数", summary.get("课时数"), "课时")

        def course_options(category, items):
            for item in items or []:
                text = f"{item.get('count') or 0} 场 · {item.get('hours') or 0} 课时"
                rows.append([category, item["label"], text])

        courses = breakdown.get("courses") or {}
        course_options("活动类型", courses.get("by_type"))
        for activity in courses.get("by_type") or []:
            label = "沙龙类型" if activity["key"] == "沙龙活动" else "课程名称"
            course_options(f"{label} · {activity['label']}", activity.get("subtypes"))
        course_options("课程老师", courses.get("by_teacher"))
    elif group == "participation":
        participation = breakdown.get("participation") or {}

        def participation_options(category, items):
            for item in items or []:
                text = (f"{item.get('count') or 0} 次 · {item.get('people') or 0} 人；"
                        f"案主 {item.get('owner_count') or 0} 次 / {item.get('owner_people') or 0} 人；"
                        f"参与者 {item.get('participant_count') or 0} 次 / {item.get('participant_people') or 0} 人")
                rows.append([category, item["label"], text])

        participation_options("总数", [{"label": "活动参与", **participation.get("overall", {})}])
        participation_options("活动类型", participation.get("by_type"))
        for activity in participation.get("by_type") or []:
            participation_options(f"沙龙类型 · {activity['label']}", activity.get("subtypes"))
        participation_options("参与者", participation.get("by_participant"))
    # 每个下拉维度只占一行，选项名和数量在同一个单元格内分行显示。
    compact = []
    grouped = {}
    for category, label, value in rows:
        if category == "总数":
            compact.append([category, label, value])
            continue
        if category not in grouped:
            grouped[category] = []
            compact.append([category, grouped[category], ""])
        grouped[category].append(f"{label} {value}")
    return [[category, "\n".join(label) if isinstance(label, list) else label, value]
            for category, label, value in compact]
