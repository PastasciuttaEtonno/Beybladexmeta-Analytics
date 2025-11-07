import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/Avatar';
import { useState } from 'react';

export default function Messages() {
  const [conversations] = useState([
    { id: 1, name: 'Sarah Johnson', message: 'Hey, how are you?', time: '2m ago', unread: 2 },
    { id: 2, name: 'Mike Chen', message: 'Meeting at 3pm?', time: '1h ago', unread: 0 },
    { id: 3, name: 'Emily Davis', message: 'Thanks for the update!', time: '3h ago', unread: 0 },
    { id: 4, name: 'Alex Kim', message: 'Can you review this?', time: '1d ago', unread: 1 },
  ]);

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Messages" />
      
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        <div className="space-y-2">
          {conversations.map((conv) => (
            <Card
              key={conv.id}
              className="p-4 hover-elevate active-elevate-2"
              data-testid={`conversation-${conv.id}`}
            >
              <div className="flex items-center gap-3">
                <Avatar alt={conv.name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-medium truncate" data-testid={`text-contact-name-${conv.id}`}>
                      {conv.name}
                    </h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {conv.time}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.message}
                    </p>
                    {conv.unread > 0 && (
                      <span
                        className="flex items-center justify-center w-5 h-5 text-xs font-medium text-primary-foreground bg-primary rounded-full"
                        data-testid={`badge-unread-${conv.id}`}
                      >
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
