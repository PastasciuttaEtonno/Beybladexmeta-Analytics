import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { TrendingUp, Users, Activity, CheckCircle } from 'lucide-react';

export default function Home() {
  const { user } = useAuth();

  const stats = [
    { label: 'Active Tasks', value: '12', icon: Activity, color: 'text-blue-500' },
    { label: 'Completed', value: '48', icon: CheckCircle, color: 'text-green-500' },
    { label: 'Team Members', value: '8', icon: Users, color: 'text-purple-500' },
    { label: 'Progress', value: '85%', icon: TrendingUp, color: 'text-orange-500' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title={`Welcome, ${user?.displayName}`} />
      
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat, idx) => (
            <Card
              key={idx}
              className="p-4 space-y-2 hover-elevate"
              data-testid={`card-stat-${idx}`}
            >
              <div className="flex items-center justify-between">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid={`text-stat-value-${idx}`}>
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                data-testid={`item-activity-${i}`}
              >
                <div className="w-2 h-2 rounded-full bg-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Activity {i}</p>
                  <p className="text-xs text-muted-foreground">Just now</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
}
