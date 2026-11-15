"""Paired, local-demo crew sync. Dates are Unix milliseconds, matching Swift's codec."""
from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator


class WireModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Crew(WireModel):
    id: UUID
    displayName: str = Field(min_length=1, max_length=100)
    role: str = Field(max_length=100)
    status: Literal["nominal", "attention", "alert"]
    lastUpdated: float = Field(ge=0)


class CheckInTiming(WireModel):
    after: float = Field(ge=0)


class Event(WireModel):
    id: UUID
    crewMemberID: UUID
    type: Literal["possibleUnresponsive", "manualTest"]
    timestamp: float = Field(ge=0)
    severity: int = Field(ge=0, le=2)
    source: Literal["liveCamera", "replay", "simulated", "webCamera"]
    heuristicScore: float | None = Field(default=None, ge=0, le=1)
    details: str = Field(max_length=4000)
    acknowledged: bool = False
    acknowledgedAt: float | None = Field(default=None, ge=0)
    checkIn: dict[Literal["respondedOK", "requestedHelp", "noResponse"], CheckInTiming] | None = None

    @model_validator(mode="after")
    def validate_check_in(self):
        if self.checkIn is not None and len(self.checkIn) != 1:
            raise ValueError("Expected one check-in outcome")
        return self


class Telemetry(WireModel):
    id: UUID
    crewMemberID: UUID
    timestamp: float = Field(ge=0)
    heartRateBPM: float | None = Field(default=None, ge=0, le=400)
    activityLevel: float | None = Field(default=None, ge=0, le=1)
    source: Literal["simulated", "healthKit"]


HealthKey = Literal["heartRate", "restingHeartRate", "heartRateVariability", "respiratoryRate", "bloodOxygen"]
Standing = Literal["below", "within", "above"]


class HealthMetric(WireModel):
    key: HealthKey
    value: float | None = Field(default=None, ge=0, le=1000)
    usualLow: float | None = Field(default=None, ge=0, le=1000)
    usualHigh: float | None = Field(default=None, ge=0, le=1000)
    standing: Standing | None = None
    astronautLow: float | None = Field(default=None, ge=0, le=1000)
    astronautHigh: float | None = Field(default=None, ge=0, le=1000)
    astronautStanding: Standing | None = None


class HealthSummary(WireModel):
    """Optional, opt-in Watch summary: daily averages and ranges only. No ECG, no raw samples."""
    updatedAt: float = Field(ge=0)
    simulated: bool
    metrics: list[HealthMetric] = Field(max_length=5)

    @model_validator(mode="after")
    def unique_keys(self):
        if len({m.key for m in self.metrics}) != len(self.metrics):
            raise ValueError("Duplicate health metrics")
        return self


class Snapshot(WireModel):
    deviceID: UUID
    crew: list[Crew] = Field(min_length=1, max_length=50)
    monitoredCrewMemberID: UUID
    events: list[Event] = Field(max_length=500)
    telemetry: list[Telemetry] = Field(max_length=200)
    health: HealthSummary | None = None

    @model_validator(mode="after")
    def validate_references(self):
        ids = {c.id for c in self.crew}
        if len(ids) != len(self.crew) or self.monitoredCrewMemberID not in ids:
            raise ValueError("Invalid crew IDs")
        if any(item.crewMemberID not in ids for item in [*self.events, *self.telemetry]):
            raise ValueError("Unknown crew reference")
        if len({e.id for e in self.events}) != len(self.events):
            raise ValueError("Duplicate event IDs")
        return self


def make_router(db_path: Path) -> APIRouter:
    router = APIRouter(prefix="/sync", tags=["Crew dashboard sync"])

    @contextmanager
    def connect():
        db_path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(db_path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires REAL NOT NULL, state TEXT)")
        try:
            with db:
                yield db
        finally:
            db.close()

    def authorize(db, authorization):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Pairing code required")
        token = authorization[7:]
        if len(token) != 32:
            raise HTTPException(401, "Invalid pairing code")
        key = hashlib.sha256(token.encode()).hexdigest()
        row = db.execute("SELECT * FROM sessions WHERE token=?", (key,)).fetchone()
        if row is None or row["expires"] < time.time():
            raise HTTPException(401, "Session expired or pairing code invalid")
        return key, json.loads(row["state"]) if row["state"] else None

    @router.post("/sessions", status_code=201)
    def create_session(response: Response):
        token = secrets.token_hex(16)
        expires = time.time() + 24 * 60 * 60
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
            if db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] >= 1000:
                raise HTTPException(429, "Session capacity reached")
            db.execute("INSERT INTO sessions VALUES (?,?,NULL)", (hashlib.sha256(token.encode()).hexdigest(), expires))
        response.headers["Cache-Control"] = "no-store"
        return {"pairingCode": token, "expiresAt": expires * 1000}

    @router.get("/state")
    def get_state(response: Response, authorization: str | None = Header(default=None)):
        with connect() as db:
            _, state = authorize(db, authorization)
        response.headers["Cache-Control"] = "no-store"
        return {"snapshot": state}

    @router.put("/state")
    def publish(body: Snapshot, response: Response, authorization: str | None = Header(default=None)):
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            key, previous = authorize(db, authorization)
            state = body.model_dump(mode="json")
            if previous and previous["deviceID"] != state["deviceID"]:
                raise HTTPException(409, "This session is paired with another iPhone. Create a new session.")
            # Preserve existing event identity/content and monotonic acknowledgements.
            events = {e["id"]: e for e in previous["events"]} if previous else {}
            for event in state["events"]:
                if event["id"] not in events:
                    events[event["id"]] = event
                elif event["acknowledged"] and not events[event["id"]]["acknowledged"]:
                    events[event["id"]]["acknowledged"] = True
                    events[event["id"]]["acknowledgedAt"] = event["acknowledgedAt"] or time.time() * 1000
            state["events"] = sorted(events.values(), key=lambda e: e["timestamp"], reverse=True)[:500]
            state["receivedAt"] = time.time() * 1000
            db.execute("UPDATE sessions SET state=? WHERE token=?", (json.dumps(state), key))
        response.headers["Cache-Control"] = "no-store"
        return {"snapshot": state}

    @router.post("/events/{event_id}/acknowledge")
    def acknowledge(event_id: UUID, authorization: str | None = Header(default=None)):
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            key, state = authorize(db, authorization)
            event = next((e for e in (state or {}).get("events", []) if e["id"] == str(event_id)), None)
            if event is None:
                raise HTTPException(404, "Event not found")
            if not event["acknowledged"]:
                event["acknowledged"] = True
                event["acknowledgedAt"] = time.time() * 1000
                db.execute("UPDATE sessions SET state=? WHERE token=?", (json.dumps(state), key))
        return {"acknowledged": True}

    @router.delete("/session", status_code=204)
    def end_session(authorization: str | None = Header(default=None)):
        with connect() as db:
            key, _ = authorize(db, authorization)
            db.execute("DELETE FROM sessions WHERE token=?", (key,))

    return router
