import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * NextAuth handles the actual Google consent screen redirect (real OAuth,
 * no mock). We ask for an `id_token` and forward it to our Express
 * backend in `app/dashboard/page.tsx`, which independently verifies it
 * with Google's public keys before minting our own session cookie. That
 * split keeps "who the user is" (Google's job) separate from "what they
 * can do in our app" (our backend's job).
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorization: {
        params: { scope: "openid email profile" },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.id_token) {
        token.googleIdToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).googleIdToken = token.googleIdToken;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};
