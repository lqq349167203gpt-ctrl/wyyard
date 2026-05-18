from pydantic_settings import BaseSettings


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

    # 服务器
    host: str = "127.0.0.1"
    port: int = 8000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
