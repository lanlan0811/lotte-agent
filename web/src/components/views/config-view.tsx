"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Settings, Save, RefreshCw, Loader2, Plus, Trash2, Eye, EyeOff, TestTube,
} from "lucide-react";
import { useAppStore, type AppConfig } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { wsClient } from "@/lib/ws-client";
import { APP_CONFIG } from "@/lib/config";
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
  const [wsAuthMode, setWsAuthMode] = useState<"token" | "password" | "none">("none");
  const [wsAuthSecret, setWsAuthSecret] = useState("");
  const [showWsSecret, setShowWsSecret] = useState(false);

  const [aiProviders, setAiProviders] = useState<AiProvider[]>([]);
  const [gatewayCfg, setGatewayCfg] = useState<GatewayConfig>({
    host: "0.0.0.0",
    port: APP_CONFIG.DEFAULT_GATEWAY_PORT,
    authMode: "token",
    token: "",
    web: { enabled: false, root: "", basePath: "/" },
  });
  const [toolCfg, setToolCfg] = useState<ToolConfig>({
    shell: { enabled: true, timeout: APP_CONFIG.DEFAULT_SHELL_TIMEOUT },
    gitBash: { enabled: true, path: "" },
    fileSystem: { enabled: false, allowedPaths: [] },
  });

  useEffect(() => {
    loadConfig();
    const creds = wsClient.getCredentials();
    setWsAuthMode(creds.mode);
    if (creds.mode === "token" && creds.token) setWsAuthSecret(creds.token);
    if (creds.mode === "password" && creds.password) setWsAuthSecret(creds.password);
  }, []);

  const loadConfig = useCallback(async () => {
    const result = await apiClient.get<Record<string, unknown>>("/api/v1/config");
    if (result.ok && result.data) {
      const d = result.data as Record<string, unknown>;

      if (d.ai) {
        const ai = d.ai as Record<string, unknown>;
        const providers: AiProvider[] = [];
        const defaultProvider = String(ai.default_provider || "");
        const defaultModel = String(ai.default_model || "");

        if (ai.providers && typeof ai.providers === "object" && !Array.isArray(ai.providers)) {
          const providersMap = ai.providers as Record<string, unknown>;
          for (const [name, value] of Object.entries(providersMap)) {
            const p = value as Record<string, unknown>;
            const modelsMap = (p.models as Record<string, unknown>) || {};
            const modelNames = Object.keys(modelsMap);
            providers.push({
              name,
              url: String(p.api_url || ""),
              apiKey: String(p.api_key || ""),
              models: modelNames,
              defaultModel: name === defaultProvider ? defaultModel : (modelNames[0] || ""),
            });
          }
        }
        setAiProviders(providers);
      }

      if (d.gateway) {
        const gw = d.gateway as Record<string, unknown>;
        const auth = (gw.auth as Record<string, unknown>) || {};
        const web = (gw.web as Record<string, unknown>) || {};
        setGatewayCfg({
          host: String(gw.host || APP_CONFIG.DEFAULT_GATEWAY_HOST),
          port: Number(gw.port || APP_CONFIG.DEFAULT_GATEWAY_PORT),
          authMode: String(auth.mode || "token"),
          token: String(auth.token || ""),
          web: {
            enabled: Boolean(web.enabled),
            root: String(web.root || ""),
            basePath: String(web.base_path || "/"),
          },
        });
      }

      if (d.tools) {
        const tools = d.tools as Record<string, unknown>;
        const bash = (tools.bash as Record<string, unknown>) || {};
        const git = (tools.git as Record<string, unknown>) || {};
        const file = (tools.file as Record<string, unknown>) || {};
        setToolCfg({
          shell: { enabled: Boolean(bash.enabled ?? true), timeout: Number(bash.timeout || APP_CONFIG.DEFAULT_SHELL_TIMEOUT) },
          gitBash: { enabled: Boolean(git.enabled ?? true), path: "" },
          fileSystem: {
            enabled: Boolean(file.enabled ?? false),
            allowedPaths: Array.isArray(file.allowed_paths) ? file.allowed_paths.map(String) : [],
          },
        });
      }

      setConfig(d as unknown as AppConfig);
    }
  }, [setConfig]);

  const handleSave = async () => {
    setSaving(true);

    const providersMap: Record<string, unknown> = {};
    let defaultProvider = "";
    let defaultModel = "";
    for (const p of aiProviders) {
      if (!p.name) continue;
      const modelsMap: Record<string, unknown> = {};
      for (const m of p.models) {
        modelsMap[m] = { context_window: 128000, max_output: 16384 };
      }
      providersMap[p.name] = {
        api_url: p.url,
        api_key: p.apiKey,
        models: modelsMap,
      };
      if (!defaultProvider) {
        defaultProvider = p.name;
        defaultModel = p.defaultModel || p.models[0] || "";
      }
    }

    const payload: Record<string, unknown> = {
      ai: {
        default_provider: defaultProvider,
        default_model: defaultModel,
        providers: providersMap,
      },
      gateway: {
        host: gatewayCfg.host,
        port: gatewayCfg.port,
        auth: {
          mode: gatewayCfg.authMode,
          token: gatewayCfg.authMode === "token" ? gatewayCfg.token : "",
          password: gatewayCfg.authMode === "password" ? gatewayCfg.token : "",
        },
        web: {
          enabled: gatewayCfg.web.enabled,
          root: gatewayCfg.web.root,
          base_path: gatewayCfg.web.basePath,
        },
      },
      tools: {
        bash: {
          enabled: toolCfg.shell.enabled,
          timeout: toolCfg.shell.timeout,
        },
        git: {
          enabled: toolCfg.gitBash.enabled,
        },
        file: {
          enabled: toolCfg.fileSystem.enabled,
          allowed_paths: toolCfg.fileSystem.allowedPaths,
        },
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
                    onChange={(e) => setGatewayCfg({ ...gatewayCfg, port: parseInt(e.target.value, 10) || APP_CONFIG.DEFAULT_GATEWAY_PORT })}
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">WebSocket {t("config.authMode") || "Authentication"}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("config.wsAuthHint") || "Credentials for WebSocket connection to the server"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("config.authMode") || "Auth Mode"}</Label>
                  <Select
                    value={wsAuthMode}
                    onValueChange={(v) => {
                      setWsAuthMode(v as "token" | "password" | "none");
                      if (v === "none") setWsAuthSecret("");
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="token">Token</SelectItem>
                      <SelectItem value="password">{t("config.password") || "Password"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {wsAuthMode !== "none" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{wsAuthMode === "token" ? "Token" : t("config.password") || "Password"}</Label>
                    <div className="relative">
                      <Input
                        value={wsAuthSecret}
                        onChange={(e) => setWsAuthSecret(e.target.value)}
                        type={showWsSecret ? "text" : "password"}
                        placeholder={wsAuthMode === "token" ? "Enter token..." : "Enter password..."}
                        className="h-8 text-sm pr-8"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-8 w-8"
                        onClick={() => setShowWsSecret(!showWsSecret)}
                      >
                        {showWsSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => {
                    wsClient.setCredentials(wsAuthMode, wsAuthSecret || undefined);
                    wsClient.disconnect();
                    setTimeout(() => wsClient.connect(), 500);
                  }}
                >
                  {t("common.save") || "Save & Reconnect"}
                </Button>
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
                      shell: { ...toolCfg.shell, timeout: parseInt(e.target.value, 10) || APP_CONFIG.DEFAULT_SHELL_TIMEOUT },
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
