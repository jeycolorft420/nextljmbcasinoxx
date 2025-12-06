// src/app/admin/configurations/page.tsx
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function ConfigurationsPage() {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    // Only admin/god can access
    if (role !== "admin" && role !== "god") redirect("/");

    const pendingUsers = await prisma.user.findMany({
        where: { verificationStatus: "PENDING" },
        select: {
            id: true,
            email: true,
            fullName: true,
            documentUrl: true,
            selfieUrl: true,
            profilePhotoUrl: true,
        },
    });

    return (
        <main className="max-w-5xl mx-auto p-4 space-y-6">
            <h1 className="text-2xl font-bold">Configuraciones – Verificaciones pendientes</h1>
            {pendingUsers.length === 0 ? (
                <p className="text-sm opacity-80">No hay usuarios pendientes de verificación.</p>
            ) : (
                <section className="grid gap-4 md:grid-cols-2">
                    {pendingUsers.map((user) => (
                        <article key={user.id} className="border rounded-xl p-4 bg-card">
                            <div className="flex items-center space-x-4 mb-3">
                                {user.profilePhotoUrl && (
                                    <Image
                                        src={user.profilePhotoUrl}
                                        alt="Avatar"
                                        width={48}
                                        height={48}
                                        className="rounded-full object-cover"
                                    />
                                )}
                                <div>
                                    <p className="font-medium">{user.fullName || "(Sin nombre)"}</p>
                                    <p className="text-sm text-gray-400">{user.email}</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {user.documentUrl && (
                                    <a
                                        href={user.documentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 underline"
                                    >Documento de identidad</a>
                                )}
                                {user.selfieUrl && (
                                    <a
                                        href={user.selfieUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 underline"
                                    >Selfie</a>
                                )}
                            </div>
                            <div className="flex space-x-2 mt-4">
                                <form action={`/api/admin/verification/${user.id}/action`} method="post">
                                    <input type="hidden" name="action" value="APPROVE" />
                                    <button type="submit" className="btn btn-success flex-1">Aprobar</button>
                                </form>
                                <form action={`/api/admin/verification/${user.id}/action`} method="post">
                                    <input type="hidden" name="action" value="REJECT" />
                                    <button type="submit" className="btn btn-danger flex-1">Rechazar</button>
                                </form>
                            </div>
                        </article>
                    ))}
                </section>
            )}
        </main>
    );
}
