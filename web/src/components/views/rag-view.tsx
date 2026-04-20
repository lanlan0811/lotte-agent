"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Database, Upload, FileText, Search, Trash2, RefreshCw } from "lucide-react";
import { t } from "@/lib/i18n";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface RAGDocument {
  doc_id: string;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  chunk_count: number;
  created_at: number;
}

interface RAGSearchResultItem {
  chunk_id: string;
  doc_id: string;
  text: string;
  score: number;
  filename: string | null;
  start_offset: number | null;
  end_offset: number | null;
}

interface RAGStats {
  documentCount: number;
  chunkCount: number;
}

export function RAGView() {
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [stats, setStats] = useState<RAGStats>({ documentCount: 0, chunkCount: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RAGSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    const res = await apiClient.get<{ documents: RAGDocument[]; total: number }>("/api/v1/rag/documents");
    if (res.ok && res.data) {
      setDocuments(res.data.documents);
    }
    const statsRes = await apiClient.get<RAGStats>("/api/v1/rag/stats");
    if (statsRes.ok && statsRes.data) {
      setStats(statsRes.data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(`${apiClient.getBaseUrl()}/api/v1/rag/documents`, {
          method: "POST",
          body: formData,
        });
        const result = await response.json();
        if (!result.ok) {
          console.error(`Upload failed for ${file.name}: ${result.error?.message}`);
        }
      } catch (error) {
        console.error(`Upload error for ${file.name}:`, error);
      }
    }

    setIsUploading(false);
    loadDocuments();
  };

  const handleDelete = async (docId: string) => {
    const res = await apiClient.delete(`/api/v1/rag/documents/${docId}`);
    if (res.ok) {
      loadDocuments();
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const res = await apiClient.post<{ results: RAGSearchResultItem[]; total: number }>("/api/v1/rag/search", {
      query: searchQuery,
      top_k: 5,
      min_score: 0.5,
    });
    if (res.ok && res.data) {
      setSearchResults(res.data.results);
    } else {
      setSearchResults([]);
    }
    setIsSearching(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("rag.title")}</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t("rag.documentCount")}: {stats.documentCount}</Badge>
          <Badge variant="secondary">{t("rag.chunkCount")}: {stats.chunkCount}</Badge>
          <Button variant="outline" size="sm" onClick={loadDocuments}>
            <RefreshCw className="h-3 w-3 mr-1" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              {t("rag.upload")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t("rag.dragDrop")}</p>
              <p className="text-xs mt-1">{t("rag.supportedFormats")}</p>
              <Button variant="outline" size="sm" className="mt-3" disabled={isUploading}>
                {isUploading ? t("common.loading") : t("rag.browseFiles")}
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.txt,.md,.json,.csv"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              {t("rag.search")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder={t("rag.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button size="sm" onClick={handleSearch} disabled={isSearching}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {searchResults.length > 0 && (
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {searchResults.map((result) => (
                    <div key={result.chunk_id} className="border rounded-md p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {result.filename || "unknown"}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {t("rag.score")}: {result.score.toFixed(4)}
                        </Badge>
                      </div>
                      <p className="text-sm leading-relaxed line-clamp-4">{result.text}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            {searchResults.length === 0 && searchQuery && !isSearching && (
              <p className="text-center text-sm text-muted-foreground py-4">{t("rag.noResults")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            {t("rag.documents")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("common.noData")}</div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.doc_id}
                    className="flex items-center justify-between border rounded-md p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.file_size)} · {doc.chunk_count} chunks · {formatDate(doc.created_at)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(doc.doc_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
