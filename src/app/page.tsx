// src/app/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";

// Server Component: redirige según sesión
export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/rooms");
  } else {
    redirect("/login");
  }
  return null;
}

