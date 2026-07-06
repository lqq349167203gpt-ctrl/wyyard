from pydantic_settings import BaseSettings
from pydantic import model_validator


class Settings(BaseSettings):
    app_name: str = "wyyard-backend"
    debug: bool = False

    # LLM（默认智谱 GLM-5）
    llm_api_key: str = ""
    llm_base_url: str = "https://open.bigmodel.cn/api/paas/v4/"
    llm_model: str = "glm-5"

    # Anthropic（备用）
    anthropic_api_key: str = ""

    # 飞书
    feishu_app_id: str = ""
    feishu_app_secret: str = ""

    # 微信小程序
    wechat_appid: str = ""
    wechat_secret: str = ""

    # JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 168

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
