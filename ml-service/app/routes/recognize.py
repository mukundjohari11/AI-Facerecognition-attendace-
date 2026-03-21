"""
Recognition & Enrollment API routes.

Enrollment uses a background queue to avoid blocking the event loop and
to handle duplicates, retries, and failure tracking gracefully.
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
from app.services.enrollment_queue import enrollment_queue

logger = logging.getLogger(__name__)
router = APIRouter()

# These are injected at startup via main.py
_matcher = None
_device_name = "cpu"


def init_router(matcher, device_name: str):
    global _matcher, _device_name
    _matcher = matcher
    _device_name = device_name


# ── Recognition (read-only, non-blocking) ─────────────────────────────


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
        # Recognition is read-only on FAISS — safe to run in thread pool
        import asyncio
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None, _matcher.match_faces_multi, pil_images, allowed_ids
        )
    except Exception as e:
        logger.exception("Recognition failed")
        raise HTTPException(status_code=500, detail=str(e))

    return RecognizeResponse(**results)


# ── Enrollment (queued, non-blocking) ─────────────────────────────────


@router.post("/enroll")
async def enroll_student(
    student_id: str = Form(...),
    images: List[UploadFile] = File(...),
):
    """
    Queue a student enrollment job. Returns immediately with a job_id.

    - **student_id**: Unique student identifier.
    - **images**: One or more face images (JPEG/PNG).

    Poll `/enroll/status/{job_id}` to check progress.
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

    if not pil_images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    try:
        job = enrollment_queue.enqueue(student_id, pil_images)
    except Exception as e:
        logger.exception("Failed to queue enrollment for %s", student_id)
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "job_id": job.job_id,
        "student_id": job.student_id,
        "status": job.status.value,
        "message": "Enrollment queued. Poll /enroll/status/{job_id} for progress.",
        "queue_position": job.position_in_queue,
    }


@router.get("/enroll/status/{job_id}")
async def enrollment_status(job_id: str):
    """
    Check the status of an enrollment job.

    Returns: status (queued/processing/completed/failed), result or error.
    """
    job = enrollment_queue.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    response = {
        "job_id": job.job_id,
        "student_id": job.student_id,
        "status": job.status.value,
        "retries": job.retries,
    }

    if job.result:
        response["result"] = job.result
    if job.error:
        response["error"] = job.error
    if job.completed_at:
        response["processing_time_sec"] = round(job.completed_at - job.created_at, 2)

    return response


@router.get("/enroll/student-status/{student_id}")
async def student_enrollment_status(student_id: str):
    """Check enrollment status by student ID (for the frontend to poll)."""
    job = enrollment_queue.get_student_job(student_id)
    if not job:
        # Check if already in FAISS
        if _matcher and student_id in _matcher.index_manager._id_map:
            return {
                "student_id": student_id,
                "status": "completed",
                "message": "Student is already enrolled",
            }
        return {
            "student_id": student_id,
            "status": "not_found",
            "message": "No enrollment job found for this student",
        }

    return {
        "job_id": job.job_id,
        "student_id": job.student_id,
        "status": job.status.value,
        "error": job.error,
    }


@router.get("/enroll/queue-stats")
async def queue_stats():
    """Get enrollment queue statistics."""
    return enrollment_queue.stats


# ── Index Management ──────────────────────────────────────────────────


@router.post("/rebuild-index")
async def rebuild_index():
    """Force rebuild the FAISS index from stored embeddings."""
    if _matcher is None:
        raise HTTPException(status_code=503, detail="ML service not initialised")
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
    queue_info = enrollment_queue.stats
    return HealthResponse(
        status="ok",
        index_size=_matcher.index_manager.total_embeddings if _matcher else 0,
        device=_device_name,
    )
