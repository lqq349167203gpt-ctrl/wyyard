import json
import uuid
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from app.config.settings import settings
from app.services import system_helper_config_service
from app.services.chat_history_service import save_message
from app.models.chat_history import ChatRecordCreate

router = APIRouter(prefix="/api/system-helper", tags=["system-helper"])


class ChatMessage(BaseModel):
    role: str
    content: str


class SystemHelperRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    user_id: str = ""
    user_name: str = ""
    user_role: str = ""
    permissions: list[str] = []


# 权限与页面的映射关系
PERMISSION_PAGE_MAP = {
    "business-reminders": ("业务提醒", "/business-reminders"),
    "traffic-records": ("引流记录", "/traffic-records"),
    "activity-records": ("活动记录", "/activity-records"),
    "healing-records": ("客户信息", "/healing-records"),
    "class-records": ("人员安排", "/courses/class-records"),
    "class-records-visitors": ("人员安排", "/courses/class-records"),
    "class-records-activities": ("活动安排", "/courses/daily-activities"),
    "class-records-arrival": ("到场确认", "/courses/class-records"),
    "daily-activities": ("活动安排", "/courses/daily-activities"),
    "membership-cards": ("会员活动", "/payment/membership-cards"),
    "group-cases": ("觉醒游戏", "/payment/group-cases"),
    "emotional-releases": ("情绪释放", "/payment/emotional-releases"),
    "energy-knots": ("能量结", "/payment/energy-knots"),
    "internal-courses": ("内部课程", "/payment/internal-courses"),
    "other-projects": ("其他项目", "/other-projects"),
    "courses": ("活动配置", "/positions/courses"),
    "member-identities": ("会员身份", "/config/member-identities"),
    "healing-identities": ("疗愈老师", "/healing-identities"),
    "organizations": ("组织管理", "/organizations"),
    "spaces": ("疗愈空间", "/courses/spaces"),
    "reminders": ("提醒配置", "/config/reminders"),
    "position-management": ("账号管理", "/positions/management"),
    "agents": ("AI 配置", "/agents"),
    "system-logs": ("系统日志", "/system-logs"),
    "operation-logs": ("操作日志", "/operation-logs"),
}


def build_filtered_prompt(base_prompt: str, user_role: str, permissions: list[str]) -> str:
    """根据用户权限过滤系统提示词中的页面清单"""
    if user_role == "超级管理员":
        return base_prompt

    allowed_routes = set()
    for perm in permissions:
        if perm in PERMISSION_PAGE_MAP:
            _, route = PERMISSION_PAGE_MAP[perm]
            allowed_routes.add(route)

    if not allowed_routes:
        return base_prompt + "\n\n注意：当前用户没有配置任何页面权限，请告知用户联系管理员配置权限。"

    permission_hint = f"\n\n注意：当前用户角色为「{user_role}」，只拥有以下页面的访问权限：{', '.join(sorted(allowed_routes))}。请只回复用户有权限访问的页面，对于没有权限的页面，告知用户需要联系管理员开通权限。"
    return base_prompt + permission_hint


@router.post("/chat")
async def chat(data: SystemHelperRequest):
    config = system_helper_config_service.get_config()

    llm = ChatOpenAI(
        model=config.model or settings.llm_model,
        api_key=config.api_key or settings.llm_api_key,
        base_url=config.base_url or settings.llm_base_url,
        temperature=config.temperature if config.temperature is not None else 0.7,
        max_tokens=config.max_tokens or 4096,
        streaming=True,
    )

    system_prompt = build_filtered_prompt(config.system_prompt, data.user_role, data.permissions)

    messages = [SystemMessage(content=system_prompt)]
    for msg in data.history:
        if msg.role == "user":
            messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            messages.append(AIMessage(content=msg.content))
    messages.append(HumanMessage(content=data.message))

    # 保存用户消息
    session_id = str(uuid.uuid4())[:8]
    if data.user_id:
        save_message(ChatRecordCreate(
            user_id=data.user_id,
            user_name=data.user_name,
            user_role=data.user_role,
            role="user",
            content=data.message,
            session_id=session_id,
        ))

    async def generate():
        full_content = ""
        for chunk in llm.stream(messages):
            if chunk.content:
                full_content += chunk.content
                yield f"data: {json.dumps({'content': chunk.content})}\n\n"
        yield "data: [DONE]\n\n"

        # 保存 AI 回复
        if data.user_id and full_content:
            save_message(ChatRecordCreate(
                user_id=data.user_id,
                user_name=data.user_name,
                user_role=data.user_role,
                role="assistant",
                content=full_content,
                session_id=session_id,
            ))

    return StreamingResponse(generate(), media_type="text/event-stream")
