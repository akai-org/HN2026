from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  """Runtime configuration from environment variables (or .env), e.g. MAX_FILE_SIZE_MB."""

  model_config = SettingsConfigDict(env_file=".env", extra="ignore")

  max_file_size_mb: int = 10
  jwt_secret: str
  jwt_algorithm: str = "HS256"
  jwt_expire_minutes: int = 60
  auth_username: str
  auth_password: str
  llm_base_url: str = "https://api.groq.com/openai/v1"  # any OpenAI-compatible /chat/completions API
  llm_api_key: str                                       # required, set in .env
  llm_model: str                                         # required, set in .env
  llm_timeout_s: int = 300
  ocr_lang: str = "pol"
  emit_validators: bool = True

  @property
  def max_file_size_bytes(self) -> int:
    return self.max_file_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
  return Settings()
