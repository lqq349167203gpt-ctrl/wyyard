from fastapi import APIRouter, Depends, Query, Request

from app.middleware.jwt_auth import require_page_permission
from app.services import customer_access_service, customer_service, service_teacher_customer_service

router = APIRouter(
    prefix="/api/service-teacher-customers",
    tags=["service-teacher-customers"],
    dependencies=[Depends(require_page_permission("service-teacher"))],
)


def _actor_name(request: Request) -> str:
    return (
        getattr(request.state, "user_owner", "")
        or getattr(request.state, "user_name", "")
        or ""
    ).strip()


@router.get("/metadata")
def get_metadata(request: Request):
    customers = customer_access_service.filter_customers(request, customer_service.list_customers())
    current_teacher = _actor_name(request)
    return {
        "current_teacher": current_teacher,
        "teachers": service_teacher_customer_service.available_teachers(customers, current_teacher),
    }


@router.get("")
def list_customers(
    request: Request,
    service_teacher: str | None = Query(None),
    follow_up_filter: str = Query("inactive_30", pattern="^(inactive_30|active_30|all)$"),
    nickname: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    customers = customer_access_service.filter_customers(request, customer_service.list_customers())
    teacher = (service_teacher or _actor_name(request)).strip()
    return service_teacher_customer_service.list_teacher_customers(
        customers,
        teacher,
        follow_up_filter=follow_up_filter,
        nickname=nickname,
        page=page,
        page_size=page_size,
    )
