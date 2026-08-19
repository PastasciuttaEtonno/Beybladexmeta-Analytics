import { PageHeader } from '../PageHeader';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function PageHeaderExample() {
  return (
    <div className="bg-background">
      <PageHeader
        title="Example Page"
        action={
          <Button size="icon">
            <Plus className="w-5 h-5" />
          </Button>
        }
      />
    </div>
  );
}
