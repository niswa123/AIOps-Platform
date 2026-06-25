"""
Multi-tenant data models for Organizations, Projects, Users, API Keys, and RBAC.

Schema supports:
  - Organizations as top-level tenants
  - Projects scoped to organizations
  - Users with role-based membership (Owner, Admin, Viewer)
  - API Keys for SDK authentication, scoped to projects
"""

from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Enum as SqlEnum, Text, Boolean, Index
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import relationship
from database import Base
import datetime
import uuid
import enum


# ──────────────────────── RBAC Role Enum ────────────────────────

class Role(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    VIEWER = "viewer"


# ──────────────────────── Organizations ────────────────────────

class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = {"schema": "public"}

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, unique=True)
    slug = Column(String(128), nullable=False, unique=True, index=True)
    logo_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")
    memberships = relationship("Membership", back_populates="organization", cascade="all, delete-orphan")
    api_keys = relationship("ApiKey", back_populates="organization", cascade="all, delete-orphan")


# ──────────────────────── Projects ────────────────────────

class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        Index("ix_projects_org_id", "org_id"),
        {"schema": "public"},
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("public.organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    slug = Column(String(128), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    organization = relationship("Organization", back_populates="projects")


# ──────────────────────── Users ────────────────────────

class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "public"}

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=True)
    avatar_url = Column(Text, nullable=True)
    password_hash = Column(String(255), nullable=True)  # null when using SSO
    provider = Column(String(50), nullable=True)  # github, google, okta, local
    provider_user_id = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan")


# ──────────────────────── Memberships (Org <-> User with Role) ────────────────────────

class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        Index("ix_memberships_user_org", "user_id", "org_id", unique=True),
        {"schema": "public"},
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(String(36), ForeignKey("public.organizations.id", ondelete="CASCADE"), nullable=False)
    role = Column(SqlEnum(Role, name="user_role", create_constraint=True), nullable=False, default=Role.VIEWER)
    invited_at = Column(DateTime, default=datetime.datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="memberships")


# ──────────────────────── API Keys ────────────────────────

class ApiKey(Base):
    __tablename__ = "api_keys"
    __table_args__ = {"schema": "public"}

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("public.organizations.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(String(36), ForeignKey("public.projects.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    key_hash = Column(String(64), nullable=False, unique=True, index=True)
    key_prefix = Column(String(12), nullable=False)  # first 8 chars for display: "aio_xxxx..."
    scopes = Column(Text, nullable=True)  # JSON list of allowed scopes
    is_active = Column(Boolean, default=True)
    created_by = Column(String(36), ForeignKey("public.users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="api_keys")
