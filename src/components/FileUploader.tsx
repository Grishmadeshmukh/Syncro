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
          ? "border-violet-400 bg-violet-500/20"
          : "border-violet-700/50 hover:border-violet-500 bg-violet-900/20 hover:bg-violet-900/40"
      )}
    >
      <input {...getInputProps()} />
      <div className={cn(
        "p-4 rounded-full transition-transform duration-300 group-hover:scale-110",
        isDragActive ? "bg-violet-500/40 text-violet-200" : "bg-violet-800/50 text-violet-400"
      )}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-violet-100">{label}</p>
        <p className="text-xs text-violet-400 mt-1">
          {isDragActive ? "Drop files here" : "Drag & drop or click to select"}
        </p>
      </div>
    </div>
  );
};
