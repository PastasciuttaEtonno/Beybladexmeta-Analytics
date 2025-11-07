import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Plus } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function Schedule() {
  const { toast } = useToast();
  const [events] = useState([
    { id: 1, title: 'Team Meeting', time: '9:00 AM', date: 'Today' },
    { id: 2, title: 'Project Review', time: '2:00 PM', date: 'Today' },
    { id: 3, title: 'Client Call', time: '10:00 AM', date: 'Tomorrow' },
  ]);

  const handleAddEvent = () => {
    toast({
      title: 'Add Event',
      description: 'Event creation would open here',
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader
        title="Schedule"
        action={
          <Button
            size="icon"
            onClick={handleAddEvent}
            data-testid="button-add-event"
          >
            <Plus className="w-5 h-5" />
          </Button>
        }
      />
      
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Upcoming Events</h2>
          </div>
          
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="p-4 rounded-lg bg-muted/50 hover-elevate active-elevate-2"
                data-testid={`event-${event.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-medium" data-testid={`text-event-title-${event.id}`}>
                      {event.title}
                    </h3>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{event.time}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{event.date}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
}
