import os
import requests
from config import settings

class SupabaseClient:
    """
    Lightweight Supabase client for REST API operations (Auth, DB, and Storage).
    Works without heavy SDK dependencies.
    """
    def __init__(self):
        self.base_url = settings.SUPABASE_URL.rstrip('/') if settings.SUPABASE_URL else ""
        self.anon_key = settings.SUPABASE_ANON_KEY
        self.service_role_key = settings.SUPABASE_SERVICE_ROLE_KEY

    def is_configured(self) -> bool:
        return bool(self.base_url and (self.anon_key or self.service_role_key))

    def get_headers(self, use_service_role: bool = False) -> dict:
        key = self.service_role_key if use_service_role and self.service_role_key else self.anon_key
        return {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }

    def verify_token(self, token: str) -> dict:
        """
        Verifies a Supabase Auth JWT token by querying the /auth/v1/user endpoint.
        """
        if not self.is_configured():
            return {"valid": False, "error": "Supabase not configured"}

        try:
            res = requests.get(
                f"{self.base_url}/auth/v1/user",
                headers={
                    "apikey": self.anon_key,
                    "Authorization": f"Bearer {token}"
                },
                timeout=5
            )
            if res.status_code == 200:
                return {"valid": True, "user": res.json()}
            return {"valid": False, "error": res.text}
        except Exception as e:
            return {"valid": False, "error": str(e)}

supabase = SupabaseClient()
