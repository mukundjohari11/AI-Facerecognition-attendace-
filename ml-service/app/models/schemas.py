"""Pydantic request / response schemas for the ML service."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


# Requests 

class RecognizeRequest(BaseModel):
    """Sent alongside the uploaded image (multipart)."""
    section_student_ids: Optional[List[str]] = None


# Responses 

class MatchResult(BaseModel):
    student_id: str
    confidence: float
    bbox: List[float]
    detection_prob: float


class RecognizeResponse(BaseModel):
    matches: List[MatchResult]
    low_confidence: List[MatchResult]
    unknown_faces: int
    total_detected: int


class EnrollResponse(BaseModel):
    student_id: str
    embeddings_added: int
    total_index_size: int


class IndexInfoResponse(BaseModel):
    total_embeddings: int
    unique_students: int


class HealthResponse(BaseModel):
    status: str
    index_size: int
    device: str
