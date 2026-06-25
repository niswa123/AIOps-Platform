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
        user: Optional[User],
        org: Organization,
        project: Optional[Project],
        role: Role,
        api_key_id: Optional[str] = None,
    ):
        self.user = user
        self.org = org
        self.project = project
        self.role = role
        self.api_key_id = api_key_id

    @property
    def org_id(self) -> str:
        return self.org.id

    @property
    def user_id(self) -> Optional[str]:
        return self.user.id if self.user else None

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
                org = db.query(Organization).filter(Organization.id == cached["org_id"]).first()
                if org:
                    project = None
                    if cached.get("project_id"):
                        project = db.query(Project).filter(Project.id == cached["project_id"]).first()

                    return AuthContext(
                        user=None,
                        org=org,
                        project=project,
                        role=Role(cached.get("role", "viewer")),
                        api_key_id=cached.get("key_id"),
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

    org = db.query(Organization).filter(Organization.id == api_key_record.org_id).first()
    if not org:
        raise HTTPException(status_code=403, detail="Organization not found for this API key")

    project = None
    if api_key_record.project_id:
        project = db.query(Project).filter(Project.id == api_key_record.project_id).first()

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
                "org_id": org.id,
                "project_id": api_key_record.project_id or "",
                "role": role.value,
            })
            redis_client.expire(cache_key, 300)
        except Exception:
            pass

    return AuthContext(
        user=None,
        org=org,
        project=project,
        role=role,
        api_key_id=api_key_record.id,
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
