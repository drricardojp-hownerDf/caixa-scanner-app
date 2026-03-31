import { useState, useEffect } from "react";

const TOKEN_KEY = "caixa_scanner_apify_token";

export function useApifyToken() {
  const [token, setTokenState] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  });

  const setToken = (newToken: string) => {
    setTokenState(newToken);
    try {
      if (newToken.trim()) {
        localStorage.setItem(TOKEN_KEY, newToken.trim());
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // localStorage not available
    }
  };

  const hasToken = token.trim().length > 0;

  return { token, setToken, hasToken };
}
