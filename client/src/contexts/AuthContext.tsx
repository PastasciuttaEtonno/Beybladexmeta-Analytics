import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: { displayName?: string; photoURL?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('mockUser');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const mockUser: User = {
      uid: '123',
      email,
      displayName: email.split('@')[0],
      photoURL: null,
    };
    
    setUser(mockUser);
    localStorage.setItem('mockUser', JSON.stringify(mockUser));
  };

  const logout = async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    setUser(null);
    localStorage.removeItem('mockUser');
  };

  const updateProfile = async (updates: { displayName?: string; photoURL?: string }) => {
    if (!user) return;
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    localStorage.setItem('mockUser', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
