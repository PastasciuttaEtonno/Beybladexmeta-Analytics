import { Avatar } from '../Avatar';

export default function AvatarExample() {
  return (
    <div className="flex items-center gap-4 p-8 bg-background">
      <Avatar alt="John Doe" size="sm" />
      <Avatar alt="Jane Smith" size="md" />
      <Avatar alt="Bob Johnson" size="lg" />
      <Avatar alt="Alice Williams" size="xl" />
    </div>
  );
}
