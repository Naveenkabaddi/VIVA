import axios, { AxiosError } from "axios";

const TOKEN_KEY = "viva_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 120_000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event("viva:unauthorized"));
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { detail?: string | Array<{ msg?: string }>; message?: string }
      | undefined;
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) {
      return data.detail.map((item) => item.msg ?? "Invalid value").join(", ");
    }
    if (data?.message) return data.message;
    if (error.code === "ECONNABORTED") {
      return "The request took too long. Check the backend and try again.";
    }
    if (!error.response) {
      return "Cannot reach the API. Make sure the backend is running on port 8000.";
    }
    return `Request failed (${error.response.status}).`;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
