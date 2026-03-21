import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, Mail, Lock, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

export const LoginPage: React.FC<{ onToggle: () => void }> = ({ onToggle }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { setAuth, setError, setLoading, isLoading, error } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/api/v1/tenants/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Invalid email or password');
      }

      const data = await response.json();
      console.log("DEBUG: Raw login response:", data);
      
      if (!data.access_token) {
        console.error("DEBUG: Access token missing from response!", data);
        throw new Error('Server returned invalid auth data');
      }

      // Get user profile
      const profileResponse = await fetch('http://localhost:8000/api/v1/tenants/auth/me', {
        headers: { 'Authorization': `Bearer ${data.access_token}` },
      });
      const userProfile = await profileResponse.json();

      setAuth(userProfile, data.access_token);
    } catch (err: any) {
      localStorage.removeItem('designdc-auth-storage'); // FORCE CLEAR ON ERROR
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0B0F14] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#151921] border border-[#2D343F] rounded-xl p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
             <LogIn className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">DesignDC Platform</h1>
          <p className="text-[#8E95A2] text-sm">Design the future of infrastructure</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#8E95A2]">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A5568]" />
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0B0F14] border border-[#2D343F] rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-[#4A5568] focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[#8E95A2]">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A5568]" />
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0B0F14] border border-[#2D343F] rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-[#4A5568] focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Sign In
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-[#2D343F] text-center">
          <p className="text-sm text-[#8E95A2]">
            Don't have an account? {' '}
            <button onClick={onToggle} className="text-blue-400 hover:underline">Register</button>
          </p>
        </div>
      </motion.div>
    </div>
  );
};
