"""Logs each diagnosis (session, user message, detected cues, result) to Supabase.

Every function is a no-op when Supabase isn't configured, so logging never blocks a diagnosis.
"""
from typing import Any, Dict, List, Optional

from app.supabase_client import supabase

def create_session(vehicle: Optional[Dict[str, Any]] = None) -> Optional[str]:
    if supabase is None:
        return None
    vehicle = vehicle or {}
    payload = {
        "vehicle_make": vehicle.get("vehicle_make") or vehicle.get("make"),
        "vehicle_model": vehicle.get("vehicle_model") or vehicle.get("model"),
        "vehicle_year": vehicle.get("vehicle_year") or vehicle.get("year"),
        "status": "open",
    }
    row = supabase.table("sessions").insert(payload).execute().data[0]
    return row["id"]


def insert_message(session_id: Optional[str], text: str, role: str = "user") -> Optional[str]:
    if supabase is None:
        return None
    row = supabase.table("messages").insert(
        {"session_id": session_id, "role": role, "text": text}
    ).execute().data[0]
    return row["id"]

def insert_detections(message_id: Optional[str], detections: List[Dict[str, Any]]) -> None:
    if supabase is None or not detections:
        return
    rows = [
        {
            "message_id": message_id,
            "cue_key": d["cue"],
            "is_red_flag": bool(d.get("is_red_flag", False)),
            "weight": float(d.get("weight", 0.0)),
        }
        for d in detections
    ]
    supabase.table("detections").insert(rows).execute()

def insert_diagnosis(session_id: Optional[str], message_id: Optional[str], diag: Dict[str, Any]) -> Optional[str]:
    if supabase is None:
        return None
    payload = {
        "session_id": session_id,
        "message_id": message_id,
        "risk_band": diag.get("risk_band"),
        "drivable": diag.get("drivable"),
        "score_numeric": float(diag.get("score", 0.0)),
        # Keep these nullable for clarify mode
        "likely_issue": diag.get("likely_issue"),
        # The model's "why" is stored in the rationale column
        "rationale": diag.get("why") or diag.get("rationale"),
    }

    row = supabase.table("diagnoses").insert(payload).execute().data[0]
    return row["id"]
