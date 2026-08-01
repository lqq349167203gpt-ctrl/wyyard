import json
import time
import uuid
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config.settings import settings
from app.models.base import StrictBaseModel
from app.models.chat_history import ChatRecordCreate
from app.services import position_permission_service, system_helper_config_service
from app.services.ai_entry_service import analyze_image_intent, execute_entry, parse_entry_intent
from app.services.chat_history_service import save_message

router = APIRouter(prefix="/api/system-helper", tags=["system-helper"])

# 简单内存限流：每个用户每分钟最多 10 次请求
_chat_rate: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 10
_RATE_WINDOW = 60


def _check_rate_limit(user_id: str):
    now = time.time()
    _chat_rate[user_id] = [t for t in _chat_rate[user_id] if now - t < _RATE_WINDOW]
    if len(_chat_rate[user_id]) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
    _chat_rate[user_id].append(now)


class ChatMessage(StrictBaseModel):
    role: str
    content: str


class SystemHelperRequest(StrictBaseModel):
    message: str
    history: list[ChatMessage] = []


# 权限与页面的映射关系
PERMISSION_PAGE_MAP = {
    "business-reminders": ("业务提醒", "/business-reminders"),
    "course-statistics": ("课程", "/course-statistics"),
    "traffic-records": ("引流记录", "/traffic-records"),
    "activity-records": ("活动记录", "/activity-records"),
    "healing-records": ("客户信息", "/healing-records"),
    "class-records": ("人员安排", "/courses/class-records"),
    "class-records-visitors": ("人员安排", "/courses/class-records"),
    "class-records-activities": ("活动安排", "/courses/daily-activities"),
    "class-records-arrival": ("到场确认", "/courses/class-records"),
    "daily-activities": ("活动安排", "/courses/daily-activities"),
    "membership-cards": ("会员卡", "/payment/membership-cards"),
    "group-cases": ("觉醒游戏", "/payment/group-cases"),
    "emotional-releases": ("情绪释放", "/payment/emotional-releases"),
    "energy-knots": ("能量结", "/payment/energy-knots"),
    "internal-courses": ("内部课程", "/payment/internal-courses"),
    "other-projects": ("其他项目", "/other-projects"),
    "courses": ("活动配置", "/positions/courses"),
    "member-identities": ("会员身份", "/config/member-identities"),
    "healing-identities": ("疗愈老师", "/healing-identities"),
    "organizations": ("组织信息", "/organizations"),
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
async def chat(data: SystemHelperRequest, request: Request):
    # 从 JWT 中读取身份，不信任客户端
    user_id = getattr(request.state, "user_id", "")
    _check_rate_limit(user_id)
    user_name = getattr(request.state, "user_name", "")
    user_role = getattr(request.state, "user_role", "")
    permissions = position_permission_service.get_permissions(user_role)

    config = system_helper_config_service.get_config()

    llm = ChatOpenAI(
        model=config.model or settings.llm_model,
        api_key=config.api_key or settings.llm_api_key,
        base_url=config.base_url or settings.llm_base_url,
        temperature=config.temperature if config.temperature is not None else 0.7,
        max_tokens=config.max_tokens or 4096,
        streaming=True,
    )

    system_prompt = build_filtered_prompt(config.system_prompt, user_role, permissions)

    messages = [SystemMessage(content=system_prompt)]
    for msg in data.history:
        if msg.role == "user":
            messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            messages.append(AIMessage(content=msg.content))
    messages.append(HumanMessage(content=data.message))

    # 保存用户消息
    session_id = str(uuid.uuid4())[:12]
    if user_id:
        save_message(ChatRecordCreate(
            user_id=user_id,
            user_name=user_name,
            user_role=user_role,
            role="user",
            content=data.message,
            session_id=session_id,
            mode="system",
        ))

    async def generate():
        full_content = ""
        for chunk in llm.stream(messages):
            if chunk.content:
                full_content += chunk.content
                yield f"data: {json.dumps({'content': chunk.content})}\n\n"
        yield "data: [DONE]\n\n"

        # 保存 AI 回复
        if user_id and full_content:
            save_message(ChatRecordCreate(
                user_id=user_id,
                user_name=user_name,
                user_role=user_role,
                role="assistant",
                content=full_content,
                session_id=session_id,
                mode="system",
            ))

    return StreamingResponse(generate(), media_type="text/event-stream")


class ParseEntryRequest(StrictBaseModel):
    message: str
    history: list[ChatMessage] = []


class ExecuteEntryRequest(StrictBaseModel):
    action: str
    data: dict = {}


@router.post("/parse-entry")
async def parse_entry(data: ParseEntryRequest, request: Request):
    user_id = getattr(request.state, "user_id", "")
    _check_rate_limit(user_id)
    history = [{"role": m.role, "content": m.content} for m in data.history]
    result = parse_entry_intent(data.message, history)
    return result


@router.post("/execute-entry")
async def exec_entry(data: ExecuteEntryRequest, request: Request):
    user_id = getattr(request.state, "user_id", "")
    _check_rate_limit(user_id)
    result = execute_entry(data.action, data.data)
    return result


class AnalyzeImageRequest(StrictBaseModel):
    image: str  # base64 encoded image
    text: str = ""
    history: list[ChatMessage] = []

    @staticmethod
    def _validate_image_size(v: str) -> str:
        # base64 开销约 33%，10MB 原始 ≈ 13.3MB base64
        if len(v) > 14_000_000:
            raise ValueError("图片数据过大，请压缩后重试")
        return v

    def __init__(self, **data):
        if "image" in data:
            data["image"] = self._validate_image_size(data["image"])
        super().__init__(**data)


@router.post("/analyze-image")
async def analyze_image(data: AnalyzeImageRequest, request: Request):
    user_id = getattr(request.state, "user_id", "")
    _check_rate_limit(user_id)
    history = [{"role": m.role, "content": m.content} for m in data.history]
    result = analyze_image_intent(data.image, data.text, history)
    return result
