from datetime import datetime
import json
from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey, DateTime, Float, Boolean, JSON
)
from sqlalchemy.orm import relationship
from .database import Base

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(String(100), primary_key=True, index=True) # UUID from Supabase or local ID
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=True)
    role = Column(String(50), default="student") # teacher | student | admin
    avatar_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    taught_classes = relationship("Class", back_populates="teacher")
    class_memberships = relationship("ClassMember", back_populates="student")
    signals = relationship("Signal", back_populates="student")

# Alias for backward compatibility
User = Profile

class Class(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(String(100), ForeignKey("profiles.id"), nullable=True)
    name = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=True)
    invite_code = Column(String(20), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    teacher = relationship("Profile", back_populates="taught_classes")
    members = relationship("ClassMember", back_populates="parent_class", cascade="all, delete-orphan")
    sessions = relationship("ClassSession", back_populates="parent_class")
    materials = relationship("Material", back_populates="parent_class")

class ClassMember(Base):
    __tablename__ = "class_members"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    student_id = Column(String(100), ForeignKey("profiles.id"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    parent_class = relationship("Class", back_populates="members")
    student = relationship("Profile", back_populates="class_memberships")

class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=True)
    teacher_id = Column(String(100), ForeignKey("profiles.id"), nullable=True)
    title = Column(String(255), nullable=False)
    file_url = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False) # pdf | pptx | ppt
    status = Column(String(50), default="processed")
    created_at = Column(DateTime, default=datetime.utcnow)

    parent_class = relationship("Class", back_populates="materials")
    pages = relationship("DocumentPage", back_populates="material", cascade="all, delete-orphan")
    sessions = relationship("ClassSession", back_populates="material")

# Alias for backward compatibility
Document = Material

class DocumentPage(Base):
    __tablename__ = "document_pages"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    page_number = Column(Integer, nullable=False)
    width = Column(Float, default=800.0)
    height = Column(Float, default=600.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    material = relationship("Material", back_populates="pages")
    blocks = relationship("ContentBlock", back_populates="page", cascade="all, delete-orphan")

class ContentBlock(Base):
    __tablename__ = "content_blocks"

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("document_pages.id"), nullable=False)
    block_order = Column(Integer, nullable=False)
    block_hash = Column(String(64), nullable=True)
    title = Column(String(255), nullable=True)
    original_text = Column(Text, nullable=False)
    bbox_json = Column(JSON, nullable=True) # {x0, y0, x1, y1} normalized
    is_important = Column(Boolean, default=False)
    important_rationale = Column(Text, nullable=True)
    simplified_text = Column(Text, nullable=True)
    simplified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    page = relationship("DocumentPage", back_populates="blocks")
    signals = relationship("Signal", back_populates="block", cascade="all, delete-orphan")
    comprehension_tests = relationship("ComprehensionTest", back_populates="block", cascade="all, delete-orphan")

# Alias for backward compatibility
Chunk = ContentBlock

class ClassSession(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=True)
    document_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    room_code = Column(String(20), unique=True, index=True, nullable=False)
    current_slide_index = Column(Integer, default=0)
    struggle_threshold_count = Column(Integer, default=10)
    struggle_threshold_percent = Column(Float, default=25.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    parent_class = relationship("Class", back_populates="sessions")
    material = relationship("Material", back_populates="sessions")
    students = relationship("Student", back_populates="session", cascade="all, delete-orphan")
    reiteration_events = relationship("ReiterationEvent", back_populates="session", cascade="all, delete-orphan")

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    display_name = Column(String(255), nullable=False)
    socket_id = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    camera_gaze_consented = Column(Boolean, default=False)
    is_calibrated = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ClassSession", back_populates="students")
    signals = relationship("Signal", back_populates="student_rel", cascade="all, delete-orphan")

class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    chunk_id = Column(Integer, ForeignKey("content_blocks.id"), nullable=False)
    signal_type = Column(String(50), nullable=False) # flag_difficult | flag_important | dwell_ms | reread | gaze_dwell
    value = Column(Float, default=1.0)
    confidence = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    student_rel = relationship("Student", back_populates="signals")
    student = relationship("Profile", foreign_keys=[], primaryjoin="False")
    block = relationship("ContentBlock", back_populates="signals")

# Alias for backward compatibility
GazeObservation = Signal

class ComprehensionTest(Base):
    __tablename__ = "comprehension_tests"

    id = Column(Integer, primary_key=True, index=True)
    block_id = Column(Integer, ForeignKey("content_blocks.id"), nullable=False)
    question = Column(Text, nullable=False)
    options_json = Column(JSON, nullable=False) # ["Option A", "Option B", "Option C", "Option D"]
    correct_option_idx = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    block = relationship("ContentBlock", back_populates="comprehension_tests")
    responses = relationship("ComprehensionResponse", back_populates="test", cascade="all, delete-orphan")

class ComprehensionResponse(Base):
    __tablename__ = "comprehension_responses"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("comprehension_tests.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    selected_option_idx = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    confidence_score = Column(Integer, default=3)
    answered_at = Column(DateTime, default=datetime.utcnow)

    test = relationship("ComprehensionTest", back_populates="responses")

class ReiterationEvent(Base):
    __tablename__ = "reiteration_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    block_id = Column(Integer, ForeignKey("content_blocks.id"), nullable=False)
    trigger_reason = Column(Text, nullable=True)
    proposed_simplification = Column(Text, nullable=False)
    approved_simplification = Column(Text, nullable=True)
    is_approved = Column(Boolean, default=False)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ClassSession", back_populates="reiteration_events")
