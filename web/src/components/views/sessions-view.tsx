"use client";

import React, { useEffect } from "react";
import { MessageSquare, Trash2, Plus } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export function SessionsView() {
  const { sessions, setSessions, setActiveSessionId, removeSession, setActiveView } = useAppStore();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const result = await apiClient.get<{ sessions: Array<{ id: string; title?: string; createdAt: number; updatedAt: number; messageCount?: number }> }>("/api/v1/sessions");
    if (result.ok && result.data) {
      setSessions(
        (result.data.sessions || []).map((s) => ({
          id: s.id,
          title: s.title || s.id,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount || 0,
        })),
      );
    }
  };

  const handleDelete = async (id: string) => {
    await apiClient.delete(`/api/v1/sessions/${id}`);
    removeSession(id);
  };

  const handleOpen = (id: string) => {
    setActiveSessionId(id);
    setActiveView("chat");
  };

  const handleNew = () => {
    setActiveView("chat");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("sessions.title")}</h2>
        <Button onClick={handleNew} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("chat.newSession")}
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>{t("sessions.empty")}</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-2">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleOpen(session.id)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{session.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(session.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {session.messageCount} msg
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(session.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
