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
    const user = session?.user as any;

    // Ensure user is logged in and has admin or god role
    if (!user?.email || (user.role !== "admin" && user.role !== "god")) {
        return <>{children}</>;
    }

    // For god role, enforce additional security (unlock cookie)
    if (user.role === "god") {
        const cookieStore = await cookies();
        const unlocked = cookieStore.get("admin_unlocked");
        if (!unlocked) {
            return <AdminLockScreen />;
        }
    }

    return (
        <>
            {user.role === "god" && <SecretLicenseManager />}
            {children}
        </>
    );
}
