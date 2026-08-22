"""Platform settings routes (dashboard users; writes admin-only)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.services import app_settings
from app.services import authentication as auth

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


class AlertSettingsRead(BaseModel):
    ram_threshold_percent: float
    cpu_threshold_percent: float
    cpu_duration_seconds: float
    disk_threshold_percent: float


class AlertSettingsUpdate(BaseModel):
    ram_threshold_percent: Optional[float] = Field(default=None, ge=0, le=100)
    cpu_threshold_percent: Optional[float] = Field(default=None, ge=0, le=100)
    cpu_duration_seconds: Optional[int] = Field(default=None, ge=30)
    disk_threshold_percent: Optional[float] = Field(default=None, ge=0, le=100)


@router.get("", response_model=AlertSettingsRead)
async def get_settings(_: dict = Depends(auth.get_current_user)) -> AlertSettingsRead:
    """Effective alert thresholds (defaults merged with runtime overrides)."""
    return AlertSettingsRead(**app_settings.get_alert_config())


@router.patch("", response_model=AlertSettingsRead)
async def update_settings(
    body: AlertSettingsUpdate,
    _: dict = Depends(auth.require_admin),
) -> AlertSettingsRead:
    """Persist alert-threshold overrides. Admin role required."""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No settings provided",
        )
    try:
        effective = app_settings.update_alert_config(patch)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return AlertSettingsRead(**effective)
