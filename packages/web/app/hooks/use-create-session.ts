'use client';

import { useState, useCallback } from 'react';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import {
  CREATE_SESSION,
  type CreateSessionInput,
  type CreateSessionResponse,
} from '@boardsesh/graphql/operations/create-session';
import type { SessionCreationFormData } from '@/app/components/session-creation/session-creation-form';
import { isNativeApp } from '@/app/lib/ble/capacitor-utils';

function getGeolocation(): Promise<{ latitude: number; longitude: number }> {
  // Use Capacitor Geolocation plugin on native
  if (isNativeApp()) {
    const plugin = window.Capacitor?.Plugins?.Geolocation;
    if (plugin) {
      return plugin
        .getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 })
        .then((pos) => ({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
        .catch(() => ({ latitude: 0, longitude: 0 }));
    }
    return Promise.resolve({ latitude: 0, longitude: 0 });
  }

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: 0, longitude: 0 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        // On error/denial, fall back to 0,0
        resolve({ latitude: 0, longitude: 0 });
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  });
}

export function useCreateSession() {
  const { token } = useWsAuthToken();
  const [isCreating, setIsCreating] = useState(false);

  const createSession = useCallback(
    async (formData: SessionCreationFormData, boardPath: string): Promise<string> => {
      setIsCreating(true);
      try {
        // Get geolocation when discoverable
        const coords = formData.discoverable ? await getGeolocation() : { latitude: 0, longitude: 0 };

        const input: CreateSessionInput = {
          boardPath,
          latitude: coords.latitude,
          longitude: coords.longitude,
          discoverable: formData.discoverable,
          name: formData.name,
          goal: formData.goal,
          color: formData.color,
          isPermanent: formData.isPermanent,
        };

        const client = createGraphQLHttpClient(token);
        const response = await client.request<CreateSessionResponse>(CREATE_SESSION, { input });

        return response.createSession.id;
      } finally {
        setIsCreating(false);
      }
    },
    [token],
  );

  return { createSession, isCreating };
}
