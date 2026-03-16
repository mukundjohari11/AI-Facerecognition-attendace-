"""
Recognition & Enrollment API routes.
"""
import io
import logging
from typing import List, Optional

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from PIL import Image

from app.models.schemas import (
    RecognizeResponse,
    EnrollResponse,
    IndexInfoResponse,
    HealthResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# These are injected at startup via main.py
_matcher = None
_device_name = "cpu"


def init_router(matcher, device_name: str):
    global _matcher, _device_name
    _matcher = matcher
    _device_name = device_name




@router.post("/recognize", response_model=RecognizeResponse)
async def recognize_faces(
    images: List[UploadFile] = File(None),
    image: Optional[UploadFile] = File(None),
    section_student_ids: Optional[str] = Form(None),
):
    """
    Detect & recognise faces in one or more classroom images.

    - **images**: One or more classroom/group photos (JPEG/PNG).
    - **image**: Single image (backward-compatible).
    - **section_student_ids**: Comma-separated student IDs to filter by section.
    """
    if _matcher is None:
        raise HTTPException(status_code=503, detail="ML service not initialised")

    
    upload_files = []
    if images:
        upload_files.extend(images)
    if image:
        upload_files.append(image)
    if not upload_files:
        raise HTTPException(status_code=400, detail="At least one image is required")

    pil_images = []
    for img_file in upload_files:
        try:
            contents = await img_file.read()
            pil_images.append(Image.open(io.BytesIO(contents)).convert("RGB"))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image '{img_file.filename}': {e}")

    allowed_ids = None
    if section_student_ids:
        allowed_ids = [s.strip() for s in section_student_ids.split(",") if s.strip()]

    try:
        results = _matcher.match_faces_multi(pil_images, allowed_student_ids=allowed_ids)
    except Exception as e:
        logger.exception("Recognition failed")
        raise HTTPException(status_code=500, detail=str(e))

    return RecognizeResponse(**results)

@router.post("/enroll", response_model=EnrollResponse)
async def enroll_student(
    student_id: str = Form(...),
    images: List[UploadFile] = File(...),
):
    """
    Enroll a student by uploading one or more face images.

    - **student_id**: Unique student identifier.
    - **images**: One or more face images (JPEG/PNG).
    """
    if _matcher is None:
        raise HTTPException(status_code=503, detail="ML service not initialised")

    pil_images = []
    for img_file in images:
        try:
            contents = await img_file.read()
            pil_images.append(Image.open(io.BytesIO(contents)).convert("RGB"))
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid image '{img_file.filename}': {e}",
            )

    try:
        count = _matcher.enroll_student(student_id, pil_images)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Enrollment failed for %s", student_id)
        raise HTTPException(status_code=500, detail=str(e))

    return EnrollResponse(
        student_id=student_id,
        embeddings_added=count,
        total_index_size=_matcher.index_manager.total_embeddings,
    )
@router.post("/rebuild-index")
async def rebuild_index():
    """Force rebuild the FAISS index from stored embeddings."""
    if _matcher is None:
        raise HTTPException(status_code=503, detail="ML service not initialised")
    # The index self-maintains;       this endpoint triggers a persist
    _matcher.index_manager._persist()
    return {"status": "ok", "total_embeddings": _matcher.index_manager.total_embeddings}


@router.delete("/students/{student_id}")
async def remove_student(student_id: str):
    """Remove a student's embeddings from the index."""
    if _matcher is None:
        raise HTTPException(status_code=503, detail="ML service not initialised")

    removed = _matcher.index_manager.remove_student(student_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Student not found in index")

    return {"status": "removed", "student_id": student_id}


@router.get("/index-info", response_model=IndexInfoResponse)
async def index_info():
    """Get FAISS index statistics."""
    if _matcher is None:
        raise HTTPException(status_code=503, detail="ML service not initialised")
    return IndexInfoResponse(
        total_embeddings=_matcher.index_manager.total_embeddings,
        unique_students=_matcher.index_manager.student_count,
    )


 

@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        index_size=_matcher.index_manager.total_embeddings if _matcher else 0,
        device=_device_name,
    )
