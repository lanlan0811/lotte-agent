"use client";

import React from "react";
import { useAppStore } from "@/lib/store";
import { ChatView } from "@/components/views/chat-view";
import { SessionsView } from "@/components/views/sessions-view";
import { SkillsView } from "@/components/views/skills-view";
import { MCPView } from "@/components/views/mcp-view";
import { ChannelsView } from "@/components/views/channels-view";
import { AutomationView } from "@/components/views/automation-view";
import { LogsView } from "@/components/views/logs-view";
import { ConfigView } from "@/components/views/config-view";
import { RAGView } from "@/components/views/rag-view";
import { NotificationView } from "@/components/views/notification-view";

const viewMap: Record<string, React.ComponentType> = {
  chat: ChatView,
  sessions: SessionsView,
  skills: SkillsView,
  mcp: MCPView,
  channels: ChannelsView,
  automation: AutomationView,
  logs: LogsView,
  config: ConfigView,
  rag: RAGView,
  notification: NotificationView,
};

export function MainContent() {
  const { activeView } = useAppStore();
  const ViewComponent = viewMap[activeView] || ChatView;

  return (
    <div className="flex-1 overflow-hidden">
      <ViewComponent />
    </div>
  );
}
