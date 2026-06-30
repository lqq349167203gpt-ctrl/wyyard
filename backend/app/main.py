from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import settings
from app.middleware.operation_logging import OperationLogMiddleware

from app.api.agents import router as agents_router

from app.api.customers import router as customers_router
from app.api.ai_configs import router as ai_configs_router
from app.api.customer_ai_config import router as customer_ai_config_router
from app.api.visits import router as visits_router
from app.api.courses import router as courses_router
from app.api.spaces import router as spaces_router
from app.api.course_types import router as course_types_router
from app.api.class_records import router as class_records_router
from app.api.group_cases import router as group_cases_router
from app.api.group_case_sessions import router as group_case_sessions_router
from app.api.energy_knots import router as energy_knots_router
from app.api.membership_cards import router as membership_cards_router
from app.api.emotional_releases import router as emotional_releases_router
from app.api.internal_courses import router as internal_courses_router
from app.api.other_projects import router as other_projects_router
from app.api.emotional_release_sessions import router as emotional_release_sessions_router
from app.api.oh_card_readings import router as oh_card_readings_router
from app.api.oh_card_reading_sessions import router as oh_card_reading_sessions_router
from app.api.energy_knot_sessions import router as energy_knot_sessions_router
from app.api.internal_course_sessions import router as internal_course_sessions_router
from app.api.member_identities import router as member_identities_router
from app.api.uploads import router as uploads_router
from app.api.healing_records import router as healing_records_router
from app.api.customer_detail import router as customer_detail_router
from app.api.system_logs import router as system_logs_router
from app.api.operation_logs import router as operation_logs_router
from app.api.accounts import router as accounts_router
from app.api.position_permissions import router as position_permissions_router
from app.api.positions import router as positions_router
from app.api.position_customer_permissions import router as position_customer_permissions_router
from app.api.daily_groupings import router as daily_groupings_router
from app.api.activity_permissions import router as activity_permissions_router
from app.api.reminders import router as reminders_router
from app.api.business_reminders import router as business_reminders_router
from app.api.organizations import router as organizations_router
from app.api.activity_themes import router as activity_themes_router
from app.api.activity_orders import router as activity_orders_router
from app.api.project_deductions import router as project_deductions_router
from app.api.project_refunds import router as project_refunds_router
from app.api.system_helper import router as system_helper_router
from app.api.system_helper_config import router as system_helper_config_router
from app.api.chat_history import router as chat_history_router
from app.api.consumption_records import router as consumption_records_router
from app.api.activity_history import router as activity_history_router
from app.api.visit_history import router as visit_history_router
from app.api.wechat import router as wechat_router

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(OperationLogMiddleware)


app.include_router(agents_router)

app.include_router(customers_router)
app.include_router(ai_configs_router)
app.include_router(customer_ai_config_router)
app.include_router(visits_router)
app.include_router(courses_router)
app.include_router(spaces_router)
app.include_router(course_types_router)
app.include_router(class_records_router)
app.include_router(group_cases_router)
app.include_router(group_case_sessions_router)
app.include_router(energy_knots_router)
app.include_router(membership_cards_router)
app.include_router(emotional_releases_router)
app.include_router(internal_courses_router)
app.include_router(other_projects_router)
app.include_router(emotional_release_sessions_router)
app.include_router(oh_card_readings_router)
app.include_router(oh_card_reading_sessions_router)
app.include_router(energy_knot_sessions_router)
app.include_router(internal_course_sessions_router)
app.include_router(member_identities_router)
app.include_router(uploads_router)
app.include_router(healing_records_router)
app.include_router(customer_detail_router)
app.include_router(system_logs_router)
app.include_router(operation_logs_router)
app.include_router(accounts_router)
app.include_router(position_permissions_router)
app.include_router(positions_router)
app.include_router(position_customer_permissions_router)
app.include_router(daily_groupings_router)
app.include_router(activity_permissions_router)
app.include_router(reminders_router)
app.include_router(business_reminders_router)
app.include_router(organizations_router)
app.include_router(activity_themes_router)
app.include_router(activity_orders_router)
app.include_router(project_deductions_router)
app.include_router(project_refunds_router)
app.include_router(system_helper_router)
app.include_router(system_helper_config_router)
app.include_router(chat_history_router)
app.include_router(consumption_records_router)
app.include_router(activity_history_router)
app.include_router(visit_history_router)
app.include_router(wechat_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
