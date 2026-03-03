"""
Face Detection Module — wraps MTCNN for multi-face detection and alignment.
"""
import logging
from typing import List, Tuple, Optional

import torch
import numpy as np
from PIL import Image
from facenet_pytorch import MTCNN

from app.config import (
    MIN_FACE_SIZE,
    DETECTION_THRESHOLDS,
    MAX_FACES_PER_IMAGE,
)

logger = logging.getLogger(__name__)


class FaceDetector:
    """Detects and aligns faces in images using MTCNN."""

    def __init__(self, device: Optional[torch.device] = None):
        self.device = device or torch.device(
            "cuda" if torch.cuda.is_available() else "cpu"
        )
        # MTCNN that returns cropped & aligned 160×160 face tensors
        self.mtcnn = MTCNN(
            image_size=160,
            margin=20,
            min_face_size=MIN_FACE_SIZE,
            thresholds=DETECTION_THRESHOLDS,
            factor=0.709,
            keep_all=True,          # detect ALL faces
            device=self.device,
            post_process=True,      # normalise to [-1, 1]
        )
        logger.info("FaceDetector initialised on %s", self.device)

    def detect_faces(
        self, image: Image.Image
    ) -> Tuple[Optional[torch.Tensor], Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Detect faces in a PIL Image.

        Returns
        -------
        faces : Tensor | None
            (N, 3, 160, 160) aligned face tensors, or None if no faces found.
        boxes : ndarray | None
            (N, 4) bounding boxes [x1, y1, x2, y2].
        probs : ndarray | None
            (N,) detection confidences.
        """
        boxes, probs = self.mtcnn.detect(image)

        if boxes is None or len(boxes) == 0:
            logger.warning("No faces detected in image")
            return None, None, None

        # Cap the number of faces
        if len(boxes) > MAX_FACES_PER_IMAGE:
            logger.warning(
                "Detected %d faces, capping to %d",
                len(boxes),
                MAX_FACES_PER_IMAGE,
            )
            indices = np.argsort(probs)[::-1][:MAX_FACES_PER_IMAGE]
            boxes = boxes[indices]
            probs = probs[indices]

        # Extract aligned face crops
        faces = self.mtcnn.extract(image, boxes, save_path=None)

        if faces is None:
            logger.warning("MTCNN extract returned None")
            return None, None, None

        logger.info("Detected %d face(s)", len(faces))
        return faces, boxes, probs
