"""本人活动核销码；到店和扣卡统一调用邀约已有业务逻辑。"""

import base64
import io
import time
from datetime import datetime, timezone

import jwt
from fastapi import HTTPException

from app.config.settings import settings
from app.services import customer_service, storage, visit_service

FILENAME = "activity_checkins.json"
PREFIX = "WYCI:"


def _activity(customer_id: str, activity_key: str):
    from app.api.customer_detail import _build_activities

    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise HTTPException(404, "客户信息不存在")
    activity = next((a for a in _build_activities(customer_id) if a["activity_key"] == activity_key), None)
    if not activity or activity.get("withdrawn"):
        raise HTTPException(400, "该客户未参与此活动或已退课，无法核销")
    visits = [v for v in visit_service.list_basic_visits({customer_id})
              if v.visit_date == activity["date"] and not v.cancelled]
    if not visits:
        raise HTTPException(400, "该活动尚未关联有效的当天邀约，请先录入邀约")
    # 到店口径按客户当天判断，优先沿用已到店的记录，避免多条邀约重复扣卡。
    visit = next((v for v in visits if v.arrived), visits[0])
    return customer, activity, visit


def create_code(customer_id: str, activity_key: str):
    import qrcode

    _activity(customer_id, activity_key)
    expires = int(time.time()) + 600
    token = jwt.encode({"cid": customer_id, "activity": activity_key, "exp": expires,
                        "iss": "wyyard-checkin", "aud": "activity-checkin"},
                       settings.jwt_secret, algorithm="HS256")
    image = qrcode.make(PREFIX + token)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return {"image": "data:image/png;base64," + base64.b64encode(output.getvalue()).decode(), "expires_at": expires}


def _decode(code: str):
    if not code.startswith(PREFIX):
        raise HTTPException(400, "请扫描有效的活动核销二维码")
    try:
        payload = jwt.decode(code[len(PREFIX):], settings.jwt_secret, algorithms=["HS256"],
                             issuer="wyyard-checkin", audience="activity-checkin",
                             options={"require": ["cid", "activity", "exp"]})
        return str(payload["cid"]), str(payload["activity"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(400, "二维码已过期，请会员刷新后重新出示")
    except jwt.InvalidTokenError:
        raise HTTPException(400, "二维码无效，请重新出示")


def inspect_code(code: str, request):
    from app.services import customer_access_service

    customer_id, activity_key = _decode(code)
    customer_access_service.require_customer_scope(request, customer_id, action="核销")
    customer, activity, visit = _activity(customer_id, activity_key)
    event_id = f"{customer_id}:{activity_key}"
    existing = storage.load_item(FILENAME, event_id)
    return {"customer_id": customer_id, "nickname": customer.nickname or customer.name,
            "activity_key": activity_key, "date": activity["date"], "name": activity["name"],
            "type": activity.get("course_type") or activity["type"], "role": activity["role"],
            "arrived": visit.arrived, "checked": bool(existing), "visit_id": visit.id}, visit


def confirm(code: str, request):
    from app.services import visit_verification_service

    info, visit = inspect_code(code, request)
    event_id = f'{info["customer_id"]}:{info["activity_key"]}'
    if info["checked"]:
        if not visit.arrived:
            raise HTTPException(409, "该活动核销后到店状态已被调整，请在邀约页面确认")
        request.state.skip_operation_log = True
        return {**info, "message": "该活动已核销，无需重复操作"}
    was_arrived = visit.arrived
    if not was_arrived:
        visit_verification_service.ensure_update_allowed(visit, {"arrived": True})
        try:
            updated = visit_service.update_visit(visit.id, {"arrived": True})
            if updated is None:
                raise HTTPException(404, "邀约记录不存在，请重新扫码")
        except ValueError as error:
            raise HTTPException(400, str(error))
    event = {**info, "checked": True, "arrived": True,
             "checked_at": datetime.now(timezone.utc).isoformat(),
             "operator_id": request.state.user_id,
             "operator": getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "")}
    storage.save_item(FILENAME, event_id, event)
    request.state.operation_log_context = {
        "entity_id": event_id,
        "content": f'活动核销：{info["nickname"]} · {info["date"]} · {info["name"]} · {info["role"]}；'
                   + ("原已到店，未重复扣卡" if was_arrived else "确认到店，按现有活动规则扣卡"),
        "after_data": {"客户": info["nickname"], "活动日期": info["date"], "活动名称": info["name"],
                       "参与身份": info["role"], "核销时间": event["checked_at"], "核销人": event["operator"]},
    }
    return {**info, "checked": True, "arrived": True, "message": "核销成功"}
