import { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser, getStoredUser, getToken, logout as clearAuth, saveToken, saveUser } from '../services/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());
  const [token, setToken] = useState(getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      const storedToken = getToken();
      const storedUser = getStoredUser();

      if (mounted && storedUser) {
        setUser(storedUser);
      }

      if (mounted && storedToken) {
        setToken(storedToken);
      }

      if (!storedToken) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const response = await getCurrentUser();
        if (mounted) {
          if (response?.user) {
            setUser(response.user);
            setToken(storedToken);
            saveUser(response.user);
          } else {
            console.warn('[Auth] Token verification failed (no user). Clearing auth state.');
            clearAuth();
            setUser(null);
            setToken(null);
          }
        }
      } catch (error) {
        console.error('[Auth] Error verifying secure access. Backend might be offline:', error);
        if (mounted) {
          clearAuth();
          setUser(null);
          setToken(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  const loginWithToken = async (nextToken) => {
    saveToken(nextToken);
    setToken(nextToken);
    const response = await getCurrentUser();
    setUser(response?.user ?? null);
    if (response?.user) {
      saveUser(response.user);
    }
    return response?.user ?? null;
  };

  const logout = () => {
    clearAuth();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: Boolean(user && token),
        loginWithToken,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
