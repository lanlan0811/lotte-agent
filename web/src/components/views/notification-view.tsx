"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Bell, Globe, Mail, Plus, RefreshCw, Send, ToggleLeft, ToggleRight } from "lucide-react";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NotificationRule {
  id: string;
  name: string;
  eventTypes: string[];
  channels: Array<{
    type: "message" | "webhook" | "email";
    target: string;
  }>;
  enabled: boolean;
  createdAt: number;
}

interface WebhookConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  enabled: boolean;
}

interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  from: string;
  to: string[];
  enabled: boolean;
}

export function NotificationView() {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>({
    url: "",
    method: "POST",
    headers: {},
    enabled: false,
  });
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    smtp_host: "",
    smtp_port: 587,
    from: "",
    to: [],
    enabled: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newRule, setNewRule] = useState({
    name: "",
    eventTypes: "",
    channelType: "message" as "message" | "webhook" | "email",
    channelTarget: "",
  });

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    const res = await apiClient.get<{
      rules: NotificationRule[];
      webhook: WebhookConfig;
      email: EmailConfig;
    }>("/api/v1/notification/config");
    if (res.ok && res.data) {
      setRules(res.data.rules || []);
      if (res.data.webhook) setWebhookConfig(res.data.webhook);
      if (res.data.email) setEmailConfig(res.data.email);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    const res = await apiClient.put(`/api/v1/notification/rules/${ruleId}`, { enabled });
    if (res.ok) {
      setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, enabled } : r)));
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    const res = await apiClient.delete(`/api/v1/notification/rules/${ruleId}`);
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    }
  };

  const handleAddRule = async () => {
    if (!newRule.name || !newRule.eventTypes) return;
    const res = await apiClient.post<NotificationRule>("/api/v1/notification/rules", {
      name: newRule.name,
      eventTypes: newRule.eventTypes.split(",").map((s) => s.trim()),
      channels: [{ type: newRule.channelType, target: newRule.channelTarget }],
      enabled: true,
    });
    if (res.ok && res.data) {
      setRules((prev) => [...prev, res.data!]);
      setNewRule({ name: "", eventTypes: "", channelType: "message", channelTarget: "" });
      setDialogOpen(false);
    }
  };

  const handleTest = async (channelType: string) => {
    setIsTesting(channelType);
    await apiClient.post("/api/v1/notification/test", { channel: channelType });
    setIsTesting(null);
  };

  const handleSaveWebhook = async () => {
    await apiClient.put("/api/v1/notification/webhook", webhookConfig);
  };

  const handleSaveEmail = async () => {
    await apiClient.put("/api/v1/notification/email", emailConfig);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("notification.title")}</h2>
        <Button variant="outline" size="sm" onClick={loadConfig}>
          <RefreshCw className="h-3 w-3 mr-1" />
          {t("common.refresh")}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {t("notification.webhook")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">URL</Label>
                  <Input
                    placeholder="https://hooks.example.com/..."
                    value={webhookConfig.url}
                    onChange={(e) => setWebhookConfig((prev) => ({ ...prev, url: e.target.value }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t("common.enabled")}</Label>
                  <Switch
                    checked={webhookConfig.enabled}
                    onCheckedChange={(v) => setWebhookConfig((prev) => ({ ...prev, enabled: v }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveWebhook}>{t("common.save")}</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest("webhook")}
                    disabled={isTesting === "webhook"}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    {t("notification.test")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {t("notification.email")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">SMTP Host</Label>
                    <Input
                      placeholder="smtp.example.com"
                      value={emailConfig.smtp_host}
                      onChange={(e) => setEmailConfig((prev) => ({ ...prev, smtp_host: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Port</Label>
                    <Input
                      type="number"
                      value={emailConfig.smtp_port}
                      onChange={(e) => setEmailConfig((prev) => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input
                    placeholder="lotte@example.com"
                    value={emailConfig.from}
                    onChange={(e) => setEmailConfig((prev) => ({ ...prev, from: e.target.value }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t("common.enabled")}</Label>
                  <Switch
                    checked={emailConfig.enabled}
                    onCheckedChange={(v) => setEmailConfig((prev) => ({ ...prev, enabled: v }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEmail}>{t("common.save")}</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest("email")}
                    disabled={isTesting === "email"}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    {t("notification.test")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                {t("notification.rules")}
              </CardTitle>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-3 w-3 mr-1" />
                    {t("notification.addRule")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("notification.addRule")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>{t("common.name")}</Label>
                      <Input
                        value={newRule.name}
                        onChange={(e) => setNewRule((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Rule name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("notification.eventType")}</Label>
                      <Input
                        value={newRule.eventTypes}
                        onChange={(e) => setNewRule((prev) => ({ ...prev, eventTypes: e.target.value }))}
                        placeholder="cron.*, channel.*, workflow.*"
                      />
                      <p className="text-xs text-muted-foreground">Comma-separated event type patterns</p>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("notification.channels")}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={newRule.channelType}
                          onValueChange={(v) => setNewRule((prev) => ({ ...prev, channelType: v as NotificationRule["channels"][0]["type"] }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="message">{t("notification.message")}</SelectItem>
                            <SelectItem value="webhook">{t("notification.webhook")}</SelectItem>
                            <SelectItem value="email">{t("notification.email")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={newRule.channelTarget}
                          onChange={(e) => setNewRule((prev) => ({ ...prev, channelTarget: e.target.value }))}
                          placeholder="Target (channel ID / email)"
                        />
                      </div>
                    </div>
                    <Button className="w-full" onClick={handleAddRule}>{t("common.create")}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{t("common.noData")}</div>
              ) : (
                <ScrollArea className="max-h-96">
                  <div className="space-y-2">
                    {rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between border rounded-md p-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{rule.name}</p>
                            <Badge variant={rule.enabled ? "default" : "secondary"}>
                              {rule.enabled ? t("common.enabled") : t("common.disabled")}
                            </Badge>
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {rule.eventTypes.map((et) => (
                              <Badge key={et} variant="outline" className="text-xs">{et}</Badge>
                            ))}
                          </div>
                          <div className="flex gap-1 mt-1">
                            {rule.channels.map((ch, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {ch.type}: {ch.target || "default"}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={(v) => handleToggleRule(rule.id, v)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteRule(rule.id)}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
