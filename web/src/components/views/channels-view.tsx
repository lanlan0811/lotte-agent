"use client";

import React, { useEffect } from "react";
import { Radio, Play, Square, RotateCcw } from "lucide-react";
import { useAppStore, type ChannelInfo } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ChannelsView() {
  const { channels, setChannels } = useAppStore();

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    const result = await apiClient.get<ChannelInfo[]>("/api/v1/channels");
    if (result.ok && result.data) {
      setChannels(result.data);
    }
  };

  const handleStart = async (channelType: string) => {
    await apiClient.post(`/api/v1/channels/${channelType}/start`);
    loadChannels();
  };

  const handleStop = async (channelType: string) => {
    await apiClient.post(`/api/v1/channels/${channelType}/stop`);
    loadChannels();
  };

  const handleRestart = async (channelType: string) => {
    await apiClient.post(`/api/v1/channels/${channelType}/restart`);
    loadChannels();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "running":
        return "default";
      case "stopped":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("channels.title")}</h2>
        <Button onClick={loadChannels} variant="outline" size="sm" className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          {t("common.refresh")}
        </Button>
      </div>

      {channels.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>{t("common.noData")}</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="grid gap-3 md:grid-cols-2">
            {channels.map((channel) => (
              <Card key={channel.channelType}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Radio className="h-4 w-4 text-muted-foreground" />
                      {channel.channelName || channel.channelType}
                    </CardTitle>
                    <Badge variant={statusColor(channel.status) as "default" | "secondary" | "destructive" | "outline"}>
                      {channel.status === "running"
                        ? t("common.running")
                        : channel.status === "error"
                          ? t("common.error")
                          : t("common.stopped")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{t("channels.messageCount")}: {channel.messageCount}</span>
                    {channel.connectedAt && (
                      <span>
                        {t("channels.connectedAt")}: {new Date(channel.connectedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  {channel.error && (
                    <p className="text-xs text-destructive">{channel.error}</p>
                  )}
                  <div className="flex gap-1.5">
                    {channel.status === "running" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleStop(channel.channelType)}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        {t("channels.stop")}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleStart(channel.channelType)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        {t("channels.start")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleRestart(channel.channelType)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      {t("channels.restart")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
