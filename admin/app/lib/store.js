import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Auth Store
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,

      setAuth: (user, token, refreshToken) => set({
        user: user ? {
          ...user,
          school_id: user.school_id ?? user.school?.id ?? null
        } : null,
        token,
        refreshToken
      }),

      logout: () => {
        set({ user: null, token: null, refreshToken: null });
      },

      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null
      })),

      isAuthenticated: () => !!get().token && !!get().user,

      isSuperAdmin: () => get().user?.role === 'superadmin',
      isPrincipal: () => get().user?.role === 'principal',
      isTeacher: () => get().user?.role === 'teacher',

      hasRole: (...roles) => roles.includes(get().user?.role),
    }),
    {
      name: 'e-kilit-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken
      })
    }
  )
);

// UI Store
export const useUIStore = create((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  activeModal: null,
  modalData: null,
  openModal: (name, data = null) => set({ activeModal: name, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
}));
