import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

export interface GoogleAccessTokenResult {
  accessToken: string | null;
  error?: string;
  reconnectRequired?: boolean;
}

/**
 * Server-only helper to extract Google access token from the encrypted JWT session cookie.
 * Automatically attempts to refresh the token if it is expired or close to expiring.
 */
export async function getGoogleAccessToken(
  req: NextRequest | Request
): Promise<GoogleAccessTokenResult> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return {
      accessToken: null,
      error: "AUTH_SECRET is not configured on the server",
      reconnectRequired: true,
    };
  }

  // Attempt reading session token (both default and secure cookie variants)
  let token = await getToken({
    req,
    secret,
  });

  if (!token) {
    token = await getToken({
      req,
      secret,
      secureCookie: true,
    });
  }

  if (!token) {
    return {
      accessToken: null,
      error: "No authenticated session token found. Please sign in.",
      reconnectRequired: true,
    };
  }

  if (token.error === "RefreshAccessTokenError") {
    return {
      accessToken: null,
      error: "Google authentication token has expired. Please reconnect your Google account.",
      reconnectRequired: true,
    };
  }

  let accessToken = token.access_token as string | undefined;
  const refreshToken = token.refresh_token as string | undefined;
  const expiresAt = token.expires_at as number | undefined;

  // Check if token has expired or will expire within 60 seconds
  if (
    typeof expiresAt === "number" &&
    Date.now() >= (expiresAt - 60) * 1000
  ) {
    if (!refreshToken) {
      return {
        accessToken: null,
        error: "Google access token expired and no refresh token is available. Please reconnect.",
        reconnectRequired: true,
      };
    }

    try {
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.AUTH_GOOGLE_ID || "",
          client_secret: process.env.AUTH_GOOGLE_SECRET || "",
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      const refreshed = await refreshResponse.json();
      if (!refreshResponse.ok) {
        throw refreshed;
      }

      accessToken = refreshed.access_token;
    } catch (refreshErr) {
      console.error("Error refreshing Google OAuth access token:", refreshErr);
      return {
        accessToken: null,
        error: "Failed to refresh Google access token. Please reconnect your Google account.",
        reconnectRequired: true,
      };
    }
  }

  if (!accessToken) {
    return {
      accessToken: null,
      error: "No Google access token found in session.",
      reconnectRequired: true,
    };
  }

  return { accessToken };
}
