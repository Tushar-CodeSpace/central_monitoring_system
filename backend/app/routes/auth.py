"""Dashboard authentication routes."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import models as db
from app.schemas.auth import LoginRequest, TokenResponse, UserRead
from app.services import authentication as auth

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    user = db.users().find_one({"email": body.email.lower()})
    if user is None or not auth.verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    token, expires_at = auth.create_access_token(str(user["_id"]))
    return TokenResponse(access_token=token, token_type="bearer", expires_at=expires_at)


@router.get("/me", response_model=UserRead)
async def me(user: dict = Depends(auth.get_current_user)) -> UserRead:
    return UserRead(
        id=str(user["_id"]),
        email=user["email"],
        name=user.get("name"),
        role=user.get("role", "user"),
    )