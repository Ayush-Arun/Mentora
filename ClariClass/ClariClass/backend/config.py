import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PORT: int = int(os.getenv("PORT", 8000))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./clariclass.db")
    
    # Supabase Configuration
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # JWT & Auth
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "temporary-secret-key-for-clariclass-mvp")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))
    OTP_EXPIRE_SECONDS: int = int(os.getenv("OTP_EXPIRE_SECONDS", 300))
    OTP_DEV_BYPASS: bool = os.getenv("OTP_DEV_BYPASS", "true").lower() == "true"

    # Local Ollama AI (Gemma 4 verified local model)
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL_NAME: str = os.getenv("OLLAMA_MODEL", os.getenv("OLLAMA_MODEL_NAME", "gemma4:12b"))
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # Class Difficulty Threshold Governance
    DEFAULT_STRUGGLE_THRESHOLD_COUNT: int = int(os.getenv("DEFAULT_STRUGGLE_THRESHOLD_COUNT", 10))
    DEFAULT_STRUGGLE_THRESHOLD_PERCENT: float = float(os.getenv("DEFAULT_STRUGGLE_THRESHOLD_PERCENT", 25.0))
    DEFAULT_MIN_STUDENTS_FOR_THRESHOLD: int = int(os.getenv("DEFAULT_MIN_STUDENTS_FOR_THRESHOLD", 3))
    DWELL_TIME_STRUGGLE_THRESHOLD_MS: int = int(os.getenv("DWELL_TIME_STRUGGLE_THRESHOLD_MS", 45000))
    RE_READ_STRUGGLE_THRESHOLD_COUNT: int = int(os.getenv("RE_READ_STRUGGLE_THRESHOLD_COUNT", 2))

settings = Settings()
