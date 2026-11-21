from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  """Runtime configuration from environment variables (or .env), e.g. MAX_FILE_SIZE_MB."""

  model_config = SettingsConfigDict(env_file=".env", extra="ignore")

  max_file_size_mb: int = 10
  llm_base_url: str = "http://127.0.0.1:11434"
  llm_model: str = "hf.co/unsloth/gemma-4-E4B-it-GGUF:UD-Q8_K_XL"
  llm_timeout_s: int = 300
  ocr_lang: str = "pol"
  emit_validators: bool = True

  @property
  def max_file_size_bytes(self) -> int:
    return self.max_file_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
  return Settings()
