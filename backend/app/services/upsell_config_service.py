"""客户业务分类：体验、转化、梳理、升单、复购；兼容旧档位配置。"""

import threading
import uuid

from app.models.upsell_config import PURCHASE_RULE_LABELS, PurchaseRule, UpsellLevel
from app.services import course_rule_catalog
from app.services.storage import load_data, save_data

UPSELL_FILE = "upsell_levels.json"

_lock = threading.RLock()
_levels: list[UpsellLevel] = []
_rules: list[PurchaseRule] | None = None


def _load() -> None:
    global _levels, _rules
    raw = load_data(UPSELL_FILE)
    # 一条整体配置：id 固定为 order，方便整体覆盖保存
    stored = raw.get("order") or {}
    _levels = [UpsellLevel(**item) for item in stored.get("levels", [])]
    _rules = [PurchaseRule(**item) for item in stored["rules"]] if "rules" in stored else None


_load()


def list_levels() -> list[dict]:
    if _rules is not None:
        return [{"id": rule.key, "name": PURCHASE_RULE_LABELS[rule.key], "products": list(dict.fromkeys(product for condition in rule.conditions for product in (condition.products or [condition.product])))} for rule in _rules]
    return [level.model_dump(mode="json") for level in _levels]


def rules_configured() -> bool:
    return _rules is not None


def _rule_dict(rule):
    result = rule.model_dump(mode="json")
    for key, default in (("previous_stage", ""), ("once", False), ("count_from", "history")):
        if result[key] == default:
            result.pop(key)
    for condition in result["conditions"]:
        for key, default in (("event_kind", "purchase"), ("public_welfare_only", False), ("products", []), ("count_scope", "subtype"), ("first_purchase", False), ("previous_products", []), ("excluded_previous_products", [])):
            if condition[key] == default:
                condition.pop(key)
        if not condition.get("product"):
            condition.pop("product", None)
    return result


def list_rules() -> list[dict]:
    by_key = {rule.key: rule for rule in (_rules or [])}
    return course_rule_catalog.normalize_rules([_rule_dict(by_key.get(key, PurchaseRule(key=key))) for key in PURCHASE_RULE_LABELS])


def replace_rules(rules: list[PurchaseRule]) -> list[dict]:
    """先持久化再切换内存，不改写或删除旧档位备份。"""
    global _rules
    with _lock:
        by_key = {rule.key: rule for rule in rules}
        normalized = [by_key[key].model_copy(deep=True) for key in PURCHASE_RULE_LABELS]
        save_data(UPSELL_FILE, {"order": {
            "levels": [level.model_dump(mode="json") for level in _levels],
            "rules": [_rule_dict(rule) for rule in normalized],
        }})
        _rules = normalized
    return list_rules()


def recommended_rules() -> list[dict]:
    """默认业务方案：先转化、再升单、再复购；读取不覆盖已保存的配置。"""
    from app.utils.payment_types import MEMBERSHIP_CARD_TYPES

    big = [f"membership:{name}" for name in MEMBERSHIP_CARD_TYPES if name not in {"次卡", "体验会员"}]
    big += ["group_case", "emotional", "online_tea", "energy", "internal", "offline"]
    big.append("companion_camp")
    entry = ["membership:次卡", "membership:体验会员"]
    book_club = course_rule_catalog.book_club_key()
    return [
        {"key": "experience", "conditions": [
            {"products": ["coarse"], "operator": "gte", "count": 1, "count_scope": "group"},
            *([{ "event_kind": "attendance", "products": [book_club], "public_welfare_only": True,
                "operator": "gte", "count": 1, "count_scope": "group"}] if book_club else []),
        ]},
        {"key": "conversion", "once": True, "conditions": [
            {"products": entry + big, "operator": "eq", "count": 1, "count_scope": "group"},
        ]},
        # OH 卡独立统计，不是升单前置，不占用转化或大单计数。
        {"key": "assessment", "conditions": [
            {"products": ["oh"], "operator": "gte", "count": 1, "count_scope": "group"},
        ]},
        {"key": "upsell", "previous_stage": "conversion", "count_from": "previous_stage", "once": True, "conditions": [
            {"products": big, "operator": "gte", "count": 1, "count_scope": "group"},
        ]},
        {"key": "repurchase", "previous_stage": "upsell", "count_from": "previous_stage", "conditions": [
            {"products": big, "operator": "gte", "count": 1, "count_scope": "group"},
        ]},
    ]


def classify_purchases(events: list[dict], rules: list[dict] | None = None) -> None:
    """先按完整购买和上课历史分类，再由调用方筛选周期；组合计数允许跨项目累计。"""
    from collections import defaultdict

    counts = defaultdict(int)
    previous_counts = defaultdict(dict)
    group_counts = defaultdict(int)
    condition_subtype_counts = defaultdict(int)
    customer_counts = defaultdict(int)
    achieved_stages = defaultdict(set)
    configured = course_rule_catalog.normalize_rules(list_rules() if rules is None else rules)
    timeline = sorted(events, key=lambda item: (
        (item.get("deal_date") or "") if item.get("kind") == "coarse_usage" else item.get("date", ""),
        item.get("recorded_at", ""), item.get("id", ""),
    ))

    def matches_item(item, product, subtype):
        selected_product, selected_subtype = parse_item(item)
        return selected_product == product and (not selected_subtype or selected_subtype == subtype)

    for event in timeline:
        product, subtype, customer = event["product"], event.get("subtype") or "", event["customer_id"]
        event_kind = "attendance" if event.get("kind") == "attendance" else "purchase"
        if event_kind == "attendance" and product == "class":
            subtype = course_rule_catalog.resolve_key("class:" + subtype).partition(":")[2]
        occurrence = counts[(customer, event_kind, product, subtype)] + 1
        matches = []
        for rule_index, rule in enumerate(configured):
            matched = False
            if rule.get("count_from") == "previous_stage" and rule.get("previous_stage") not in achieved_stages[customer]:
                continue
            for index, condition in enumerate(rule["conditions"]):
                if condition.get("event_kind", "purchase") != event_kind:
                    continue
                if condition.get("public_welfare_only") and event.get("is_public_welfare") is not True:
                    continue
                selected = condition.get("products") or [condition.get("product", "")]
                if not any(matches_item(item, product, subtype) for item in selected):
                    continue
                group_key = (customer, rule_index, index)
                group_counts[group_key] += 1
                subtype_key = (*group_key, product, subtype)
                condition_subtype_counts[subtype_key] += 1
                count = group_counts[group_key] if condition.get("count_scope") == "group" else condition_subtype_counts[subtype_key]
                previous = condition.get("previous_products") or []
                prior_match = not previous or any(
                    times > 0 and any(matches_item(item, prior_product, prior_subtype) for item in previous)
                    for (prior_product, prior_subtype), times in previous_counts[customer].items()
                )
                excluded = condition.get("excluded_previous_products") or []
                if any(
                    times > 0 and any(matches_item(item, prior_product, prior_subtype) for item in excluded)
                    for (prior_product, prior_subtype), times in previous_counts[customer].items()
                ):
                    continue
                if condition.get("first_purchase") and customer_counts[customer]:
                    continue
                if prior_match and (count == condition["count"] or (condition["operator"] == "gte" and count >= condition["count"])):
                    matched = True
            # 仅看此前记录达到的阶段，本笔完成后再更新，避免一笔连跳多个阶段。
            previous_stage = rule.get("previous_stage")
            if previous_stage and previous_stage not in achieved_stages[customer]:
                matched = False
            if rule.get("once") and rule["key"] in achieved_stages[customer]:
                matched = False
            if matched:
                matches.append(rule["key"])
        # 历史配置仍可能存在冲突：明确标记，不能重复计入转化、升单、复购。
        conflicts = [key for key in matches if key in {"conversion", "upsell", "repurchase"}]
        if len(conflicts) > 1:
            matches = [key for key in matches if key not in conflicts]
        else:
            conflicts = []
        event["purchase_rule_conflicts"] = conflicts
        achieved_stages[customer].update(matches)
        counts[(customer, event_kind, product, subtype)] += 1
        if event_kind == "purchase":
            previous_counts[customer][(product, subtype)] = occurrence
            customer_counts[customer] += 1
        event["repeat_times"] = occurrence
        event["purchase_rule_keys"] = matches
        event["purchase_rule_labels"] = [PURCHASE_RULE_LABELS[key] for key in matches] + (["规则冲突"] if conflicts else [])
        event["classification"] = "、".join(event["purchase_rule_labels"]) or ("未匹配" if event_kind == "attendance" else "其他成交")
        event["is_upsell"] = "upsell" in matches



def classify_visible_events(events: list[dict], *, until: str) -> None:
    """同一客户的阶段不随查看人权限改变，仅回填可见事件的分类结果。"""
    from app.services import course_workflow_service

    ids = {e["customer_id"] for e in events}
    history = [e for e in course_workflow_service.active_events(course_workflow_service.stage_events(), until)
               if e["customer_id"] in ids]
    classify_purchases(history)

    def event_key(event):
        identifier = event["id"].removeprefix("purchase:") if event.get("kind") == "purchase" else event["id"]
        return event["customer_id"], identifier

    classified = {event_key(e): e for e in history}
    for event in events:
        item = classified.get(event_key(event))
        # 没有有效来源时不能以不完整的可见记录重新推算阶段。
        event.update({"purchase_rule_keys": [], "purchase_rule_labels": [], "purchase_rule_conflicts": [],
                      "classification": "未匹配" if event.get("kind") == "attendance" else "其他成交", "is_upsell": False})
        if item:
            for field in ("purchase_rule_keys", "purchase_rule_labels", "purchase_rule_conflicts", "classification", "is_upsell", "repeat_times"):
                event[field] = item[field]


def preview_rules(rules: list[dict]) -> list[dict]:
    """只用模拟行为顺序预览分类，不读取或写入客户业务记录。"""
    cases = [
        ("公益读书会", ["attendance:class:读书会"]),
        ("粗门次卡", ["coarse"]),
        ("首次买 198 单次", ["membership:次卡"]),
        ("首次买 398", ["membership:体验会员"]),
        ("首次买陪伴营", ["companion_camp"]),
        ("首次买大单", ["membership:30次卡"]),
        ("OH卡诊断", ["oh"]),
        ("OH卡诊断 → 首次买大单", ["oh", "energy"]),
        ("公益读书会 → 198 单次", ["attendance:class:读书会", "membership:次卡"]),
        ("198 单次 → 398", ["membership:次卡", "membership:体验会员"]),
        ("198 单次 → 398 → 大单", ["membership:次卡", "membership:体验会员", "energy"]),
        ("198 单次 → 大单 → 陪伴营", ["membership:次卡", "energy", "companion_camp"]),
        ("粗门次卡 → 首次买大单", ["coarse", "membership:30次卡"]),
        ("398 → 再买 398", ["membership:体验会员", "membership:体验会员"]),
        ("398 → OH卡诊断 → 大单", ["membership:体验会员", "oh", "energy"]),
        ("大单 → 大单", ["group_case", "energy"]),
        ("大单 → OH卡诊断 → 大单", ["group_case", "oh", "energy"]),
        ("大单 → 大单 → 大单", ["group_case", "energy", "online_tea"]),
        ("398 → 30 次卡 → 60 次卡", ["membership:体验会员", "membership:30次卡", "membership:60次卡"]),
        ("大单 → 次卡 → 首次买 398", ["membership:30次卡", "membership:次卡", "membership:体验会员"]),
    ]
    book_club = course_rule_catalog.book_club_key()
    book_label = next((item["label"] for item in course_rule_catalog.activities() if item["key"] == book_club), "")
    cases = [(title.replace("读书会", book_label), ["attendance:" + book_club if item == "attendance:class:读书会" else item for item in items])
             for title, items in cases if book_club or "attendance:class:读书会" not in items]
    cases.extend(("参加公益课程 · " + item["label"], ["attendance:" + item["key"]])
                 for item in course_rule_catalog.activities() if item["key"] != book_club)
    rows = []
    for title, items in cases:
        events = []
        for index, item in enumerate(items):
            attendance = item.startswith("attendance:")
            product, subtype = parse_item(item.removeprefix("attendance:"))
            events.append({"id": str(index), "customer_id": "preview", "kind": "attendance" if attendance else "purchase",
                           "is_public_welfare": attendance,
                           "product": product, "subtype": subtype, "date": f"2026-01-{index + 1:02d}"})
        classify_purchases(events, rules)
        rows.append({"journey": title, "classification": events[-1]["classification"]})
    return rows


def replace_levels(levels: list[UpsellLevel]) -> list[dict]:
    """整体保存：前端一次提交排好序的大类列表。"""
    with _lock:
        normalized: list[UpsellLevel] = []
        for level in levels:
            level_id = level.id or uuid.uuid4().hex[:12]
            normalized.append(level.model_copy(update={"id": level_id}))
        global _levels
        _levels = normalized
        save_data(UPSELL_FILE, {"order": {"levels": [level.model_dump(mode="json") for level in _levels]}})
    return list_levels()


def parse_item(item: str) -> tuple[str, str]:
    """把配置项拆成（付费项目, 卡种）；卡种为空表示这个大项下的所有卡种。"""
    product, _, subtype = item.partition(":")
    return product, subtype


def level_order() -> list[list[tuple[str, str]]]:
    """按升单顺序返回每一档包含的项目，每项是（付费项目, 卡种）。"""
    return [[parse_item(item) for item in level.products] for level in _levels]
