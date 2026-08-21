import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  // Note: document.title is now handled by Seo component
  // This component only handles the visual header
  return (
    <header role="banner" className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border transition-all duration-300">
      <div className="flex flex-row items-center justify-between min-h-12 md:min-h-[100px] px-4 md:px-8 py-2 md:py-6 max-w-[1400px] mx-auto gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-3xl font-bold tracking-tight text-foreground truncate decoration-clone" data-testid="text-page-title">{title}</h1>
          {description && (
            <p className="hidden md:block text-sm md:text-base text-muted-foreground mt-1 md:mt-2 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex items-center shrink-0 self-center">{action}</div>}
      </div>
    </header>
  );
}
