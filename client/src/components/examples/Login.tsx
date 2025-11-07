import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeProvider';
import Login from '@/pages/Login';

export default function LoginExample() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Login />
      </ThemeProvider>
    </AuthProvider>
  );
}
