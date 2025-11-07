import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';

export default function Analytics() {
  const metrics = [
    { label: 'Total Views', value: '2,543', change: '+12%', trend: 'up' },
    { label: 'Engagement', value: '68%', change: '+5%', trend: 'up' },
    { label: 'Conversion', value: '3.2%', change: '-2%', trend: 'down' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Analytics" />
      
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        <div className="grid gap-4">
          {metrics.map((metric, idx) => (
            <Card
              key={idx}
              className="p-4 hover-elevate"
              data-testid={`card-metric-${idx}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="text-2xl font-bold mt-1" data-testid={`text-metric-value-${idx}`}>
                    {metric.value}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {metric.trend === 'up' ? (
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-500" />
                  )}
                  <span className={`text-sm font-medium ${metric.trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                    {metric.change}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Chart Placeholder</h2>
          </div>
          <div className="h-48 bg-muted/30 rounded-lg flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Chart visualization would go here</p>
          </div>
        </Card>
      </main>
    </div>
  );
}
