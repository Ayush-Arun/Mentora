import os
import shutil
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Material, DocumentPage, ContentBlock
from services.document_parser import parse_document

router = APIRouter(prefix="/documents", tags=["Documents & Materials"])

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    Uploads a PDF or PPTX file, persists it, and parses into mapped document pages and content blocks.
    """
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["pdf", "pptx", "ppt"]:
        raise HTTPException(status_code=400, detail="Only PDF and PPTX files are supported.")

    doc_title = title or file.filename
    file_path = os.path.join(UPLOAD_DIR, f"{int(os.times().elapsed)}_{file.filename}")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    material = Material(
        title=doc_title,
        file_url=file_path,
        file_type=file_ext,
        status="processed"
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Parse into content blocks with bounding boxes
    parsed_blocks = parse_document(file_path, file_ext)
    
    # Create pages index
    pages_map = {}
    for b in parsed_blocks:
        page_num = b.get("page_number", 1)
        if page_num not in pages_map:
            page = DocumentPage(
                material_id=material.id,
                page_number=page_num,
                width=b.get("page_width", 800.0),
                height=b.get("page_height", 600.0)
            )
            db.add(page)
            db.commit()
            db.refresh(page)
            pages_map[page_num] = page

        block = ContentBlock(
            page_id=pages_map[page_num].id,
            block_order=b["order"],
            block_hash=b.get("block_hash"),
            title=b.get("title", f"Block {b['order']}"),
            original_text=b["text"],
            bbox_json=b.get("bbox")
        )
        db.add(block)

    db.commit()

    return {
        "document_id": material.id,
        "title": material.title,
        "chunks_count": len(parsed_blocks),
        "pages_count": len(pages_map)
    }

@router.get("")
def list_documents(db: Session = Depends(get_db)):
    """
    Returns all uploaded documents with chunk counts.
    """
    docs = db.query(Material).order_by(Material.created_at.desc()).all()
    results = []
    for d in docs:
        count = (
            db.query(ContentBlock)
            .join(DocumentPage, ContentBlock.page_id == DocumentPage.id)
            .filter(DocumentPage.material_id == d.id)
            .count()
        )
        results.append({
            "id": d.id,
            "title": d.title,
            "file_type": d.file_type,
            "chunks_count": count,
            "created_at": d.created_at
        })
    return results

@router.get("/{document_id}")
def get_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.query(Material).filter(Material.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    
    blocks = (
        db.query(ContentBlock, DocumentPage.page_number)
        .join(DocumentPage, ContentBlock.page_id == DocumentPage.id)
        .filter(DocumentPage.material_id == document_id)
        .order_by(ContentBlock.block_order)
        .all()
    )

    return {
        "id": doc.id,
        "title": doc.title,
        "file_type": doc.file_type,
        "created_at": doc.created_at,
        "chunks": [
            {
                "id": b[0].id,
                "order": b[0].block_order,
                "title": b[0].title or f"Slide {b[1]}",
                "text": b[0].original_text,
                "bbox": b[0].bbox_json,
                "simplified_text": b[0].simplified_text,
                "page_number": b[1],
                "is_important": b[0].is_important,
                "important_rationale": b[0].important_rationale
            }
            for b in blocks
        ]
    }
