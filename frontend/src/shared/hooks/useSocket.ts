import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore, getAccessToken } from '@/shared/stores/auth.store';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const accessToken = getAccessToken();
    if (!isAuthenticated || !accessToken || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io('/events', {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      // Auto-joined to tenant room by server
    });

    socket.on('order.created', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('order.status_changed', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('order.cancelled', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('payment.received', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['payments'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
      queryClientRef.current.invalidateQueries({
        queryKey: ['dashboard', 'kpi'],
      });
      queryClientRef.current.invalidateQueries({
        queryKey: ['dashboard', 'alerts'],
      });
    });

    socket.on('booking.confirmed', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['orders'] });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, user]);

  return socketRef;
}
