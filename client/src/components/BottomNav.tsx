import { Home, BarChart3, Calendar, MessageCircle, User } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/schedule', icon: Calendar, label: 'Schedule' },
  { path: '/messages', icon: MessageCircle, label: 'Messages' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-card-border z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-2xl mx-auto px-2">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location === path;
          
          return (
            <Link
              key={path}
              href={path}
              data-testid={`link-${label.toLowerCase()}`}
            >
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-2 py-1 rounded-lg transition-colors',
                  'hover-elevate active-elevate-2',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
                data-testid={`button-nav-${label.toLowerCase()}`}
              >
                <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
