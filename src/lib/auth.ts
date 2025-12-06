import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authenticator } from "otplib";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const authOptions: NextAuthOptions = {
  providers: [
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
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        // Comparar contraseñas
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        // Retornar datos mínimos para sesión
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: user.role,
          avatarUrl: user.avatarUrl
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as any).role;
        token.avatarUrl = (user as any).avatarUrl;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        session.user.email = token.email as string | undefined;
        session.user.name = token.name as string | null | undefined;
        (session.user as any).role = token.role;
        (session.user as any).avatarUrl = token.avatarUrl;
      }
      return session;
    },
  },
};
