import { useAuth } from "./useAuth";

export function useApi() {
  const { api } = useAuth();
  return api;
}
