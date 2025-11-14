import { Home, BarChart3, Star, Trophy, User } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { path: '/', icon: Home, label: 'Home', adminOnly: false },
  { path: '/analytics', icon: BarChart3, label: 'Analytics', adminOnly: false },
  { path: '/favorites', icon: Star, label: 'Preferiti', adminOnly: false },
  { path: '/tournaments', icon: Trophy, label: 'Tornei', adminOnly: false },
  { path: '/profile', icon: User, label: 'Profilo', adminOnly: false },
];

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const visibleNavItems = navItems.filter(item => !item.adminOnly || user?.isAdmin);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-card-border z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-2xl mx-auto px-2">
        {visibleNavItems.map(({ path, icon: Icon, label }) => {
          const isActive = location === path;
          
          return (
            <Link
              key={path}
              href={path}
              data-testid={`link-${label.toLowerCase()}`}
            >
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-2 py-1 rounded-lg transition-colors relative',
                  'hover-elevate active-elevate-2',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
                data-testid={`button-nav-${label.toLowerCase()}`}
              >
                <div className="relative">
                  <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className="text-xs font-medium">{label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
