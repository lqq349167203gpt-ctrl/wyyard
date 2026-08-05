from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "wyyard-backend"
    debug: bool = False
    # dev-login 独立开关：反代后客户端 IP 恒为 127.0.0.1，IP 白名单形同虚设，
    # 因此除 debug 外还需显式开启本开关才允许免密登录（环境变量 ENABLE_DEV_LOGIN）
    enable_dev_login: bool = False

    # LLM（默认智谱 GLM-5）
    llm_api_key: str = ""
    llm_base_url: str = "https://open.bigmodel.cn/api/paas/v4/"
    llm_model: str = "glm-5"

    # 本地语音识别（无需第三方 API Key，首次使用会下载开源模型）
    local_asr_model: str = "small"
    local_asr_device: str = "cpu"
    local_asr_compute_type: str = "int8"
    local_asr_cpu_threads: int = 2

    # Anthropic（备用）
    anthropic_api_key: str = ""

    # 飞书
    feishu_app_id: str = ""
    feishu_app_secret: str = ""

    # 微信小程序（员工端）
    wechat_appid: str = ""
    wechat_secret: str = ""

    # 微信小程序（客户端）
    wechat_client_appid: str = ""
    wechat_client_secret: str = ""

    # JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    # 默认 720h（30 天），配合滑动续期减少被迫重新登录
    jwt_expire_hours: int = 720

    # 系统 API Key
    system_api_key: str = ""

    # 数据库
    database_url: str = ""

    # 服务器
    host: str = "127.0.0.1"
    port: int = 8000

    # CORS
    allowed_origins: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @model_validator(mode="after")
    def _validate_secrets(self):
        if not self.jwt_secret:
            raise ValueError("JWT_SECRET 环境变量未设置，启动拒绝")
        if len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET 长度不足 32 字符，安全要求不满足")
        if not self.database_url:
            raise ValueError("DATABASE_URL 环境变量未设置，启动拒绝")
        return self


settings = Settings()
