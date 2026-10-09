import random
import string
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import ClassSession, Document, Student, Chunk

router = APIRouter(prefix="/sessions", tags=["Classroom Sessions"])

def generate_room_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))

class CreateSessionSchema(BaseModel):
    document_id: int
    struggle_threshold_percent: float = 25.0

class JoinSessionSchema(BaseModel):
    room_code: str
    display_name: str

@router.post("/create")
def create_session(payload: CreateSessionSchema, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == payload.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    room_code = generate_room_code(6)
    session = ClassSession(
        room_code=room_code,
        document_id=payload.document_id,
        struggle_threshold_percent=payload.struggle_threshold_percent,
        is_active=True
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "room_code": session.room_code,
        "document_title": doc.title,
        "struggle_threshold_percent": session.struggle_threshold_percent
    }

@router.post("/join")
def join_session(payload: JoinSessionSchema, db: Session = Depends(get_db)):
    session = db.query(ClassSession).filter(
        ClassSession.room_code == payload.room_code.upper().strip(),
        ClassSession.is_active == True
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Active classroom session not found for this room code.")

    student = Student(
        session_id=session.id,
        display_name=payload.display_name.strip()
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    # Return session metadata and initial chunks
    chunks = db.query(Chunk).filter(Chunk.document_id == session.document_id).order_by(Chunk.chunk_order).all()

    return {
        "session_id": session.id,
        "room_code": session.room_code,
        "student_id": student.id,
        "display_name": student.display_name,
        "document_id": session.document_id,
        "chunks": [
            {
                "id": c.id,
                "order": c.chunk_order,
                "text": c.original_text,
                "simplified_text": c.simplified_text,
                "page_number": c.page_number
            }
            for c in chunks
        ]
    }

@router.get("/room/{room_code}")
def get_session_by_room(room_code: str, db: Session = Depends(get_db)):
    session = db.query(ClassSession).filter(ClassSession.room_code == room_code.upper().strip()).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    
    doc = session.document
    chunks = db.query(Chunk).filter(Chunk.document_id == session.document_id).order_by(Chunk.chunk_order).all() if session.document_id else []

    return {
        "session_id": session.id,
        "room_code": session.room_code,
        "document_title": doc.title if doc else "Lecture Material",
        "document_id": session.document_id,
        "struggle_threshold_percent": session.struggle_threshold_percent,
        "is_active": session.is_active,
        "chunks_count": len(chunks)
    }
