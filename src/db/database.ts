import BetterSqlite3 from "better-sqlite3";
import { logger } from "../utils/logger.js";
import { ensureDir } from "../utils/fs.js";
import path from "node:path";

const SCHEMA_VERSION = 3;

const CREATE_META_TABLE = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;

const CREATE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata_json TEXT
)`;

const CREATE_MESSAGES_TABLE = `
CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  content_parts_json TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  model TEXT,
  token_usage_json TEXT,
  created_at INTEGER NOT NULL
)`;

const CREATE_MEMORY_FILES_TABLE = `
CREATE TABLE IF NOT EXISTS memory_files (
  path TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'memory',
  hash TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL
)`;

const CREATE_MEMORY_CHUNKS_TABLE = `
CREATE TABLE IF NOT EXISTS memory_chunks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'memory',
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  hash TEXT NOT NULL,
  model TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const CREATE_EMBEDDING_CACHE_TABLE = `
CREATE TABLE IF NOT EXISTS embedding_cache (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  hash TEXT NOT NULL,
  embedding TEXT NOT NULL,
  dims INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, model, provider_key, hash)
)`;

const CREATE_CRON_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS cron_jobs (
  job_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  prompt TEXT NOT NULL,
  channel_id TEXT,
  session_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const CREATE_AUDIT_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  session_id TEXT,
  tool_name TEXT,
  input_json TEXT,
  output_json TEXT,
  approved INTEGER,
  user_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
)`;

const CREATE_RAG_DOCUMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS rag_documents (
  doc_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`;

const CREATE_RAG_CHUNKS_TABLE = `
CREATE TABLE IF NOT EXISTS rag_chunks (
  chunk_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  metadata_json TEXT
)`;

const CREATE_CHANNEL_RECEIVE_IDS_TABLE = `
CREATE TABLE IF NOT EXISTS channel_receive_ids (
  session_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  receive_id_type TEXT NOT NULL,
  receive_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, channel_id)
)`;

const CREATE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_sessions_channel_id ON sessions(channel_id)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)",
  "CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_chunks_path ON memory_chunks(path)",
  "CREATE INDEX IF NOT EXISTS idx_chunks_source ON memory_chunks(source)",
  "CREATE INDEX IF NOT EXISTS idx_embedding_cache_updated_at ON embedding_cache(updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type)",
  "CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_audit_session_id ON audit_logs(session_id)",
  "CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc_id ON rag_chunks(doc_id)",
  "CREATE INDEX IF NOT EXISTS idx_channel_receive_ids_channel_id ON channel_receive_ids(channel_id)",
  "CREATE INDEX IF NOT EXISTS idx_channel_receive_ids_updated_at ON channel_receive_ids(updated_at)",
];

const CREATE_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
  text,
  id UNINDEXED,
  path UNINDEXED,
  source UNINDEXED,
  model UNINDEXED,
  start_line UNINDEXED,
  end_line UNINDEXED
)`;

export class Database {
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string;

  constructor(dataDir: string) {
    this.dbPath = path.join(dataDir, "lotte.db");
  }

  initialize(): void {
    ensureDir(path.dirname(this.dbPath));

    this.db = new BetterSqlite3(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("foreign_keys = ON");

    this.loadVecExtension();

    this.createSchema();
    this.runMigrations();

    logger.info(`Database initialized at ${this.dbPath}`);
  }

  private loadVecExtension(): void {
    try {
      const sqliteVec = require("sqlite-vec") as {
        load: (db: BetterSqlite3.Database) => void;
        getLoadablePath: () => string;
      };
      sqliteVec.load(this.db!);
      logger.info("sqlite-vec extension loaded successfully");
    } catch (error) {
      try {
        const sqliteVec = require("sqlite-vec") as { getLoadablePath: () => string };
        const extensionPath = sqliteVec.getLoadablePath();
        this.db!.loadExtension(extensionPath);
        logger.info(`sqlite-vec extension loaded from path: ${extensionPath}`);
      } catch (fallbackError) {
        logger.warn(
          `Failed to load sqlite-vec extension: ${fallbackError}. Vector search will use brute-force fallback.`,
        );
      }
    }
  }

  getDb(): BetterSqlite3.Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info("Database closed");
    }
  }

  private createSchema(): void {
    const db = this.getDb();

    db.exec(CREATE_META_TABLE);
    db.exec(CREATE_SESSIONS_TABLE);
    db.exec(CREATE_MESSAGES_TABLE);
    db.exec(CREATE_MEMORY_FILES_TABLE);
    db.exec(CREATE_MEMORY_CHUNKS_TABLE);
    db.exec(CREATE_EMBEDDING_CACHE_TABLE);
    db.exec(CREATE_CRON_JOBS_TABLE);
    db.exec(CREATE_AUDIT_LOGS_TABLE);
    db.exec(CREATE_RAG_DOCUMENTS_TABLE);
    db.exec(CREATE_RAG_CHUNKS_TABLE);
    db.exec(CREATE_CHANNEL_RECEIVE_IDS_TABLE);

    for (const indexSql of CREATE_INDEXES) {
      db.exec(indexSql);
    }

    try {
      db.exec(CREATE_FTS_TABLE);
    } catch (error) {
      logger.warn("FTS5 virtual table creation failed (FTS5 may not be available)", error);
    }

    const existingVersion = this.getSchemaVersion();
    if (existingVersion === 0) {
      this.setSchemaVersion(SCHEMA_VERSION);
    }
  }

  private runMigrations(): void {
    const currentVersion = this.getSchemaVersion();

    if (currentVersion < SCHEMA_VERSION) {
      logger.info(`Migrating database from version ${currentVersion} to ${SCHEMA_VERSION}`);

      this.ensureColumns();

      this.setSchemaVersion(SCHEMA_VERSION);
      logger.info(`Database migrated to version ${SCHEMA_VERSION}`);
    }
  }

  private ensureColumns(): void {
    const db = this.getDb();
    this.ensureColumn(db, "memory_files", "source", "TEXT NOT NULL DEFAULT 'memory'");
    this.ensureColumn(db, "memory_chunks", "source", "TEXT NOT NULL DEFAULT 'memory'");
  }

  private ensureColumn(
    db: BetterSqlite3.Database,
    table: string,
    column: string,
    definition: string,
  ): void {
    const rows = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (rows.some((row) => row.name === column)) {
      return;
    }
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private getSchemaVersion(): number {
    const db = this.getDb();
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get("schema_version") as
      | { value: string }
      | undefined;
    return row ? parseInt(row.value, 10) : 0;
  }

  private setSchemaVersion(version: number): void {
    const db = this.getDb();
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
      "schema_version",
      String(version),
    );
  }

  saveReceiveId(sessionId: string, channelId: string, receiveIdType: string, receiveId: string): void {
    const db = this.getDb();
    db.prepare(
      "INSERT OR REPLACE INTO channel_receive_ids (session_id, channel_id, receive_id_type, receive_id, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(sessionId, channelId, receiveIdType, receiveId, Date.now());
  }

  loadReceiveId(sessionId: string, channelId: string): { receiveIdType: string; receiveId: string } | null {
    const db = this.getDb();
    const row = db.prepare(
      "SELECT receive_id_type, receive_id FROM channel_receive_ids WHERE session_id = ? AND channel_id = ?",
    ).get(sessionId, channelId) as { receive_id_type: string; receive_id: string } | undefined;
    if (!row) return null;
    return { receiveIdType: row.receive_id_type, receiveId: row.receive_id };
  }

  loadReceiveIdsByChannel(channelId: string): Array<{ sessionId: string; receiveIdType: string; receiveId: string }> {
    const db = this.getDb();
    const rows = db.prepare(
      "SELECT session_id, receive_id_type, receive_id FROM channel_receive_ids WHERE channel_id = ?",
    ).all(channelId) as Array<{ session_id: string; receive_id_type: string; receive_id: string }>;
    return rows.map((r) => ({ sessionId: r.session_id, receiveIdType: r.receive_id_type, receiveId: r.receive_id }));
  }

  deleteReceiveIdsBefore(timestamp: number): number {
    const db = this.getDb();
    const result = db.prepare(
      "DELETE FROM channel_receive_ids WHERE updated_at < ?",
    ).run(timestamp);
    return result.changes;
  }
}
