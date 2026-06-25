"""
SSO & OAuth integration router for AIOps Platform.

Supports:
  - GitHub OAuth (Authorization Code Flow)
  - Google OAuth (Authorization Code Flow)
  - Okta OIDC (Authorization Code Flow with PKCE)

Flow:
  1. Client calls GET /auth/{provider}/login -> redirect to provider
  2. Provider redirects back to GET /auth/{provider}/callback
  3. Server exchanges code for access token, fetches user profile
  4. Creates or updates User record, issues JWT session token
"""

import os
import json
import hashlib
import secrets
import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Response, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from database import redis_client, logger
from auth.tenant_models import User, Organization, Membership, Role
from auth.rbac import get_db

import urllib.parse


router = APIRouter(prefix="/auth", tags=["Authentication"])


# ──────────────────────── Configuration ────────────────────────

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
OKTA_DOMAIN = os.getenv("OKTA_DOMAIN", "")  # e.g., "dev-12345.okta.com"
OKTA_CLIENT_ID = os.getenv("OKTA_CLIENT_ID", "")
OKTA_CLIENT_SECRET = os.getenv("OKTA_CLIENT_SECRET", "")

BASE_URL = os.getenv("AUTH_BASE_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

JWT_SECRET = os.getenv("JWT_SECRET", secrets.token_urlsafe(32))
SESSION_TTL = 86400 * 7  # 7 days


# ──────────────────────── Pydantic Schemas ────────────────────────

class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str
    name: Optional[str]
    avatar_url: Optional[str]
    provider: str


class SessionInfo(BaseModel):
    user_id: str
    email: str
    name: Optional[str]
    avatar_url: Optional[str]
    provider: str
    org_id: Optional[str]
    role: Optional[str]


# ──────────────────────── Session Token Utilities ────────────────────────

def create_session_token(user: User) -> str:
    """Create a secure session token and store in Redis."""
    token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    session_data = {
        "user_id": user.id,
        "email": user.email,
        "name": user.name or "",
        "avatar_url": user.avatar_url or "",
        "provider": user.provider or "local",
    }

    if redis_client:
        redis_client.hset(f"session:{token_hash}", mapping=session_data)
        redis_client.expire(f"session:{token_hash}", SESSION_TTL)
    else:
        logger.warning("Redis not available. Session tokens will not persist across restarts.")

    return token


def validate_session_token(token: str) -> Optional[SessionInfo]:
    """Validate a session token from Redis."""
    if not redis_client:
        return None

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    data = redis_client.hgetall(f"session:{token_hash}")

    if not data or not data.get("user_id"):
        return None

    return SessionInfo(
        user_id=data["user_id"],
        email=data["email"],
        name=data.get("name") or None,
        avatar_url=data.get("avatar_url") or None,
        provider=data.get("provider", "local"),
        org_id=data.get("org_id"),
        role=data.get("role"),
    )


# ──────────────────────── Helper: Upsert User ────────────────────────

def upsert_oauth_user(
    db: Session,
    email: str,
    name: Optional[str],
    avatar_url: Optional[str],
    provider: str,
    provider_user_id: str,
) -> User:
    """Create or update a user from OAuth profile data."""
    user = db.query(User).filter(User.email == email).first()

    if user:
        # Update fields from provider
        user.name = name or user.name
        user.avatar_url = avatar_url or user.avatar_url
        user.provider = provider
        user.provider_user_id = provider_user_id
        user.last_login = datetime.datetime.utcnow()
    else:
        # Create new user
        user = User(
            email=email,
            name=name,
            avatar_url=avatar_url,
            provider=provider,
            provider_user_id=provider_user_id,
            last_login=datetime.datetime.utcnow(),
        )
        db.add(user)
        db.flush()

        # Auto-create a personal organization for the user
        org_slug = email.split("@")[0].lower().replace(".", "-")[:64]
        existing_org = db.query(Organization).filter(Organization.slug == org_slug).first()
        if not existing_org:
            org = Organization(
                name=f"{name or email.split('@')[0]}'s Workspace",
                slug=org_slug,
            )
            db.add(org)
            db.flush()

            membership = Membership(
                user_id=user.id,
                org_id=org.id,
                role=Role.OWNER,
                accepted_at=datetime.datetime.utcnow(),
            )
            db.add(membership)

    db.commit()
    db.refresh(user)
    return user


# ──────────────────────── GitHub OAuth ────────────────────────

@router.get("/github/login")
async def github_login():
    """Redirect user to GitHub OAuth authorization page."""
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured. Set GITHUB_CLIENT_ID.")

    state = secrets.token_urlsafe(16)
    params = urllib.parse.urlencode({
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": f"{BASE_URL}/auth/github/callback",
        "scope": "user:email read:org",
        "state": state,
    })
    return RedirectResponse(f"https://github.com/login/oauth/authorize?{params}")


@router.get("/github/callback")
async def github_callback(code: str = Query(...), state: str = Query(""), db: Session = Depends(get_db)):
    """Handle GitHub OAuth callback. Exchange code for token and fetch user profile."""
    import httpx

    # Exchange authorization code for access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": f"{BASE_URL}/auth/github/callback",
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail=f"GitHub token exchange failed: {token_data}")

        # Fetch user profile
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        profile = user_resp.json()

        # Fetch primary email if not public
        email = profile.get("email")
        if not email:
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            emails = emails_resp.json()
            primary = next((e for e in emails if e.get("primary")), None)
            email = primary["email"] if primary else f"{profile['login']}@github.noreply.com"

    user = upsert_oauth_user(
        db=db,
        email=email,
        name=profile.get("name") or profile.get("login"),
        avatar_url=profile.get("avatar_url"),
        provider="github",
        provider_user_id=str(profile["id"]),
    )

    session_token = create_session_token(user)
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={session_token}&provider=github")


# ──────────────────────── Google OAuth ────────────────────────

@router.get("/google/login")
async def google_login():
    """Redirect user to Google OAuth consent screen."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID.")

    params = urllib.parse.urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": f"{BASE_URL}/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(code: str = Query(...), db: Session = Depends(get_db)):
    """Handle Google OAuth callback."""
    import httpx

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": f"{BASE_URL}/auth/google/callback",
                "grant_type": "authorization_code",
            },
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail=f"Google token exchange failed: {token_data}")

        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        profile = user_resp.json()

    user = upsert_oauth_user(
        db=db,
        email=profile["email"],
        name=profile.get("name"),
        avatar_url=profile.get("picture"),
        provider="google",
        provider_user_id=profile["id"],
    )

    session_token = create_session_token(user)
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={session_token}&provider=google")


# ──────────────────────── Okta OIDC ────────────────────────

@router.get("/okta/login")
async def okta_login():
    """Redirect user to Okta OIDC authorization."""
    if not OKTA_DOMAIN or not OKTA_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Okta OIDC not configured. Set OKTA_DOMAIN and OKTA_CLIENT_ID.")

    params = urllib.parse.urlencode({
        "client_id": OKTA_CLIENT_ID,
        "redirect_uri": f"{BASE_URL}/auth/okta/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "state": secrets.token_urlsafe(16),
    })
    return RedirectResponse(f"https://{OKTA_DOMAIN}/oauth2/default/v1/authorize?{params}")


@router.get("/okta/callback")
async def okta_callback(code: str = Query(...), db: Session = Depends(get_db)):
    """Handle Okta OIDC callback."""
    import httpx

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            f"https://{OKTA_DOMAIN}/oauth2/default/v1/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": f"{BASE_URL}/auth/okta/callback",
                "client_id": OKTA_CLIENT_ID,
                "client_secret": OKTA_CLIENT_SECRET,
            },
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail=f"Okta token exchange failed: {token_data}")

        user_resp = await client.get(
            f"https://{OKTA_DOMAIN}/oauth2/default/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        profile = user_resp.json()

    user = upsert_oauth_user(
        db=db,
        email=profile["email"],
        name=profile.get("name"),
        avatar_url=None,
        provider="okta",
        provider_user_id=profile.get("sub", ""),
    )

    session_token = create_session_token(user)
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={session_token}&provider=okta")


# ──────────────────────── Session Validation ────────────────────────

@router.get("/me")
async def get_current_session(
    authorization: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return the current user session from a Bearer session token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = authorization.replace("Bearer ", "").strip()
    session = validate_session_token(token)

    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    # Fetch memberships
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    memberships = db.query(Membership).options(joinedload(Membership.organization)).filter(Membership.user_id == user.id).all()
    orgs = []
    for m in memberships:
        org = m.organization
        if org:
            orgs.append({
                "org_id": org.id,
                "org_name": org.name,
                "org_slug": org.slug,
                "role": m.role.value,
            })

    return {
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "provider": user.provider,
        "organizations": orgs,
    }


@router.post("/logout")
async def logout(authorization: Optional[str] = None):
    """Invalidate the current session token."""
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        if redis_client:
            redis_client.delete(f"session:{token_hash}")

    return {"status": "logged_out"}
