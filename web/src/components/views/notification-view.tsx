"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Bell, Globe, Mail, Plus, RefreshCw, Send, Pencil, Trash2, AlertCircle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

interface RuleFormData {
  name: string;
  eventTypes: string;
  channelType: "message" | "webhook" | "email";
  channelTarget: string;
}

interface FormErrors {
  name?: string;
  eventTypes?: string;
  channelTarget?: string;
}

const EMPTY_FORM: RuleFormData = {
  name: "",
  eventTypes: "",
  channelType: "message",
  channelTarget: "",
};

function validateForm(data: RuleFormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.name.trim()) {
    errors.name = t("notification.validation.nameRequired") || "Rule name is required";
  } else if (data.name.trim().length > 64) {
    errors.name = t("notification.validation.nameTooLong") || "Name must be 64 characters or less";
  }
  if (!data.eventTypes.trim()) {
    errors.eventTypes = t("notification.validation.eventTypesRequired") || "At least one event type is required";
  } else {
    const patterns = data.eventTypes.split(",").map((s) => s.trim()).filter(Boolean);
    const invalidPattern = patterns.find((p) => !/^[\w.*-]+$/.test(p));
    if (invalidPattern) {
      errors.eventTypes = t("notification.validation.invalidPattern") || `Invalid pattern: ${invalidPattern}`;
    }
  }
  if (data.channelType !== "message" && !data.channelTarget.trim()) {
    errors.channelTarget = t("notification.validation.targetRequired") || "Target is required for this channel type";
  }
  if (data.channelType === "email" && data.channelTarget.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.channelTarget.trim())) {
      errors.channelTarget = t("notification.validation.invalidEmail") || "Invalid email address";
    }
  }
  return errors;
}

function ruleToFormData(rule: NotificationRule): RuleFormData {
  return {
    name: rule.name,
    eventTypes: rule.eventTypes.join(", "),
    channelType: rule.channels[0]?.type ?? "message",
    channelTarget: rule.channels[0]?.target ?? "",
  };
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
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RuleFormData>({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<NotificationRule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [webhookUrlError, setWebhookUrlError] = useState<string>("");
  const [emailToInput, setEmailToInput] = useState("");

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
    setDeleteTarget(null);
  };

  const openAddDialog = () => {
    setEditingRuleId(null);
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (rule: NotificationRule) => {
    setEditingRuleId(rule.id);
    setFormData(ruleToFormData(rule));
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmitRule = async () => {
    const errors = validateForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      if (editingRuleId) {
        const res = await apiClient.put(`/api/v1/notification/rules/${editingRuleId}`, {
          name: formData.name.trim(),
          eventTypes: formData.eventTypes.split(",").map((s) => s.trim()).filter(Boolean),
          channels: [{ type: formData.channelType, target: formData.channelTarget.trim() }],
        });
        if (res.ok && res.data) {
          setRules((prev) => prev.map((r) => (r.id === editingRuleId ? { ...r, ...res.data } : r)));
        }
      } else {
        const res = await apiClient.post<NotificationRule>("/api/v1/notification/rules", {
          name: formData.name.trim(),
          eventTypes: formData.eventTypes.split(",").map((s) => s.trim()).filter(Boolean),
          channels: [{ type: formData.channelType, target: formData.channelTarget.trim() }],
          enabled: true,
        });
        if (res.ok && res.data) {
          setRules((prev) => [...prev, res.data!]);
        }
      }
      setFormData({ ...EMPTY_FORM });
      setFormErrors({});
      setDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTest = async (channelType: string) => {
    setIsTesting(channelType);
    await apiClient.post("/api/v1/notification/test", { channel: channelType });
    setIsTesting(null);
  };

  const validateWebhookUrl = (url: string): boolean => {
    if (!url.trim()) {
      setWebhookUrlError("");
      return true;
    }
    try {
      new URL(url);
      setWebhookUrlError("");
      return true;
    } catch {
      setWebhookUrlError(t("notification.validation.invalidUrl") || "Invalid URL format");
      return false;
    }
  };

  const handleSaveWebhook = async () => {
    if (!validateWebhookUrl(webhookConfig.url)) return;
    await apiClient.put("/api/v1/notification/webhook", webhookConfig);
  };

  const handleSaveEmail = async () => {
    const configToSave = { ...emailConfig };
    if (emailToInput.trim()) {
      const emails = emailToInput.split(",").map((s) => s.trim()).filter(Boolean);
      configToSave.to = [...new Set([...emailConfig.to, ...emails])];
      setEmailToInput("");
    }
    await apiClient.put("/api/v1/notification/email", configToSave);
    setEmailConfig(configToSave);
  };

  const removeEmailTo = (email: string) => {
    setEmailConfig((prev) => ({ ...prev, to: prev.to.filter((e) => e !== email) }));
  };

  const getDialogTitle = () => {
    if (editingRuleId) return t("notification.editRule") || "Edit Rule";
    return t("notification.addRule") || "Add Rule";
  };

  const getSubmitLabel = () => {
    if (editingRuleId) return t("common.save");
    return t("common.create");
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
                    onChange={(e) => {
                      setWebhookConfig((prev) => ({ ...prev, url: e.target.value }));
                      if (webhookUrlError) validateWebhookUrl(e.target.value);
                    }}
                    onBlur={() => validateWebhookUrl(webhookConfig.url)}
                  />
                  {webhookUrlError && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {webhookUrlError}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("notification.webhookMethod") || "Method"}</Label>
                  <Select
                    value={webhookConfig.method}
                    onValueChange={(v) => setWebhookConfig((prev) => ({ ...prev, method: v }))}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t("common.enabled")}</Label>
                  <Switch
                    checked={webhookConfig.enabled}
                    onCheckedChange={(v) => setWebhookConfig((prev) => ({ ...prev, enabled: v }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveWebhook} disabled={!webhookConfig.url.trim()}>
                    {t("common.save")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest("webhook")}
                    disabled={isTesting === "webhook" || !webhookConfig.url.trim()}
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
                <div className="space-y-1">
                  <Label className="text-xs">{t("notification.emailTo") || "Recipients"}</Label>
                  {emailConfig.to.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {emailConfig.to.map((email) => (
                        <Badge key={email} variant="secondary" className="text-xs gap-1 pr-1">
                          {email}
                          <button
                            className="hover:text-destructive"
                            onClick={() => removeEmailTo(email)}
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="email@example.com"
                      value={emailToInput}
                      onChange={(e) => setEmailToInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (emailToInput.trim()) {
                            const emails = emailToInput.split(",").map((s) => s.trim()).filter(Boolean);
                            setEmailConfig((prev) => ({ ...prev, to: [...new Set([...prev.to, ...emails])] }));
                            setEmailToInput("");
                          }
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        if (emailToInput.trim()) {
                          const emails = emailToInput.split(",").map((s) => s.trim()).filter(Boolean);
                          setEmailConfig((prev) => ({ ...prev, to: [...new Set([...prev.to, ...emails])] }));
                          setEmailToInput("");
                        }
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t("common.enabled")}</Label>
                  <Switch
                    checked={emailConfig.enabled}
                    onCheckedChange={(v) => setEmailConfig((prev) => ({ ...prev, enabled: v }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEmail} disabled={!emailConfig.smtp_host.trim()}>
                    {t("common.save")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest("email")}
                    disabled={isTesting === "email" || !emailConfig.smtp_host.trim()}
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
              <Button size="sm" onClick={openAddDialog}>
                <Plus className="h-3 w-3 mr-1" />
                {t("notification.addRule")}
              </Button>
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
                        <div className="min-w-0 flex-1">
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
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("notification.createdAt") || "Created"}: {new Date(rule.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={(v) => handleToggleRule(rule.id, v)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(rule)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(rule)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) {
          setFormErrors({});
        }
        setDialogOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("common.name")}</Label>
              <Input
                value={formData.name}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, name: e.target.value }));
                  if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder={t("notification.ruleNamePlaceholder") || "Enter rule name"}
                maxLength={64}
              />
              {formErrors.name && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {formErrors.name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("notification.eventType")}</Label>
              <Textarea
                value={formData.eventTypes}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, eventTypes: e.target.value }));
                  if (formErrors.eventTypes) setFormErrors((prev) => ({ ...prev, eventTypes: undefined }));
                }}
                placeholder="cron.*, channel.message, workflow.completed"
                rows={2}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t("notification.eventTypeHelp") || "Comma-separated event type patterns (e.g. cron.*, channel.message)"}
              </p>
              {formErrors.eventTypes && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {formErrors.eventTypes}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("notification.channels")}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={formData.channelType}
                  onValueChange={(v) => {
                    setFormData((prev) => ({ ...prev, channelType: v as NotificationRule["channels"][0]["type"] }));
                    if (formErrors.channelTarget) setFormErrors((prev) => ({ ...prev, channelTarget: undefined }));
                  }}
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
                  value={formData.channelTarget}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, channelTarget: e.target.value }));
                    if (formErrors.channelTarget) setFormErrors((prev) => ({ ...prev, channelTarget: undefined }));
                  }}
                  placeholder={
                    formData.channelType === "email"
                      ? "email@example.com"
                      : formData.channelType === "webhook"
                        ? "https://..."
                        : t("notification.channelIdPlaceholder") || "Channel ID (optional)"
                  }
                />
              </div>
              {formErrors.channelTarget && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {formErrors.channelTarget}
                </p>
              )}
            </div>
            <Button className="w-full" onClick={handleSubmitRule} disabled={isSubmitting}>
              {isSubmitting ? t("common.loading") : getSubmitLabel()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("common.confirmDelete")}</DialogTitle>
            <DialogDescription>
              {t("notification.deleteRuleConfirm") || "Are you sure you want to delete this notification rule? This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="py-2 space-y-1">
              <p className="text-sm font-medium">{deleteTarget.name}</p>
              <div className="flex gap-1 flex-wrap">
                {deleteTarget.eventTypes.map((et) => (
                  <Badge key={et} variant="outline" className="text-xs">{et}</Badge>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDeleteRule(deleteTarget.id)}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
