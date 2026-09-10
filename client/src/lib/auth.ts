import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, api, queryClient } from "./api";

export interface User {
  id: number;
  username: string;
  role: string;
}

const USER_KEY = ["/api/auth/user"];

export function useAuth() {
  const { data, isLoading } = useQuery<User | null>({
    queryKey: USER_KEY,
    queryFn: async () => {
      try {
        return await api<User>("GET", "/api/auth/user");
      } catch (error) {
        // Somebody who is not signed in is an expected state, not a failure.
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
  });

  return { user: data ?? null, isLoading };
}

export function useSignIn() {
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      api<User>("POST", "/api/auth/signin", credentials),
    onSuccess: (user) => queryClient.setQueryData(USER_KEY, user),
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("POST", "/api/auth/signout"),
    onSuccess: () => {
      // Switch the shell over first. Clearing the cache outright would pull the
      // observer above away from its query, so it would keep holding the old
      // user and the app would still look signed in with a dead session.
      client.setQueryData(USER_KEY, null);
      // Then drop everything the last session loaded, so the next person starts
      // fresh from the server rather than seeing what was cached before.
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== USER_KEY[0],
      });
    },
  });
}
