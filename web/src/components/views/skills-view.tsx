"use client";

import React, { useEffect } from "react";
import { Wrench, Power, PowerOff } from "lucide-react";
import { useAppStore, type SkillInfo } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function SkillsView() {
  const { skills, setSkills } = useAppStore();

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    const result = await apiClient.get<{ builtin: SkillInfo[]; installed: SkillInfo[] }>("/api/v1/skills/builtin/list");
    if (result.ok && result.data) {
      const all = [...(result.data.builtin || []), ...(result.data.installed || [])];
      setSkills(all);
    }
  };

  const handleToggle = async (skill: SkillInfo) => {
    if (skill.enabled) {
      await apiClient.post(`/api/v1/skills/${skill.name}/disable`);
    } else {
      await apiClient.post(`/api/v1/skills/${skill.name}/enable`);
    }
    setSkills(skills.map((s) => (s.name === skill.name ? { ...s, enabled: !s.enabled } : s)));
  };

  const builtinSkills = skills.filter((s) => s.builtin);
  const installedSkills = skills.filter((s) => !s.builtin);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold">{t("skills.title")}</h2>

      {builtinSkills.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">{t("skills.builtin")}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {builtinSkills.map((skill) => (
              <Card key={skill.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      {skill.name}
                    </CardTitle>
                    <Badge variant={skill.enabled ? "default" : "secondary"}>
                      {skill.enabled ? t("common.enabled") : t("common.disabled")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground mb-2">{skill.description}</p>
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={() => handleToggle(skill)}
                  />
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
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      {skill.name}
                    </CardTitle>
                    <Switch
                      checked={skill.enabled}
                      onCheckedChange={() => handleToggle(skill)}
                    />
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
          {t("common.noData")}
        </div>
      )}
    </div>
  );
}
