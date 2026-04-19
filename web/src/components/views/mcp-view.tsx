"use client";

import React, { useEffect, useState } from "react";
import { Plug, Plus, Trash2, RefreshCw } from "lucide-react";
import { useAppStore, type MCPClientInfo } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export function MCPView() {
  const { mcpClients, setMcpClients } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", transport: "stdio", command: "", url: "", args: "" });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const result = await apiClient.get<MCPClientInfo[]>("/api/v1/mcp/clients");
    if (result.ok && result.data) {
      setMcpClients(result.data);
    }
  };

  const handleAdd = async () => {
    const body: Record<string, unknown> = {
      name: form.name,
      transport: form.transport,
    };
    if (form.transport === "stdio") {
      body.command = form.command;
      if (form.args) body.args = form.args.split(" ");
    } else {
      body.url = form.url;
    }

    await apiClient.post("/api/v1/mcp/clients", body);
    setShowAdd(false);
    setForm({ name: "", transport: "stdio", command: "", url: "", args: "" });
    loadClients();
  };

  const handleRemove = async (name: string) => {
    await apiClient.delete(`/api/v1/mcp/clients/${name}`);
    loadClients();
  };

  const handleReconnect = async (name: string) => {
    await apiClient.post(`/api/v1/mcp/clients/${name}/reconnect`);
    loadClients();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("mcp.title")}</h2>
        <Button onClick={() => setShowAdd(true)} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("mcp.addClient")}
        </Button>
      </div>

      {mcpClients.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Plug className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>{t("common.noData")}</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="grid gap-3 md:grid-cols-2">
            {mcpClients.map((client) => (
              <Card key={client.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Plug className="h-4 w-4 text-muted-foreground" />
                      {client.name}
                    </CardTitle>
                    <Badge variant={client.status === "connected" ? "default" : "destructive"}>
                      {client.status === "connected" ? t("mcp.connected") : t("mcp.disconnected")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t("mcp.transport")}: {client.transport}</span>
                    <span>·</span>
                    <span>{t("mcp.tools")}: {client.toolsCount}</span>
                  </div>
                  {client.error && (
                    <p className="text-xs text-destructive">{client.error}</p>
                  )}
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleReconnect(client.name)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      {t("channels.restart")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleRemove(client.name)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t("mcp.removeClient")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mcp.addClient")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="my-mcp-server"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("mcp.transport")}</Label>
              <Select value={form.transport} onValueChange={(v) => setForm({ ...form, transport: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="streamable_http">streamable_http</SelectItem>
                  <SelectItem value="sse">sse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.transport === "stdio" ? (
              <>
                <div className="space-y-2">
                  <Label>Command</Label>
                  <Input
                    value={form.command}
                    onChange={(e) => setForm({ ...form, command: e.target.value })}
                    placeholder="npx my-mcp-server"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Arguments</Label>
                  <Input
                    value={form.args}
                    onChange={(e) => setForm({ ...form, args: e.target.value })}
                    placeholder="--port 3000"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="http://localhost:3000/mcp"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleAdd} disabled={!form.name}>
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
