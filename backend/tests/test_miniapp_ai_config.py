import base64

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config.settings import settings
from app.middleware.jwt_auth import decode_token
from app.services import local_speech_service, miniapp_ai_config_service, session_service, voice_parser


def test_loads_singleton_record_without_losing_saved_key(monkeypatch):
    original = miniapp_ai_config_service._config
    saved = {
        "id": "default",
        "provider": "deepseek",
        "model": "deepseek-v4-flash",
        "api_key": "saved-deepseek-key",
        "base_url": "https://api.deepseek.com",
        "temperature": 0.1,
        "max_tokens": 2048,
    }
    monkeypatch.setattr(miniapp_ai_config_service, "load_item", lambda *_: saved)

    try:
        miniapp_ai_config_service._config = None
        miniapp_ai_config_service._load()
        config = miniapp_ai_config_service.get_config()
        assert config.provider == "deepseek"
        assert config.model == "deepseek-v4-flash"
        assert config.api_key == "saved-deepseek-key"
    finally:
        miniapp_ai_config_service._config = original


def test_local_speech_service_transcribes_without_remote_api(monkeypatch):
    captured = {}

    class Segment:
        def __init__(self, text):
            self.text = text

    class Model:
        def transcribe(self, audio, **kwargs):
            captured.update(audio=audio, kwargs=kwargs)
            return [Segment("添加客户"), Segment("张三")], None

    monkeypatch.setattr(local_speech_service, "_get_model", lambda: Model())

    result = local_speech_service.transcribe(b"audio")

    assert result == "添加客户张三"
    assert captured["kwargs"]["language"] == "zh"
    assert captured["kwargs"]["vad_filter"] is True


def test_voice_parser_decodes_audio_for_local_transcription(monkeypatch):
    captured = {}

    def fake_transcribe(audio_bytes):
        captured["audio_bytes"] = audio_bytes
        return "测试语音"

    monkeypatch.setattr(voice_parser, "transcribe_locally", fake_transcribe)

    result = voice_parser.transcribe_audio(base64.b64encode(b"audio").decode(), "mp3")

    assert result == "测试语音"
    assert captured["audio_bytes"] == b"audio"


def test_voice_parser_rejects_invalid_base64():
    with pytest.raises(HTTPException) as exc_info:
        voice_parser.transcribe_audio("not-base64", "mp3")

    assert exc_info.value.status_code == 400


def test_dev_login_token_can_access_protected_api(client, monkeypatch):
    monkeypatch.setattr(settings, "debug", True)
    monkeypatch.setattr(settings, "enable_dev_login", True)

    local_client = TestClient(client.app, client=("127.0.0.1", 50000))
    response = local_client.post("/api/wechat/dev-login", json={"username": "pytest_admin"})

    assert response.status_code == 200
    token = response.json()["token"]
    jti = decode_token(token)["jti"]
    try:
        protected_response = local_client.get(
            "/api/miniapp-ai-config/providers",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert protected_response.status_code == 200
    finally:
        session_service.delete_session(jti)
