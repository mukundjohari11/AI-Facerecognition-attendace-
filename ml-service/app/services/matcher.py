"""
Face Matching Pipeline — orchestrates detection → embedding → search → filtering.
"""
import logging
from typing import Any, Dict, List, Optional

import numpy as np
import torch
from PIL import Image

from app.config import (
    SIMILARITY_THRESHOLD,
    LOW_CONFIDENCE_LOWER,
    LOW_CONFIDENCE_UPPER,
)
from app.services.detector import FaceDetector
from app.services.embedder import FaceEmbedder
from app.services.faiss_index import FAISSIndexManager

logger = logging.getLogger(__name__)


class FaceMatcher:
    """
    End-to-end face matching pipeline.

    Pipeline:
      1. MTCNN detects & aligns faces
      2. FaceNet generates batch embeddings
      3. FAISS batch nearest-neighbour search
      4. Apply similarity threshold
      5. Deduplicate (one match per student)
      6. Flag unknowns / low-confidence matches
    """

    def __init__(
        self,
        detector: FaceDetector,
        embedder: FaceEmbedder,
        index_manager: FAISSIndexManager,
    ):
        self.detector = detector
        self.embedder = embedder
        self.index_manager = index_manager

    def match_faces(
        self,
        image: Image.Image,
        allowed_student_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Run the full recognition pipeline on a classroom image.

        Parameters
        ----------
        image : PIL.Image
            The classroom / group photo.
        allowed_student_ids : list[str] | None
            If provided, only return matches for these students (section filter).

        Returns
        -------
        dict with keys:
            matches        — list of high-confidence matches
            low_confidence — list of matches needing review
            unknown_faces  — count of unrecognised faces
            total_detected — total faces detected in frame
        """
        # Step 1: Detect faces
        faces, boxes, probs = self.detector.detect_faces(image)
        if faces is None:
            return {
                "matches": [],
                "low_confidence": [],
                "unknown_faces": 0,
                "total_detected": 0,
            }

        total_detected = len(faces)
        logger.info("Pipeline: %d faces detected", total_detected)

        # Step 2: Batch generate embeddings
        embeddings = self.embedder.generate_embeddings(faces)

        # Step 3: FAISS batch search
        distances, candidate_ids = self.index_manager.search(embeddings, k=1)

        # Step 4–6: Threshold, deduplicate, flag unknowns
        matches: List[Dict[str, Any]] = []
        low_confidence: List[Dict[str, Any]] = []
        unknown_count = 0
        seen_students: set = set()

        for i in range(total_detected):
            sim = float(distances[i][0])
            student_id = candidate_ids[i][0]
            bbox = boxes[i].tolist() if boxes is not None else []
            det_prob = float(probs[i]) if probs is not None else 0.0

            # Unknown face
            if sim < LOW_CONFIDENCE_LOWER or not student_id:
                unknown_count += 1
                continue

            # Section filter
            if allowed_student_ids and student_id not in allowed_student_ids:
                continue

            # Deduplicate — keep highest confidence per student
            if student_id in seen_students:
                # Update if this detection has higher confidence
                for m in matches + low_confidence:
                    if m["student_id"] == student_id and sim > m["confidence"]:
                        m["confidence"] = sim
                        m["bbox"] = bbox
                        break
                continue

            seen_students.add(student_id)

            record = {
                "student_id": student_id,
                "confidence": sim,
                "bbox": bbox,
                "detection_prob": det_prob,
            }

            if sim >= SIMILARITY_THRESHOLD:
                matches.append(record)
            elif sim >= LOW_CONFIDENCE_LOWER:
                low_confidence.append(record)

        # Sort by confidence descending
        matches.sort(key=lambda m: m["confidence"], reverse=True)
        low_confidence.sort(key=lambda m: m["confidence"], reverse=True)

        logger.info(
            "Pipeline results: %d matches, %d low-confidence, %d unknown",
            len(matches),
            len(low_confidence),
            unknown_count,
        )

        return {
            "matches": matches,
            "low_confidence": low_confidence,
            "unknown_faces": unknown_count,
            "total_detected": total_detected,
        }

    def match_faces_multi(
        self,
        images: List[Image.Image],
        allowed_student_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Run recognition on MULTIPLE classroom photos and merge results.

        Faces from all photos are processed, and results are merged by keeping
        the highest confidence per student across all images. This handles
        scenarios where some students are not visible in one angle but visible
        in another.
        """
        if not images:
            return {
                "matches": [],
                "low_confidence": [],
                "unknown_faces": 0,
                "total_detected": 0,
            }

        # If only one image, use the standard method
        if len(images) == 1:
            return self.match_faces(images[0], allowed_student_ids)

        # Process each image separately
        all_matches: Dict[str, Dict[str, Any]] = {}  # student_id -> best record
        all_low_conf: Dict[str, Dict[str, Any]] = {}
        total_unknown = 0
        total_detected = 0

        for idx, image in enumerate(images):
            logger.info("Processing image %d/%d", idx + 1, len(images))
            result = self.match_faces(image, allowed_student_ids)
            total_detected += result["total_detected"]
            total_unknown += result["unknown_faces"]

            # Merge matches — keep best confidence per student
            for m in result["matches"]:
                sid = m["student_id"]
                if sid not in all_matches or m["confidence"] > all_matches[sid]["confidence"]:
                    all_matches[sid] = m
                # If previously low-confidence, promote to match
                if sid in all_low_conf:
                    del all_low_conf[sid]

            for m in result["low_confidence"]:
                sid = m["student_id"]
                # Don't downgrade a high-confidence match
                if sid in all_matches:
                    continue
                if sid not in all_low_conf or m["confidence"] > all_low_conf[sid]["confidence"]:
                    all_low_conf[sid] = m

        matches = sorted(all_matches.values(), key=lambda m: m["confidence"], reverse=True)
        low_confidence = sorted(all_low_conf.values(), key=lambda m: m["confidence"], reverse=True)

        logger.info(
            "Multi-image results (%d photos): %d matches, %d low-confidence, %d unknown, %d total faces",
            len(images), len(matches), len(low_confidence), total_unknown, total_detected,
        )

        return {
            "matches": matches,
            "low_confidence": low_confidence,
            "unknown_faces": total_unknown,
            "total_detected": total_detected,
            "images_processed": len(images),
        }

    def enroll_student(
        self, student_id: str, images: List[Image.Image]
    ) -> int:
        """
        Enroll a student from one or more face images.

        Returns the number of embeddings added.
        """
        all_embeddings = []

        for img in images:
            faces, _, _ = self.detector.detect_faces(img)
            if faces is None or len(faces) == 0:
                logger.warning("No face found in enrollment image for %s", student_id)
                continue
            # Use only the first (best) face from each image
            emb = self.embedder.generate_single_embedding(faces[0])
            all_embeddings.append(emb)

        if not all_embeddings:
            raise ValueError(f"No valid faces found in any images for student {student_id}")

        embeddings_matrix = np.array(all_embeddings, dtype=np.float32)
        ids = [student_id] * len(all_embeddings)
        self.index_manager.add_embeddings(embeddings_matrix, ids)

        logger.info("Enrolled student %s with %d embedding(s)", student_id, len(all_embeddings))
        return len(all_embeddings)
