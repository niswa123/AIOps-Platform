"use client";

import { useState } from "react";
import {
  MOCK_ORG,
  MOCK_MEMBERS,
  MOCK_PROJECTS,
  MOCK_API_KEYS,
  OrgMember,
  OrgProject,
  OrgApiKey
} from "@/lib/mockData";
import {
  Settings,
  Building2,
  FolderKanban,
  Users,
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Clipboard,
  ShieldCheck,
  X
} from "lucide-react";

export default function SettingsPage() {
  // Tabs: "org", "projects", "team", "keys"
  const [activeTab, setActiveTab] = useState<"org" | "projects" | "team" | "keys">("org");

  // State initialized with mock data
  const [org, setOrg] = useState(MOCK_ORG);
  const [projects, setProjects] = useState<OrgProject[]>(MOCK_PROJECTS);
  const [members, setMembers] = useState<OrgMember[]>(MOCK_MEMBERS);
  const [apiKeys, setApiKeys] = useState<OrgApiKey[]>(MOCK_API_KEYS);

  // Forms states
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSlug, setNewProjectSlug] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"owner" | "admin" | "viewer">("viewer");

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyProject, setNewKeyProject] = useState(projects[0]?.name || "");

  // UI state feedback
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);

  // Helper functions
  const showFeedback = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Org updates
  const handleUpdateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    showFeedback("Organization settings updated successfully");
  };

  // Projects CRUD
  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName || !newProjectSlug) return;
    
    const newProj: OrgProject = {
      id: `proj-${Date.now().toString(36)}`,
      name: newProjectName,
      slug: newProjectSlug.toLowerCase().replace(/\s+/g, "-"),
      description: newProjectDesc,
      agent_count: 0,
      created_at: new Date().toISOString().split("T")[0]
    };

    setProjects([...projects, newProj]);
    setNewProjectName("");
    setNewProjectSlug("");
    setNewProjectDesc("");
    showFeedback(`Project "${newProj.name}" created successfully`);
  };

  const handleDeleteProject = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the project "${name}"? All associated agent trace data will be archived.`)) {
      setProjects(projects.filter(p => p.id !== id));
      showFeedback(`Project "${name}" has been deleted`);
    }
  };

  // Members CRUD
  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail || !newMemberName) return;

    const newMember: OrgMember = {
      id: `user-${Date.now().toString(36)}`,
      email: newMemberEmail,
      name: newMemberName,
      role: newMemberRole,
      avatar_initial: newMemberName.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2),
      joined: new Date().toISOString().split("T")[0],
      last_active: "Never"
    };

    setMembers([...members, newMember]);
    setNewMemberEmail("");
    setNewMemberName("");
    setNewMemberRole("viewer");
    showFeedback(`Invitation sent to ${newMember.email}`);
  };

  const handleUpdateMemberRole = (id: string, role: "owner" | "admin" | "viewer") => {
    const updated = members.map(m => {
      if (m.id === id) {
        return { ...m, role };
      }
      return m;
    });
    setMembers(updated);
    showFeedback("Team member role updated");
  };

  const handleRemoveMember = (id: string, name: string) => {
    // Basic protection: do not delete the last owner
    const owners = members.filter(m => m.role === "owner");
    const target = members.find(m => m.id === id);
    if (target?.role === "owner" && owners.length <= 1) {
      alert("Error: You cannot remove the last owner of this organization. Please promote another member to Owner first.");
      return;
    }

    if (confirm(`Are you sure you want to remove ${name} from the organization?`)) {
      setMembers(members.filter(m => m.id !== id));
      showFeedback(`Removed member ${name} from organization`);
    }
  };

  // API Keys CRUD
  const handleGenerateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName) return;

    const randomSuffix = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const fullKey = `aio_${randomSuffix.substring(0, 32)}`;
    const prefix = `${fullKey.substring(0, 8)}...`;

    const newKey: OrgApiKey = {
      id: `key-${Date.now().toString(36)}`,
      name: newKeyName,
      key_prefix: prefix,
      project: newKeyProject || projects[0]?.name || "Default Project",
      created_at: new Date().toISOString().split("T")[0],
      last_used: "Never",
      is_active: true
    };

    setApiKeys([...apiKeys, newKey]);
    setNewKeyName("");
    setNewlyGeneratedKey(fullKey);
    showFeedback(`API Key "${newKey.name}" generated successfully`);
  };

  const handleToggleKeyStatus = (id: string) => {
    setApiKeys(apiKeys.map(k => {
      if (k.id === id) {
        const nextState = !k.is_active;
        showFeedback(nextState ? "API Key enabled" : "API Key disabled");
        return { ...k, is_active: nextState };
      }
      return k;
    }));
  };

  const handleRevokeKey = (id: string, name: string) => {
    if (confirm(`Are you sure you want to permanently revoke the API key "${name}"? Any agent SDK using this key will immediately fail to authenticate.`)) {
      setApiKeys(apiKeys.filter(k => k.id !== id));
      showFeedback(`API Key "${name}" revoked`);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-base overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-border-muted flex items-center justify-between px-8 bg-bg-surface shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-accent-info" />
          <h1 className="text-sm font-semibold tracking-tight text-text-primary">
            Workspace Settings
          </h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-elevated border border-border-muted text-text-muted">
            Org: {org.name}
          </span>
        </div>

        {/* Global Feedback Banner */}
        {successMessage && (
          <div className="bg-accent-success/15 border border-accent-success/30 px-3 py-1 rounded text-[11px] font-mono text-accent-success flex items-center gap-2 animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-success animate-pulse" />
            {successMessage}
          </div>
        )}
      </header>

      {/* Workspace Area */}
      <div className="flex-1 flex min-h-0">
        
        {/* Settings Secondary Navigation Sidebar */}
        <aside className="w-56 shrink-0 border-r border-border-muted bg-bg-base/30 flex flex-col p-4 select-none">
          <span className="text-[9px] font-mono uppercase tracking-wider text-text-dim px-3 mb-2 block">
            Workspace Configuration
          </span>
          <nav className="space-y-1">
            <button
              onClick={() => { setActiveTab("org"); setNewlyGeneratedKey(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded font-sans text-xs transition-all text-left ${
                activeTab === "org"
                  ? "bg-bg-elevated text-text-primary border border-border-muted font-medium"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-elevated/40 border border-transparent"
              }`}
            >
              <Building2 className="h-4 w-4 text-text-dim" />
              <span>Organization Profile</span>
            </button>

            <button
              onClick={() => { setActiveTab("projects"); setNewlyGeneratedKey(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded font-sans text-xs transition-all text-left ${
                activeTab === "projects"
                  ? "bg-bg-elevated text-text-primary border border-border-muted font-medium"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-elevated/40 border border-transparent"
              }`}
            >
              <FolderKanban className="h-4 w-4 text-text-dim" />
              <span>Projects CRUD</span>
            </button>

            <button
              onClick={() => { setActiveTab("team"); setNewlyGeneratedKey(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded font-sans text-xs transition-all text-left ${
                activeTab === "team"
                  ? "bg-bg-elevated text-text-primary border border-border-muted font-medium"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-elevated/40 border border-transparent"
              }`}
            >
              <Users className="h-4 w-4 text-text-dim" />
              <span>Team Members</span>
            </button>

            <button
              onClick={() => { setActiveTab("keys"); setNewlyGeneratedKey(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded font-sans text-xs transition-all text-left ${
                activeTab === "keys"
                  ? "bg-bg-elevated text-text-primary border border-border-muted font-medium"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-elevated/40 border border-transparent"
              }`}
            >
              <KeyRound className="h-4 w-4 text-text-dim" />
              <span>API Ingestion Keys</span>
            </button>
          </nav>
        </aside>

        {/* Dynamic Content Pane */}
        <main className="flex-1 p-8 overflow-y-auto min-w-0">
          
          {/* TAB 1: ORGANIZATION PROFILE */}
          {activeTab === "org" && (
            <div className="max-w-2xl space-y-6">
              <div className="space-y-1 border-b border-border-muted/30 pb-4">
                <h2 className="text-sm font-semibold text-text-primary">Organization Settings</h2>
                <p className="text-xs text-text-muted">Manage your organizational profile details and subscription plan levels.</p>
              </div>

              <form onSubmit={handleUpdateOrg} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
                      Organization Name
                    </label>
                    <input
                      type="text"
                      value={org.name}
                      onChange={(e) => setOrg({ ...org, name: e.target.value })}
                      className="w-full bg-bg-surface border border-border-muted rounded px-3 py-1.5 text-xs text-text-primary font-mono focus:border-text-dim outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
                      Organization ID
                    </label>
                    <input
                      type="text"
                      value={org.id}
                      disabled
                      className="w-full bg-bg-surface/50 border border-border-muted/50 rounded px-3 py-1.5 text-xs text-text-dim font-mono cursor-not-allowed outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
                      Workspace Domain / Slug
                    </label>
                    <input
                      type="text"
                      value={org.slug}
                      onChange={(e) => setOrg({ ...org, slug: e.target.value.toLowerCase().replace(/\s+/g, "") })}
                      className="w-full bg-bg-surface border border-border-muted rounded px-3 py-1.5 text-xs text-text-primary font-mono focus:border-text-dim outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
                      Created At
                    </label>
                    <input
                      type="text"
                      value={new Date(org.created_at).toLocaleString()}
                      disabled
                      className="w-full bg-bg-surface/50 border border-border-muted/50 rounded px-3 py-1.5 text-xs text-text-dim font-mono cursor-not-allowed outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="bg-bg-elevated border border-border-muted text-text-primary text-[11px] font-mono font-bold px-4 py-2 rounded hover:border-text-dim transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              </form>

              {/* Ingest Endpoints Card */}
              <div className="border border-border-muted bg-bg-surface/30 rounded p-4 space-y-3">
                <span className="text-[9px] font-mono uppercase tracking-wider text-text-dim block">
                  SDK Telemetry Ingest Configuration
                </span>
                
                <div className="space-y-2">
                  <p className="text-xs text-text-muted leading-relaxed">
                    Set this as the telemetry base URL in your AI SDK to stream traces directly to clickhouse.
                  </p>
                  
                  <div className="flex items-center justify-between bg-bg-base border border-border-muted rounded px-3 py-2 font-mono text-[10px]">
                    <span className="text-accent-info select-all">
                      http://localhost:8000/v1/telemetry
                    </span>
                    <button
                      onClick={() => handleCopy("http://localhost:8000/v1/telemetry")}
                      className="text-text-dim hover:text-text-primary transition-colors flex items-center gap-1"
                    >
                      {copiedText === "http://localhost:8000/v1/telemetry" ? (
                        <Check className="h-3 w-3 text-accent-success" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Plan and Billing Box */}
              <div className="border border-border-muted bg-bg-surface/30 rounded p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary">Enterprise Plan: {org.plan}</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-accent-success/15 border border-accent-success/30 text-accent-success">
                      Active
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Usage current cycle: 2,345,182 / 5,000,000 ingested traces.
                  </p>
                </div>
                <button
                  onClick={() => alert("Billing updates are locked in read-only sandbox mode.")}
                  className="bg-bg-elevated border border-border-muted text-text-primary text-[10px] font-mono px-3 py-1.5 rounded hover:border-text-dim transition-all"
                >
                  Manage Billing
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PROJECTS CRUD */}
          {activeTab === "projects" && (
            <div className="max-w-4xl space-y-6">
              <div className="space-y-1 border-b border-border-muted/30 pb-4">
                <h2 className="text-sm font-semibold text-text-primary">Project Directories</h2>
                <p className="text-xs text-text-muted">Isolate and analyze metrics by separating systems into isolated workspaces.</p>
              </div>

              {/* Registered Projects Table Grid */}
              <div className="border border-border-muted rounded bg-bg-surface/15 overflow-hidden">
                <div className="grid grid-cols-12 px-4 py-2 bg-bg-surface border-b border-border-muted text-[9px] font-mono uppercase tracking-wider text-text-dim select-none">
                  <div className="col-span-3">Project Name / ID</div>
                  <div className="col-span-2">Slug identifier</div>
                  <div className="col-span-4">Description details</div>
                  <div className="col-span-2 text-center">Active Agents</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>

                <div className="divide-y divide-border-muted/30">
                  {projects.map((proj) => (
                    <div key={proj.id} className="grid grid-cols-12 px-4 py-3.5 items-center text-xs">
                      <div className="col-span-3 pr-2">
                        <span className="font-sans font-semibold text-text-primary block truncate">
                          {proj.name}
                        </span>
                        <span className="font-mono text-[9px] text-text-dim block truncate mt-0.5">
                          {proj.id}
                        </span>
                      </div>

                      <div className="col-span-2">
                        <code className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated border border-border-muted/65 text-text-muted">
                          {proj.slug}
                        </code>
                      </div>

                      <div className="col-span-4 pr-3 text-text-muted text-[11px] truncate">
                        {proj.description || "No description provided."}
                      </div>

                      <div className="col-span-2 text-center">
                        <span className="font-mono font-bold px-2 py-0.5 rounded bg-bg-elevated border border-border-muted text-text-primary">
                          {proj.agent_count}
                        </span>
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          onClick={() => handleDeleteProject(proj.id, proj.name)}
                          className="p-1 rounded text-text-dim hover:text-accent-error hover:bg-accent-error/10 transition-all"
                          title="Delete Project"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Project Section */}
              <div className="border border-border-muted bg-bg-surface/30 rounded p-6 max-w-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-accent-info" />
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wide">
                    Create New Workspace Project
                  </span>
                </div>

                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-text-dim">Project Name</label>
                      <input
                        type="text"
                        required
                        value={newProjectName}
                        onChange={(e) => {
                          setNewProjectName(e.target.value);
                          if (!newProjectSlug) {
                            setNewProjectSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                          }
                        }}
                        placeholder="e.g. Finance Agent Hub"
                        className="w-full bg-bg-base border border-border-muted rounded px-3 py-1.5 text-xs text-text-primary font-sans focus:border-text-dim outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-text-dim">Slug Identifier</label>
                      <input
                        type="text"
                        required
                        value={newProjectSlug}
                        onChange={(e) => setNewProjectSlug(e.target.value)}
                        placeholder="e.g. finance-agent-hub"
                        className="w-full bg-bg-base border border-border-muted rounded px-3 py-1.5 text-xs text-text-primary font-mono focus:border-text-dim outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-mono uppercase text-text-dim">Workspace Description</label>
                    <textarea
                      value={newProjectDesc}
                      onChange={(e) => setNewProjectDesc(e.target.value)}
                      placeholder="Explain what agents and SDKs are housed within this directory."
                      className="w-full h-16 bg-bg-base border border-border-muted rounded px-3 py-1.5 text-xs text-text-primary font-sans focus:border-text-dim outline-none resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-bg-elevated border border-border-muted text-text-primary text-[10px] font-mono font-bold px-3 py-2 rounded hover:border-text-dim transition-all flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5 text-accent-info" />
                    Register Project
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: TEAM MEMBERS & RBAC */}
          {activeTab === "team" && (
            <div className="max-w-4xl space-y-6">
              <div className="space-y-1 border-b border-border-muted/30 pb-4">
                <h2 className="text-sm font-semibold text-text-primary">Team Access Control (RBAC)</h2>
                <p className="text-xs text-text-muted">Control who can access metrics, register projects, or generate integration API credentials.</p>
              </div>

              {/* Members Table */}
              <div className="border border-border-muted rounded bg-bg-surface/15 overflow-hidden">
                <div className="grid grid-cols-12 px-4 py-2 bg-bg-surface border-b border-border-muted text-[9px] font-mono uppercase tracking-wider text-text-dim select-none">
                  <div className="col-span-4">Team Member Name / Email</div>
                  <div className="col-span-3">System Role Permission</div>
                  <div className="col-span-2">Joined Date</div>
                  <div className="col-span-2">Last System Activity</div>
                  <div className="col-span-1 text-right">Revoke</div>
                </div>

                <div className="divide-y divide-border-muted/30">
                  {members.map((member) => (
                    <div key={member.id} className="grid grid-cols-12 px-4 py-3 items-center text-xs">
                      {/* Avatar + name */}
                      <div className="col-span-4 flex items-center gap-3 pr-2">
                        <div className="h-7 w-7 rounded-full bg-bg-elevated border border-border-muted flex items-center justify-center font-mono font-semibold text-[10px] text-accent-info shrink-0 select-none">
                          {member.avatar_initial}
                        </div>
                        <div className="overflow-hidden">
                          <span className="font-sans font-semibold text-text-primary block truncate">
                            {member.name}
                          </span>
                          <span className="font-mono text-[9px] text-text-dim block truncate">
                            {member.email}
                          </span>
                        </div>
                      </div>

                      {/* Role selection dropdown */}
                      <div className="col-span-3 pr-3">
                        <select
                          value={member.role}
                          onChange={(e) => handleUpdateMemberRole(member.id, e.target.value as "owner" | "admin" | "viewer")}
                          className="bg-bg-elevated border border-border-muted text-text-primary rounded text-[11px] font-mono px-2 py-1 outline-none focus:border-text-dim transition-all cursor-pointer"
                        >
                          <option value="owner">Owner (Full Admin)</option>
                          <option value="admin">Admin (Read/Write)</option>
                          <option value="viewer">Viewer (Read-only)</option>
                        </select>
                      </div>

                      {/* Joined */}
                      <div className="col-span-2 font-mono text-[11px] text-text-muted">
                        {member.joined}
                      </div>

                      {/* Last Active */}
                      <div className="col-span-2 font-mono text-[11px] text-text-dim">
                        {member.last_active}
                      </div>

                      {/* Revoke member action */}
                      <div className="col-span-1 text-right">
                        <button
                          onClick={() => handleRemoveMember(member.id, member.name)}
                          className="p-1 rounded text-text-dim hover:text-accent-error hover:bg-accent-error/10 transition-all"
                          title="Revoke Organization Access"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Invite Member Section */}
              <div className="border border-border-muted bg-bg-surface/30 rounded p-6 max-w-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-accent-info" />
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wide">
                    Invite New Team Collaborator
                  </span>
                </div>

                <form onSubmit={handleInviteMember} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-text-dim">Full Name</label>
                      <input
                        type="text"
                        required
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="w-full bg-bg-base border border-border-muted rounded px-3 py-1.5 text-xs text-text-primary font-sans focus:border-text-dim outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-text-dim">Email Address</label>
                      <input
                        type="email"
                        required
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        placeholder="e.g. john@company.com"
                        className="w-full bg-bg-base border border-border-muted rounded px-3 py-1.5 text-xs text-text-primary font-mono focus:border-text-dim outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-mono uppercase text-text-dim">Initial RBAC Role Designation</label>
                    <div className="flex gap-4">
                      {["viewer", "admin", "owner"].map((role) => (
                        <label
                          key={role}
                          className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer transition-all ${
                            newMemberRole === role
                              ? "bg-bg-elevated border-text-dim text-text-primary font-semibold"
                              : "bg-bg-base border-border-muted text-text-muted hover:border-text-dim"
                          }`}
                        >
                          <input
                            type="radio"
                            name="newMemberRole"
                            checked={newMemberRole === role}
                            onChange={() => setNewMemberRole(role as "owner" | "admin" | "viewer")}
                            className="hidden"
                          />
                          <span className="font-mono text-[10px] capitalize">{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-bg-elevated border border-border-muted text-text-primary text-[10px] font-mono font-bold px-3 py-2 rounded hover:border-text-dim transition-all flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5 text-accent-info" />
                    Send Organization Invitation
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: API INGESTION KEYS */}
          {activeTab === "keys" && (
            <div className="max-w-4xl space-y-6">
              <div className="space-y-1 border-b border-border-muted/30 pb-4">
                <h2 className="text-sm font-semibold text-text-primary">API Ingestion Keys</h2>
                <p className="text-xs text-text-muted">Use these keys inside your application SDK configuration variables (`AIOPS_API_KEY`) to authenticate telemetry payloads.</p>
              </div>

              {/* Alert Warning newly generated key - SINGLE SIGHTING */}
              {newlyGeneratedKey && (
                <div className="border border-accent-warning/30 bg-accent-warning/10 p-5 rounded space-y-3 animate-pulse">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4.5 w-4.5 text-accent-warning" />
                    <span className="font-mono text-xs font-bold text-accent-warning uppercase">
                      New API Key Created — Save This Secret Key!
                    </span>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">
                    This credential will never be displayed in plain text again. Copy it right now and store it in a secure password vault or environment config file.
                  </p>
                  <div className="flex items-center gap-2 max-w-lg">
                    <div className="flex-1 flex items-center justify-between bg-bg-base border border-border-muted rounded px-3 py-2 font-mono text-xs text-accent-success">
                      <span>{newlyGeneratedKey}</span>
                      <button
                        onClick={() => handleCopy(newlyGeneratedKey)}
                        className="text-text-dim hover:text-text-primary transition-all flex items-center gap-1 shrink-0"
                      >
                        {copiedText === newlyGeneratedKey ? (
                          <Check className="h-3.5 w-3.5 text-accent-success" />
                        ) : (
                          <Clipboard className="h-3.5 w-3.5" />
                        )}
                        <span className="text-[10px]">Copy</span>
                      </button>
                    </div>
                    <button
                      onClick={() => setNewlyGeneratedKey(null)}
                      className="p-2 border border-border-muted rounded bg-bg-surface text-text-dim hover:text-text-primary transition-all"
                      title="Dismiss Warning"
                    >
                      <X className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* API Keys Table */}
              <div className="border border-border-muted rounded bg-bg-surface/15 overflow-hidden">
                <div className="grid grid-cols-12 px-4 py-2 bg-bg-surface border-b border-border-muted text-[9px] font-mono uppercase tracking-wider text-text-dim select-none">
                  <div className="col-span-3">Credential Name</div>
                  <div className="col-span-3">Secret Key Preview</div>
                  <div className="col-span-2">Target Project</div>
                  <div className="col-span-2 text-center">Status</div>
                  <div className="col-span-1 text-center">Last Used</div>
                  <div className="col-span-1 text-right">Revoke</div>
                </div>

                <div className="divide-y divide-border-muted/30">
                  {apiKeys.map((k) => (
                    <div key={k.id} className="grid grid-cols-12 px-4 py-3.5 items-center text-xs">
                      {/* Name */}
                      <div className="col-span-3 font-sans font-semibold text-text-primary pr-2">
                        {k.name}
                      </div>

                      {/* Prefix key */}
                      <div className="col-span-3 font-mono text-[11px] text-text-muted">
                        <code>{k.key_prefix}</code>
                      </div>

                      {/* Project target */}
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-bg-elevated border border-border-muted text-text-muted truncate block max-w-full">
                          {k.project}
                        </span>
                      </div>

                      {/* Active status switcher */}
                      <div className="col-span-2 text-center">
                        <button
                          onClick={() => handleToggleKeyStatus(k.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-semibold transition-all ${
                            k.is_active
                              ? "bg-accent-success/10 text-accent-success border-accent-success/20 hover:bg-accent-success/15"
                              : "bg-accent-error/10 text-accent-error border-accent-error/20 hover:bg-accent-error/15"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${k.is_active ? "bg-accent-success" : "bg-accent-error"}`} />
                          {k.is_active ? "Enabled" : "Disabled"}
                        </button>
                      </div>

                      {/* Last Used */}
                      <div className="col-span-1 text-center font-mono text-[10px] text-text-dim">
                        {k.last_used}
                      </div>

                      {/* Delete key */}
                      <div className="col-span-1 text-right">
                        <button
                          onClick={() => handleRevokeKey(k.id, k.name)}
                          className="p-1 rounded text-text-dim hover:text-accent-error hover:bg-accent-error/10 transition-all"
                          title="Revoke Ingest Access Key"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Generate Key Section */}
              <div className="border border-border-muted bg-bg-surface/30 rounded p-6 max-w-xl space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4.5 w-4.5 text-accent-info" />
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wide">
                    Generate New Ingestion Key
                  </span>
                </div>

                <form onSubmit={handleGenerateKey} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-text-dim">Credential Label</label>
                      <input
                        type="text"
                        required
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g. Production Collector Hook"
                        className="w-full bg-bg-base border border-border-muted rounded px-3 py-1.5 text-xs text-text-primary font-sans focus:border-text-dim outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-text-dim">Target Scope Project</label>
                      <select
                        value={newKeyProject}
                        onChange={(e) => setNewKeyProject(e.target.value)}
                        className="w-full bg-bg-base border border-border-muted rounded px-3 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-text-dim cursor-pointer"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-bg-elevated border border-border-muted text-text-primary text-[10px] font-mono font-bold px-3 py-2 rounded hover:border-text-dim transition-all flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5 text-accent-info" />
                    Generate Secret Key API
                  </button>
                </form>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
