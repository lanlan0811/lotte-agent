"use client";

import React, { useEffect, useState } from "react";
import { Clock, Play, Plus, Trash2, Square, RotateCcw } from "lucide-react";
import { useAppStore, type CronJob } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

function CreateCronDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    scheduleKind: "cron",
    cronExpr: "",
    everyMs: 60000,
    atTs: "",
    tz: "",
    prompt: "",
    enabled: true,
  });

  const handleCreate = async () => {
    const schedule: Record<string, unknown> = { kind: form.scheduleKind };
    if (form.scheduleKind === "cron") {
      schedule.expr = form.cronExpr;
      if (form.tz) schedule.tz = form.tz;
    } else if (form.scheduleKind === "every") {
      schedule.everyMs = form.everyMs;
    } else if (form.scheduleKind === "at") {
      schedule.at = new Date(form.atTs).getTime();
    }

    await apiClient.post("/api/v1/cron/jobs", {
      name: form.name,
      schedule,
      prompt: form.prompt,
      enabled: form.enabled,
    });

    setForm({ name: "", scheduleKind: "cron", cronExpr: "", everyMs: 60000, atTs: "", tz: "", prompt: "", enabled: true });
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("automation.createJob")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Daily Report" />
          </div>
          <div className="space-y-2">
            <Label>{t("automation.schedule")}</Label>
            <Select value={form.scheduleKind} onValueChange={(v) => setForm({ ...form, scheduleKind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cron">Cron</SelectItem>
                <SelectItem value="every">Every</SelectItem>
                <SelectItem value="at">At</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.scheduleKind === "cron" && (
            <>
              <div className="space-y-2">
                <Label>{t("automation.cronExpr")}</Label>
                <Input value={form.cronExpr} onChange={(e) => setForm({ ...form, cronExpr: e.target.value })} placeholder="0 9 * * *" />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input value={form.tz} onChange={(e) => setForm({ ...form, tz: e.target.value })} placeholder="Asia/Shanghai" />
              </div>
            </>
          )}
          {form.scheduleKind === "every" && (
            <div className="space-y-2">
              <Label>{t("automation.everyInterval")}</Label>
              <Input type="number" value={form.everyMs} onChange={(e) => setForm({ ...form, everyMs: Number(e.target.value) })} />
            </div>
          )}
          {form.scheduleKind === "at" && (
            <div className="space-y-2">
              <Label>{t("automation.atTimestamp")}</Label>
              <Input type="datetime-local" value={form.atTs} onChange={(e) => setForm({ ...form, atTs: e.target.value })} />
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("automation.prompt")}</Label>
            <Textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="Generate daily report" rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            <Label>{t("common.enabled")}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleCreate} disabled={!form.name || !form.prompt}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AutomationView() {
  const { cronJobs, setCronJobs, addCronJob, removeCronJob, updateCronJob } = useAppStore();
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState("cron");

  useEffect(() => {
    loadCronJobs();
  }, []);

  const loadCronJobs = async () => {
    const result = await apiClient.get<CronJob[]>("/api/v1/cron/jobs");
    if (result.ok && result.data) {
      setCronJobs(result.data);
    }
  };

  const handleRunNow = async (id: string) => {
    await apiClient.post(`/api/v1/cron/jobs/${id}/run`);
  };

  const handleToggle = async (job: CronJob) => {
    await apiClient.put(`/api/v1/cron/jobs/${job.id}`, { enabled: !job.enabled });
    updateCronJob(job.id, { enabled: !job.enabled });
  };

  const handleDelete = async (id: string) => {
    await apiClient.delete(`/api/v1/cron/jobs/${id}`);
    removeCronJob(id);
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString();
  };

  const statusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline">-</Badge>;
    switch (status) {
      case "ok":
        return <Badge variant="default">{status}</Badge>;
      case "error":
        return <Badge variant="destructive">{status}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("automation.title")}</h2>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("automation.createJob")}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="cron">{t("automation.cron")}</TabsTrigger>
          <TabsTrigger value="workflows">{t("automation.workflows")}</TabsTrigger>
          <TabsTrigger value="triggers">{t("automation.triggers")}</TabsTrigger>
          <TabsTrigger value="events">{t("automation.events")}</TabsTrigger>
        </TabsList>

        <TabsContent value="cron">
          {cronJobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t("common.noData")}</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-3 mt-4">
                {cronJobs.map((job) => (
                  <Card key={job.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {job.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={job.enabled}
                            onCheckedChange={() => handleToggle(job)}
                          />
                          <Badge variant="outline" className="text-xs">
                            {job.schedule.kind}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <p className="text-xs text-muted-foreground line-clamp-2">{job.prompt}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{t("automation.nextRun")}: {formatTime(job.state.nextRunAt)}</span>
                        <span>{t("automation.lastRun")}: {formatTime(job.state.lastRunAt)}</span>
                        <span>{t("automation.lastStatus")}: {statusBadge(job.state.lastRunStatus)}</span>
                        <span>{t("automation.consecutiveErrors")}: {job.state.consecutiveErrors}</span>
                      </div>
                      {job.state.lastError && (
                        <p className="text-xs text-destructive">{job.state.lastError}</p>
                      )}
                      <div className="flex gap-1.5 pt-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleRunNow(job.id)}>
                          <Play className="h-3 w-3 mr-1" />
                          {t("automation.runNow")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleDelete(job.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          {t("common.delete")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="workflows">
          <div className="text-center py-12 text-muted-foreground">
            <p>{t("common.noData")}</p>
          </div>
        </TabsContent>

        <TabsContent value="triggers">
          <div className="text-center py-12 text-muted-foreground">
            <p>{t("common.noData")}</p>
          </div>
        </TabsContent>

        <TabsContent value="events">
          <div className="text-center py-12 text-muted-foreground">
            <p>{t("common.noData")}</p>
          </div>
        </TabsContent>
      </Tabs>

      <CreateCronDialog open={showCreate} onOpenChange={setShowCreate} onCreated={loadCronJobs} />
    </div>
  );
}
