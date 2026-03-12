import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  key: string;
  previewUrl?: string;
}

export interface UseFileUploadReturn {
  files: UploadedFile[];
  isUploading: boolean;
  error: string | null;
  upload: (file: File) => Promise<UploadedFile | null>;
  removeFile: (id: string) => void;
  clearFiles: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function useFileUpload(): UseFileUploadReturn {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File): Promise<UploadedFile | null> => {
    setError(null);

    if (file.size > MAX_FILE_SIZE) {
      setError("File too large (max 10MB)");
      return null;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiFetch("/api/upload", {
        method: "POST",
        body: formData,
        headers: {}, // Let browser set content-type with boundary
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Upload failed" }));
        setError((data as { error?: string }).error || "Upload failed");
        return null;
      }

      const uploaded = (await res.json()) as UploadedFile;
      if (file.type.startsWith("image/")) {
        uploaded.previewUrl = URL.createObjectURL(file);
      }
      setFiles((prev) => [...prev, uploaded]);
      return uploaded;
    } catch {
      setError("Upload failed");
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setError(null);
  }, []);

  return { files, isUploading, error, upload, removeFile, clearFiles };
}
