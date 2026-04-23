"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Database, Upload, Search, Trash2, RefreshCw, FileText, Eye,
  Loader2, CheckSquare, Square, X, RotateCcw, ChevronRight, ChevronDown,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

interface RagDocument {
  id: string;
  name: string;
  size: number;
  chunkCount: number;
  uploadedAt: number;
  status: "ready" | "processing" | "error";
}

interface SearchResult {
  content: string;
  score: number;
  documentName: string;
  chunkIndex: number;
}

interface ChunkDetail {
  index: number;
  content: string;
  tokenCount: number;
}

interface UploadProgress {
  fileName: string;
  progress: number;
  status: "uploading" | "processing" | "done" | "error";
}

export function RagView() {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<RagDocument | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<RagDocument | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [chunkDoc, setChunkDoc] = useState<RagDocument | null>(null);
  const [chunks, setChunks] = useState<ChunkDetail[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());
  const [reindexingIds, setReindexingIds] = useState<Set<string>>(new Set());
  const [uploadProgresses, setUploadProgresses] = useState<UploadProgress[]>([]);
  const [stats, setStats] = useState({ documentCount: 0, chunkCount: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
    loadStats();
  }, []);

  const loadDocuments = useCallback(async () => {
    const result = await apiClient.get<RagDocument[]>("/api/v1/rag/documents");
    if (result.ok && result.data) {
      setDocuments(result.data);
    }
  }, []);

  const loadStats = useCallback(async () => {
    const result = await apiClient.get<{ documentCount: number; chunkCount: number }>("/api/v1/rag/stats");
    if (result.ok && result.data) {
      setStats(result.data);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const result = await apiClient.get<{ results: SearchResult[] }>("/api/v1/rag/search", {
      query: searchQuery,
    });
    if (result.ok && result.data) {
      setSearchResults(result.data.results || []);
    } else {
      setSearchResults([]);
    }
    setIsSearching(false);
  }, [searchQuery]);

  const handleUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const progress: UploadProgress = {
        fileName: file.name,
        progress: 0,
        status: "uploading",
      };
      setUploadProgresses((prev) => [...prev, progress]);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const xhr = new XMLHttpRequest();
        await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 80);
              setUploadProgresses((prev) =>
                prev.map((p) => (p.fileName === file.name ? { ...p, progress: pct } : p)),
              );
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setUploadProgresses((prev) =>
                prev.map((p) =>
                  p.fileName === file.name ? { ...p, progress: 90, status: "processing" } : p,
                ),
              );
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          });
          xhr.addEventListener("error", () => reject(new Error("Upload error")));
          xhr.open("POST", "/api/v1/rag/upload");
          xhr.send(formData);
        });

        setUploadProgresses((prev) =>
          prev.map((p) =>
            p.fileName === file.name ? { ...p, progress: 100, status: "done" } : p,
          ),
        );
      } catch {
        setUploadProgresses((prev) =>
          prev.map((p) =>
            p.fileName === file.name ? { ...p, status: "error" } : p,
          ),
        );
      }
    }

    await loadDocuments();
    await loadStats();

    setTimeout(() => {
      setUploadProgresses((prev) => prev.filter((p) => p.status !== "done"));
    }, 2000);
  };

  const handleDelete = async (doc: RagDocument) => {
    await apiClient.delete(`/api/v1/rag/documents/${doc.id}`);
    await loadDocuments();
    await loadStats();
    setDeleteTarget(null);
  };

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      await apiClient.delete(`/api/v1/rag/documents/${id}`);
    }
    setSelectedIds(new Set());
    setBatchDeleteOpen(false);
    await loadDocuments();
    await loadStats();
  };

  const handlePreview = async (doc: RagDocument) => {
    setPreviewDoc(doc);
    const result = await apiClient.get<{ content: string }>(`/api/v1/rag/documents/${doc.id}/preview`);
    if (result.ok && result.data) {
      setPreviewContent(result.data.content || "");
    } else {
      setPreviewContent("");
    }
  };

  const handleReindex = async (doc: RagDocument) => {
    setReindexingIds((prev) => new Set(prev).add(doc.id));
    try {
      await apiClient.post(`/api/v1/rag/documents/${doc.id}/reindex`);
      await loadDocuments();
      await loadStats();
    } finally {
      setReindexingIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  };

  const handleViewChunks = async (doc: RagDocument) => {
    setChunkDoc(doc);
    setIsLoadingChunks(true);
    setExpandedChunks(new Set());
    const result = await apiClient.get<{ chunks: ChunkDetail[] }>(`/api/v1/rag/documents/${doc.id}/chunks`);
    if (result.ok && result.data) {
      setChunks(result.data.chunks || []);
    } else {
      setChunks([]);
    }
    setIsLoadingChunks(false);
  };

  const toggleChunkExpand = (index: number) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("rag.title")}</h2>
        <Button onClick={() => { loadDocuments(); loadStats(); }} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          {t("common.refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.documentCount}</p>
              <p className="text-xs text-muted-foreground">{t("rag.documentCount")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-green-500/10 text-green-600">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.chunkCount}</p>
              <p className="text-xs text-muted-foreground">{t("rag.chunkCount")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {uploadProgresses.length > 0 && (
        <div className="space-y-2">
          {uploadProgresses.map((up, idx) => (
            <div key={idx} className="flex items-center gap-3 p-2 rounded-md border text-xs">
              <span className="font-medium truncate max-w-[200px]">{up.fileName}</span>
              <Progress value={up.progress} className="flex-1 h-2" />
              <Badge
                variant={
                  up.status === "done" ? "default" :
                  up.status === "error" ? "destructive" :
                  "secondary"
                }
                className="text-xs"
              >
                {up.status === "uploading" ? t("rag.uploading") :
                 up.status === "processing" ? t("rag.processing") :
                 up.status === "done" ? t("common.success") :
                 t("common.error")}
              </Badge>
              {up.status === "done" && (
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                  setUploadProgresses((prev) => prev.filter((_, i) => i !== idx));
                }}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">
            {t("rag.documents")} ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="search">{t("rag.search")}</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4 mt-4">
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("rag.dragDrop")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("rag.supportedFormats")}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {t("rag.browseFiles")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.md,.json,.csv"
              className="hidden"
              onChange={(e) => e.target.files && handleUpload(e.target.files)}
            />
          </div>

          {documents.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={toggleSelectAll}>
                  {selectedIds.size === documents.length ? (
                    <CheckSquare className="h-3.5 w-3.5" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                  {selectedIds.size === documents.length ? t("rag.deselectAll") : t("rag.selectAll")}
                </Button>
                {selectedIds.size > 0 && (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      {t("rag.selected")}: {selectedIds.size}
                    </Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setBatchDeleteOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("rag.batchDelete")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {documents.length > 0 ? (
            <ScrollArea className="h-[calc(100vh-520px)]">
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/30 transition-colors"
                  >
                    <button
                      className="shrink-0"
                      onClick={() => toggleSelect(doc.id)}
                    >
                      {selectedIds.has(doc.id) ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{formatSize(doc.size)}</span>
                        <span>·</span>
                        <span>{doc.chunkCount} {t("rag.chunkCount")}</span>
                        <span>·</span>
                        <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Badge
                      variant={doc.status === "ready" ? "default" : doc.status === "processing" ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {doc.status}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleViewChunks(doc)}
                        title={t("rag.viewChunks") || "View Chunks"}
                      >
                        <Database className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handlePreview(doc)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleReindex(doc)}
                        disabled={reindexingIds.has(doc.id)}
                        title={t("rag.reindex") || "Re-index"}
                      >
                        {reindexingIds.has(doc.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(doc)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("common.noData")}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="search" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={t("rag.searchPlaceholder")}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleSearch} disabled={isSearching}>
              {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {searchResults.length > 0 ? (
            <ScrollArea className="h-[calc(100vh-360px)]">
              <div className="space-y-3">
                {searchResults.map((result, idx) => (
                  <Card key={idx}>
                    <CardContent className="pt-3 pb-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">{result.documentName}</span>
                          <Badge variant="secondary" className="text-xs">#{result.chunkIndex}</Badge>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {t("rag.score")}: {(result.score * 100).toFixed(1)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-4">{result.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : searchQuery && !isSearching ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("rag.noResults")}</p>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("common.confirmDelete")}</DialogTitle>
            <DialogDescription>{t("rag.deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm font-medium">{deleteTarget?.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatSize(deleteTarget?.size || 0)} · {deleteTarget?.chunkCount} {t("rag.chunkCount")}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("rag.batchDelete") || "Batch Delete"}</DialogTitle>
            <DialogDescription>
              {t("rag.batchDeleteConfirm") || `Are you sure you want to delete ${selectedIds.size} selected documents? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleBatchDelete}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDoc !== null} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("rag.preview")} - {previewDoc?.name}</DialogTitle>
            <DialogDescription>
              {formatSize(previewDoc?.size || 0)} · {previewDoc?.chunkCount} {t("rag.chunkCount")}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all p-2 bg-muted rounded-md">
              {previewContent || t("common.noData")}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={chunkDoc !== null} onOpenChange={(open) => !open && setChunkDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("rag.chunkDetails") || "Chunk Details"} - {chunkDoc?.name}</DialogTitle>
            <DialogDescription>
              {chunkDoc?.chunkCount} {t("rag.chunkCount")} · {formatSize(chunkDoc?.size || 0)}
            </DialogDescription>
          </DialogHeader>
          {isLoadingChunks ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">{t("common.loading")}</span>
            </div>
          ) : chunks.length > 0 ? (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-1">
                {chunks.map((chunk) => (
                  <div key={chunk.index} className="border rounded-md">
                    <button
                      className="w-full flex items-center gap-2 p-2.5 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => toggleChunkExpand(chunk.index)}
                    >
                      {expandedChunks.has(chunk.index) ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-xs font-medium">
                        {t("rag.chunk") || "Chunk"} #{chunk.index}
                      </span>
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {chunk.tokenCount} {t("rag.tokens") || "tokens"}
                      </Badge>
                    </button>
                    {expandedChunks.has(chunk.index) && (
                      <div className="px-3 pb-2.5 pt-0">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all p-2 bg-muted rounded-md max-h-48 overflow-auto">
                          {chunk.content}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t("common.noData")}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setChunkDoc(null)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
