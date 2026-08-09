from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.services import payment_export_service, position_permission_service

router = APIRouter(prefix="/api/payment-exports", tags=["payment-exports"])


@router.get("/export")
def export_payment_records(request: Request):
    user_role = getattr(request.state, "user_role", "")
    if user_role in {"", "customer", "system"}:
        raise HTTPException(status_code=403, detail="无权导出付费记录")
    if user_role != "超级管理员":
        page_permissions = position_permission_service.get_permissions(user_role)
        if "payment" not in page_permissions:
            raise HTTPException(status_code=403, detail="无付费项目页面权限")

    output, record_count = payment_export_service.build_payment_export(user_role)
    filename = f"付费项目_{date.today().isoformat()}.xlsx"
    disposition = (
        f'attachment; filename="payment_records_{date.today().isoformat()}.xlsx"; '
        f"filename*=UTF-8''{quote(filename)}"
    )
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": disposition,
            "X-Export-Count": str(record_count),
        },
    )
