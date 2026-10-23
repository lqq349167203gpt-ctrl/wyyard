"""实际上课规则的课程目录：可配置类型用固定编号，兼容旧名称。"""
from copy import deepcopy

from app.services import course_type_service


def activities():
    from app.api.statistics import COURSE_ACTIVITY_TYPES

    items = [{"key": "class:" + row["id"], "label": row["name"], "parent": "class"}
             for row in course_type_service.list_course_types() if row.get("category") != "other"]
    items.extend({"key": kind, "label": label, "parent": kind}
                 for kind, label, _ in COURSE_ACTIVITY_TYPES if kind != "class")
    return items


def resolve_key(key):
    if not key.startswith("class:"):
        return key
    value = key.partition(":")[2]
    for row in course_type_service.list_course_types():
        if value == row["id"] or value == row["name"] or value in row.get("previous_names", []):
            return "class:" + row["id"]
    return key


def book_club_key():
    for row in course_type_service.list_course_types():
        if row.get("category") != "other" and row.get("rule_purpose") == "experience_book_club":
            return "class:" + row["id"]
    return ""


def normalize_rules(rules):
    result = deepcopy(rules)
    for rule in result:
        for condition in rule["conditions"]:
            if condition.get("event_kind") != "attendance":
                continue
            if condition.get("product"):
                condition["product"] = resolve_key(condition["product"])
            if condition.get("products"):
                condition["products"] = list(dict.fromkeys(resolve_key(key) for key in condition["products"]))
    return result


def missing_rules(rules):
    valid = {item["key"] for item in activities()}
    return sorted({key for rule in normalize_rules(rules) for condition in rule["conditions"]
                   if condition.get("event_kind") == "attendance"
                   for key in condition.get("products") or [condition.get("product", "")]
                   if key not in valid})
