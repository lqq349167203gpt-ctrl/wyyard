import io
import logging
import threading
from typing import Any

from app.config.settings import settings

logger = logging.getLogger(__name__)

_model: Any = None
_model_lock = threading.Lock()
_transcribe_lock = threading.Lock()

DOMAIN_PROMPT = "无忧茶苑，客户，邀约，课表，沙龙活动，觉醒游戏，情绪释放，能量结，内部课程。"


def _get_model():
    """按需加载本地 Whisper，避免拖慢不使用语音功能的服务启动。"""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                try:
                    from faster_whisper import WhisperModel

                    _model = WhisperModel(
                        settings.local_asr_model,
                        device=settings.local_asr_device,
                        compute_type=settings.local_asr_compute_type,
                        cpu_threads=settings.local_asr_cpu_threads,
                    )
                except Exception as exc:
                    logger.exception("本地语音模型加载失败")
                    raise RuntimeError("本地语音模型加载失败，请检查模型是否已下载及服务器资源是否充足") from exc
    return _model


def transcribe(audio_bytes: bytes) -> str:
    """使用本地 Whisper 将短音频转换成中文文本，不调用任何收费 API。"""
    if not audio_bytes:
        return ""

    model = _get_model()
    try:
        # CPU 推理串行化，避免多个录音同时识别时耗尽服务器资源。
        with _transcribe_lock:
            segments, _ = model.transcribe(
                io.BytesIO(audio_bytes),
                language="zh",
                beam_size=3,
                vad_filter=True,
                condition_on_previous_text=False,
                initial_prompt=DOMAIN_PROMPT,
            )
            return "".join(segment.text for segment in segments).strip()
    except Exception as exc:
        logger.exception("本地语音识别失败")
        raise RuntimeError("本地语音识别失败，请重新录音后再试") from exc
