/** Static shell layout for loading states — matches AppShell structure without session dependency. */
export function ShellSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <span className="text-violet-400 font-bold text-lg tracking-tight">SunoFlow</span>
      </header>
      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      {/* Bottom nav placeholder */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 bg-gray-900 border-t border-gray-800 max-w-md mx-auto">
        <div className="flex items-center justify-around h-16">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1 px-3 py-2">
              <div className="w-6 h-6 rounded bg-gray-800" />
              <div className="w-8 h-2 rounded bg-gray-800" />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
