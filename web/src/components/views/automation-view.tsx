"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Clock, Play, Plus, Trash2, RefreshCw, Loader2, Zap, Workflow,
  ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react";
import { useAppStore, type CronJobInfo } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface TriggerInfo {
  id: string;
  name: string;
  event: string;
  condition: string;
  action: string;
  enabled: boolean;
}

interface EventEntry {
  id: string;
  time: string;
  type: string;
  data: string;
  duration?: number;
}

interface JobForm {
  name: string;
  scheduleType: "cron" | "interval" | "timestamp";
  cronExpr: string;
  interval: string;
  timestamp: string;
  prompt: string;
  enabled: boolean;
}

const emptyJobForm: JobForm = {
  name: "",
  scheduleType: "cron",
  cronExpr: "0 * * * *",
  interval: "3600000",
  timestamp: "",
  prompt: "",
  enabled: true,
};

export function AutomationView() {
  const { cronJobs, setCronJobs } = useAppStore();
  const [triggers, setTriggers] = useState<TriggerInfo[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [showJobDialog, setShowJobDialog] = useState(false);
  const [jobForm, setJobForm] = useState<JobForm>(emptyJobForm);
  const [deleteTarget, setDeleteTarget] = useState<CronJobInfo | TriggerInfo | null>(null);
  const [deleteType, setDeleteType] = useState<"job" | "trigger">("job");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadJobs();
    loadTriggers();
    loadEvents();
  }, []);

  const loadJobs = useCallback(async () => {
    const result = await apiClient.get<CronJobInfo[]>("/api/v1/automation/cron");
    if (result.ok && result.data) {
      setCronJobs(result.data);
    }
  }, [setCronJobs]);

  const loadTriggers = useCallback(async () => {
    const result = await apiClient.get<TriggerInfo[]>("/api/v1/automation/triggers");
    if (result.ok && result.data) {
      setTriggers(result.data);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    const result = await apiClient.get<EventEntry[]>("/api/v1/automation/events");
    if (result.ok && result.data) {
      setEvents(result.data);
    }
  }, []);

  const handleCreateJob = async () => {
    if (!jobForm.name.trim() || !jobForm.prompt.trim()) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: jobForm.name.trim(),
      prompt: jobForm.prompt.trim(),
      enabled: jobForm.enabled,
    };
    switch (jobForm.scheduleType) {
      case "cron":
        payload.schedule = { type: "cron", expression: jobForm.cronExpr };
        break;
      case "interval":
        payload.schedule = { type: "interval", ms: parseInt(jobForm.interval, 10) || 3600000 };
        break;
      case "timestamp":
        payload.schedule = { type: "timestamp", ts: parseInt(jobForm.timestamp, 10) || Date.now() };
        break;
    }
    await apiClient.post("/api/v1/automation/cron", payload);
    await loadJobs();
    setShowJobDialog(false);
    setJobForm(emptyJobForm);
    setSaving(false);
  };

  const handleRunNow = async (id: string) => {
    await apiClient.post(`/api/v1/automation/cron/${id}/run`);
  };

  const handleToggleJob = async (job: CronJobInfo) => {
    if (job.enabled) {
      await apiClient.post(`/api/v1/automation/cron/${job.id}/disable`);
    } else {
      await apiClient.post(`/api/v1/automation/cron/${job.id}/enable`);
    }
    setCronJobs(cronJobs.map((j) => (j.id === job.id ? { ...j, enabled: !j.enabled } : j)));
  };

  const handleDeleteJob = async (job: CronJobInfo) => {
    await apiClient.delete(`/api/v1/automation/cron/${job.id}`);
    await loadJobs();
    setDeleteTarget(null);
  };

  const handleDeleteTrigger = async (trigger: TriggerInfo) => {
    await apiClient.delete(`/api/v1/automation/triggers/${trigger.id}`);
    await loadTriggers();
    setDeleteTarget(null);
  };

  const formatTime = (ts: number | string) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("automation.title")}</h2>
        <Button onClick={() => { loadJobs(); loadTriggers(); loadEvents(); }} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          {t("common.refresh")}
        </Button>
      </div>

      <Tabs defaultValue="cron">
        <TabsList>
          <TabsTrigger value="cron">
            <Clock className="h-3.5 w-3.5 mr-1" />
            {t("automation.cron")} ({cronJobs.length})
          </TabsTrigger>
          <TabsTrigger value="triggers">
            <Zap className="h-3.5 w-3.5 mr-1" />
            {t("automation.triggers")} ({triggers.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            <Workflow className="h-3.5 w-3.5 mr-1" />
            {t("automation.events")} ({events.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cron" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => { setJobForm(emptyJobForm); setShowJobDialog(true); }}>
              <Plus className="h-3.5 w-3.5" />
              {t("automation.createJob")}
            </Button>
          </div>

          {cronJobs.length > 0 ? (
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="space-y-3">
                {cronJobs.map((job) => (
                  <Card key={job.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Clock className="h-3.5 w-3.5" />
                          </div>
                          {job.name}
                          <Badge variant={job.enabled ? "default" : "secondary"}>
                            {job.enabled ? t("common.enabled") : t("common.disabled")}
                          </Badge>
                          {(job.consecutiveErrors ?? 0) > 0 && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {job.consecutiveErrors}
                            </Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={job.enabled}
                            onCheckedChange={() => handleToggleJob(job)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleRunNow(job.id)}
                            title={t("automation.runNow")}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => { setDeleteTarget(job); setDeleteType("job"); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">{t("automation.schedule")}:</span>{" "}
                          <code className="bg-muted px-1.5 py-0.5 rounded">{job.schedule}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("automation.nextRun")}:</span>{" "}
                          {job.nextRun ? formatTime(job.nextRun) : "-"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("automation.lastRun")}:</span>{" "}
                          {job.lastRun ? formatTime(job.lastRun) : "-"}
                        </div>
                        {job.lastStatus && (
                          <div>
                            <span className="text-muted-foreground">{t("automation.lastStatus")}:</span>{" "}
                            <Badge
                              variant={job.lastStatus === "success" ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {job.lastStatus}
                            </Badge>
                          </div>
                        )}
                      </div>
                      {job.prompt && (
                        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded line-clamp-2">
                          {job.prompt}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("common.noData")}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="triggers" className="space-y-4 mt-4">
          {triggers.length > 0 ? (
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="space-y-3">
                {triggers.map((trigger) => (
                  <Card key={trigger.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-yellow-500/10 text-yellow-600">
                            <Zap className="h-3.5 w-3.5" />
                          </div>
                          {trigger.name}
                          <Badge variant={trigger.enabled ? "default" : "secondary"}>
                            {trigger.enabled ? t("common.enabled") : t("common.disabled")}
                          </Badge>
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => { setDeleteTarget(trigger); setDeleteType("trigger"); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">{t("automation.triggerEvent")}:</span>{" "}
                          <code className="bg-muted px-1.5 py-0.5 rounded">{trigger.event}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("automation.triggerAction")}:</span>{" "}
                          <span className="font-medium">{trigger.action}</span>
                        </div>
                      </div>
                      {trigger.condition && (
                        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-2">
                          {t("automation.triggerCondition")}: {trigger.condition}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("common.noData")}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-4 mt-4">
          {events.length > 0 ? (
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="space-y-2">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-3 rounded-md border text-xs"
                  >
                    <Workflow className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{event.type}</Badge>
                        <span className="text-muted-foreground">
                          {new Date(event.time).toLocaleString()}
                        </span>
                        {event.duration != null && (
                          <Badge variant="secondary" className="text-xs">
                            {t("automation.duration")}: {event.duration}ms
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground font-mono break-all line-clamp-2">
                        {event.data}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Workflow className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("common.noData")}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showJobDialog} onOpenChange={setShowJobDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("automation.createJob")}</DialogTitle>
            <DialogDescription>{t("automation.schedule")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("common.name")}</Label>
              <Input
                value={jobForm.name}
                onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
                placeholder="daily-summary"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("automation.schedule")}</Label>
              <Select
                value={jobForm.scheduleType}
                onValueChange={(v) => setJobForm({ ...jobForm, scheduleType: v as JobForm["scheduleType"] })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cron">{t("automation.cronExpr")}</SelectItem>
                  <SelectItem value="interval">{t("automation.everyInterval")}</SelectItem>
                  <SelectItem value="timestamp">{t("automation.atTimestamp")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {jobForm.scheduleType === "cron" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("automation.cronExpr")}</Label>
                <Input
                  value={jobForm.cronExpr}
                  onChange={(e) => setJobForm({ ...jobForm, cronExpr: e.target.value })}
                  placeholder="0 * * * *"
                  className="h-8 text-sm font-mono"
                />
              </div>
            )}
            {jobForm.scheduleType === "interval" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("automation.everyInterval")}</Label>
                <Input
                  value={jobForm.interval}
                  onChange={(e) => setJobForm({ ...jobForm, interval: e.target.value })}
                  placeholder="3600000"
                  className="h-8 text-sm font-mono"
                />
              </div>
            )}
            {jobForm.scheduleType === "timestamp" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("automation.atTimestamp")}</Label>
                <Input
                  value={jobForm.timestamp}
                  onChange={(e) => setJobForm({ ...jobForm, timestamp: e.target.value })}
                  placeholder={String(Date.now())}
                  className="h-8 text-sm font-mono"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("automation.prompt")}</Label>
              <Textarea
                value={jobForm.prompt}
                onChange={(e) => setJobForm({ ...jobForm, prompt: e.target.value })}
                placeholder="请总结今天的工作进展..."
                className="text-xs min-h-[80px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={jobForm.enabled}
                onCheckedChange={(v) => setJobForm({ ...jobForm, enabled: v })}
              />
              <Label className="text-xs">{t("common.enabled")}</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowJobDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreateJob}
              disabled={!jobForm.name.trim() || !jobForm.prompt.trim() || saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {deleteType === "job" ? t("automation.cron") : t("automation.triggers")}
            </DialogTitle>
            <DialogDescription>
              {deleteType === "job" ? t("automation.deleteWorkflow") : t("automation.deleteTrigger")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm font-medium">
              {deleteTarget?.name || (deleteTarget as CronJobInfo)?.id}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteType === "job" && deleteTarget) {
                  handleDeleteJob(deleteTarget as CronJobInfo);
                } else if (deleteTarget) {
                  handleDeleteTrigger(deleteTarget as TriggerInfo);
                }
              }}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
