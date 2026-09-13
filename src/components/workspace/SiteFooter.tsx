export function SiteFooter() {
  return (
    <footer
      id="site-footer"
      className="bg-footer-rose border-t border-border-smoke px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6"
      data-testid="site-footer"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-[15px] font-light tracking-[-0.2px] text-cloud-white">
          SQL Visualiser
        </p>
        <p className="text-[13px] font-light text-fog-text">
          © 2026 SQL Visualiser
        </p>
      </div>
    </footer>
  );
}
