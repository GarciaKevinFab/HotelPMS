import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, tenantsAPI } from '../lib/api';
import { limpiarCache } from '../lib/cache';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (token && storedUser) {
        try {
          // Verify token is still valid
          const response = await authAPI.me();
          setUser(response.data);
          localStorage.setItem('user', JSON.stringify(response.data));
        } catch (err) {
          // Token invalid, clear storage
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    setLoading(true);
    
    try {
      const response = await authAPI.login(email, password);
      const { access_token, user: userData } = response.data;

      // El cache de lecturas es de la sesion anterior. Si en esta pestaña ya
      // entro otra persona -- el cambio de turno en recepcion es exactamente
      // eso --, sus habitaciones y sus reservas siguen en memoria y la
      // siguiente pantalla las pintaria como si fueran de quien acaba de
      // entrar. Se tira antes de guardar el token nuevo.
      limpiarCache();

      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.detail || 'Error al iniciar sesión';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    // window.location.href se salta el router a proposito: cerrar sesion
    // descarta todo el estado en memoria, no solo el token.
    window.location.href = '/login';
  }, []);

  /* Cambia el token de la sesion (entrar a un hotel o salir de el) y vuelve a
     pedir /auth/me con el nuevo. Devuelve el usuario ya cargado. La pantalla
     que llama decide a donde navegar; el estado en memoria se descarta con
     una recarga completa, igual que al cerrar sesion, porque todo lo que
     estaba cargado pertenecia al otro contexto. */
  const cambiarSesion = useCallback(async (accessToken, destino) => {
    localStorage.setItem('token', accessToken);
    // ANTES del /auth/me, no despues. Esa ruta se cachea 30 segundos, y entrar
    // a un hotel es justo el caso en que el SUPER_ADMIN acaba de pedirla desde
    // la consola: sin vaciar, /auth/me responderia desde memoria con el usuario
    // del contexto ANTERIOR y eso es lo que quedaria guardado en localStorage.
    limpiarCache();
    const response = await authAPI.me();
    localStorage.setItem('user', JSON.stringify(response.data));
    setUser(response.data);
    window.location.href = destino;
    return response.data;
  }, []);

  const entrarEnHotel = useCallback(async (tenantId) => {
    const { data } = await tenantsAPI.entrar(tenantId);
    return cambiarSesion(data.access_token, '/dashboard');
  }, [cambiarSesion]);

  const salirDeHotel = useCallback(async () => {
    const { data } = await authAPI.salirDeHotel();
    return cambiarSesion(data.access_token, '/tenants');
  }, [cambiarSesion]);

  /* Mi cuenta cambia el nombre: se refleja en la cabecera sin recargar. */
  const actualizarUsuario = useCallback((cambios) => {
    setUser((actual) => {
      const nuevo = { ...actual, ...cambios };
      localStorage.setItem('user', JSON.stringify(nuevo));
      return nuevo;
    });
  }, []);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    entrarEnHotel,
    salirDeHotel,
    actualizarUsuario,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN',
    isSuperAdmin: user?.role === 'SUPER_ADMIN',
    isHousekeeping: user?.role === 'HOUSEKEEPING',
    // SUPER_ADMIN de visita en un hotel (rol efectivo ADMIN): la franja
    // ambar del AppLayout y el boton de salir dependen de esto.
    enOtroHotel: Boolean(user?.en_otro_hotel),
    hotelNombre: user?.hotel_nombre || user?.tenant?.nombre_comercial || user?.tenant?.name || null,
    hasRole: (role) => user?.role === role,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
