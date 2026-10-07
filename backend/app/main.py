import json
import math
import os
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Tuple, Union

import httpx
from fastapi import Body, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .repo.beta_users import create_beta_user, increment_diagnosis_count, validate_token
from .repo.diagnostics import create_session, insert_detections, insert_diagnosis, insert_message

# LLM used for routing (diagnose vs. clarify). Override with the OPENAI_MODEL env var.
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

app = FastAPI(title="Whipify API")

# Rate limiting per client IP
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: localhost is always allowed; add deployed frontends via ALLOWED_ORIGINS (comma-separated)
_extra_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_extra_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------------------------Cue Library-------------------------------------------------------------------------------------------------------------
CUE_LIBRARY = {
    # Cooling system
    "overheating": {
        "system": "Cooling",
        "triggers": ["overheat", "overheating", "temp light", "temperature light", "steam", "smoke from hood"],
        "is_red_flag": True,
        "weight": 0.9,
        "issues": ["Coolant leak", "Water pump failure", "Thermostat stuck closed"]
    },
    "sweet_smell": {
        "system": "Cooling",
        "triggers": ["sweet smell", "maple syrup smell"],
        "is_red_flag": False,
        "weight": 0.4,
        "issues": ["Coolant leak"]
    },
    "low_coolant": {
        "system": "Cooling",
        "triggers": ["low coolant", "coolant low", "add coolant"],
        "is_red_flag": False,
        "weight": 0.5,
        "issues": ["Coolant leak", "Reservoir cap"]
    },

    # Brakes
    "brake_squeal": {
        "system": "Brakes",
        "triggers": ["brake squeal", "squeal when braking", "squealing brake", "squealing when braking", "squeal", "squeaking when braking","Brakes noise"],
        "is_red_flag": False,
        "weight": 0.45,
        "issues": ["Worn brake pads", "Glazed pads/rotors", "Debris between pad and rotor"]
    },
    "brake_grind": {
        "system": "Brakes",
        "triggers": ["grinding when braking", "brake grinding", "metal on metal"],
        "is_red_flag": True,
        "weight": 0.9,
        "issues": ["Pads worn to metal", "Rotor damage"]
    },
}

# ------------------------------------------------------------------------------------------------Helper functions---------------------------------------------------------------------------------------------------------------

def detect_cues(text: str) -> List[Dict[str, Any]]:
    """
    Scan the user's text for trigger phrases; return hits with system, cue, flags, weight, and issues.
    """
    t = text.lower()
    hits: List[Dict[str, Any]] = []
    for cue_key, meta in CUE_LIBRARY.items():
        if any(trig in t for trig in meta["triggers"]):
            hits.append({
                "cue": cue_key,
                "system": meta["system"],
                "is_red_flag": meta["is_red_flag"],
                "weight": float(meta["weight"]),
                "issues": list(meta["issues"]),
            })
    return hits

def aggregate_risk(hits: List[Dict[str, Any]]) -> Tuple[float, str, bool]:
    """
    Combine cue weights into a 0..1 risk score, map to band, set drivable.
    """
    s = 0.0
    any_red = any(h["is_red_flag"] for h in hits)
    for h in hits:
        s += float(h["weight"])
        if h["is_red_flag"]:
            s += 0.8
    if any_red:
        s += 0.5

    risk = 1.0 / (1.0 + math.exp(-s))

    if risk >= 0.85:
        return float(risk), "Red", False
    elif risk >= 0.65:
        return float(risk), "Orange", False
    elif risk >= 0.45:
        return float(risk), "Yellow", True
    else:
        return float(risk), "Green", True

def likely_issue(hits: List[Dict[str, Any]]) -> str:
    """
    Weighted vote among candidate issues from all hits.
    """
    tally: Dict[str, float] = defaultdict(float)
    for h in hits:
        for issue in h["issues"]:
            tally[issue] += float(h["weight"]) + (0.5 if h["is_red_flag"] else 0.0)
    return max(tally, key=tally.get) if tally else "Needs more information"



def gpt_generate_clarifying_questions(
    symptoms: str,
    vehicle_make: Optional[str],
    vehicle_model: Optional[str],
    vehicle_year: Optional[int],
    mileage: Optional[int] = None,
    hits: Optional[List[Dict[str, Any]]] = None,
) -> List[str]:
    """
    Use GPT to generate exactly 2 high-signal clarifying questions tailored to the situation.
    Falls back to generic questions if GPT is unavailable.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return [
            "When does it happen (braking, accelerating, idling, turning, or over bumps)?",
            "Any warning lights, leaks, burning smells, or unusual sounds?"
        ]

    red_flags = []
    if hits:
        red_flags = [h["cue"] for h in hits if h.get("is_red_flag")]
    red_flag_note = f"Red flags detected: {', '.join(red_flags)}." if red_flags else "No rule-based red flags detected."

    system = (
        "You are a senior automotive technician. "
        "Your job is to ask exactly TWO clarifying questions that a normal driver can answer. "
        "The questions must be specific, non-redundant, and high-impact for narrowing the diagnosis. "
        "Do not ask for tools, scanners, or measurements. "
        "Return JSON only with a 'questions' array containing exactly 2 strings."
    )

    user = {
        "vehicle": {
            "make": vehicle_make,
            "model": vehicle_model,
            "year": vehicle_year,
        },
        "context": red_flag_note,
        "symptoms": symptoms.strip(),
        "requirements": {
            "num_questions": 2,
            "style": "short, direct",
            "answerable_by": "non-expert driver"
        }
    }

    schema = {
        "type": "object",
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "minItems": 2,
                "maxItems": 2,
                "items": {
                    "type": "string"
                }
            }
        }
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user)},
                    ],
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "ClarifyQuestions",
                            "schema": schema
                        }
                    }
                },
            )

        if resp.status_code >= 400:
            return [
                "When does it happen (braking, accelerating, idling, turning, or over bumps)?",
                "Any warning lights, leaks, burning smells, or unusual sounds?"
            ]

        data = resp.json()
        output_text = data["choices"][0]["message"]["content"]
        parsed = json.loads(output_text)
        qs = parsed.get("questions", [])

        if not isinstance(qs, list) or len(qs) != 2 or not all(isinstance(q, str) and q.strip() for q in qs):
            return [
                "When does it happen (braking, accelerating, idling, turning, or over bumps)?",
                "Any warning lights, leaks, burning smells, or unusual sounds?"
            ]

        return [q.strip() for q in qs]

    except Exception as e:
        print(f"OPENAI CLARIFY EXCEPTION: {repr(e)}")
        return [
            "When does it happen (braking, accelerating, idling, turning, or over bumps)?",
            "Any warning lights, leaks, burning smells, or unusual sounds?"
        ]


def gpt_route_diagnose_or_clarify(
    symptoms: str,
    vehicle_make: Optional[str],
    vehicle_model: Optional[str],
    vehicle_year: Optional[int],
    hits: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    GPT decides: either return a diagnosis (one likely issue + why + price_estimate)
    OR return clarify (exactly 2 questions).
    """

    fallback = {
        "mode": "clarify",
        "questions": [
            "When does it happen (braking, accelerating, idling, turning, or over bumps)?",
            "Any warning lights, leaks, burning smells, or unusual sounds?"
        ]
    }

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI DEBUG: Missing API key")
        return fallback

    red_flags = [h.get("cue") for h in hits if h.get("is_red_flag")]
    context = {
        "vehicle": {
            "make": vehicle_make,
            "model": vehicle_model,
            "year": vehicle_year
        },
        "symptoms": symptoms.strip(),
        "rule_engine": {
            "detected_systems": sorted(
                list({h.get("system") for h in hits if h.get("system")})
            ),
            "red_flags": [rf for rf in red_flags if rf],
        }
    }

    schema = {
        "type": "object",
        "required": ["mode"],
        "properties": {
            "mode": {
                "type": "string",
                "enum": ["diagnosis", "clarify"]
            },
            "likely_issue": {
                "type": "string",
                "description": "Required when mode=diagnosis. Single specific problem."
            },
            "why": {
                "type": "string",
                "description": "Required when mode=diagnosis. Mechanic-style justification, 3-6 sentences."
            },
            "price_estimate": {
                "type": "object",
                "description": "Required when mode=diagnosis. Aftermarket parts price estimate only.",
                "properties": {
                    "parts_low": {
                        "type": ["number", "null"],
                        "description": "Low end of aftermarket parts price range in USD, or null if unknown"
                    },
                    "parts_high": {
                        "type": ["number", "null"],
                        "description": "High end of aftermarket parts price range in USD, or null if unknown"
                    },
                    "notes": {
                        "type": "string",
                        "description": "Brief notes about pricing (e.g., budget vs premium options, uncertainties)"
                    }
                },
                "required": ["parts_low", "parts_high", "notes"]
            },
            "questions": {
                "type": "array",
                "description": "Required when mode=clarify. Exactly 2 questions.",
                "items": {
                    "type": "string"
                },
                "minItems": 2,
                "maxItems": 2
            }
        }
    }

    system_prompt = (
        "You are a senior automotive technician for Whipify.\n"
        "You must choose ONE of two actions:\n\n"
        "1) mode='diagnosis': Provide:\n"
        "   - 'likely_issue' (a single specific problem)\n"
        "   - 'why' (mechanic-style justification, 3-6 sentences, no bullets)\n"
        "   - 'price_estimate' object with:\n"
        "     * 'parts_low' and 'parts_high': USD price range for AFTERMARKET parts only (not OEM, no labor)\n"
        "     * Use typical U.S. aftermarket pricing (budget to mid-range quality)\n"
        "     * If multiple options exist (budget vs premium, single vs pair), use the common mid-range\n"
        "     * 'notes': Brief context (e.g., 'pair recommended', 'varies by brand', 'single rotor price')\n"
        "     * If you cannot reasonably estimate, set parts_low and parts_high to null and explain in notes\n"
        "   Do NOT include 'questions' field.\n\n"
        "2) mode='clarify': Provide 'questions' (array of exactly 2 strings). "
        "Do NOT include 'likely_issue', 'why', or 'price_estimate' fields.\n\n"
        "Choose clarify ONLY if you cannot name a single most likely issue.\n"
        "It is acceptable to diagnose even if confidence is moderate, "
        "as long as one issue is more likely than others.\n"
        "Questions must be answerable by a normal driver, specific, and non-redundant.\n"
        "Return ONLY the required fields for your chosen mode in valid JSON format."
    )

    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(context)}
                    ],
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "DiagnoseRoute",
                            "schema": schema
                        }
                    }
                }
            )

        if resp.status_code >= 400:
            print(f"OPENAI ERROR: {resp.status_code} {resp.text}")
            return fallback

        data = resp.json()
        try:
            output_text = data["choices"][0]["message"]["content"]
        except Exception as e:
            print("OPENAI DEBUG: Could not extract text from response:", data)
            return fallback
        
                
        try:
            parsed = json.loads(output_text)
        except Exception as e:
            print("OPENAI PARSE ERROR:", repr(e), output_text)
            return fallback

        mode = parsed.get("mode")

        if mode == "diagnosis":
            likely_issue = (parsed.get("likely_issue") or "").strip()
            why = (parsed.get("why") or "").strip()
            price_est = parsed.get("price_estimate")

            if likely_issue and why and price_est:
                return {
                    "mode": "diagnosis",
                    "likely_issue": likely_issue,
                    "why": why,
                    "price_estimate": price_est
                }

            print("OPENAI DEBUG: diagnosis missing fields", parsed)
            return fallback

        if mode == "clarify":
            qs = parsed.get("questions")
            if isinstance(qs, list) and len(qs) == 2:
                q1, q2 = (qs[0] or "").strip(), (qs[1] or "").strip()
                if q1 and q2:
                    return {"mode": "clarify", "questions": [q1, q2]}

            print("OPENAI DEBUG: clarify questions invalid", parsed)
            return fallback

        print("OPENAI DEBUG: unknown mode", parsed)
        return fallback

    except Exception as e:
        print("OPENAI EXCEPTION:", repr(e))
        return fallback


# -----------------------------------------------------------------------------------------------Pydantic models-------------------------------------------------------------------------------------------------------------

class DiagnoseInV0(BaseModel):
    symptoms: str
    vehicle_year: Optional[int] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    location_zip: Optional[str] = None

class DiagnoseInV1(BaseModel):
    access_token: str
    symptoms: str
    vehicle_year: Optional[int] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    location_zip: Optional[str] = None

class CueOut(BaseModel):
    system: str
    cue: str
    is_red_flag: bool
    weight: float

class DiagnoseOutV0(BaseModel):
    mode: Literal["diagnosis", "clarify"] = "diagnosis"
    risk_band: Literal["Green","Yellow","Orange","Red"]
    drivable: bool
    likely_issue: str
    rationale: str
    risk_score: float
    cues_detected: List[CueOut] = []


class DiagnoseClarifyOutV0(BaseModel):
    mode: Literal["clarify"] = "clarify"
    risk_band: Literal["Green","Yellow","Orange","Red"]
    drivable: bool
    risk_score: float
    questions: List[str]
    instruction: str
    diagnoses_remaining: Optional[int] = None

class PriceEstimate(BaseModel):
    parts_low: Optional[float] = None
    parts_high: Optional[float] = None
    notes: Optional[str] = None

class DiagnoseAIOutV1(BaseModel):
    mode: Literal["diagnosis"] = "diagnosis"
    risk_band: Literal["Green","Yellow","Orange","Red"]
    drivable: bool
    risk_score: float
    likely_issue: str
    why: str
    price_estimate: PriceEstimate
    diagnoses_remaining: Optional[int] = None

class BetaSignupIn(BaseModel):
    first_name: str
    last_name: str
    email: str

# -----------------------------------------------------------------------------------------------routes----------------------------------------------------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/exchange-token")
@limiter.limit("10/minute")
async def exchange_token_for_cookie(request: Request, response: Response, payload: dict = Body(...)):
    """
    Exchange URL token for HTTP-only cookie session
    This endpoint is called once when user clicks the email link
    """
    access_token = payload.get("access_token")
    
    if not access_token:
        raise HTTPException(status_code=400, detail="access_token required")
    
    # Validate the token
    user = validate_token(access_token)
    
    if not user:
        raise HTTPException(
            status_code=403, 
            detail="Invalid or expired access token. Please sign up for beta access."
        )
    
    # Check if user has diagnoses remaining
    remaining = user["max_diagnoses"] - user["diagnosis_count"]
    
    if remaining <= 0:
        raise HTTPException(
            status_code=403,
            detail=f"You've used all {user['max_diagnoses']} free diagnoses. Beta access limit reached."
        )
    
    # Set HTTP-only cookie with the token
    # Cookie expires when the access token expires
    expires_at = datetime.fromisoformat(user.get("expires_at").replace("Z", "+00:00"))
    
    # Deployed: frontend and API are on different domains, so the cookie must be Secure + SameSite=None.
    # Local dev runs over plain http on localhost, where a Lax cookie is enough.
    is_local = request.url.hostname in ("localhost", "127.0.0.1")
    response.set_cookie(
        key="whipify_session",
        value=access_token,
        httponly=True,
        secure=not is_local,
        samesite="lax" if is_local else "none",
        max_age=int((expires_at - datetime.now(expires_at.tzinfo)).total_seconds()),
        path="/"
    )
    
    return {
        "success": True,
        "user": {
            "first_name": user.get("first_name"),
            "email": user.get("email"),
            "diagnoses_remaining": remaining,
            "expires_at": user.get("expires_at")
        }
    }


@app.post("/auth/logout")
async def logout(response: Response):
    """
    Clear the session cookie
    """
    response.delete_cookie(
        key="whipify_session",
        path="/"
    )
    return {"success": True, "message": "Logged out successfully"}


@app.post("/validate-token")  
@limiter.limit("200/hour")
def validate_token_endpoint(request: Request, payload: dict = Body(...)):
    """
    Validate if an access token is valid without using up a diagnosis
    Accepts token from either cookie OR request body
    """
    # Try to get token from cookie first
    access_token = request.cookies.get("whipify_session")
    
    # If not in cookie, try request body (backward compatibility)
    if not access_token:
        access_token = payload.get("access_token")
    
    if not access_token:
        raise HTTPException(status_code=400, detail="access_token required")
    
    # Validate the token
    user = validate_token(access_token)
    
    if not user:
        raise HTTPException(
            status_code=403, 
            detail="Invalid or expired access token. Please sign up for beta access."
        )
    
    # Check if user has diagnoses remaining
    remaining = user["max_diagnoses"] - user["diagnosis_count"]
    
    if remaining <= 0:
        raise HTTPException(
            status_code=403,
            detail=f"You've used all {user['max_diagnoses']} free diagnoses. Beta access limit reached."
        )
    
    # Token is valid and user has diagnoses remaining
    return {
        "valid": True,
        "user": {
            "first_name": user.get("first_name"),
            "email": user.get("email"),
            "diagnoses_remaining": remaining,
            "expires_at": user.get("expires_at")
        }
    }


@app.post("/diagnose", response_model=Union[DiagnoseAIOutV1, DiagnoseClarifyOutV0])
@limiter.limit("100/hour")
def diagnose(request: Request, payload: DiagnoseInV1 = Body(...)):
    
    # Try to get token from cookie first
    access_token = request.cookies.get("whipify_session")
    
    # If not in cookie, try request body (backward compatibility during transition)
    if not access_token:
        access_token = payload.access_token
    
    if not access_token:
        raise HTTPException(status_code=403, detail="No access token provided")

    # Validate access token
    user = validate_token(access_token)
    if not user:
        raise HTTPException(
            status_code=403, 
            detail="Invalid or expired access token. Please sign up for beta access."
        )
    
    # Check remaining diagnoses
    remaining = user["max_diagnoses"] - user["diagnosis_count"]
    if remaining <= 0:
        raise HTTPException(
            status_code=403,
            detail=f"You've used all {user['max_diagnoses']} free diagnoses. Beta access limit reached."
        )

    user_text = (payload.symptoms or "").strip()
    if not user_text:
        raise HTTPException(status_code=422, detail="symptoms required")

    car_info = {
        "vehicle_make": payload.vehicle_make,
        "vehicle_model": payload.vehicle_model,
        "vehicle_year": payload.vehicle_year,
        "location_zip": payload.location_zip,
    }
    session_id = create_session(car_info)

    message_id = insert_message(session_id, user_text, role="user")

    hits = detect_cues(user_text)
    risk, band, drivable = aggregate_risk(hits)

    insert_detections(message_id, hits)

    route = gpt_route_diagnose_or_clarify(
        symptoms=user_text,
        vehicle_make=payload.vehicle_make,
        vehicle_model=payload.vehicle_model,
        vehicle_year=payload.vehicle_year,
        hits=hits,
    )

    if route["mode"] == "clarify":
        questions = route["questions"]
        instruction = "Please rerun the diagnosis and include answers to the two questions above."

        insert_diagnosis(
            session_id=session_id,
            message_id=message_id,
            diag={
                "mode": "clarify",
                "risk_band": band,
                "drivable": drivable,
                "questions": questions,
                "instruction": instruction,
                "score": risk,
            },
        )

        # Clarifying questions don't use up one of the user's diagnoses
        return DiagnoseClarifyOutV0(
            risk_band=band,
            drivable=drivable,
            risk_score=float(risk),
            questions=questions,
            instruction=instruction,
            diagnoses_remaining=remaining,
        )

    likely = route["likely_issue"]
    why = route["why"]
    price_est = route.get("price_estimate", {})

    insert_diagnosis(
        session_id=session_id,
        message_id=message_id,
        diag={
            "mode": "diagnosis",
            "risk_band": band,
            "drivable": drivable,
            "likely_issue": likely,
            "why": why,
            "price_estimate": price_est,
            "score": risk,
        },
    )

    increment_diagnosis_count(access_token)

    return DiagnoseAIOutV1(
        risk_band=band,
        drivable=drivable,
        risk_score=float(risk),
        likely_issue=likely,
        why=why,
        price_estimate=PriceEstimate(**price_est),
        diagnoses_remaining=remaining - 1,
    )


@app.post("/beta-signup")
@limiter.limit("50/day")
async def beta_signup(request: Request, payload: BetaSignupIn = Body(...)):
    """
    Handle beta access signup - instant access, no email
    """
    try:
        # Create beta user and generate token
        user_data = create_beta_user(
            first_name=payload.first_name,
            last_name=payload.last_name or "",
            email=payload.email,
            days_valid=7,
            max_diagnoses=3
        )
        
        # Check if exhausted
        is_existing = user_data.get("existing", False)
        remaining = user_data["max_diagnoses"] - user_data.get("diagnosis_count", 0)
        
        if is_existing and remaining <= 0:
            return {
                "status": "error",
                "message": "You've used all your diagnoses. Contact us for more access.",
                "exhausted": True
            }
        
        # Return access token directly (no email)
        return {
            "status": "success",
            "message": "Access granted",
            "access_token": user_data['access_token'],  # Frontend uses this
            "user": {
                "first_name": payload.first_name,
                "email": payload.email,
                "diagnoses_remaining": remaining,
                "expires_at": user_data["expires_at"]
            }
        }
        
    except Exception as e:
        print(f"SIGNUP ERROR: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))
