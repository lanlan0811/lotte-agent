"use client";

import React, { useRef, useEffect, useState } from "react";
import { Send, Copy, Check, Wrench, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, type ChatMessage, type ToolCallInfo } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

function ToolCallBlock({ toolCall }: { toolCall: ToolCallInfo }) {
  return (
    <div className="my-2 rounded-lg border bg-muted/50 p-3 text-sm">
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{toolCall.name}</span>
        <Badge
          variant={
            toolCall.status === "done"
              ? "default"
              : toolCall.status === "error"
                ? "destructive"
                : "secondary"
          }
          className="text-[10px] px-1.5 py-0"
        >
          {toolCall.status}
        </Badge>
      </div>
      {toolCall.arguments && (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-background/80 p-2 text-xs font-mono">
          {toolCall.arguments}
        </pre>
      )}
      {toolCall.result && (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-background/80 p-2 text-xs font-mono">
          {toolCall.result}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("flex gap-3 py-4", isUser && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn("text-xs", isUser ? "bg-primary text-primary-foreground" : "bg-muted")}>
          {isUser ? "U" : "L"}
        </AvatarFallback>
      </Avatar>
      <div className={cn("flex-1 space-y-1 max-w-[80%]", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted",
          )}
        >
          {message.status === "streaming" && !message.content ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-muted-foreground">{t("chat.thinking")}</span>
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          )}
        </div>
        {message.toolCalls?.map((tc) => (
          <ToolCallBlock key={tc.id} toolCall={tc} />
        ))}
        {isAssistant && message.status === "done" && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatView() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    activeSessionId,
    messages,
    addMessage,
    updateMessage,
    addSession,
    setActiveSessionId,
  } = useAppStore();

  const sessionMessages = activeSessionId ? messages[activeSessionId] || [] : [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionMessages.length]);

  const handleNewSession = () => {
    const id = `session_${Date.now()}`;
    addSession({
      id,
      title: t("chat.newSession"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    });
    setActiveSessionId(id);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = `session_${Date.now()}`;
      addSession({
        id: sessionId,
        title: text.slice(0, 30),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
      });
      setActiveSessionId(sessionId);
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: text,
      timestamp: Date.now(),
      status: "done",
    };
    addMessage(sessionId, userMsg);
    setInput("");

    const assistantMsg: ChatMessage = {
      id: `msg_${Date.now()}_asst`,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      status: "streaming",
    };
    addMessage(sessionId, assistantMsg);

    try {
      const result = await apiClient.post<{ response?: string }>(
        `/api/v1/chat/${sessionId}`,
        { text },
      );

      if (result.ok && result.data) {
        updateMessage(sessionId, assistantMsg.id, {
          content: result.data.response || "",
          status: "done",
        });
      } else {
        updateMessage(sessionId, assistantMsg.id, {
          content: result.error?.message || "Request failed",
          status: "error",
        });
      }
    } catch {
      updateMessage(sessionId, assistantMsg.id, {
        content: "Network error",
        status: "error",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {!activeSessionId && sessionMessages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
            <Wrench className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-medium text-foreground">{t("chat.title")}</h2>
            <p className="text-sm mt-1">{t("sessions.empty")}</p>
          </div>
          <Button onClick={handleNewSession} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("chat.newSession")}
          </Button>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1 px-4">
            <div ref={scrollRef} className="max-w-3xl mx-auto">
              {sessionMessages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-4">
            <div className="max-w-3xl mx-auto flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("chat.placeholder")}
                className="min-h-[44px] max-h-[200px] resize-none"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim()}
                size="icon"
                className="shrink-0 h-[44px] w-[44px]"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
