"use client";

import React from "react";
import {
  MessageSquare,
  Bot,
  Wrench,
  Plug,
  Radio,
  Clock,
  ScrollText,
  Settings,
  Database,
  ChevronLeft,
  ChevronRight,
  Zap,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { id: "chat", icon: MessageSquare, labelKey: "nav.chat" },
  { id: "sessions", icon: Bot, labelKey: "nav.sessions" },
  { id: "skills", icon: Wrench, labelKey: "nav.skills" },
  { id: "mcp", icon: Plug, labelKey: "nav.mcp" },
  { id: "channels", icon: Radio, labelKey: "nav.channels" },
  { id: "automation", icon: Clock, labelKey: "nav.automation" },
  { id: "logs", icon: ScrollText, labelKey: "nav.logs" },
  { id: "config", icon: Settings, labelKey: "nav.config" },
  { id: "rag", icon: Database, labelKey: "nav.rag" },
  { id: "notification", icon: Bell, labelKey: "nav.notification" },
];

export function AppSidebar() {
  const { sidebarOpen, toggleSidebar, activeView, setActiveView, connected } = useAppStore();

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out",
        sidebarOpen ? "w-56" : "w-14",
      )}
    >
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        {sidebarOpen && (
          <span className="font-semibold text-sm tracking-tight truncate">
            {t("common.appName")}
          </span>
        )}
        <div
          className={cn(
            "ml-auto h-2 w-2 rounded-full",
            connected ? "bg-green-500" : "bg-red-500",
          )}
        />
      </div>

      <nav className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          const btn = (
            <Button
              key={item.id}
              variant={isActive ? "secondary" : "ghost"}
              size={sidebarOpen ? "default" : "icon"}
              className={cn(
                "w-full",
                sidebarOpen ? "justify-start gap-3 px-3" : "justify-center",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
              onClick={() => setActiveView(item.id)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && (
                <span className="text-sm truncate">{t(item.labelKey)}</span>
              )}
            </Button>
          );

          if (!sidebarOpen) {
            return (
              <Tooltip key={item.id} delayDuration={0}>
                <TooltipTrigger asChild>{btn}</TooltipTrigger>
                <TooltipContent side="right" className="font-sans">
                  {t(item.labelKey)}
                </TooltipContent>
              </Tooltip>
            );
          }

          return btn;
        })}
      </nav>

      <Separator />
      <div className="p-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-full h-8"
          onClick={toggleSidebar}
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
