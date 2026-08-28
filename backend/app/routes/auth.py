"""Dashboard authentication routes."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import models as db
from app.schemas.auth import ChangePasswordRequest, LoginRequest, TokenResponse, UserRead
from app.services import authentication as auth

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    user = db.users().find_one({"email": body.email.lower()})
    if user is None or not auth.verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    token, expires_at = auth.create_access_token(user["_id"])
    return TokenResponse(access_token=token, token_type="bearer", expires_at=expires_at)


@router.get("/me", response_model=UserRead)
async def me(user: dict = Depends(auth.get_current_user)) -> UserRead:
    return UserRead(
        id=user["_id"],
        email=user["email"],
        name=user.get("name"),
        role=auth.effective_role(user),
        created_at=user.get("created_at"),
    )


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(auth.get_current_user),
) -> dict:
    if not auth.verify_password(body.current_password, current_user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 8 characters long"
        )

    new_hash = auth.hash_password(body.new_password)
    db.users().update_one({"_id": current_user["_id"]}, {"$set": {"password_hash": new_hash}})
    return {"message": "Password changed successfully"}