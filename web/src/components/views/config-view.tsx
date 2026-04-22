"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Settings, Save, RefreshCw, Loader2, Plus, Trash2, Eye, EyeOff, TestTube,
} from "lucide-react";
import { useAppStore, type AppConfig } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AiProvider {
  name: string;
  url: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
}

interface GatewayConfig {
  host: string;
  port: number;
  authMode: string;
  token: string;
  web: {
    enabled: boolean;
    root: string;
    basePath: string;
  };
}

interface ToolConfig {
  shell: { enabled: boolean; timeout: number };
  gitBash: { enabled: boolean; path: string };
  fileSystem: { enabled: boolean; allowedPaths: string[] };
}

export function ConfigView() {
  const { config, setConfig } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const [aiProviders, setAiProviders] = useState<AiProvider[]>([]);
  const [gatewayCfg, setGatewayCfg] = useState<GatewayConfig>({
    host: "0.0.0.0",
    port: 3000,
    authMode: "token",
    token: "",
    web: { enabled: false, root: "", basePath: "/" },
  });
  const [toolCfg, setToolCfg] = useState<ToolConfig>({
    shell: { enabled: true, timeout: 30000 },
    gitBash: { enabled: true, path: "" },
    fileSystem: { enabled: false, allowedPaths: [] },
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = useCallback(async () => {
    const result = await apiClient.get<AppConfig>("/api/v1/config");
    if (result.ok && result.data) {
      setConfig(result.data);
      const d = result.data;
      if (d.ai) {
        const providers: AiProvider[] = [];
        const ai = d.ai as Record<string, unknown>;
        if (ai.providers && Array.isArray(ai.providers)) {
          for (const p of ai.providers as Record<string, unknown>[]) {
            providers.push({
              name: String(p.name || ""),
              url: String(p.url || ""),
              apiKey: String(p.apiKey || ""),
              models: Array.isArray(p.models) ? p.models.map(String) : [],
              defaultModel: String(p.defaultModel || ""),
            });
          }
        }
        setAiProviders(providers);
      }
      if (d.gateway) {
        const gw = d.gateway as Record<string, unknown>;
        const web = (gw.web as Record<string, unknown>) || {};
        setGatewayCfg({
          host: String(gw.host || "0.0.0.0"),
          port: Number(gw.port || 3000),
          authMode: String(gw.authMode || "token"),
          token: String(gw.token || ""),
          web: {
            enabled: Boolean(web.enabled),
            root: String(web.root || ""),
            basePath: String(web.basePath || "/"),
          },
        });
      }
      if (d.tools) {
        const tools = d.tools as Record<string, unknown>;
        const shell = (tools.shell as Record<string, unknown>) || {};
        const gitBash = (tools.gitBash as Record<string, unknown>) || {};
        const fs = (tools.fileSystem as Record<string, unknown>) || {};
        setToolCfg({
          shell: { enabled: Boolean(shell.enabled ?? true), timeout: Number(shell.timeout || 30000) },
          gitBash: { enabled: Boolean(gitBash.enabled ?? true), path: String(gitBash.path || "") },
          fileSystem: {
            enabled: Boolean(fs.enabled ?? false),
            allowedPaths: Array.isArray(fs.allowedPaths) ? fs.allowedPaths.map(String) : [],
          },
        });
      }
    }
  }, [setConfig]);

  const handleSave = async () => {
    setSaving(true);
    const payload: Record<string, unknown> = {
      ai: {
        providers: aiProviders.map((p) => ({
          name: p.name,
          url: p.url,
          apiKey: p.apiKey,
          models: p.models,
          defaultModel: p.defaultModel,
        })),
      },
      gateway: {
        host: gatewayCfg.host,
        port: gatewayCfg.port,
        authMode: gatewayCfg.authMode,
        token: gatewayCfg.token,
        web: gatewayCfg.web,
      },
      tools: {
        shell: toolCfg.shell,
        gitBash: toolCfg.gitBash,
        fileSystem: toolCfg.fileSystem,
      },
    };
    const result = await apiClient.put("/api/v1/config", payload);
    if (result.ok) {
      await loadConfig();
    }
    setSaving(false);
  };

  const handleTestConnection = async (provider: AiProvider) => {
    setTesting(true);
    setTestResult(null);
    const result = await apiClient.post("/api/v1/config/test-connection", {
      url: provider.url,
      apiKey: provider.apiKey,
      model: provider.defaultModel,
    });
    setTestResult({
      ok: result.ok,
      msg: result.ok ? t("config.connectionSuccess") : t("config.connectionFailed"),
    });
    setTesting(false);
  };

  const addProvider = () => {
    setAiProviders([
      ...aiProviders,
      { name: "", url: "", apiKey: "", models: [], defaultModel: "" },
    ]);
    setShowAddProvider(false);
  };

  const removeProvider = (idx: number) => {
    setAiProviders(aiProviders.filter((_, i) => i !== idx));
  };

  const updateProvider = (idx: number, field: keyof AiProvider, value: string | string[]) => {
    setAiProviders(
      aiProviders.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("config.title")}</h2>
        <div className="flex items-center gap-2">
          <Button onClick={loadConfig} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("common.refresh")}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t("common.save")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="ai">
        <TabsList>
          <TabsTrigger value="ai">{t("config.ai")}</TabsTrigger>
          <TabsTrigger value="gateway">{t("config.gateway")}</TabsTrigger>
          <TabsTrigger value="tools">{t("config.tools")}</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={addProvider}>
              <Plus className="h-3.5 w-3.5" />
              {t("config.addProvider")}
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-4">
              {aiProviders.map((provider, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {provider.name || `${t("config.provider")} ${idx + 1}`}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeProvider(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("config.providerName")}</Label>
                        <Input
                          value={provider.name}
                          onChange={(e) => updateProvider(idx, "name", e.target.value)}
                          placeholder="openai"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("config.providerUrl")}</Label>
                        <Input
                          value={provider.url}
                          onChange={(e) => updateProvider(idx, "url", e.target.value)}
                          placeholder="https://api.openai.com/v1"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("config.apiKey")}</Label>
                        <div className="relative">
                          <Input
                            value={provider.apiKey}
                            onChange={(e) => updateProvider(idx, "apiKey", e.target.value)}
                            type={showApiKey ? "text" : "password"}
                            placeholder="sk-..."
                            className="h-8 text-sm pr-8"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-8 w-8"
                            onClick={() => setShowApiKey(!showApiKey)}
                          >
                            {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("config.defaultModel")}</Label>
                        <Input
                          value={provider.defaultModel}
                          onChange={(e) => updateProvider(idx, "defaultModel", e.target.value)}
                          placeholder="gpt-4o"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("config.models")}</Label>
                      <Input
                        value={provider.models.join(", ")}
                        onChange={(e) =>
                          updateProvider(
                            idx,
                            "models",
                            e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                          )
                        }
                        placeholder="gpt-4o, gpt-4o-mini, gpt-3.5-turbo"
                        className="h-8 text-sm"
                      />
                      <p className="text-xs text-muted-foreground">逗号分隔</p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-7 text-xs"
                        onClick={() => handleTestConnection(provider)}
                        disabled={testing || !provider.url}
                      >
                        {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
                        {t("config.testConnection")}
                      </Button>
                    </div>
                    {testResult && (
                      <Badge variant={testResult.ok ? "default" : "destructive"} className="text-xs">
                        {testResult.msg}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}

              {aiProviders.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{t("common.noData")}</p>
                  <Button size="sm" className="mt-2 gap-1.5" onClick={addProvider}>
                    <Plus className="h-3.5 w-3.5" />
                    {t("config.addProvider")}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="gateway" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("config.gateway")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("config.host")}</Label>
                  <Input
                    value={gatewayCfg.host}
                    onChange={(e) => setGatewayCfg({ ...gatewayCfg, host: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("config.port")}</Label>
                  <Input
                    value={String(gatewayCfg.port)}
                    onChange={(e) => setGatewayCfg({ ...gatewayCfg, port: parseInt(e.target.value, 10) || 3000 })}
                    type="number"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("config.authMode")}</Label>
                  <Select
                    value={gatewayCfg.authMode}
                    onValueChange={(v) => setGatewayCfg({ ...gatewayCfg, authMode: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="token">Token</SelectItem>
                      <SelectItem value="password">{t("config.password")}</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {gatewayCfg.authMode !== "none" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("config.token")}</Label>
                    <div className="relative">
                      <Input
                        value={gatewayCfg.token}
                        onChange={(e) => setGatewayCfg({ ...gatewayCfg, token: e.target.value })}
                        type={showToken ? "text" : "password"}
                        className="h-8 text-sm pr-8"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-8 w-8"
                        onClick={() => setShowToken(!showToken)}
                      >
                        {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">{t("config.webEnabled")}</Label>
                  <Switch
                    checked={gatewayCfg.web.enabled}
                    onCheckedChange={(v) =>
                      setGatewayCfg({ ...gatewayCfg, web: { ...gatewayCfg.web, enabled: v } })
                    }
                  />
                </div>
                {gatewayCfg.web.enabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("config.webRoot")}</Label>
                      <Input
                        value={gatewayCfg.web.root}
                        onChange={(e) =>
                          setGatewayCfg({ ...gatewayCfg, web: { ...gatewayCfg.web, root: e.target.value } })
                        }
                        placeholder="./web/out"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Base Path</Label>
                      <Input
                        value={gatewayCfg.web.basePath}
                        onChange={(e) =>
                          setGatewayCfg({ ...gatewayCfg, web: { ...gatewayCfg.web, basePath: e.target.value } })
                        }
                        placeholder="/"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Shell</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t("common.enabled")}</Label>
                <Switch
                  checked={toolCfg.shell.enabled}
                  onCheckedChange={(v) =>
                    setToolCfg({ ...toolCfg, shell: { ...toolCfg.shell, enabled: v } })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("automation.duration")} (ms)</Label>
                <Input
                  value={String(toolCfg.shell.timeout)}
                  onChange={(e) =>
                    setToolCfg({
                      ...toolCfg,
                      shell: { ...toolCfg.shell, timeout: parseInt(e.target.value, 10) || 30000 },
                    })
                  }
                  type="number"
                  className="h-8 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Git Bash</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t("common.enabled")}</Label>
                <Switch
                  checked={toolCfg.gitBash.enabled}
                  onCheckedChange={(v) =>
                    setToolCfg({ ...toolCfg, gitBash: { ...toolCfg.gitBash, enabled: v } })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Path</Label>
                <Input
                  value={toolCfg.gitBash.path}
                  onChange={(e) =>
                    setToolCfg({ ...toolCfg, gitBash: { ...toolCfg.gitBash, path: e.target.value } })
                  }
                  placeholder="C:\Program Files\Git\bin\bash.exe"
                  className="h-8 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">File System</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t("common.enabled")}</Label>
                <Switch
                  checked={toolCfg.fileSystem.enabled}
                  onCheckedChange={(v) =>
                    setToolCfg({ ...toolCfg, fileSystem: { ...toolCfg.fileSystem, enabled: v } })
                  }
                />
              </div>
              {toolCfg.fileSystem.enabled && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Allowed Paths</Label>
                  <Textarea
                    value={toolCfg.fileSystem.allowedPaths.join("\n")}
                    onChange={(e) =>
                      setToolCfg({
                        ...toolCfg,
                        fileSystem: {
                          ...toolCfg.fileSystem,
                          allowedPaths: e.target.value.split("\n").filter(Boolean),
                        },
                      })
                    }
                    placeholder={"/home/user/documents&#10;/tmp/workspace"}
                    className="text-xs min-h-[80px] font-mono"
                  />
                  <p className="text-xs text-muted-foreground">每行一个路径</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
