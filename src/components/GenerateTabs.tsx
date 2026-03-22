"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { GenerateForm } from "./GenerateForm";
import { AudioUploadForm } from "./AudioUploadForm";
import {
  SparklesIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";

type Tab = "create" | "upload";

export function GenerateTabs() {
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("tab") === "upload" ? "upload" : "create";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-0">
      {/* Tab navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-4 pt-4">
        <button
          type="button"
          onClick={() => setActiveTab("create")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "create"
              ? "border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          <SparklesIcon className="h-4 w-4" />
          Create
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("upload")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "upload"
              ? "border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
          Upload
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "create" ? (
        <GenerateForm />
      ) : (
        <div className="px-4 py-4 space-y-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Upload &amp; Generate</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Upload audio to create a cover or extend it with AI</p>
          </div>
          <AudioUploadForm />
        </div>
      )}
    </div>
  );
}
