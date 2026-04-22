"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Wrench, Search, Download, Trash2, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { useAppStore, type SkillInfo } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface MarketSkill {
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  installed: boolean;
}

export function SkillsView() {
  const { skills, setSkills } = useAppStore();
  const [marketSearch, setMarketSearch] = useState("");
  const [marketResults, setMarketResults] = useState<MarketSkill[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<SkillInfo | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = useCallback(async () => {
    const result = await apiClient.get<{ builtin: SkillInfo[]; installed: SkillInfo[] }>("/api/v1/skills/builtin/list");
    if (result.ok && result.data) {
      const all = [...(result.data.builtin || []), ...(result.data.installed || [])];
      setSkills(all);
    }
  }, [setSkills]);

  const handleToggle = async (skill: SkillInfo) => {
    if (skill.enabled) {
      await apiClient.post(`/api/v1/skills/${skill.name}/disable`);
    } else {
      await apiClient.post(`/api/v1/skills/${skill.name}/enable`);
    }
    setSkills(skills.map((s) => (s.name === skill.name ? { ...s, enabled: !s.enabled } : s)));
  };

  const handleMarketSearch = useCallback(async () => {
    if (!marketSearch.trim()) return;
    setIsSearching(true);
    const result = await apiClient.get<{ skills: MarketSkill[] }>("/api/v1/skills/market/search", {
      query: marketSearch,
    });
    if (result.ok && result.data) {
      setMarketResults(result.data.skills || []);
    } else {
      setMarketResults([]);
    }
    setIsSearching(false);
  }, [marketSearch]);

  const handleInstall = async (skillName: string) => {
    setInstalling(skillName);
    const result = await apiClient.post("/api/v1/skills/market/install", { name: skillName });
    if (result.ok) {
      await loadSkills();
    }
    setInstalling(null);
  };

  const handleUninstall = async (skill: SkillInfo) => {
    const result = await apiClient.delete(`/api/v1/skills/${skill.name}`);
    if (result.ok) {
      await loadSkills();
    }
    setUninstallTarget(null);
  };

  const builtinSkills = skills.filter((s) => s.builtin);
  const installedSkills = skills.filter((s) => !s.builtin);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("skills.title")}</h2>
        <Button onClick={loadSkills} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          {t("common.refresh")}
        </Button>
      </div>

      <Tabs defaultValue="installed">
        <TabsList>
          <TabsTrigger value="installed">
            {t("skills.installed")} ({skills.length})
          </TabsTrigger>
          <TabsTrigger value="market">{t("skills.market")}</TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="space-y-6 mt-4">
          {builtinSkills.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t("skills.builtin")}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {builtinSkills.map((skill) => (
                  <Card key={skill.name}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Wrench className="h-3.5 w-3.5" />
                          </div>
                          {skill.name}
                        </CardTitle>
                        <Badge variant={skill.enabled ? "default" : "secondary"}>
                          {skill.enabled ? t("common.enabled") : t("common.disabled")}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground mb-3">{skill.description}</p>
                      <div className="flex items-center justify-between">
                        <Switch
                          checked={skill.enabled}
                          onCheckedChange={() => handleToggle(skill)}
                        />
                        <Badge variant="outline" className="text-xs">{t("skills.builtin")}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {installedSkills.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t("skills.installed")}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {installedSkills.map((skill) => (
                  <Card key={skill.name}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/10 text-green-600">
                            <Download className="h-3.5 w-3.5" />
                          </div>
                          {skill.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={skill.enabled}
                            onCheckedChange={() => handleToggle(skill)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setUninstallTarget(skill)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Download className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("common.noData")}</p>
              <p className="text-xs mt-1">{t("skills.market")}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="market" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleMarketSearch()}
                placeholder={t("skills.searchMarket")}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleMarketSearch} disabled={isSearching}>
              {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {marketResults.length > 0 ? (
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="grid gap-3 md:grid-cols-2">
                {marketResults.map((skill) => {
                  const isAlreadyInstalled = skills.some((s) => s.name === skill.name);
                  return (
                    <Card key={skill.name}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            {skill.name}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            {skill.version && (
                              <Badge variant="outline" className="text-xs">
                                v{skill.version}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2">
                        <p className="text-xs text-muted-foreground">{skill.description}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {skill.author && <span>{t("skills.author")}: {skill.author}</span>}
                          {skill.category && (
                            <>
                              <span>·</span>
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">{skill.category}</Badge>
                            </>
                          )}
                        </div>
                        <Button
                          size="sm"
                          className="w-full h-7 text-xs"
                          variant={isAlreadyInstalled ? "outline" : "default"}
                          disabled={isAlreadyInstalled || installing === skill.name}
                          onClick={() => handleInstall(skill.name)}
                        >
                          {installing === skill.name ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              {t("skills.installing")}
                            </>
                          ) : isAlreadyInstalled ? (
                            t("skills.installed")
                          ) : (
                            <>
                              <Download className="h-3 w-3 mr-1" />
                              {t("skills.install")}
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          ) : marketSearch && !isSearching ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("skills.noMarketResults")}</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <ExternalLink className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("skills.searchMarket")}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={uninstallTarget !== null} onOpenChange={(open) => !open && setUninstallTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("skills.uninstall")}</DialogTitle>
            <DialogDescription>
              {t("common.confirmDelete")} {uninstallTarget?.name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setUninstallTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => uninstallTarget && handleUninstall(uninstallTarget)}
            >
              {t("skills.uninstall")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
