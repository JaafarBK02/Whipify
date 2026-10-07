"""Optional Supabase client used to log diagnosis sessions.

If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set, `supabase` is None and
session logging is skipped, so the API still runs locally with no database setup.
"""
import os
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Optional[Client] = (
    create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
    else None
)

if supabase is None:
    print("Supabase not configured: diagnosis sessions will not be logged.")
