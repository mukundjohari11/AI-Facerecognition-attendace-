"""
Enrollment Queue — Thread-safe background enrollment with status tracking.

Solves:
  1. Request blocking: CPU-bound ML work runs in a thread pool, not the event loop
  2. Duplicate requests: Idempotency check before queuing (skip if already enrolled)
  3. Timeout risk: Instant response with job_id, student polls for status
  4. Failure handling: Retries with backoff, per-job error tracking
"""
import asyncio
import logging
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from PIL import Image

logger = logging.getLogger(__name__)

MAX_RETRIES = 2
MAX_JOB_HISTORY = 500  # keep last N completed jobs in memory


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class EnrollmentJob:
    job_id: str
    student_id: str
    images: List[Image.Image]
    status: JobStatus = JobStatus.QUEUED
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    retries: int = 0
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    position_in_queue: int = 0


class EnrollmentQueue:
    """
    Thread-safe enrollment queue that processes jobs sequentially
    in a background thread while keeping the async event loop free.
    """

    def __init__(self):
        self._queue: asyncio.Queue = None  # initialized in start()
        self._jobs: OrderedDict[str, EnrollmentJob] = OrderedDict()
        self._student_locks: Dict[str, str] = {}  # student_id -> active job_id
        self._lock = threading.Lock()  # protects _jobs and _student_locks
        self._matcher = None
        self._running = False
        self._worker_task = None
        self._processed_count = 0

    def set_matcher(self, matcher):
        """Inject the FaceMatcher instance."""
        self._matcher = matcher

    async def start(self):
        """Start the background worker."""
        self._queue = asyncio.Queue()
        self._running = True
        self._worker_task = asyncio.create_task(self._worker())
        logger.info("Enrollment queue worker started")

    async def stop(self):
        """Gracefully stop the worker."""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        logger.info("Enrollment queue worker stopped")

    def enqueue(self, student_id: str, images: List[Image.Image]) -> EnrollmentJob:
        """
        Add an enrollment job to the queue.

        Returns immediately with a job object containing the job_id.
        Raises ValueError if student already has an active enrollment.
        """
        with self._lock:
            # Idempotency: check if student already has an active job
            if student_id in self._student_locks:
                existing_job_id = self._student_locks[student_id]
                existing_job = self._jobs.get(existing_job_id)
                if existing_job and existing_job.status in (JobStatus.QUEUED, JobStatus.PROCESSING):
                    # Return the existing job instead of creating a duplicate
                    logger.info(
                        "Duplicate enrollment request for %s — returning existing job %s",
                        student_id, existing_job_id,
                    )
                    return existing_job

            # Check if student already enrolled in FAISS
            if self._matcher and student_id in self._matcher.index_manager._id_map.values():
                # Already enrolled — allow re-enrollment (updates embeddings)
                logger.info("Student %s already enrolled — will update embeddings", student_id)

            job_id = uuid.uuid4().hex[:12]
            job = EnrollmentJob(
                job_id=job_id,
                student_id=student_id,
                images=images,
                position_in_queue=self._queue.qsize() if self._queue else 0,
            )
            self._jobs[job_id] = job
            self._student_locks[student_id] = job_id

            # Trim old completed jobs to prevent memory leak
            self._trim_history()

        # Put on async queue (must be called from async context)
        if self._queue:
            self._queue.put_nowait(job)

        logger.info("Queued enrollment job %s for student %s (queue size: %d)",
                     job_id, student_id, self._queue.qsize() if self._queue else 0)
        return job

    def get_job(self, job_id: str) -> Optional[EnrollmentJob]:
        """Get job status by ID."""
        with self._lock:
            return self._jobs.get(job_id)

    def get_student_job(self, student_id: str) -> Optional[EnrollmentJob]:
        """Get the latest job for a student."""
        with self._lock:
            job_id = self._student_locks.get(student_id)
            if job_id:
                return self._jobs.get(job_id)
        return None

    @property
    def queue_size(self) -> int:
        return self._queue.qsize() if self._queue else 0

    @property
    def stats(self) -> Dict[str, Any]:
        with self._lock:
            active = sum(1 for j in self._jobs.values()
                         if j.status in (JobStatus.QUEUED, JobStatus.PROCESSING))
            failed = sum(1 for j in self._jobs.values() if j.status == JobStatus.FAILED)
            return {
                "queue_size": self.queue_size,
                "active_jobs": active,
                "failed_jobs": failed,
                "total_processed": self._processed_count,
            }

    async def _worker(self):
        """Background worker that processes enrollment jobs sequentially."""
        logger.info("Enrollment worker loop started")
        while self._running:
            try:
                job = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            await self._process_job(job)

    async def _process_job(self, job: EnrollmentJob):
        """Process a single enrollment job in a thread pool."""
        with self._lock:
            job.status = JobStatus.PROCESSING

        logger.info("Processing enrollment for student %s (job %s)",
                     job.student_id, job.job_id)

        try:
            # Run CPU-bound ML work in a thread pool to avoid blocking the event loop
            loop = asyncio.get_event_loop()
            count = await loop.run_in_executor(
                None,  # default thread pool
                self._matcher.enroll_student,
                job.student_id,
                job.images,
            )

            with self._lock:
                job.status = JobStatus.COMPLETED
                job.result = {
                    "embeddings_added": count,
                    "total_index_size": self._matcher.index_manager.total_embeddings,
                }
                job.completed_at = time.time()
                job.images = []  # free memory
                self._processed_count += 1

            logger.info("Enrollment completed for student %s: %d embeddings added",
                         job.student_id, count)

        except Exception as e:
            logger.exception("Enrollment failed for student %s (attempt %d/%d)",
                             job.student_id, job.retries + 1, MAX_RETRIES + 1)

            job.retries += 1
            if job.retries <= MAX_RETRIES:
                # Retry with backoff
                await asyncio.sleep(2 ** job.retries)
                with self._lock:
                    job.status = JobStatus.QUEUED
                self._queue.put_nowait(job)
                logger.info("Retrying enrollment for %s (attempt %d)",
                            job.student_id, job.retries + 1)
            else:
                with self._lock:
                    job.status = JobStatus.FAILED
                    job.error = str(e)
                    job.completed_at = time.time()
                    job.images = []  # free memory
                logger.error("Enrollment permanently failed for %s: %s",
                             job.student_id, e)

    def _trim_history(self):
        """Remove old completed/failed jobs to prevent unbounded memory growth."""
        if len(self._jobs) <= MAX_JOB_HISTORY:
            return
        to_remove = []
        for jid, job in self._jobs.items():
            if job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
                to_remove.append(jid)
            if len(self._jobs) - len(to_remove) <= MAX_JOB_HISTORY:
                break
        for jid in to_remove:
            job = self._jobs.pop(jid)
            if job.student_id in self._student_locks and self._student_locks[job.student_id] == jid:
                del self._student_locks[job.student_id]


# Singleton
enrollment_queue = EnrollmentQueue()
