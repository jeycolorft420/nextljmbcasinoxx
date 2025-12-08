import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import prisma from "@/modules/ui/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authenticator } from "otplib"; // Reserved for 2FA if needed

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        // Validar entrada
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Buscar usuario en DB
        const user = await prisma.user.findUnique({
          where: { email },
          include: { rouletteSkins: true, diceSkins: true }
        });
        if (!user) return null;

        // Comparar contraseñas
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        // Retornar datos mínimos para sesión, incluyendo skins
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: user.role,
          avatarUrl: user.avatarUrl,
          username: user.username,
          rouletteSkins: user.rouletteSkins,
          diceSkins: user.diceSkins,
          selectedRouletteSkin: user.selectedRouletteSkin,
          selectedDiceColor: user.selectedDiceColor,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && token.email) {
        // Fetch fresh data from DB
        console.log("JWT Update Triggered for:", token.email);
        const freshUser = await prisma.user.findUnique({
          where: { email: token.email },
          include: { rouletteSkins: true, diceSkins: true }
        });
        if (freshUser) {
          token.role = freshUser.role;
          token.verificationStatus = freshUser.verificationStatus;
          token.avatarUrl = freshUser.avatarUrl;
          (token as any).username = freshUser.username;
          (token as any).rouletteSkins = (freshUser as any).rouletteSkins; // Assuming relation or JSON
          (token as any).diceSkins = (freshUser as any).diceSkins;
          (token as any).selectedRouletteSkin = (freshUser as any).selectedRouletteSkin;
          (token as any).selectedDiceColor = (freshUser as any).selectedDiceColor;
        }
        return token;
      }

      if (user) {
        token.id = (user as any).id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as any).role || "user";
        token.avatarUrl = (user as any).avatarUrl;
        token.verificationStatus = (user as any).verificationStatus;
        (token as any).username = (user as any).username;
        (token as any).rouletteSkins = (user as any).rouletteSkins;
        (token as any).diceSkins = (user as any).diceSkins;
        (token as any).selectedRouletteSkin = (user as any).selectedRouletteSkin;
        (token as any).selectedDiceColor = (user as any).selectedDiceColor;
      }
      return token;
    },
    async session({ session, token, user }) {
      // Nota: Con strategy="jwt", 'user' es undefined aquí, usamos 'token'.
      if (session.user) {
        (session.user as any).id = token.id;
        session.user.email = token.email as string | undefined;
        session.user.name = token.name as string | null | undefined;
        (session.user as any).role = token.role;
        (session.user as any).avatarUrl = token.avatarUrl;
        (session.user as any).verificationStatus = (token as any).verificationStatus;
        (session.user as any).username = (token as any).username;
        (session.user as any).rouletteSkins = (token as any).rouletteSkins;
        (session.user as any).diceSkins = (token as any).diceSkins;
        (session.user as any).selectedRouletteSkin = (token as any).selectedRouletteSkin;
        (session.user as any).selectedDiceColor = (token as any).selectedDiceColor;
      }
      return session;
    },
  },
};

