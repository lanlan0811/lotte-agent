"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  MessageSquare, Trash2, Plus, Search, Pencil, Check, X, ArrowUpDown,
  Clock, RotateCcw, CheckSquare, Square, Info,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type SortField = "updatedAt" | "createdAt" | "title" | "messageCount";
type SortOrder = "asc" | "desc";

interface SessionDetail {
  id: string;
  title: string;
  model: string;
  maxTurns: number;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  status: string;
}

export function SessionsView() {
  const { sessions, setSessions, setActiveSessionId, removeSession, setActiveView } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<SessionDetail | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = useCallback(async () => {
    const result = await apiClient.get<{
      sessions: Array<{
        id: string;
        title?: string;
        createdAt: number;
        updatedAt: number;
        messageCount?: number;
      }>;
    }>("/api/v1/sessions");
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
  }, [setSessions]);

  const handleDelete = async (id: string) => {
    await apiClient.delete(`/api/v1/sessions/${id}`);
    removeSession(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDeleteTarget(null);
  };

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      await apiClient.delete(`/api/v1/sessions/${id}`);
      removeSession(id);
    }
    setSelectedIds(new Set());
    setBatchDeleteOpen(false);
  };

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }
    await apiClient.put(`/api/v1/sessions/${id}`, { title: editTitle.trim() });
    setSessions(
      sessions.map((s) => (s.id === id ? { ...s, title: editTitle.trim() } : s)),
    );
    setEditingId(null);
  };

  const startEditing = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleOpen = (id: string) => {
    if (editingId === id) return;
    setActiveSessionId(id);
    setActiveView("chat");
  };

  const handleNew = () => {
    setActiveView("chat");
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSessions.map((s) => s.id)));
    }
  };

  const handleShowDetail = async (id: string) => {
    const result = await apiClient.get<SessionDetail>(`/api/v1/sessions/${id}`);
    if (result.ok && result.data) {
      setDetailTarget(result.data);
    }
  };

  const filteredSessions = sessions
    .filter((s) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "messageCount":
          cmp = a.messageCount - b.messageCount;
          break;
        case "createdAt":
          cmp = a.createdAt - b.createdAt;
          break;
        case "updatedAt":
        default:
          cmp = a.updatedAt - b.updatedAt;
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t("sessions.justNow") || "刚刚";
    if (minutes < 60) return `${minutes} ${t("sessions.minutesAgo") || "分钟前"}`;
    if (hours < 24) return `${hours} ${t("sessions.hoursAgo") || "小时前"}`;
    if (days < 7) return `${days} ${t("sessions.daysAgo") || "天前"}`;
    return new Date(timestamp).toLocaleDateString();
  };

  const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t("sessions.title")}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {sessions.length} {t("sessions.sessions") || "会话"}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {totalMessages} {t("sessions.messages") || "消息"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadSessions} variant="outline" size="sm" className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            {t("common.refresh")}
          </Button>
          <Button onClick={handleNew} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t("chat.newSession")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("sessions.search") || "搜索会话..."}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updatedAt">{t("sessions.sortByUpdated") || "更新时间"}</SelectItem>
            <SelectItem value="createdAt">{t("sessions.sortByCreated") || "创建时间"}</SelectItem>
            <SelectItem value="title">{t("sessions.sortByName") || "名称"}</SelectItem>
            <SelectItem value="messageCount">{t("sessions.sortByMessages") || "消息数"}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSortOrder}>
          <ArrowUpDown className={`h-3.5 w-3.5 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} />
        </Button>
        {searchQuery && (
          <span className="text-xs text-muted-foreground">
            {filteredSessions.length} / {sessions.length}
          </span>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={toggleSelectAll}>
            {selectedIds.size === filteredSessions.length && filteredSessions.length > 0 ? (
              <CheckSquare className="h-3.5 w-3.5" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            {selectedIds.size === filteredSessions.length && filteredSessions.length > 0
              ? t("rag.deselectAll") || "取消全选"
              : t("rag.selectAll") || "全选"}
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Badge variant="secondary" className="text-xs">
                {t("rag.selected") || "已选择"}: {selectedIds.size}
              </Badge>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setBatchDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("rag.batchDelete") || "批量删除"}
              </Button>
            </>
          )}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>{t("sessions.empty")}</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>{t("sessions.noResults") || "未找到匹配的会话"}</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-300px)]">
          <div className="space-y-2">
            {filteredSessions.map((session) => (
              <Card
                key={session.id}
                className={cn(
                  "cursor-pointer hover:bg-accent/50 transition-colors group",
                  selectedIds.has(session.id) && "ring-1 ring-primary/50 bg-primary/5",
                )}
                onClick={() => handleOpen(session.id)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <button
                    className="shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(session.id);
                    }}
                  >
                    {selectedIds.has(session.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === session.id ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(session.id);
                            if (e.key === "Escape") cancelEditing();
                          }}
                          className="h-7 text-sm"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => handleRename(session.id)}
                        >
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={cancelEditing}
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <div className="font-medium text-sm truncate">{session.title}</div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Clock className="h-3 w-3" />
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                      <span>·</span>
                      <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {session.messageCount} msg
                  </Badge>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowDetail(session.id);
                      }}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(session.id, session.title);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(session.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sessions.deleteTitle") || "删除会话"}</DialogTitle>
            <DialogDescription>
              {t("sessions.deleteConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sessions.batchDeleteTitle") || "批量删除会话"}</DialogTitle>
            <DialogDescription>
              {t("sessions.batchDeleteConfirm") || `确定要删除选中的 ${selectedIds.size} 个会话吗？此操作不可撤销。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleBatchDelete}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailTarget !== null} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sessions.detailTitle") || "会话详情"}</DialogTitle>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground text-xs">{t("common.name")}</span>
                  <p className="font-medium truncate">{detailTarget.title}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">ID</span>
                  <p className="font-mono text-xs truncate">{detailTarget.id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">{t("config.model")}</span>
                  <p className="truncate">{detailTarget.model || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">{t("common.status")}</span>
                  <Badge variant={detailTarget.status === "active" ? "default" : "secondary"} className="text-xs">
                    {detailTarget.status || "unknown"}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">{t("sessions.messages")}</span>
                  <p>{detailTarget.messageCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">{t("sessions.sortByCreated")}</span>
                  <p>{new Date(detailTarget.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <Separator />
              <div>
                <span className="text-muted-foreground text-xs">{t("sessions.sortByUpdated")}</span>
                <p>{new Date(detailTarget.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function cn(...inputs: (string | boolean | undefined | null)[]) {
  return inputs.filter(Boolean).join(" ");
}
