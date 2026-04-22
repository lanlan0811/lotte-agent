"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  FileText, RefreshCw, Download, ArrowDown, Trash2, Copy, Filter, Loader2,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useAppStore, type LogEntry } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const LEVEL_COLORS: Record<string, string> = {
  error: "text-red-500 bg-red-500/10 border-red-200",
  warn: "text-yellow-500 bg-yellow-500/10 border-yellow-200",
  info: "text-blue-500 bg-blue-500/10 border-blue-200",
  debug: "text-gray-500 bg-gray-500/10 border-gray-200",
  trace: "text-purple-500 bg-purple-500/10 border-purple-200",
};

const PAGE_SIZES = [25, 50, 100, 200];

export function LogsView() {
  const { logs, setLogs } = useAppStore();
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalLogs, setTotalLogs] = useState(0);
  const [showDetail, setShowDetail] = useState<LogEntry | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLogs();
  }, [page, pageSize, levelFilter, categoryFilter]);

  const loadLogs = useCallback(async () => {
    const params: Record<string, string | number> = {
      page,
      pageSize,
    };
    if (levelFilter !== "all") params.level = levelFilter;
    if (categoryFilter !== "all") params.category = categoryFilter;
    if (searchQuery.trim()) params.search = searchQuery.trim();

    const result = await apiClient.get<{ logs: LogEntry[]; total: number; categories: string[] }>("/api/v1/logs", params);
    if (result.ok && result.data) {
      setLogs(result.data.logs || []);
      setTotalLogs(result.data.total || 0);
      if (result.data.categories) {
        setCategories(result.data.categories);
      }
    }
  }, [page, pageSize, levelFilter, categoryFilter, searchQuery, setLogs]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleClear = async () => {
    await apiClient.delete("/api/v1/logs");
    setLogs([]);
    setTotalLogs(0);
  };

  const handleExport = useCallback(() => {
    const data = logs.map((l) => ({
      timestamp: new Date(l.timestamp).toISOString(),
      level: l.level,
      category: l.category,
      message: l.message,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lotte-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  const handleCopyMessage = (message: string) => {
    navigator.clipboard.writeText(message);
  };

  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));

  const filteredLogs = searchQuery.trim()
    ? logs.filter((l) => {
        const q = searchQuery.toLowerCase();
        return (
          l.message.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q)
        );
      })
    : logs;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("logs.title")}</h2>
        <div className="flex items-center gap-2">
          <Button onClick={loadLogs} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-1.5" disabled={logs.length === 0}>
            <Download className="h-3.5 w-3.5" />
            {t("logs.export")}
          </Button>
          <Button onClick={handleClear} variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" disabled={logs.length === 0}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("logs.clear")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setPage(1); }}>
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue placeholder={t("logs.level")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("logs.level")}</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
              <SelectItem value="trace">Trace</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue placeholder={t("logs.category")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("logs.categoryAll")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadLogs()}
            placeholder={t("logs.filter")}
            className="h-7 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
          <span className="text-xs text-muted-foreground">{t("logs.autoScroll")}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t("logs.showing")} {filteredLogs.length} {t("logs.of")} {totalLogs} {t("logs.totalLogs")}
        </span>
        <div className="flex items-center gap-2">
          <span>{t("logs.pageSize")}:</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="h-6 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div ref={scrollRef} className="border rounded-md bg-background overflow-hidden">
        <ScrollArea className="h-[calc(100vh-320px)]">
          {filteredLogs.length > 0 ? (
            <div className="divide-y">
              {filteredLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30 transition-colors text-xs group"
                >
                  <span className="text-muted-foreground whitespace-nowrap font-mono shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-xs px-1.5 py-0 shrink-0 ${LEVEL_COLORS[log.level] || ""}`}
                  >
                    {log.level.toUpperCase()}
                  </Badge>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 shrink-0">
                    {log.category}
                  </Badge>
                  <span className="flex-1 min-w-0 font-mono break-all line-clamp-2">
                    {log.message}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleCopyMessage(log.message)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => setShowDetail(log)}
                    >
                      <FileText className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("common.noData")}</p>
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t("logs.page")} {page} / {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={showDetail !== null} onOpenChange={(open) => !open && setShowDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("logs.details")}</DialogTitle>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">{t("logs.timestamp")}:</span>{" "}
                  {new Date(showDetail.timestamp).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("logs.level")}:</span>{" "}
                  <Badge variant="outline" className={`text-xs ${LEVEL_COLORS[showDetail.level] || ""}`}>
                    {showDetail.level.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("logs.category")}:</span>{" "}
                  {showDetail.category}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">{t("logs.message")}:</span>
                <pre className="mt-1 p-3 bg-muted rounded-md font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-auto">
                  {showDetail.message}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetail(null)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
