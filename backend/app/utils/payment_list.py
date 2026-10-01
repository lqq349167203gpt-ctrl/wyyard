"""付费资源共用读取契约：可见范围由资源路由执行，筛选先于分页。"""
import json
from collections import Counter

from fastapi import HTTPException, Request

from app.services import customer_service
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


def payment_list_response(request: Request, items: list[dict], page, page_size, *, subtype_field='', decorate=None):
    params = getattr(request, 'query_params', {})
    creators = _selection(params, 'creator_names')
    subtypes = _selection(params, 'subtypes')
    include_options = params.get('include_filter_options') == 'true'
    options = {}
    if include_options:
        def counts(field):
            values = Counter(str(item.get(field) or '').strip() for item in items)
            return [{'name': name, 'count': count} for name, count in sorted(values.items(), key=lambda row: (-row[1], row[0])) if name]
        options = {'creator_options': counts('created_by'), 'subtype_options': counts(subtype_field) if subtype_field else []}
    keyword = params.get('keyword', '').strip().casefold()
    names = {c.id: (c.name or '').casefold() for c in customer_service.list_customers()} if keyword else {}
    selected = [item for item in items
                if (not creators or str(item.get('created_by') or '').strip() in creators)
                and (not subtypes or (subtype_field and str(item.get(subtype_field) or '').strip() in subtypes))
                and (not keyword or keyword in str(item.get('nickname') or '').casefold()
                     or keyword in names.get(item.get('customer_id'), ''))]
    selected.sort(key=lambda item: str(item.get('created_at') or ''), reverse=True)
    result = paginate(selected, page, page_size or 10) if page is not None else None
    returned = result['items'] if result is not None else selected
    if decorate:
        for item in returned:
            decorate(item)
    return {**result, **options} if result is not None else returned
