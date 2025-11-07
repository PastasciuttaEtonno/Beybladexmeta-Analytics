import { useState, useRef } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeProvider';
import { useToast } from '@/hooks/use-toast';
import { Camera, LogOut, Moon, Sun, Bell, Lock, HelpCircle, Info, ChevronRight } from 'lucide-react';

export default function Profile() {
  const { user, logout, updateProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveName = async () => {
    if (!displayName.trim()) {
      toast({
        title: 'Error',
        description: 'Name cannot be empty',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({ displayName: displayName.trim() });
      setIsEditingName(false);
      toast({
        title: 'Success',
        description: 'Display name updated',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update name',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500000) {
      toast({
        title: 'Error',
        description: 'Image must be less than 500KB',
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const photoURL = reader.result as string;
      try {
        await updateProfile({ photoURL });
        toast({
          title: 'Success',
          description: 'Profile picture updated',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to upload photo',
          variant: 'destructive',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: 'Logged out',
        description: 'Come back soon!',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to logout',
        variant: 'destructive',
      });
    }
  };

  const handleSettingClick = (label: string) => {
    toast({
      title: label,
      description: `${label} settings would open here`,
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Profile" />
      
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        <Card className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Avatar
                src={user?.photoURL}
                alt={user?.displayName || 'User'}
                size="xl"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center hover-elevate active-elevate-2"
                data-testid="button-upload-photo"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
                data-testid="input-photo-upload"
              />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold" data-testid="text-display-name">
                {user?.displayName}
              </h2>
              <p className="text-sm text-muted-foreground" data-testid="text-email">
                {user?.email}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Edit Display Name</h3>
          {isEditingName ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="h-12"
                  data-testid="input-display-name"
                  disabled={isSaving}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveName}
                  disabled={isSaving}
                  className="flex-1"
                  data-testid="button-save-name"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditingName(false);
                    setDisplayName(user?.displayName || '');
                  }}
                  disabled={isSaving}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setIsEditingName(true)}
              className="w-full"
              data-testid="button-edit-name"
            >
              Edit Name
            </Button>
          )}
        </Card>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Appearance
          </h2>
          <Card className="p-4">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between hover-elevate active-elevate-2"
              data-testid="button-toggle-theme"
            >
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Sun className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="font-medium">Dark Mode</span>
              </div>
              <div
                className={`w-12 h-6 rounded-full transition-colors ${
                  theme === 'dark' ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'
                  } mt-0.5`}
                />
              </div>
            </button>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Preferences
          </h2>
          <Card className="divide-y divide-border">
            <button
              onClick={() => handleSettingClick('Notifications')}
              className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
              data-testid="button-notifications"
            >
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">Notifications</span>
              <span className="text-sm text-muted-foreground">On</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => handleSettingClick('Privacy')}
              className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
              data-testid="button-privacy"
            >
              <Lock className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">Privacy</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Support
          </h2>
          <Card className="divide-y divide-border">
            <button
              onClick={() => handleSettingClick('Help Center')}
              className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
              data-testid="button-help-center"
            >
              <HelpCircle className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">Help Center</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => handleSettingClick('About')}
              className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
              data-testid="button-about"
            >
              <Info className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">About</span>
              <span className="text-sm text-muted-foreground">v1.0.0</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <Button
          variant="destructive"
          onClick={handleLogout}
          className="w-full h-12"
          data-testid="button-logout"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Log Out
        </Button>
      </main>
    </div>
  );
}
