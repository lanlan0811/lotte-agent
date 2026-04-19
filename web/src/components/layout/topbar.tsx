"use client";

import React from "react";
import { Moon, Sun, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";

export function AppTopbar() {
  const { darkMode, setDarkMode, activeView, setConnected } = useAppStore();

  const handleRefresh = async () => {
    const result = await apiClient.health();
    setConnected(result.ok);
  };

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const viewLabels: Record<string, string> = {
    chat: t("nav.chat"),
    sessions: t("nav.sessions"),
    skills: t("nav.skills"),
    mcp: t("nav.mcp"),
    channels: t("nav.channels"),
    automation: t("nav.automation"),
    logs: t("nav.logs"),
    config: t("nav.config"),
    rag: t("nav.rag"),
  };

  return (
    <header className="flex h-12 items-center gap-2 border-b bg-background px-4">
      <h1 className="text-sm font-medium">{viewLabels[activeView] || activeView}</h1>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDark}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
