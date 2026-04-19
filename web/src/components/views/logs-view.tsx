"use client";

import React, { useEffect, useState } from "react";
import { ScrollText, Trash2, Filter } from "lucide-react";
import { useAppStore, type LogEntry } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

const levelColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  error: "destructive",
  warn: "outline",
  info: "secondary",
  debug: "outline",
};

export function LogsView() {
  const { logs, setLogs } = useAppStore();
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    const result = await apiClient.get<LogEntry[]>("/api/v1/logs");
    if (result.ok && result.data) {
      setLogs(result.data);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== "all" && log.level !== levelFilter) return false;
    if (searchFilter && !log.message.toLowerCase().includes(searchFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("logs.title")}</h2>
        <Button onClick={loadLogs} variant="outline" size="sm">
          {t("common.refresh")}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-32 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder={t("logs.filter")}
          className="max-w-xs h-8"
        />
        <div className="ml-auto text-xs text-muted-foreground">
          {filteredLogs.length} / {logs.length}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-240px)]">
        <div className="space-y-1 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ScrollText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t("common.noData")}</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/50"
              >
                <span className="text-muted-foreground shrink-0 w-36">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <Badge
                  variant={levelColors[log.level] || "outline"}
                  className="shrink-0 text-[10px] px-1.5 py-0 min-w-12 justify-center"
                >
                  {log.level.toUpperCase()}
                </Badge>
                <span className="text-muted-foreground shrink-0 w-20">{log.category}</span>
                <span className="break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
