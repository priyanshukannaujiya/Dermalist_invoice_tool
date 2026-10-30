"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Users, History, FileSpreadsheet, Database, CheckCircle2 } from "lucide-react";

export function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Studio & Preview", icon: Sparkles },
    { href: "/creators", label: "Creator Directory", icon: Users },
    { href: "/invoices", label: "Invoice Archive", icon: History },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Company branding */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-lg tracking-tight text-slate-900">
                    Dermalist
                  </span>
                  <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    AI Studio
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-500">
                  B M M RETAIL PRIVATE LIMITED
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : "text-slate-500"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Database indicator */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Database className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium text-slate-700">Neon PostgreSQL</span>
          </div>
        </div>
      </div>
    </header>
  );
}
