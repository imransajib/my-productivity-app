import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

async function refreshAccessToken(token: any) {
  try {
    if (!token.refresh_token) {
      throw new Error("No refresh_token available to refresh access token");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID || "",
        client_secret: process.env.AUTH_GOOGLE_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    const expiresIn = refreshedTokens.expires_in ?? 3600;

    return {
      ...token,
      access_token: refreshedTokens.access_token,
      expires_at: Math.floor(Date.now() / 1000 + expiresIn),
      // Fall back to old refresh token if Google does not issue a new one
      refresh_token: refreshedTokens.refresh_token ?? token.refresh_token,
      error: undefined,
    };
  } catch (error) {
    console.error("Error refreshing Google OAuth access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account }) {
      // First-time sign in: persist access token, refresh token and expiry
      if (account) {
        token.access_token = account.access_token;
        token.refresh_token = account.refresh_token;
        token.expires_at =
          account.expires_at ??
          Math.floor(Date.now() / 1000 + (account.expires_in ?? 3600));
        return token;
      }

      // Check if access token has not yet expired (using a 60 second safety buffer)
      if (
        typeof token.expires_at === "number" &&
        Date.now() < (token.expires_at - 60) * 1000
      ) {
        return token;
      }

      // Access token has expired, refresh it
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (token) {
        // Do NOT expose accessToken to browser session for security.
        // Server routes access it directly from JWT.
        session.error = token.error as string | undefined;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
});
