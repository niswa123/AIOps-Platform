"""
RBAC permission middleware and dependency injection for FastAPI.

Provides:
  - API key validation and org/project resolution from Bearer tokens
  - Role-based access guards (require_role decorator)
  - Current user context extraction
"""

import hashlib
import secrets
import datetime
from typing import Optional, List
from functools import wraps

from fastapi import Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session

from database import SessionLocal, redis_client, logger
from auth.tenant_models import (
    Organization, Project, User, Membership, ApiKey, Role
)


# ──────────────────────── Database Session Dependency ────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ──────────────────────── API Key Utilities ────────────────────────

def generate_api_key() -> tuple[str, str, str]:
    """Generate a new API key. Returns (raw_key, key_hash, key_prefix)."""
    raw_key = f"aio_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:12]
    return raw_key, key_hash, key_prefix


def hash_api_key(raw_key: str) -> str:
    """Hash a raw API key for storage/lookup."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


# ──────────────────────── Authentication Dependencies ────────────────────────

class AuthContext:
    """Resolved authentication context from API key or session token."""
    def __init__(
        self,
        user_id: Optional[str],
        org_id: str,
        project_id: Optional[str],
        role: Role,
        api_key_id: Optional[str] = None,
        db: Optional[Session] = None,
    ):
        self._user_id = user_id
        self._org_id = org_id
        self._project_id = project_id
        self.role = role
        self.api_key_id = api_key_id
        self._db = db
        self._user = None
        self._org = None
        self._project = None

    @property
    def org_id(self) -> str:
        return self._org_id

    @property
    def user_id(self) -> Optional[str]:
        return self._user_id

    @property
    def project_id(self) -> Optional[str]:
        return self._project_id

    @property
    def org(self) -> Organization:
        if not self._org and self._db and self._org_id:
            self._org = self._db.query(Organization).filter(Organization.id == self._org_id).first()
        return self._org

    @property
    def project(self) -> Optional[Project]:
        if not self._project and self._db and self._project_id:
            self._project = self._db.query(Project).filter(Project.id == self._project_id).first()
        return self._project

    @property
    def user(self) -> Optional[User]:
        if not self._user and self._db and self._user_id:
            self._user = self._db.query(User).filter(User.id == self._user_id).first()
        return self._user

    def has_role(self, minimum: Role) -> bool:
        """Check if the current role meets the minimum requirement."""
        hierarchy = {Role.VIEWER: 0, Role.ADMIN: 1, Role.OWNER: 2}
        return hierarchy.get(self.role, 0) >= hierarchy.get(minimum, 0)


async def resolve_api_key(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> AuthContext:
    """
    Resolve a Bearer API key into a full AuthContext.
    Checks Redis cache first, then falls back to Postgres.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization scheme. Use 'Bearer <api_key>'")

    raw_key = authorization[7:].strip()
    key_hash = hash_api_key(raw_key)

    # 1. Check Redis cache
    cache_key = f"apikey:{key_hash}"
    if redis_client:
        try:
            cached = redis_client.hgetall(cache_key)
            if cached and cached.get("org_id"):
                return AuthContext(
                    user_id=cached.get("user_id") or None,
                    org_id=cached["org_id"],
                    project_id=cached.get("project_id") or None,
                    role=Role(cached.get("role", "viewer")),
                    api_key_id=cached.get("key_id"),
                    db=db,
                )
        except Exception as e:
            logger.debug(f"Redis cache miss for API key: {e}")

    # 2. Lookup in Postgres
    api_key_record = db.query(ApiKey).filter(
        ApiKey.key_hash == key_hash,
        ApiKey.is_active == True,
    ).first()

    if not api_key_record:
        raise HTTPException(status_code=403, detail="Invalid or revoked API key")

    # Resolve role via creator membership
    role = Role.VIEWER
    if api_key_record.created_by:
        membership = db.query(Membership).filter(
            Membership.user_id == api_key_record.created_by,
            Membership.org_id == api_key_record.org_id,
        ).first()
        if membership:
            role = membership.role

    # Update last_used_at
    api_key_record.last_used_at = datetime.datetime.utcnow()
    db.commit()

    # 3. Write to Redis cache (TTL 5 minutes)
    if redis_client:
        try:
            redis_client.hset(cache_key, mapping={
                "key_id": api_key_record.id,
                "org_id": api_key_record.org_id,
                "project_id": api_key_record.project_id or "",
                "role": role.value,
                "user_id": api_key_record.created_by or "",
            })
            redis_client.expire(cache_key, 300)
        except Exception:
            pass

    return AuthContext(
        user_id=api_key_record.created_by,
        org_id=api_key_record.org_id,
        project_id=api_key_record.project_id,
        role=role,
        api_key_id=api_key_record.id,
        db=db,
    )


# ──────────────────────── Role Guards ────────────────────────

def require_role(minimum_role: Role):
    """
    FastAPI dependency that enforces a minimum RBAC role.

    Usage:
        @app.get("/admin-only")
        async def admin_endpoint(auth: AuthContext = Depends(require_role(Role.ADMIN))):
            ...
    """
    async def _guard(auth: AuthContext = Depends(resolve_api_key)):
        if not auth.has_role(minimum_role):
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient permissions. Required: {minimum_role.value}, current: {auth.role.value}"
            )
        return auth
    return _guard
