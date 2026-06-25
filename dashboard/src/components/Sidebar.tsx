"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Activity, 
  Coins, 
  Terminal, 
  Bug, 
  Layers,
  Database,
  User,
  ExternalLink,
  Settings
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    { name: "Distributed Tracing", href: "/traces", icon: Activity },
    { name: "FinOps Cost Center", href: "/finops", icon: Coins },
    { name: "Prompt Registry", href: "/prompts", icon: Terminal },
    { name: "Error Monitor", href: "/errors", icon: Bug },
    { name: "Settings & Team", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-border-muted bg-bg-surface flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Header / Logo */}
      <div className="h-16 border-b border-border-muted flex items-center px-6 gap-2">
        <Layers className="h-5 w-5 text-accent-info" />
        <span className="font-mono font-bold tracking-tight text-text-primary text-sm">
          AIOps Platform
        </span>
      </div>

      {/* Tenant / Project Selector */}
      <div className="p-4 border-b border-border-muted">
        <label className="text-[10px] uppercase font-mono tracking-wider text-text-dim block mb-1">
          Workspace Context
        </label>
        <div className="flex items-center justify-between bg-bg-base border border-border-muted rounded px-3 py-1.5 cursor-pointer hover:border-text-dim transition-all">
          <div className="flex items-center gap-2 overflow-hidden">
            <Database className="h-3.5 w-3.5 text-text-muted shrink-0" />
            <span className="font-mono text-xs text-text-primary truncate">
              niswa123 / default
            </span>
          </div>
        </div>
      </div>

      {/* Menu Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname.startsWith(item.href) || (item.href === "/traces" && pathname === "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded font-sans text-xs font-medium transition-all ${
                isActive
                  ? "bg-bg-elevated text-text-primary border border-border-muted"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-elevated/40 border border-transparent"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-accent-info" : "text-text-dim"}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Footer Info */}
      <div className="p-4 border-t border-border-muted space-y-3">
        {/* System Status Connection */}
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-text-dim">Ingest Endpoint</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-success animate-pulse" />
            <span className="text-text-muted">Live</span>
          </div>
        </div>

        {/* User context */}
        <div className="flex items-center gap-3 bg-bg-base border border-border-muted rounded p-2">
          <div className="h-7 w-7 rounded-full bg-bg-elevated flex items-center justify-center border border-border-muted">
            <User className="h-3.5 w-3.5 text-text-muted" />
          </div>
          <div className="overflow-hidden">
            <p className="text-[11px] text-text-primary truncate leading-tight font-medium">
              ape.ces@niswa123.ai
            </p>
            <p className="text-[9px] text-text-dim font-mono truncate leading-none mt-0.5">
              Admin Role
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
