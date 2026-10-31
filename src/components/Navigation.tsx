"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Terminal, Users, Archive, Database, Building2 } from "lucide-react";

export function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Invoice Studio", icon: Terminal },
    { href: "/creators", label: "Creator Directory", icon: Users },
    { href: "/invoices", label: "Invoice Archive", icon: Archive },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-15">
          {/* Brand Mark & Identity */}
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-slate-950 text-white flex items-center justify-center font-bold text-sm tracking-tight shadow-xs border border-slate-800 group-hover:bg-slate-900 transition-colors">
                <span className="text-emerald-400 font-mono text-xs font-bold mr-0.5">D</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm tracking-tight text-slate-950">
                    Dermalist
                  </span>
                  <span className="text-[10px] font-mono font-medium tracking-wide uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    Invoice Engine
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-normal hidden sm:inline">
                  B M M Retail Private Limited
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-950 hover:bg-slate-100/80"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* System Environment Status */}
          <div className="hidden md:flex items-center gap-2.5 text-xs text-slate-500 bg-slate-50/80 border border-slate-200/80 px-2.5 py-1 rounded-md font-mono text-[11px]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <Database className="w-3 h-3 text-slate-400" />
            <span className="text-slate-600 font-sans font-medium text-xs">PostgreSQL Active</span>
          </div>
        </div>
      </div>
    </header>
  );
}
