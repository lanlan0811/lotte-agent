"use client";

import React, { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/layout/sidebar";
import { AppTopbar } from "@/components/layout/topbar";
import { MainContent } from "@/components/layout/main-content";
import { useAppStore } from "@/lib/store";
import { wsClient } from "@/lib/ws-client";
import { apiClient } from "@/lib/api-client";
import { APP_CONFIG } from "@/lib/config";
import type { WsEvent } from "@/lib/ws-client";
import type { LogEntry } from "@/lib/store";

export default function Home() {
  const { setConnected, addLog } = useAppStore();

  useEffect(() => {
    const checkHealth = async () => {
      const result = await apiClient.health();
      setConnected(result.ok);
    };

    checkHealth();
    wsClient.connect();

    const unsub = wsClient.on("*", (event: WsEvent) => {
      if (event.type.startsWith("cron.") || event.type.startsWith("workflow.") || event.type.startsWith("channel.")) {
        addLog({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: event.timestamp || Date.now(),
          level: event.type.includes("error") || event.type.includes("failed") ? "error" : "info",
          category: event.type.split(".")[0],
          message: `${event.type}: ${JSON.stringify(event.data).slice(0, 200)}`,
        });
      }
    });

    const interval = setInterval(checkHealth, APP_CONFIG.HEALTH_CHECK_INTERVAL);

    return () => {
      wsClient.disconnect();
      unsub();
      clearInterval(interval);
    };
  }, [setConnected, addLog]);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <AppTopbar />
          <MainContent />
        </div>
      </div>
    </TooltipProvider>
  );
}
