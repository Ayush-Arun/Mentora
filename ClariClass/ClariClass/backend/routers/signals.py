from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Signal, Student, Chunk, ClassSession
from services.struggle_scoring import compute_chunk_struggle
from services.gemma_client import simplify_chunk_text
from services.cache import get_cached_simplification, set_cached_simplification
from sockets.events import broadcast_chunk_simplified, broadcast_struggle_update

router = APIRouter(prefix="/signals", tags=["Signals & Adaptive Triggers"])

class IngestSignalSchema(BaseModel):
    student_id: int
    chunk_id: int
    signal_type: str # flag_difficult | flag_important | dwell_ms | gaze_dwell_ms | expression_confusion
    value: float = 1.0

@router.post("/ingest")
async def ingest_signal(payload: IngestSignalSchema, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    chunk = db.query(Chunk).filter(Chunk.id == payload.chunk_id).first()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found.")

    session = db.query(ClassSession).filter(ClassSession.id == student.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    # Record signal
    signal = Signal(
        student_id=payload.student_id,
        chunk_id=payload.chunk_id,
        signal_type=payload.signal_type,
        value=payload.value
    )
    db.add(signal)
    db.commit()

    # Query active students in session
    active_students_count = db.query(Student).filter(Student.session_id == session.id).count()

    # Query signals for this chunk in this session
    session_chunk_signals = (
        db.query(Signal)
        .join(Student, Signal.student_id == Student.id)
        .filter(Student.session_id == session.id, Signal.chunk_id == chunk.id)
        .all()
    )

    signal_dicts = [
        {"student_id": s.student_id, "signal_type": s.signal_type, "value": s.value}
        for s in session_chunk_signals
    ]

    struggle_res = compute_chunk_struggle(
        signal_dicts, 
        active_students_count, 
        session.struggle_threshold_percent
    )

    # Broadcast struggle update to teacher dashboard
    await broadcast_struggle_update(session.room_code, {
        "chunk_id": chunk.id,
        "struggle_percentage": struggle_res["struggle_percentage"],
        "struggling_count": struggle_res["struggling_students_count"],
        "total_students": active_students_count
    })

    # If threshold exceeded and not already simplified
    if struggle_res["threshold_exceeded"] and not chunk.simplified_text:
        cached = get_cached_simplification(chunk.id)
        if cached:
            simplified_text = cached
        else:
            simplified_text = await simplify_chunk_text(chunk.original_text)
            set_cached_simplification(chunk.id, simplified_text)

        chunk.simplified_text = simplified_text
        chunk.simplified_at = datetime.utcnow()
        db.commit()

        # Push live simplified text to struggling students in real time
        await broadcast_chunk_simplified(session.room_code, {
            "chunk_id": chunk.id,
            "simplified_text": simplified_text,
            "struggling_student_ids": struggle_res["struggling_student_ids"]
        })

    return {
        "status": "recorded",
        "struggle_stats": struggle_res
    }

class ReiterateSchema(BaseModel):
    chunk_id: int
    room_code: str = "ROOM304"

@router.post("/reiterate")
@router.post("/flag")
async def trigger_reiteration(payload: IngestSignalSchema, db: Session = Depends(get_db)):
    """
    Teacher or system manually triggers AI adaptive simplification for a specific slide chunk.
    """
    chunk = db.query(Chunk).filter(Chunk.id == payload.chunk_id).first()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found.")

    # Check cache or call Gemma client
    cached = get_cached_simplification(chunk.id)
    if cached:
        simplified_text = cached
    else:
        simplified_text = await simplify_chunk_text(chunk.original_text)
        set_cached_simplification(chunk.id, simplified_text)

    chunk.simplified_text = simplified_text
    chunk.simplified_at = datetime.utcnow()
    db.commit()

    # Find room code if attached to session
    room_code = "ROOM304"
    if chunk.document and chunk.document.sessions:
        room_code = chunk.document.sessions[0].room_code

    # Broadcast simplification to all connected clients
    await broadcast_chunk_simplified(room_code, {
        "chunk_id": chunk.id,
        "simplified_text": simplified_text,
        "struggling_student_ids": []
    })

    return {
        "status": "simplified",
        "chunk_id": chunk.id,
        "simplified_text": simplified_text
    }
