"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Send, Copy, Check, Wrench, Loader2, Plus, AlertCircle, WifiOff, ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { useAppStore, type ChatMessage, type ToolCallInfo } from "@/lib/store";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { wsClient } from "@/lib/ws-client";
import type { WsEvent } from "@/lib/ws-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

function ToolCallBlock({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border bg-muted/50 p-3 text-sm">
      <div className="flex items-center gap-2">
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
          {toolCall.status === "running" ? "running" : toolCall.status}
        </Badge>
        {(toolCall.arguments || toolCall.result) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 ml-auto"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        )}
        {toolCall.status === "running" && (
          <Loader2 className="h-3 w-3 animate-spin ml-1" />
        )}
      </div>
      {expanded && (
        <div className="mt-2 space-y-2">
          {toolCall.arguments && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Arguments</div>
              <pre className="max-h-40 overflow-auto rounded bg-background/80 p-2 text-xs font-mono whitespace-pre-wrap break-all">
                {toolCall.arguments}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Result</div>
              <pre className="max-h-40 overflow-auto rounded bg-background/80 p-2 text-xs font-mono whitespace-pre-wrap break-all">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:bg-background/80 [&_pre]:rounded [&_pre]:p-2 [&_code]:text-xs [&_code]:font-mono [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ol]:mb-2 [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_table]:text-xs [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <Button variant="link" size="sm" className="h-auto p-0 text-destructive underline" onClick={onRetry}>
            {t("common.retry") || "Retry"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ConnectionBanner() {
  const [wsStatus, setWsStatus] = useState(wsClient.status);

  useEffect(() => {
    const unsub = wsClient.onStatus(setWsStatus);
    return unsub;
  }, []);

  if (wsStatus === "connected" || wsStatus === "disconnected") return null;

  return (
    <div className="flex items-center gap-2 bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-sm text-yellow-600 dark:text-yellow-400">
      {wsStatus === "reconnecting" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{t("chat.reconnecting") || "Reconnecting..."}</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>{t("chat.connecting") || "Connecting..."}</span>
        </>
      )}
    </div>
  );
}

function MessageBubble({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isError = message.status === "error";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("flex gap-3 py-4", isUser && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn("text-xs", isUser ? "bg-primary text-primary-foreground" : isError ? "bg-destructive text-destructive-foreground" : "bg-muted")}>
          {isUser ? "U" : isError ? "!" : "L"}
        </AvatarFallback>
      </Avatar>
      <div className={cn("flex-1 space-y-1 max-w-[80%]", isUser && "flex flex-col items-end")}>
        {message.status === "streaming" && !message.content ? (
          <div className={cn("rounded-xl px-4 py-2.5 text-sm", "bg-muted")}>
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-muted-foreground">{t("chat.thinking")}</span>
            </div>
          </div>
        ) : isError ? (
          <ErrorMessage message={message.content} onRetry={onRetry} />
        ) : isUser ? (
          <div className="rounded-xl px-4 py-2.5 text-sm leading-relaxed bg-primary text-primary-foreground">
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          </div>
        ) : (
          <div className="rounded-xl px-4 py-2.5 text-sm leading-relaxed bg-muted">
            <MarkdownContent content={message.content} />
            {message.status === "streaming" && (
              <span className="inline-block w-1.5 h-4 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}
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
  const [sending, setSending] = useState(false);
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
  }, [sessionMessages.length, sessionMessages[sessionMessages.length - 1]?.content]);

  const handleWsChunk = useCallback((event: WsEvent) => {
    if (!activeSessionId) return;
    if (event.type === "chat.chunk") {
      const data = event.data;
      const sessionId = data.sessionId as string;
      const msgId = data.messageId as string;
      const chunk = data.chunk as string;
      if (sessionId === activeSessionId && msgId) {
        const sessionMsgs = messages[activeSessionId] || [];
        const existing = sessionMsgs.find((m) => m.id === msgId);
        if (existing) {
          updateMessage(activeSessionId, msgId, {
            content: existing.content + chunk,
            status: "streaming",
          });
        }
      }
    } else if (event.type === "chat.done") {
      const data = event.data;
      const sessionId = data.sessionId as string;
      const msgId = data.messageId as string;
      if (sessionId === activeSessionId && msgId) {
        updateMessage(activeSessionId, msgId, { status: "done" });
      }
    } else if (event.type === "chat.error") {
      const data = event.data;
      const sessionId = data.sessionId as string;
      const msgId = data.messageId as string;
      const errorMsg = data.error as string;
      if (sessionId === activeSessionId && msgId) {
        updateMessage(activeSessionId, msgId, {
          content: errorMsg || "Stream error occurred",
          status: "error",
        });
      }
    } else if (event.type === "tool.call") {
      const data = event.data;
      const sessionId = data.sessionId as string;
      const msgId = data.messageId as string;
      if (sessionId === activeSessionId && msgId) {
        const sessionMsgs = messages[activeSessionId] || [];
        const existing = sessionMsgs.find((m) => m.id === msgId);
        if (existing) {
          const toolCall: ToolCallInfo = {
            id: data.toolCallId as string,
            name: data.toolName as string,
            arguments: data.toolArgs as string,
            status: "running",
          };
          updateMessage(activeSessionId, msgId, {
            toolCalls: [...(existing.toolCalls || []), toolCall],
          });
        }
      }
    } else if (event.type === "tool.result") {
      const data = event.data;
      const sessionId = data.sessionId as string;
      const msgId = data.messageId as string;
      const toolCallId = data.toolCallId as string;
      if (sessionId === activeSessionId && msgId) {
        const sessionMsgs = messages[activeSessionId] || [];
        const existing = sessionMsgs.find((m) => m.id === msgId);
        if (existing && existing.toolCalls) {
          updateMessage(activeSessionId, msgId, {
            toolCalls: existing.toolCalls.map((tc) =>
              tc.id === toolCallId
                ? { ...tc, result: data.toolResult as string, status: "done" as const }
                : tc,
            ),
          });
        }
      }
    }
  }, [activeSessionId, messages, updateMessage]);

  useEffect(() => {
    const unsub = wsClient.on("*", handleWsChunk);
    return unsub;
  }, [handleWsChunk]);

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
    if (!text || sending) return;

    setSending(true);

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

    if (wsClient.connected) {
      wsClient.send({
        type: "chat.send",
        data: {
          sessionId,
          messageId: assistantMsg.id,
          text,
        },
      });
      setSending(false);
      return;
    }

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
        const errorCode = result.error?.code || "UNKNOWN";
        const errorMessage = result.error?.message || "Request failed";

        if (errorCode === "TIMEOUT") {
          updateMessage(sessionId, assistantMsg.id, {
            content: "Request timed out. The server may be processing your request. Please try again.",
            status: "error",
          });
        } else if (errorCode === "NETWORK_ERROR") {
          updateMessage(sessionId, assistantMsg.id, {
            content: "Unable to connect to the server. Please check if Lotte is running.",
            status: "error",
          });
        } else {
          updateMessage(sessionId, assistantMsg.id, {
            content: errorMessage,
            status: "error",
          });
        }
      }
    } catch {
      updateMessage(sessionId, assistantMsg.id, {
        content: "An unexpected error occurred.",
        status: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const handleRetry = (msgId: string) => {
    const lastUserMsg = [...sessionMessages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      updateMessage(activeSessionId!, msgId, {
        content: "",
        status: "streaming",
        toolCalls: [],
      });
      apiClient.post<{ response?: string }>(
        `/api/v1/chat/${activeSessionId}`,
        { text: lastUserMsg.content },
      ).then((result) => {
        if (result.ok && result.data) {
          updateMessage(activeSessionId!, msgId, {
            content: result.data.response || "",
            status: "done",
          });
        } else {
          updateMessage(activeSessionId!, msgId, {
            content: result.error?.message || "Retry failed",
            status: "error",
          });
        }
      }).catch(() => {
        updateMessage(activeSessionId!, msgId, {
          content: "Retry failed. Please try again.",
          status: "error",
        });
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
      <ConnectionBanner />
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
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onRetry={msg.status === "error" && msg.role === "assistant" ? () => handleRetry(msg.id) : undefined}
                />
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
                disabled={sending}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                size="icon"
                className="shrink-0 h-[44px] w-[44px]"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
