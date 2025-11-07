import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { ChevronRight, Bell, Lock, HelpCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const { toast } = useToast();

  const settingsSections = [
    {
      title: 'Preferences',
      items: [
        { icon: Bell, label: 'Notifications', value: 'On' },
        { icon: Lock, label: 'Privacy', value: '' },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help Center', value: '' },
        { icon: Info, label: 'About', value: 'v1.0.0' },
      ],
    },
  ];

  const handleSettingClick = (label: string) => {
    toast({
      title: label,
      description: `${label} settings would open here`,
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Settings" />
      
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        {settingsSections.map((section, idx) => (
          <div key={idx} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground px-1">
              {section.title}
            </h2>
            <Card className="divide-y divide-border">
              {section.items.map((item, itemIdx) => (
                <button
                  key={itemIdx}
                  onClick={() => handleSettingClick(item.label)}
                  className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
                  data-testid={`button-${item.label.toLowerCase().replace(' ', '-')}`}
                >
                  <item.icon className="w-5 h-5 text-muted-foreground" />
                  <span className="flex-1 font-medium">{item.label}</span>
                  {item.value && (
                    <span className="text-sm text-muted-foreground">{item.value}</span>
                  )}
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              ))}
            </Card>
          </div>
        ))}
      </main>
    </div>
  );
}
