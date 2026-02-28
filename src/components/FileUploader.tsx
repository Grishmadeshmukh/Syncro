import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Video, Music, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FileUploaderProps {
  onFilesAdded: (files: File[]) => void;
  accept: Record<string, string[]>;
  label: string;
  icon?: React.ReactNode;
  multiple?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFilesAdded,
  accept,
  label,
  icon = <Upload className="w-8 h-8" />,
  multiple = true,
}) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onFilesAdded(acceptedFiles);
  }, [onFilesAdded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple,
  } as any);

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 transition-all duration-300",
        "flex flex-col items-center justify-center gap-4 text-center",
        isDragActive
          ? "border-emerald-500 bg-emerald-50/50"
          : "border-zinc-200 hover:border-zinc-400 bg-zinc-50/50 hover:bg-zinc-100/50"
      )}
    >
      <input {...getInputProps()} />
      <div className={cn(
        "p-4 rounded-full transition-transform duration-300 group-hover:scale-110",
        isDragActive ? "bg-emerald-100 text-emerald-600" : "bg-zinc-100 text-zinc-500"
      )}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-900">{label}</p>
        <p className="text-xs text-zinc-500 mt-1">
          {isDragActive ? "Drop files here" : "Drag & drop or click to select"}
        </p>
      </div>
    </div>
  );
};
