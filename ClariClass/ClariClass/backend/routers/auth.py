from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import User
from services.otp_service import generate_otp, create_access_token
from config import settings

router = APIRouter(prefix="/auth", tags=["Authentication & OTP"])

class RequestOtpSchema(BaseModel):
    email: str
    role: str = "teacher" # teacher | student
    name: str = ""

class VerifyOtpSchema(BaseModel):
    email: str
    otp_code: str

@router.post("/request-otp")
def request_otp(payload: RequestOtpSchema, db: Session = Depends(get_db)):
    """
    Generates and registers a 6-digit OTP for email login.
    In dev mode, returns the OTP in response for seamless testing.
    """
    email_clean = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean).first()
    
    otp = generate_otp(6)
    
    if not user:
        user = User(
            email=email_clean,
            name=payload.name or email_clean.split("@")[0],
            role=payload.role,
            otp_code=otp,
            otp_created_at=datetime.utcnow()
        )
        db.add(user)
    else:
        user.otp_code = otp
        user.otp_created_at = datetime.utcnow()
        if payload.name:
            user.name = payload.name
            
    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "message": f"OTP successfully dispatched to {email_clean}",
        "dev_otp": otp if settings.OTP_DEV_BYPASS else None
    }

@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpSchema, db: Session = Depends(get_db)):
    """
    Verifies the OTP code and issues a JWT token.
    """
    email_clean = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean).first()

    if not user or not user.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP request or user not found.")

    if user.otp_created_at:
        expiry = user.otp_created_at + timedelta(seconds=settings.OTP_EXPIRE_SECONDS)
        if datetime.utcnow() > expiry:
            raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if user.otp_code != payload.otp_code.strip():
        raise HTTPException(status_code=400, detail="Incorrect OTP code entered.")

    user.otp_code = None
    db.commit()

    token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": user.role, "name": user.name})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role
        }
    }
