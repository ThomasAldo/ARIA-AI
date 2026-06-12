/**
 * JWT Authentication Service
 * Handles user signup, login, and token management
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  status: string;
  message: string;
  token: string;
  user: AuthUser;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Sign up a new user
 */
export const signup = async (email: string, password: string, name: string): Promise<AuthResponse> => {
  const response = await fetch(`${API_URL}/api/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Signup failed');
  }

  const data: AuthResponse = await response.json();
  
  // Store token and user data
  localStorage.setItem('aria_token', data.token);
  localStorage.setItem('aria_user', JSON.stringify(data.user));
  localStorage.setItem('aria_auth', 'true');

  return data;
};

/**
 * Login with email and password
 */
export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const data: AuthResponse = await response.json();
  
  // Store token and user data
  localStorage.setItem('aria_token', data.token);
  localStorage.setItem('aria_user', JSON.stringify(data.user));
  localStorage.setItem('aria_auth', 'true');

  return data;
};

/**
 * Get stored JWT token
 */
export const getToken = (): string | null => {
  return localStorage.getItem('aria_token');
};

/**
 * Get stored user data
 */
export const getUser = (): AuthUser | null => {
  try {
    const user = localStorage.getItem('aria_user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
};

/**
 * Verify token is valid
 */
export const verifyToken = async (): Promise<boolean> => {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await fetch(`${API_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Logout user
 */
export const logout = () => {
  localStorage.removeItem('aria_token');
  localStorage.removeItem('aria_user');
  localStorage.removeItem('aria_auth');
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return localStorage.getItem('aria_auth') === 'true' && !!getToken();
};

/**
 * Get authorization headers for API requests
 */
export const getAuthHeaders = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
};
