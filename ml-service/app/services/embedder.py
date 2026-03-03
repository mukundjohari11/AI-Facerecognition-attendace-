"""
Face Embedding Module — wraps InceptionResnetV1 (FaceNet) for embedding generation.
"""
import logging
from typing import Optional

import torch
import numpy as np
from facenet_pytorch import InceptionResnetV1

from app.config import FACENET_PRETRAINED, EMBEDDING_DIM

logger = logging.getLogger(__name__)


class FaceEmbedder:
    """Generates L2-normalised 512-d face embeddings using FaceNet."""

    def __init__(self, device: Optional[torch.device] = None):
        self.device = device or torch.device(
            "cuda" if torch.cuda.is_available() else "cpu"
        )
        self.model = InceptionResnetV1(
            pretrained=FACENET_PRETRAINED,
        ).eval().to(self.device)
        logger.info("FaceEmbedder initialised on %s (dim=%d)", self.device, EMBEDDING_DIM)

    @torch.no_grad()
    def generate_embeddings(self, face_tensors: torch.Tensor) -> np.ndarray:
        """
        Generate normalised embeddings for a batch of aligned face tensors.

        Parameters
        ----------
        face_tensors : Tensor
            Shape (N, 3, 160, 160), values in [-1, 1].

        Returns
        -------
        embeddings : ndarray
            Shape (N, 512), L2-normalised.
        """
        face_tensors = face_tensors.to(self.device)

        # Batch through model
        embeddings = self.model(face_tensors).cpu().numpy()

        # L2-normalise so inner-product == cosine similarity
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)      # avoid division by zero
        embeddings = embeddings / norms

        logger.info("Generated %d embeddings", len(embeddings))
        return embeddings

    def generate_single_embedding(self, face_tensor: torch.Tensor) -> np.ndarray:
        """Convenience wrapper for a single face tensor."""
        if face_tensor.ndim == 3:
            face_tensor = face_tensor.unsqueeze(0)
        return self.generate_embeddings(face_tensor)[0]
