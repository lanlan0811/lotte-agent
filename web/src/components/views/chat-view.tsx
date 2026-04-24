"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  Send, Copy, Check, Wrench, Loader2, Plus, AlertCircle, WifiOff,
  ChevronDown, ChevronRight, RotateCw, Trash2, Clock,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

function tryFormatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-5 w-5", className)}
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function ToolCallBlock({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    pending: { variant: "secondary" as const, label: "pending" },
    running: { variant: "secondary" as const, label: "running" },
    done: { variant: "default" as const, label: "done" },
    error: { variant: "destructive" as const, label: "error" },
  };

  const config = statusConfig[toolCall.status] || statusConfig.pending;

  return (
    <div className={cn(
      "my-2 rounded-lg border p-3 text-sm transition-colors",
      toolCall.status === "running" && "border-blue-500/30 bg-blue-500/5",
      toolCall.status === "error" && "border-destructive/30 bg-destructive/5",
      toolCall.status === "done" && "border-green-500/30 bg-green-500/5",
      toolCall.status === "pending" && "bg-muted/50",
    )}>
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium truncate">{toolCall.name}</span>
        <Badge variant={config.variant} className="text-[10px] px-1.5 py-0 shrink-0">
          {config.label}
        </Badge>
        {(toolCall.arguments || toolCall.result) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 ml-auto shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        )}
        {toolCall.status === "running" && (
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        )}
      </div>
      {expanded && (
        <div className="mt-2 space-y-2">
          {toolCall.arguments && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase text-muted-foreground">
                  {t("chat.toolCallArgs") || "Arguments"}
                </div>
                <CopyButton text={tryFormatJson(toolCall.arguments)} />
              </div>
              <pre className="max-h-40 overflow-auto rounded bg-background/80 p-2 text-xs font-mono whitespace-pre-wrap break-all border">
                {tryFormatJson(toolCall.arguments)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase text-muted-foreground">
                  {t("chat.toolResult") || "Result"}
                </div>
                <CopyButton text={tryFormatJson(toolCall.result)} />
              </div>
              <pre className={cn(
                "max-h-40 overflow-auto rounded p-2 text-xs font-mono whitespace-pre-wrap break-all border",
                toolCall.status === "error"
                  ? "bg-destructive/5 border-destructive/20"
                  : "bg-background/80",
              )}>
                {tryFormatJson(toolCall.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const codeText = String(children).replace(/\n$/, "");

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2">
      {language && (
        <div className="absolute top-0 right-12 px-2 py-0.5 text-[10px] text-muted-foreground bg-muted/80 rounded-bl">
          {language}
        </div>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-0.5 right-0.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </Button>
      <pre className="bg-background/80 rounded p-3 text-xs font-mono overflow-x-auto border">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const components = useMemo(() => ({
    code({ className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
      const isInline = !className && typeof children === "string" && !children.includes("\n");
      if (isInline) {
        return (
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
            {children}
          </code>
        );
      }
      return <CodeBlock className={className}>{children}</CodeBlock>;
    },
    a({ href, children, ...props }: React.ComponentPropsWithoutRef<"a">) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline" {...props}>
          {children}
        </a>
      );
    },
    table({ children, ...props }: React.ComponentPropsWithoutRef<"table">) {
      return (
        <div className="overflow-x-auto my-2">
          <table className="text-xs w-full border-collapse" {...props}>
            {children}
          </table>
        </div>
      );
    },
    th({ children, ...props }: React.ComponentPropsWithoutRef<"th">) {
      return (
        <th className="border px-2 py-1 bg-muted/50 text-left font-medium" {...props}>
          {children}
        </th>
      );
    },
    td({ children, ...props }: React.ComponentPropsWithoutRef<"td">) {
      return (
        <td className="border px-2 py-1" {...props}>
          {children}
        </td>
      );
    },
  }), []);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words
      [&_p]:mb-2 [&_p:last-child]:mb-0
      [&_ul]:mb-2 [&_ol]:mb-2
      [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
      [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5
      [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
      [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
      [&_hr]:my-3 [&_hr]:border-muted
      [&_img]:rounded [&_img]:max-w-full
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
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
          <Button variant="link" size="sm" className="h-auto p-0 text-destructive underline mt-1" onClick={onRetry}>
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
      {wsStatus === "authenticating" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{t("chat.authenticating") || "Authenticating..."}</span>
        </>
      ) : wsStatus === "reconnecting" ? (
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

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({
  message,
  onRetry,
  onRegenerate,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  onRegenerate?: () => void;
}) {
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
    <div className={cn("flex gap-3 py-4 group", isUser && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(
          "text-xs",
          isUser ? "bg-primary text-primary-foreground" : isError ? "bg-destructive text-destructive-foreground" : "bg-muted",
        )}>
          {isUser ? "U" : isError ? "!" : "L"}
        </AvatarFallback>
      </Avatar>
      <div className={cn("flex-1 space-y-1 max-w-[80%]", isUser && "flex flex-col items-end")}>
        {message.status === "streaming" && !message.content ? (
          <div className="rounded-xl px-4 py-2.5 text-sm bg-muted">
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
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {formatTimestamp(message.timestamp)}
          </span>
          {isAssistant && message.status === "done" && (
            <>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
              {onRegenerate && (
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onRegenerate}>
                  <RotateCw className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatView() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    activeSessionId,
    messages,
    addMessage,
    updateMessage,
    clearMessages,
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
                ? { ...tc, result: data.toolResult as string, status: data.toolError ? "error" as const : "done" as const }
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
      wsClient.sendRequest("chat.send", {
        sessionId,
        message: text,
      });
      setSending(false);
      return;
    }

    try {
      const result = await apiClient.post<{ response?: string }>(
        `/api/v1/chat/send`,
        { sessionId, message: text },
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
            content: t("chat.timeoutError") || "Request timed out. The server may be processing your request.",
            status: "error",
          });
        } else if (errorCode === "NETWORK_ERROR") {
          updateMessage(sessionId, assistantMsg.id, {
            content: t("chat.networkError") || "Unable to connect to the server.",
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
        content: t("chat.unexpectedError") || "An unexpected error occurred.",
        status: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const handleRetry = (msgId: string) => {
    const lastUserMsg = [...sessionMessages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg || !activeSessionId) return;

    updateMessage(activeSessionId, msgId, {
      content: "",
      status: "streaming",
      toolCalls: [],
    });

    if (wsClient.connected) {
      wsClient.sendRequest("chat.send", {
        sessionId: activeSessionId,
        message: lastUserMsg.content,
      });
      return;
    }

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
          content: result.error?.message || t("chat.retryFailed") || "Retry failed",
          status: "error",
        });
      }
    }).catch(() => {
      updateMessage(activeSessionId!, msgId, {
        content: t("chat.retryFailed") || "Retry failed. Please try again.",
        status: "error",
      });
    });
  };

  const handleRegenerate = (msgId: string) => {
    handleRetry(msgId);
  };

  const handleClearHistory = () => {
    if (activeSessionId) {
      clearMessages(activeSessionId);
    }
    setShowClearDialog(false);
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
              {sessionMessages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onRetry={msg.status === "error" && msg.role === "assistant" ? () => handleRetry(msg.id) : undefined}
                  onRegenerate={msg.role === "assistant" && msg.status === "done" && idx === sessionMessages.length - 1 ? () => handleRegenerate(msg.id) : undefined}
                />
              ))}
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-4">
            <div className="max-w-3xl mx-auto flex gap-2">
              {sessionMessages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-[44px] w-[44px] text-muted-foreground hover:text-destructive"
                  onClick={() => setShowClearDialog(true)}
                  title={t("chat.clearHistory")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
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

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("chat.clearHistory")}</DialogTitle>
            <DialogDescription>
              {t("common.deleteWarning")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleClearHistory}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
