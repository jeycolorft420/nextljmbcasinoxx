import { cookies } from "next/headers";
import AdminLockScreen from "@/components/AdminLockScreen";
import SecretLicenseManager from "@/components/SecretLicenseManager";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    // 1. Check if user is logged in & is admin
    if (!session?.user?.email || session.user.role !== "admin") {
        return <>{children}</>;
    }

    // 2. Check if user has 2FA enabled
    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { twoFactorEnabled: true },
    });

    if (!user?.twoFactorEnabled) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
                <div className="max-w-md bg-card p-8 rounded-2xl border border-white/10">
                    <h1 className="text-xl font-bold mb-2">Seguridad Requerida</h1>
                    <p className="opacity-70 mb-4">
                        Para acceder al panel de administración, debes activar la autenticación de dos factores (2FA).
                    </p>
                    <a href="/profile" className="btn btn-primary">Ir a mi Perfil</a>
                </div>
            </div>
        );
    }

    // 3. Check Cookie
    const cookieStore = await cookies();
    const unlocked = cookieStore.get("admin_unlocked");

    if (!unlocked) {
        return <AdminLockScreen />;
    }

    return (
        <>
            <SecretLicenseManager />
            {children}
        </>
    );
}
