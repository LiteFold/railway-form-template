from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    database_url: Optional[str] = None
    admin_password: Optional[str] = None
    cap_endpoint: Optional[str] = None
    cap_secret_key: Optional[str] = None
    cap_site_key: Optional[str] = None
    captcha_mode: str = "auto"
    form_recipient_email: Optional[str] = None
    sendgrid_api_key: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    from_email: str = "noreply@contact-form.app"
    rate_limit: int = 10
    rate_limit_backend: str = "memory"
    session_secret_key: Optional[str] = None
    geoip_db_path: Optional[str] = None
    geoip_auto_download: bool = True
    mcp_api_key: Optional[str] = None
    public_base_url: Optional[str] = None

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
