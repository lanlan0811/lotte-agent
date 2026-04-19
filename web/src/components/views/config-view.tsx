"use client";

import React, { useEffect, useState } from "react";
import { Settings, Save } from "lucide-react";
import { useAppStore, type AppConfig } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

export function ConfigView() {
  const { config, setConfig } = useAppStore();
  const [aiConfig, setAiConfig] = useState("");
  const [gatewayConfig, setGatewayConfig] = useState("");
  const [toolsConfig, setToolsConfig] = useState("");
  const [channelsConfig, setChannelsConfig] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const result = await apiClient.get<AppConfig>("/api/v1/config");
    if (result.ok && result.data) {
      setConfig(result.data);
      setAiConfig(JSON.stringify(result.data.ai || {}, null, 2));
      setGatewayConfig(JSON.stringify(result.data.gateway || {}, null, 2));
      setToolsConfig(JSON.stringify(result.data.tools || {}, null, 2));
      setChannelsConfig(JSON.stringify(result.data.channels || {}, null, 2));
    }
  };

  const handleSave = async (section: string, value: string) => {
    setSaving(true);
    try {
      const parsed = JSON.parse(value);
      await apiClient.put(`/api/v1/config/${section}`, parsed);
      await loadConfig();
    } catch {
      // invalid JSON
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("config.title")}</h2>
        <Button onClick={loadConfig} variant="outline" size="sm">
          {t("common.refresh")}
        </Button>
      </div>

      <Tabs defaultValue="ai">
        <TabsList>
          <TabsTrigger value="ai">{t("config.ai")}</TabsTrigger>
          <TabsTrigger value="gateway">{t("config.gateway")}</TabsTrigger>
          <TabsTrigger value="tools">{t("config.tools")}</TabsTrigger>
          <TabsTrigger value="channels">{t("channels.title")}</TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("config.ai")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={aiConfig}
                onChange={(e) => setAiConfig(e.target.value)}
                className="font-mono text-xs min-h-[300px]"
                rows={15}
              />
              <Button onClick={() => handleSave("ai", aiConfig)} disabled={saving} size="sm" className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {t("common.save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateway">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("config.gateway")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={gatewayConfig}
                onChange={(e) => setGatewayConfig(e.target.value)}
                className="font-mono text-xs min-h-[300px]"
                rows={15}
              />
              <Button onClick={() => handleSave("gateway", gatewayConfig)} disabled={saving} size="sm" className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {t("common.save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("config.tools")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={toolsConfig}
                onChange={(e) => setToolsConfig(e.target.value)}
                className="font-mono text-xs min-h-[300px]"
                rows={15}
              />
              <Button onClick={() => handleSave("tools", toolsConfig)} disabled={saving} size="sm" className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {t("common.save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("channels.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={channelsConfig}
                onChange={(e) => setChannelsConfig(e.target.value)}
                className="font-mono text-xs min-h-[300px]"
                rows={15}
              />
              <Button onClick={() => handleSave("channels", channelsConfig)} disabled={saving} size="sm" className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {t("common.save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
