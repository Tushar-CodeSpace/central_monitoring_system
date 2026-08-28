"""Dashboard user management (admin only)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import models as db
from app.database.connection import new_id, parse_id
from app.schemas.auth import UserCreate, UserRead, UserUpdate
from app.services import authentication as auth

router = APIRouter(
    prefix="/api/v1/users",
    tags=["users"],
    dependencies=[Depends(auth.require_admin)],
)


def now() -> datetime:
    return datetime.now(timezone.utc)


def user_doc_to_read(doc: dict) -> UserRead:
    return UserRead(
        id=doc["_id"],
        email=doc["email"],
        name=doc.get("name"),
        role=auth.effective_role(doc),
        created_at=doc.get("created_at"),
    )


def find_user_or_404(user_id: str) -> dict:
    uid = parse_id(user_id)
    doc = db.users().find_one({"_id": uid}) if uid else None
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return doc


def admin_count() -> int:
    return db.users().count_documents({"role": "admin"})


@router.get("", response_model=list[UserRead])
async def list_users() -> list[UserRead]:
    docs = list(db.users().find().sort("created_at", 1))
    return [user_doc_to_read(d) for d in docs]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate) -> UserRead:
    email = body.email.lower()
    if db.users().find_one({"email": email}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    doc = {
        "_id": new_id(),
        "email": email,
        "password_hash": auth.hash_password(body.password),
        "name": (body.name or "").strip() or None,
        "role": body.role,
        "created_at": now(),
    }
    db.users().insert_one(doc)
    return user_doc_to_read(doc)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(user_id: str, body: UserUpdate) -> UserRead:
    doc = find_user_or_404(user_id)
    updates: dict = {}
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        name = data["name"]
        updates["name"] = name.strip() if isinstance(name, str) and name.strip() else None
    if data.get("password"):
        updates["password_hash"] = auth.hash_password(data["password"])
    if data.get("role") and data["role"] != auth.effective_role(doc):
        if auth.effective_role(doc) == "admin" and data["role"] != "admin" and admin_count() <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot demote the last admin",
            )
        updates["role"] = data["role"]
    if updates:
        db.users().update_one({"_id": doc["_id"]}, {"$set": updates})
    return user_doc_to_read(db.users().find_one({"_id": doc["_id"]}))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    current: dict = Depends(auth.require_admin),
) -> None:
    doc = find_user_or_404(user_id)
    if doc["_id"] == current["_id"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Cannot delete your own account"
        )
    if auth.effective_role(doc) == "admin" and admin_count() <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Cannot delete the last admin"
        )
    db.users().delete_one({"_id": doc["_id"]})
