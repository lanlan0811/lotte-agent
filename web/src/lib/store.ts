import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  status?: "sending" | "streaming" | "done" | "error";
}

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  status: "pending" | "running" | "done" | "error";
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: { kind: string; expr?: string; everyMs?: number; at?: number; tz?: string };
  prompt: string;
  channelId: string | null;
  sessionId: string | null;
  enabled: boolean;
  deleteAfterRun: boolean;
  state: {
    nextRunAt: number | null;
    runningAt: number | null;
    lastRunAt: number | null;
    lastRunStatus: string | null;
    lastError: string | null;
    lastDurationMs: number | null;
    consecutiveErrors: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface ChannelInfo {
  channelType: string;
  channelName: string;
  status: string;
  connectedAt: number | null;
  messageCount: number;
  error: string | null;
}

export interface MCPClientInfo {
  name: string;
  transport: string;
  status: string;
  toolsCount: number;
  error: string | null;
}

export interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
  builtin: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: string;
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AppConfig {
  ai: Record<string, unknown>;
  gateway: Record<string, unknown>;
  tools: Record<string, unknown>;
  channels: Record<string, unknown>;
}

interface AppState {
  connected: boolean;
  sidebarOpen: boolean;
  activeView: string;
  darkMode: boolean;

  sessions: Session[];
  activeSessionId: string | null;
  messages: Record<string, ChatMessage[]>;

  cronJobs: CronJob[];
  channels: ChannelInfo[];
  mcpClients: MCPClientInfo[];
  skills: SkillInfo[];
  logs: LogEntry[];
  config: AppConfig | null;

  setConnected: (v: boolean) => void;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  setActiveView: (v: string) => void;
  setDarkMode: (v: boolean) => void;

  setSessions: (s: Session[]) => void;
  setActiveSessionId: (id: string | null) => void;
  addSession: (s: Session) => void;
  removeSession: (id: string) => void;

  addMessage: (sessionId: string, msg: ChatMessage) => void;
  updateMessage: (sessionId: string, msgId: string, updates: Partial<ChatMessage>) => void;
  clearMessages: (sessionId: string) => void;

  setCronJobs: (jobs: CronJob[]) => void;
  addCronJob: (job: CronJob) => void;
  updateCronJob: (id: string, updates: Partial<CronJob>) => void;
  removeCronJob: (id: string) => void;

  setChannels: (ch: ChannelInfo[]) => void;
  setMcpClients: (clients: MCPClientInfo[]) => void;
  setSkills: (skills: SkillInfo[]) => void;
  addLog: (entry: LogEntry) => void;
  setLogs: (logs: LogEntry[]) => void;
  setConfig: (config: AppConfig) => void;
}

export const useAppStore = create<AppState>((set) => ({
  connected: false,
  sidebarOpen: true,
  activeView: "chat",
  darkMode: false,

  sessions: [],
  activeSessionId: null,
  messages: {},

  cronJobs: [],
  channels: [],
  mcpClients: [],
  skills: [],
  logs: [],
  config: null,

  setConnected: (v) => set({ connected: v }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveView: (v) => set({ activeView: v }),
  setDarkMode: (v) => set({ darkMode: v }),

  setSessions: (s) => set({ sessions: s }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  addSession: (s) => set((state) => ({ sessions: [s, ...state.sessions] })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    })),

  addMessage: (sessionId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: [...(state.messages[sessionId] || []), msg],
      },
    })),
  updateMessage: (sessionId, msgId, updates) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: (state.messages[sessionId] || []).map((m) =>
          m.id === msgId ? { ...m, ...updates } : m,
        ),
      },
    })),
  clearMessages: (sessionId) =>
    set((state) => ({
      messages: { ...state.messages, [sessionId]: [] },
    })),

  setCronJobs: (jobs) => set({ cronJobs: jobs }),
  addCronJob: (job) => set((state) => ({ cronJobs: [job, ...state.cronJobs] })),
  updateCronJob: (id, updates) =>
    set((state) => ({
      cronJobs: state.cronJobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
    })),
  removeCronJob: (id) =>
    set((state) => ({ cronJobs: state.cronJobs.filter((j) => j.id !== id) })),

  setChannels: (ch) => set({ channels: ch }),
  setMcpClients: (clients) => set({ mcpClients: clients }),
  setSkills: (skills) => set({ skills }),
  addLog: (entry) =>
    set((state) => ({ logs: [entry, ...state.logs].slice(0, 500) })),
  setLogs: (logs) => set({ logs }),
  setConfig: (config) => set({ config }),
}));
