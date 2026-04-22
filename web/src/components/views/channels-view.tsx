"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Radio, Play, Square, RotateCw, RefreshCw, Settings, Loader2, MessageSquare } from "lucide-react";
import { useAppStore, type ChannelInfo } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

interface ChannelConfig {
  [key: string]: string | number | boolean;
}

const channelTypeLabels: Record<string, string> = {
  wechat: t("channels.wechat"),
  qq: t("channels.qq"),
  feishu: t("channels.feishu"),
  console: t("channels.console"),
  web: t("channels.web"),
};

export function ChannelsView() {
  const { channels, setChannels } = useAppStore();
  const [configTarget, setConfigTarget] = useState<ChannelInfo | null>(null);
  const [configJson, setConfigJson] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = useCallback(async () => {
    const result = await apiClient.get<ChannelInfo[]>("/api/v1/channels");
    if (result.ok && result.data) {
      setChannels(result.data);
    }
  }, [setChannels]);

  const handleStart = async (name: string) => {
    await apiClient.post(`/api/v1/channels/${name}/start`);
    await loadChannels();
  };

  const handleStop = async (name: string) => {
    await apiClient.post(`/api/v1/channels/${name}/stop`);
    await loadChannels();
  };

  const handleRestart = async (name: string) => {
    await apiClient.post(`/api/v1/channels/${name}/restart`);
    await loadChannels();
  };

  const openConfig = (channel: ChannelInfo) => {
    setConfigTarget(channel);
    setConfigJson(JSON.stringify(channel.config || {}, null, 2));
  };

  const handleSaveConfig = async () => {
    if (!configTarget) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(configJson);
      await apiClient.put(`/api/v1/channels/${configTarget.name}/config`, parsed);
      await loadChannels();
      setConfigTarget(null);
    } catch {
      // invalid JSON
    }
    setSaving(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-green-500/10 text-green-600 border-green-200";
      case "stopped":
        return "bg-red-500/10 text-red-600 border-red-200";
      case "error":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "running":
        return t("common.running");
      case "stopped":
        return t("common.stopped");
      case "error":
        return t("common.error");
      default:
        return status;
    }
  };

  const formatUptime = (ms: number) => {
    if (!ms || ms <= 0) return "-";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("channels.title")}</h2>
        <Button onClick={loadChannels} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          {t("common.refresh")}
        </Button>
      </div>

      {channels.length > 0 ? (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="grid gap-3 md:grid-cols-2">
            {channels.map((channel) => (
              <Card key={channel.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Radio className="h-3.5 w-3.5" />
                      </div>
                      {channel.name}
                      <Badge variant="outline" className={`text-xs ${getStatusColor(channel.status)}`}>
                        {getStatusLabel(channel.status)}
                      </Badge>
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">{t("channels.channelType")}:</span>{" "}
                      <span className="font-medium">{channelTypeLabels[channel.type] || channel.type}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("channels.messageCount")}:</span>{" "}
                      <span className="font-medium">{channel.messageCount ?? 0}</span>
                    </div>
                    {channel.uptime && channel.status === "running" && (
                      <div>
                        <span className="text-muted-foreground">{t("channels.uptime")}:</span>{" "}
                        <span className="font-medium">{formatUptime(channel.uptime)}</span>
                      </div>
                    )}
                    {channel.lastMessage && (
                      <div>
                        <span className="text-muted-foreground">{t("channels.lastMessage")}:</span>{" "}
                        <span className="font-medium">{new Date(channel.lastMessage).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    {channel.status === "running" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleStop(channel.name)}
                      >
                        <Square className="h-3 w-3" />
                        {t("channels.stop")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleStart(channel.name)}
                      >
                        <Play className="h-3 w-3" />
                        {t("channels.start")}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleRestart(channel.name)}
                      disabled={channel.status !== "running"}
                    >
                      <RotateCw className="h-3 w-3" />
                      {t("channels.restart")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 ml-auto"
                      onClick={() => openConfig(channel)}
                    >
                      <Settings className="h-3 w-3" />
                      {t("channels.configure")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Radio className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>{t("common.noData")}</p>
        </div>
      )}

      <Dialog open={configTarget !== null} onOpenChange={(open) => !open && setConfigTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("channels.configTitle")} - {configTarget?.name}</DialogTitle>
            <DialogDescription>
              {t("channels.channelType")}: {configTarget?.type}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">JSON {t("common.name")}</Label>
            <Textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              className="font-mono text-xs min-h-[200px]"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfigTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveConfig} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
