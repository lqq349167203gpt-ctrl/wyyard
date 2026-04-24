from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "wyyard-backend"
    debug: bool = False

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # 飞书
    feishu_app_id: str = ""
    feishu_app_secret: str = ""

    # 服务器
    host: str = "127.0.0.1"
    port: int = 8000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
