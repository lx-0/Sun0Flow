"use client";

import { Suspense } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { TemplateBrowser } from "@/components/TemplateBrowser";
import { StyleTemplateManager } from "@/components/StyleTemplateManager";
import { SkeletonText } from "@/components/Skeleton";

type Tab = "prompts" | "styles";

function TemplatesTabs() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("templates");

  const activeTab: Tab = searchParams.get("tab") === "styles" ? "styles" : "prompts";

  const setTab = (tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "prompts") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };

  return (
    <div>
      <div className="border-b border-gray-200 dark:border-gray-700 px-4 pt-4">
        <nav className="flex gap-4" aria-label="Template tabs">
          <button
            onClick={() => setTab("prompts")}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "prompts"
                ? "border-violet-500 text-violet-600 dark:text-violet-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300"
            }`}
          >
            {t("promptTemplatesTab")}
          </button>
          <button
            onClick={() => setTab("styles")}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "styles"
                ? "border-violet-500 text-violet-600 dark:text-violet-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300"
            }`}
          >
            {t("styleTemplatesTab")}
          </button>
        </nav>
      </div>

      {activeTab === "prompts" ? <TemplateBrowser /> : <StyleTemplateManager />}
    </div>
  );
}

export function TemplatesPageContent() {
  return (
    <Suspense fallback={<div className="px-4 py-6"><SkeletonText lines={8} /></div>}>
      <TemplatesTabs />
    </Suspense>
  );
}
