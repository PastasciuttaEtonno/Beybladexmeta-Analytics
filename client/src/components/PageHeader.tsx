import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  action?: ReactNode;
}

export function PageHeader({ title, action }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="flex items-center justify-between h-14 px-4 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold" data-testid="text-page-title">{title}</h1>
        {action && <div>{action}</div>}
      </div>
    </header>
  );
}
