import asyncio

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from starlette.requests import Request as StarletteRequest

from app.middleware.rate_limit import limiter
from app.models.chat_history import ChatRecordCreate
from app.models.customer import CustomerCreate
from app.services import activity_chat as activity_chat_service
from app.services import chat_history_service, customer_service, voice_parser
from app.services import customer_chat as customer_chat_service
from app.services import visit_chat as visit_chat_service

router = APIRouter(prefix="/api/voice", tags=["voice"])


class VoiceParseRequest(BaseModel):
    text: str


class VoiceAudioRequest(BaseModel):
    audio_base64: str
    format: str = "mp3"


# 音频 base64 长度上限：base64 开销约 33%，14MB 音频 ≈ 1870 万字符，取 1900 万封顶
# （对齐 system_helper.py 图片上传 14MB 量级，防止超大音频刷 ASR/LLM 费用）
MAX_AUDIO_BASE64_LEN = 19_000_000


def _check_audio_size(audio_base64: str) -> None:
    """校验音频 base64 长度，超限返回 413"""
    if len(audio_base64) > MAX_AUDIO_BASE64_LEN:
        raise HTTPException(status_code=413, detail="音频数据过大，请缩短录音时长后重试")


class SaveErrorRequest(BaseModel):
    error: str
    previous_data: dict = {}


@router.post("/parse-customer")
async def parse_customer_voice(req: VoiceParseRequest):
    """从语音识别文字中提取客户信息"""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="语音识别内容为空")
    result = await voice_parser.parse_voice_input(req.text)
    return result


@router.post("/transcribe")
@limiter.limit("10/minute")
async def transcribe_audio(req: VoiceAudioRequest, request: StarletteRequest):
    """纯 ASR：音频转文字，不做提取"""
    if not req.audio_base64:
        raise HTTPException(status_code=400, detail="音频数据为空")
    _check_audio_size(req.audio_base64)
    text = await asyncio.to_thread(voice_parser.transcribe_audio, req.audio_base64, req.format)
    if not text:
        raise HTTPException(status_code=400, detail="语音识别为空，请重新录音")
    return {"text": text}


@router.post("/parse-customer-audio")
@limiter.limit("10/minute")
async def parse_customer_audio(req: VoiceAudioRequest, request: StarletteRequest):
    """从音频中提取客户信息（ASR + LLM）"""
    if not req.audio_base64:
        raise HTTPException(status_code=400, detail="音频数据为空")
    _check_audio_size(req.audio_base64)
    # 1. 音频转文字
    text = await asyncio.to_thread(voice_parser.transcribe_audio, req.audio_base64, req.format)
    if not text:
        raise HTTPException(status_code=400, detail="语音识别为空，请重新录音")
    # 2. 文字提取客户信息
    result = await voice_parser.parse_voice_input(text)
    # 附带识别文字，方便前端展示
    result["recognized_text"] = text
    return result


@router.post("/analyze-save-error")
async def analyze_save_error(req: SaveErrorRequest):
    """分析保存失败原因，返回修改建议和修正后的数据"""
    if not req.error.strip():
        raise HTTPException(status_code=400, detail="错误信息为空")
    result = await voice_parser.analyze_save_error(req.error, req.previous_data)
    return result


class ValidateCustomerRequest(BaseModel):
    data: dict


class ModifyCustomerRequest(BaseModel):
    current_data: dict
    instruction: str


@router.post("/validate-customer")
async def validate_customer(req: ValidateCustomerRequest):
    """校验客户数据能否保存（检查昵称/手机号/微信号是否重复）"""
    # 剥离 id（修改场景会带 id，CustomerCreate 不接受）
    exclude_id = req.data.get("id", "")
    clean_data = {k: v for k, v in req.data.items() if k != "id"}
    try:
        customer = CustomerCreate(**clean_data)
    except Exception as e:
        return {"valid": False, "error": f"数据格式错误: {str(e)[:100]}"}
    error = customer_service.validate_customer_data(customer, exclude_id=exclude_id)
    if error:
        return {"valid": False, "error": error}
    return {"valid": True}


@router.post("/modify-customer")
async def modify_customer(req: ModifyCustomerRequest):
    """根据用户指令修改现有客户数据"""
    if not req.instruction.strip():
        raise HTTPException(status_code=400, detail="修改指令为空")
    result = await voice_parser.modify_customer_data(req.current_data, req.instruction)
    return result


class CustomerChatRequest(BaseModel):
    message: str
    history: list = []


@router.post("/customer-chat")
async def customer_chat(req: CustomerChatRequest, request: Request):
    """客户对话：理解意图 → 执行操作 → 返回自然语言回复"""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="消息为空")
    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""
    role = getattr(request.state, "user_role", "") or ""
    result = await customer_chat_service.customer_chat(
        req.message,
        req.history,
        operator=operator,
        role=role,
    )

    # 写入沟通记录
    try:
        user_id = getattr(request.state, "user_id", "") or ""
        user_name = getattr(request.state, "user_name", "") or ""
        user_role = getattr(request.state, "user_role", "") or ""
        session_id = f"voice-customer-{user_id}"
        chat_history_service.save_message(ChatRecordCreate(
            user_id=user_id, user_name=user_name, user_role=user_role,
            role="user", content=req.message, session_id=session_id, mode="customer",
        ))
        chat_history_service.save_message(ChatRecordCreate(
            user_id=user_id, user_name=user_name, user_role=user_role,
            role="assistant", content=result.get("reply", ""), session_id=session_id, mode="customer",
        ))
    except Exception as e:
        print(f"[voice] 写沟通记录失败: {e}")

    return result


class VisitChatRequest(BaseModel):
    message: str
    history: list = []
    date: str
    space_id: str = ""


@router.post("/visit-chat")
async def visit_chat(req: VisitChatRequest, request: Request):
    """邀约对话：理解意图 → 执行操作 → 返回自然语言回复"""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="消息为空")
    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""
    result = await visit_chat_service.visit_chat(
        req.message, req.history, req.date, req.space_id, operator=operator
    )

    # 写入沟通记录
    try:
        user_id = getattr(request.state, "user_id", "") or ""
        user_name = getattr(request.state, "user_name", "") or ""
        user_role = getattr(request.state, "user_role", "") or ""
        session_id = f"voice-visit-{user_id}-{req.date}"
        chat_history_service.save_message(ChatRecordCreate(
            user_id=user_id, user_name=user_name, user_role=user_role,
            role="user", content=req.message, session_id=session_id, mode="visit",
        ))
        chat_history_service.save_message(ChatRecordCreate(
            user_id=user_id, user_name=user_name, user_role=user_role,
            role="assistant", content=result.get("reply", ""), session_id=session_id, mode="visit",
        ))
    except Exception as e:
        print(f"[voice] 写沟通记录失败: {e}")

    return result


class ActivityChatRequest(BaseModel):
    message: str
    history: list = []
    date: str
    space_id: str = ""


@router.post("/activity-chat")
async def activity_chat(req: ActivityChatRequest, request: Request):
    """课表对话：理解意图 → 执行操作 → 返回自然语言回复"""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="消息为空")
    operator = getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", "") or ""
    result = await activity_chat_service.activity_chat(
        req.message, req.history, req.date, req.space_id, operator=operator
    )

    # 写入沟通记录
    try:
        user_id = getattr(request.state, "user_id", "") or ""
        user_name = getattr(request.state, "user_name", "") or ""
        user_role = getattr(request.state, "user_role", "") or ""
        session_id = f"voice-activity-{user_id}-{req.date}"
        chat_history_service.save_message(ChatRecordCreate(
            user_id=user_id, user_name=user_name, user_role=user_role,
            role="user", content=req.message, session_id=session_id, mode="activity",
        ))
        chat_history_service.save_message(ChatRecordCreate(
            user_id=user_id, user_name=user_name, user_role=user_role,
            role="assistant", content=result.get("reply", ""), session_id=session_id, mode="activity",
        ))
    except Exception as e:
        print(f"[voice] 写沟通记录失败: {e}")

    return result
