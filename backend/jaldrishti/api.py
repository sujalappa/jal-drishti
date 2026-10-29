"""HTTP API and static web app."""

from __future__ import annotations

import json
import re
import shutil
from concurrent.futures import ThreadPoolExecutor

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth, water
from .config import REPO_ROOT, settings
from .jobs import Job, is_valid_job_id, list_jobs
from .pipelines import STAGES, run_water_job

FILENAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")

app = FastAPI(title="Jal-drishti AI", version="0.1.0", dependencies=[Depends(auth.require_user)])
auth.register(app)
executor = ThreadPoolExecutor(max_workers=2)


SEED_DIR = REPO_ROOT / "seed" / "jobs"


@app.on_event("startup")
def seed_demo_jobs() -> None:
    """Hosted copies start with an empty disk: copy the bundled demo results in, once."""
    if SEED_DIR.is_dir():
        for src in SEED_DIR.iterdir():
            if src.is_dir() and not (settings.jobs_dir / src.name).exists():
                shutil.copytree(src, settings.jobs_dir / src.name)


@app.on_event("startup")
def recover_interrupted_jobs() -> None:
    for j in list_jobs():
        if j["status"] in ("queued", "running"):
            job = Job.load(j["id"])
            job.event("error", "JOB_INTERRUPTED", "The server restarted while this assessment was running",
                      action="Start the assessment again")
            job.set_status("failed")


class WaterRequest(BaseModel):
    area: str
    months: int = 24


def _load(job_id: str) -> Job:
    if not is_valid_job_id(job_id):
        raise HTTPException(404, "Assessment not found")
    try:
        return Job.load(job_id)
    except FileNotFoundError:
        raise HTTPException(404, "Assessment not found") from None


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "gee_project_configured": bool(settings.gee_project)}


@app.get("/api/areas")
def areas() -> list[dict]:
    return [{"id": k, **v} for k, v in water.AREAS.items()]


@app.post("/api/jobs/water")
def create_water(body: WaterRequest) -> dict:
    if body.area not in water.AREAS:
        raise HTTPException(404, "Area not found")
    if not 6 <= body.months <= 36:
        raise HTTPException(400, "Months must be between 6 and 36")
    job = Job.create(f"Rivers and lakes: {water.AREAS[body.area]['name']}", "water", STAGES,
                     {"area": body.area, "months": body.months})
    executor.submit(run_water_job, job)
    return {"id": job.id}


@app.get("/api/jobs")
def jobs() -> list[dict]:
    out = []
    for j in list_jobs():
        s = dict(j.get("summary") or {})
        s.pop("city_series", None)
        s.pop("method", None)
        out.append({**j, "summary": s})
    return out


@app.get("/api/jobs/{job_id}")
def job(job_id: str) -> dict:
    j = _load(job_id)
    results = j.path("results.json")
    return {**j.state, "events": j.events(),
            "results": json.loads(results.read_text(encoding="utf-8")) if results.exists() else None}


@app.get("/api/jobs/{job_id}/files/{filename}")
def job_file(job_id: str, filename: str, download: bool = False):
    j = _load(job_id)
    allowed = {v["file"] for group in j.state["outputs"].values() for v in group.values()}
    if not FILENAME_RE.fullmatch(filename) or filename not in allowed or not j.path(filename).is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(j.path(filename), filename=filename if download else None)


_dist = REPO_ROOT / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
