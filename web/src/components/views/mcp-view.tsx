"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plug, Plus, Trash2, RefreshCw, Settings, Wrench, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useAppStore, type McpClientInfo } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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

interface McpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

interface EditForm {
  name: string;
  transport: "stdio" | "sse";
  command: string;
  args: string;
  url: string;
  headers: string;
}

const emptyForm: EditForm = {
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  url: "",
  headers: "",
};

export function McpView() {
  const { mcpClients, setMcpClients } = useAppStore();
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [clientTools, setClientTools] = useState<Record<string, McpTool[]>>({});
  const [loadingTools, setLoadingTools] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(emptyForm);
  const [removeTarget, setRemoveTarget] = useState<McpClientInfo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = useCallback(async () => {
    const result = await apiClient.get<McpClientInfo[]>("/api/v1/mcp/clients");
    if (result.ok && result.data) {
      setMcpClients(result.data);
    }
  }, [setMcpClients]);

  const loadTools = useCallback(async (clientName: string) => {
    setLoadingTools(clientName);
    const result = await apiClient.get<{ tools: McpTool[] }>(`/api/v1/mcp/clients/${clientName}/tools`);
    if (result.ok && result.data) {
      setClientTools((prev) => ({ ...prev, [clientName]: result.data?.tools || [] }));
    }
    setLoadingTools(null);
  }, []);

  const toggleExpand = (clientName: string) => {
    if (expandedClient === clientName) {
      setExpandedClient(null);
    } else {
      setExpandedClient(clientName);
      if (!clientTools[clientName]) {
        loadTools(clientName);
      }
    }
  };

  const handleAdd = async () => {
    if (!editForm.name.trim()) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: editForm.name.trim(),
      transport: editForm.transport,
    };
    if (editForm.transport === "stdio") {
      payload.command = editForm.command;
      if (editForm.args.trim()) {
        try {
          payload.args = JSON.parse(editForm.args);
        } catch {
          payload.args = editForm.args.split(/\s+/).filter(Boolean);
        }
      }
    } else {
      payload.url = editForm.url;
      if (editForm.headers.trim()) {
        try {
          payload.headers = JSON.parse(editForm.headers);
        } catch {
          payload.headers = {};
        }
      }
    }
    await apiClient.post("/api/v1/mcp/clients", payload);
    await loadClients();
    setShowAddDialog(false);
    setEditForm(emptyForm);
    setSaving(false);
  };

  const handleRemove = async (client: McpClientInfo) => {
    await apiClient.delete(`/api/v1/mcp/clients/${client.name}`);
    await loadClients();
    setRemoveTarget(null);
  };

  const handleReconnect = async (clientName: string) => {
    await apiClient.post(`/api/v1/mcp/clients/${clientName}/reconnect`);
    await loadClients();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-green-500/10 text-green-600 border-green-200";
      case "disconnected":
        return "bg-red-500/10 text-red-600 border-red-200";
      case "reconnecting":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "connected":
        return t("mcp.connected");
      case "disconnected":
        return t("mcp.disconnected");
      case "reconnecting":
        return t("mcp.reconnecting");
      default:
        return status;
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("mcp.title")}</h2>
        <div className="flex items-center gap-2">
          <Button onClick={loadClients} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("common.refresh")}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditForm(emptyForm); setShowAddDialog(true); }}>
            <Plus className="h-3.5 w-3.5" />
            {t("mcp.addClient")}
          </Button>
        </div>
      </div>

      {mcpClients.length > 0 ? (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-3">
            {mcpClients.map((client) => {
              const isExpanded = expandedClient === client.name;
              const tools = clientTools[client.name] || [];
              return (
                <Card key={client.name}>
                  <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleExpand(client.name)}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Plug className="h-3.5 w-3.5" />
                        </div>
                        {client.name}
                        <Badge variant="outline" className={`text-xs ${getStatusColor(client.status)}`}>
                          {getStatusLabel(client.status)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {client.transport}
                        </Badge>
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        {client.status === "disconnected" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); handleReconnect(client.name); }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setRemoveTarget(client); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0 space-y-4">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">{t("mcp.transport")}:</span>{" "}
                          <span className="font-medium">{client.transport}</span>
                        </div>
                        {client.transport === "stdio" && (
                          <div>
                            <span className="text-muted-foreground">{t("mcp.command")}:</span>{" "}
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{client.command || "-"}</code>
                          </div>
                        )}
                        {client.transport === "sse" && (
                          <div>
                            <span className="text-muted-foreground">{t("mcp.url")}:</span>{" "}
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs truncate max-w-[200px] inline-block align-bottom">
                              {client.url || "-"}
                            </code>
                          </div>
                        )}
                        {client.lastConnected && (
                          <div>
                            <span className="text-muted-foreground">{t("mcp.lastConnected")}:</span>{" "}
                            {new Date(client.lastConnected).toLocaleString()}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-medium text-muted-foreground">{t("mcp.toolList")}</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => loadTools(client.name)}
                            disabled={loadingTools === client.name}
                          >
                            {loadingTools === client.name ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                        {tools.length > 0 ? (
                          <div className="space-y-1.5">
                            {tools.map((tool) => (
                              <div
                                key={tool.name}
                                className="flex items-start gap-2 p-2 rounded-md bg-muted/50 text-xs"
                              >
                                <Wrench className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <span className="font-medium">{tool.name}</span>
                                  {tool.description && (
                                    <p className="text-muted-foreground mt-0.5">{tool.description}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : loadingTools === client.name ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-2">{t("common.noData")}</p>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Plug className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>{t("common.noData")}</p>
          <Button size="sm" className="mt-3 gap-1.5" onClick={() => { setEditForm(emptyForm); setShowAddDialog(true); }}>
            <Plus className="h-3.5 w-3.5" />
            {t("mcp.addClient")}
          </Button>
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mcp.addClient")}</DialogTitle>
            <DialogDescription>{t("mcp.editTransport")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("common.name")}</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="my-mcp-client"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("mcp.transport")}</Label>
              <Select
                value={editForm.transport}
                onValueChange={(v) => setEditForm({ ...editForm, transport: v as "stdio" | "sse" })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editForm.transport === "stdio" ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("mcp.command")}</Label>
                  <Input
                    value={editForm.command}
                    onChange={(e) => setEditForm({ ...editForm, command: e.target.value })}
                    placeholder="npx -y @modelcontextprotocol/server-filesystem"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("mcp.arguments")}</Label>
                  <Textarea
                    value={editForm.args}
                    onChange={(e) => setEditForm({ ...editForm, args: e.target.value })}
                    placeholder='["/path/to/dir"] 或 JSON 数组'
                    className="text-xs min-h-[60px]"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("mcp.url")}</Label>
                  <Input
                    value={editForm.url}
                    onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                    placeholder="http://localhost:3001/sse"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Headers (JSON)</Label>
                  <Textarea
                    value={editForm.headers}
                    onChange={(e) => setEditForm({ ...editForm, headers: e.target.value })}
                    placeholder='{"Authorization": "Bearer ..."}'
                    className="text-xs min-h-[60px]"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleAdd} disabled={!editForm.name.trim() || saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("mcp.removeClient")}</DialogTitle>
            <DialogDescription>
              {t("mcp.confirmRemove")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm font-medium">{removeTarget?.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("mcp.transport")}: {removeTarget?.transport} · {getStatusLabel(removeTarget?.status || "")}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => removeTarget && handleRemove(removeTarget)}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
