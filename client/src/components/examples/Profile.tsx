import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeProvider';
import Profile from '@/pages/Profile';
import { useEffect } from 'react';

export default function ProfileExample() {
  useEffect(() => {
    const mockUser = {
      uid: '123',
      email: 'demo@example.com',
      displayName: 'Demo User',
      photoURL: null,
    };
    localStorage.setItem('mockUser', JSON.stringify(mockUser));
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider>
        <div className="max-w-md mx-auto">
          <Profile />
        </div>
      </ThemeProvider>
    </AuthProvider>
  );
}
