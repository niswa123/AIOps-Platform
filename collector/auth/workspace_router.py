"""
Workspace management API routes for multi-tenant operations.

Provides CRUD for:
  - Organizations (create, list, update, delete)
  - Projects within organizations
  - Team membership (invite, update role, remove)
  - API Key management (create, list, revoke)
"""

import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, EmailStr

from auth.rbac import get_db, require_role, resolve_api_key, AuthContext, generate_api_key
from auth.tenant_models import Organization, Project, User, Membership, ApiKey, Role


router = APIRouter(prefix="/v1/workspaces", tags=["Workspace Management"])


# ──────────────────────── Pydantic Schemas ────────────────────────

class OrgCreate(BaseModel):
    name: str
    slug: str

class OrgUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None

class OrgResponse(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str]
    created_at: datetime.datetime

class ProjectCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    org_id: str
    name: str
    slug: str
    description: Optional[str]
    created_at: datetime.datetime

class MemberInvite(BaseModel):
    email: str
    role: str = "viewer"

class MemberResponse(BaseModel):
    id: str
    user_id: str
    email: str
    name: Optional[str]
    role: str
    invited_at: datetime.datetime
    accepted_at: Optional[datetime.datetime]

class MemberRoleUpdate(BaseModel):
    role: str

class ApiKeyCreate(BaseModel):
    name: str
    project_id: Optional[str] = None

class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    project_id: Optional[str]
    is_active: bool
    created_at: datetime.datetime
    last_used_at: Optional[datetime.datetime]

class ApiKeyCreated(ApiKeyResponse):
    raw_key: str  # Only returned once at creation time


# ──────────────────────── Organizations ────────────────────────

@router.get("/orgs", response_model=List[OrgResponse])
async def list_organizations(
    auth: AuthContext = Depends(resolve_api_key),
    db: Session = Depends(get_db),
):
    """List all organizations the current principal has access to."""
    org = db.query(Organization).filter(Organization.id == auth.org_id).first()
    if not org:
        return []
    return [OrgResponse(
        id=org.id, name=org.name, slug=org.slug,
        logo_url=org.logo_url, created_at=org.created_at,
    )]


@router.post("/orgs", response_model=OrgResponse, status_code=201)
async def create_organization(
    payload: OrgCreate,
    auth: AuthContext = Depends(resolve_api_key),
    db: Session = Depends(get_db),
):
    """Create a new organization. Caller becomes Owner."""
    existing = db.query(Organization).filter(Organization.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Organization slug '{payload.slug}' already exists")

    org = Organization(name=payload.name, slug=payload.slug)
    db.add(org)
    db.flush()

    # Make creator an Owner if they're a user
    if auth.user_id:
        m = Membership(
            user_id=auth.user_id,
            org_id=org.id,
            role=Role.OWNER,
            accepted_at=datetime.datetime.utcnow(),
        )
        db.add(m)

    db.commit()
    db.refresh(org)

    return OrgResponse(
        id=org.id, name=org.name, slug=org.slug,
        logo_url=org.logo_url, created_at=org.created_at,
    )


@router.patch("/orgs/{org_id}", response_model=OrgResponse)
async def update_organization(
    org_id: str,
    payload: OrgUpdate,
    auth: AuthContext = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Update organization details. Requires Admin or Owner role."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if payload.name is not None:
        org.name = payload.name
    if payload.logo_url is not None:
        org.logo_url = payload.logo_url

    db.commit()
    db.refresh(org)

    return OrgResponse(
        id=org.id, name=org.name, slug=org.slug,
        logo_url=org.logo_url, created_at=org.created_at,
    )


@router.delete("/orgs/{org_id}", status_code=204)
async def delete_organization(
    org_id: str,
    auth: AuthContext = Depends(require_role(Role.OWNER)),
    db: Session = Depends(get_db),
):
    """Delete an organization. Requires Owner role. Cascades to projects, keys, and memberships."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    db.delete(org)
    db.commit()


# ──────────────────────── Projects ────────────────────────

@router.get("/orgs/{org_id}/projects", response_model=List[ProjectResponse])
async def list_projects(
    org_id: str,
    auth: AuthContext = Depends(resolve_api_key),
    db: Session = Depends(get_db),
):
    """List all projects within an organization."""
    projects = db.query(Project).filter(Project.org_id == org_id).all()
    return [
        ProjectResponse(
            id=p.id, org_id=p.org_id, name=p.name,
            slug=p.slug, description=p.description, created_at=p.created_at,
        )
        for p in projects
    ]


@router.post("/orgs/{org_id}/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    org_id: str,
    payload: ProjectCreate,
    auth: AuthContext = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Create a new project within an organization. Requires Admin or Owner role."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    project = Project(
        org_id=org_id,
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    return ProjectResponse(
        id=project.id, org_id=project.org_id, name=project.name,
        slug=project.slug, description=project.description, created_at=project.created_at,
    )


@router.delete("/orgs/{org_id}/projects/{project_id}", status_code=204)
async def delete_project(
    org_id: str,
    project_id: str,
    auth: AuthContext = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Delete a project. Requires Admin or Owner role."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.org_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(project)
    db.commit()


# ──────────────────────── Team Members ────────────────────────

@router.get("/orgs/{org_id}/members", response_model=List[MemberResponse])
async def list_members(
    org_id: str,
    auth: AuthContext = Depends(resolve_api_key),
    db: Session = Depends(get_db),
):
    """List all team members of an organization."""
    memberships = db.query(Membership).options(joinedload(Membership.user)).filter(Membership.org_id == org_id).all()
    results = []
    for m in memberships:
        user = m.user
        results.append(MemberResponse(
            id=m.id,
            user_id=m.user_id,
            email=user.email if user else "unknown",
            name=user.name if user else None,
            role=m.role.value,
            invited_at=m.invited_at,
            accepted_at=m.accepted_at,
        ))
    return results


@router.post("/orgs/{org_id}/members", response_model=MemberResponse, status_code=201)
async def invite_member(
    org_id: str,
    payload: MemberInvite,
    auth: AuthContext = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Invite a user to the organization by email. Requires Admin or Owner."""
    try:
        role = Role(payload.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {payload.role}. Use: owner, admin, viewer")

    # Prevent non-owners from granting owner role
    if role == Role.OWNER and auth.role != Role.OWNER:
        raise HTTPException(status_code=403, detail="Only owners can grant the owner role")

    # Find or create the user
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        user = User(email=payload.email, provider="invited")
        db.add(user)
        db.flush()

    # Check for existing membership
    existing = db.query(Membership).filter(
        Membership.user_id == user.id,
        Membership.org_id == org_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member of this organization")

    membership = Membership(
        user_id=user.id,
        org_id=org_id,
        role=role,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)

    return MemberResponse(
        id=membership.id,
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=membership.role.value,
        invited_at=membership.invited_at,
        accepted_at=membership.accepted_at,
    )


@router.patch("/orgs/{org_id}/members/{member_id}")
async def update_member_role(
    org_id: str,
    member_id: str,
    payload: MemberRoleUpdate,
    auth: AuthContext = Depends(require_role(Role.OWNER)),
    db: Session = Depends(get_db),
):
    """Update a member's role. Requires Owner role."""
    membership = db.query(Membership).filter(
        Membership.id == member_id,
        Membership.org_id == org_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    try:
        membership.role = Role(payload.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {payload.role}")

    db.commit()
    return {"status": "updated", "role": membership.role.value}


@router.delete("/orgs/{org_id}/members/{member_id}", status_code=204)
async def remove_member(
    org_id: str,
    member_id: str,
    auth: AuthContext = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Remove a member from the organization."""
    membership = db.query(Membership).filter(
        Membership.id == member_id,
        Membership.org_id == org_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    # Prevent removing the last owner
    if membership.role == Role.OWNER:
        owner_count = db.query(Membership).filter(
            Membership.org_id == org_id,
            Membership.role == Role.OWNER,
        ).count()
        if owner_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner")

    db.delete(membership)
    db.commit()


# ──────────────────────── API Keys ────────────────────────

@router.get("/orgs/{org_id}/keys", response_model=List[ApiKeyResponse])
async def list_api_keys(
    org_id: str,
    auth: AuthContext = Depends(resolve_api_key),
    db: Session = Depends(get_db),
):
    """List all API keys for an organization."""
    keys = db.query(ApiKey).filter(
        ApiKey.org_id == org_id,
        ApiKey.is_active == True,
    ).all()
    return [
        ApiKeyResponse(
            id=k.id, name=k.name, key_prefix=k.key_prefix,
            project_id=k.project_id, is_active=k.is_active,
            created_at=k.created_at, last_used_at=k.last_used_at,
        )
        for k in keys
    ]


@router.post("/orgs/{org_id}/keys", response_model=ApiKeyCreated, status_code=201)
async def create_api_key(
    org_id: str,
    payload: ApiKeyCreate,
    auth: AuthContext = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Create a new API key. The raw key is only returned once."""
    raw_key, key_hash, key_prefix = generate_api_key()

    api_key = ApiKey(
        org_id=org_id,
        project_id=payload.project_id,
        name=payload.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        created_by=auth.user_id,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return ApiKeyCreated(
        id=api_key.id, name=api_key.name, key_prefix=api_key.key_prefix,
        project_id=api_key.project_id, is_active=api_key.is_active,
        created_at=api_key.created_at, last_used_at=api_key.last_used_at,
        raw_key=raw_key,
    )


@router.delete("/orgs/{org_id}/keys/{key_id}", status_code=204)
async def revoke_api_key(
    org_id: str,
    key_id: str,
    auth: AuthContext = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Revoke (soft-delete) an API key."""
    api_key = db.query(ApiKey).filter(
        ApiKey.id == key_id,
        ApiKey.org_id == org_id,
    ).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.is_active = False
    db.commit()
