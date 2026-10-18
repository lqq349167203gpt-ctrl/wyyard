"""付费资源共用读取契约：可见范围由资源路由执行，筛选先于分页。"""
import json
from collections import Counter

from fastapi import HTTPException, Request

from app.utils.customer_record_search import filter_customer_records
from app.utils.pagination import paginate


def _selection(params, key):
    value = params.get(key, '')
    if not value:
        return set()
    try:
        values = json.loads(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail='筛选选项格式不正确') from None
    if not isinstance(values, list) or any(not isinstance(item, str) for item in values):
        raise HTTPException(status_code=422, detail='筛选选项应为文本列表')
    return set(values)


def scope_filter_options(items: list[dict]) -> dict:
    """下拉只保留整表里真实出现过的成交归属和成交课程。"""
    courses: dict[str, str] = {}
    organizations: dict[str, str] = {}
    unassigned_course = False
    for item in items:
        key = str(item.get('deal_course_key') or '').strip()
        if key:
            courses.setdefault(key, str(item.get('deal_course_name') or '').strip() or key)
        else:
            unassigned_course = True
        organization_id = str(item.get('organization_id') or '').strip()
        if organization_id:
            organizations.setdefault(organization_id, str(item.get('organization_name') or '').strip())
    return {
        'deal_course_options': [
            {'key': key, 'name': name}
            for key, name in sorted(courses.items(), key=lambda row: (row[1], row[0]))
        ],
        'organization_options': [
            {'id': organization_id, 'name': name}
            for organization_id, name in sorted(organizations.items(), key=lambda row: (row[1], row[0]))
        ],
        'unassigned_course': unassigned_course,
    }


def coarse_door_course_key(item: dict) -> tuple[str, str]:
    """粗门列表里的成交课程就是被抵扣的那堂课。"""
    activity_type = str(item.get('source_activity_type') or '').strip()
    activity_id = str(item.get('source_activity_id') or '').strip()
    if not activity_type or not activity_id:
        return '', ''
    key = f'{activity_type}:{activity_id}'
    return key, str(item.get('source_activity_name') or '').strip() or key


def coarse_door_scope_filter_options(items: list[dict]) -> dict:
    """下拉取抵扣记录上的课程，不读空着的成交归因字段。"""
    annotated = []
    for item in items:
        key, name = coarse_door_course_key(item)
        annotated.append({**item, 'deal_course_key': key, 'deal_course_name': name})
    return scope_filter_options(annotated)


def matches_coarse_door_scope(item: dict, organization_id: str = '', deal_course_key: str = '') -> bool:
    key, _name = coarse_door_course_key(item)
    return matches_payment_scope(
        {**item, 'deal_course_key': key},
        organization_id,
        deal_course_key,
    )


def matches_payment_scope(item: dict, organization_id: str = '', deal_course_key: str = '') -> bool:
    """空值用 __none__ 表示未填成交归属或与课程无关。"""
    def matches(current, selected):
        if not selected:
            return True
        value = str(current or '').strip()
        if selected == '__none__':
            return not value
        return value == selected

    return matches(item.get('organization_id'), organization_id) and matches(item.get('deal_course_key'), deal_course_key)


def payment_list_response(request: Request, items: list[dict], page, page_size, *, subtype_field='', decorate=None, nickname=None):
    items = filter_customer_records(items, nickname)
    params = getattr(request, 'query_params', {})
    creators = _selection(params, 'creator_names')
    subtypes = _selection(params, 'subtypes')
    include_options = params.get('include_filter_options') == 'true'
    organization_id = str(params.get('organization_id', '') or '').strip()
    deal_course_key = str(params.get('deal_course_key', '') or '').strip()
    options = {}
    if include_options:
        def counts(field):
            values = Counter(str(item.get(field) or '').strip() for item in items)
            return [{'name': name, 'count': count} for name, count in sorted(values.items(), key=lambda row: (-row[1], row[0])) if name]
        options = {
            'creator_options': counts('created_by'),
            'subtype_options': counts(subtype_field) if subtype_field else [],
            **scope_filter_options(items),
        }
    keyword = params.get('keyword', '').strip().casefold()
    items = filter_customer_records(items, keyword)
    selected = [item for item in items
                if (not creators or str(item.get('created_by') or '').strip() in creators)
                and (not subtypes or (subtype_field and str(item.get(subtype_field) or '').strip() in subtypes))
                and matches_payment_scope(item, organization_id, deal_course_key)]
    # 先按成交日期统一排序，再分页，避免补录旧单排在近期成交前面。
    selected.sort(key=lambda item: (
        str(item.get('deal_date') or ''),
        str(item.get('created_at') or ''),
        str(item.get('id') or ''),
    ), reverse=True)
    result = paginate(selected, page, page_size or 10) if page is not None else None
    returned = result['items'] if result is not None else selected
    from app.services.payment_course_service import fill_course_organizations

    fill_course_organizations(returned)
    if decorate:
        for item in returned:
            decorate(item)
    return {**result, **options} if result is not None else returned
