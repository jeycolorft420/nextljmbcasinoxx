
import prisma from "@/modules/ui/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function ValidationsPage() {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;

    // Solo admins
    if (role !== "admin" && role !== "god") redirect("/");

    const pendingUsers = await prisma.user.findMany({
        where: { verificationStatus: "PENDING" },
        select: {
            id: true,
            email: true,
            fullName: true,
            dob: true,
            documentId: true,
            issueDate: true,
            phoneNumber: true,
            idFrontUrl: true,
            idBackUrl: true,
            selfieUrl: true,
            profilePhotoUrl: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' }
    });

    return (
        <main className="max-w-6xl mx-auto p-6 space-y-8 text-white">
            <header className="flex justify-between items-center border-b border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Validaciones de Identidad
                    </h1>
                    <p className="text-slate-400 mt-1">Revisa y aprueba los documentos de los usuarios.</p>
                </div>
                <div className="badge badge-lg badge-primary">{pendingUsers.length} Pendientes</div>
            </header>

            {pendingUsers.length === 0 ? (
                <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-2xl text-slate-500">🎉 Todo al día</p>
                    <p className="text-slate-600">No hay solicitudes de validación pendientes.</p>
                </div>
            ) : (
                <section className="grid gap-6">
                    {pendingUsers.map((user) => (
                        <article key={user.id} className="bg-[#1e293b] border border-white/10 rounded-2xl p-6 shadow-xl">
                            <div className="flex flex-wrap gap-6 mb-6">
                                {/* Datos Texto */}
                                <div className="flex-1 min-w-[300px] space-y-3">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="relative w-12 h-12 rounded-full overflow-hidden bg-neutral border border-white/10">
                                            {user.profilePhotoUrl ? (
                                                <Image src={user.profilePhotoUrl} alt="Avatar" fill className="object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-xl font-bold text-white bg-slate-700">
                                                    {user.fullName?.[0] || "?"}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">{user.fullName || "Sin Nombre"}</h3>
                                            <p className="text-sm text-slate-400">{user.email}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div className="text-slate-500">Documento ID:</div>
                                        <div className="font-mono">{user.documentId || "N/A"}</div>

                                        <div className="text-slate-500">Fecha Nacimiento:</div>
                                        <div>{user.dob ? new Date(user.dob).toLocaleDateString() : 'N/A'}</div>

                                        <div className="text-slate-500">Fecha Expedición:</div>
                                        <div>{user.issueDate ? new Date(user.issueDate).toLocaleDateString() : 'N/A'}</div>

                                        <div className="text-slate-500">Teléfono:</div>
                                        <div>{user.phoneNumber || "N/A"}</div>
                                    </div>
                                </div>

                                {/* Fotos */}
                                <div className="flex-1 flex gap-4 overflow-x-auto pb-2">
                                    {[
                                        { label: "Frontal", src: user.idFrontUrl },
                                        { label: "Reverso", src: user.idBackUrl },
                                        { label: "Selfie", src: user.selfieUrl }
                                    ].map((img, i) => (
                                        <div key={i} className="flex-none w-48 space-y-2">
                                            <div className="text-xs font-bold uppercase text-slate-500 text-center">{img.label}</div>
                                            {img.src ? (
                                                <a href={img.src} target="_blank" rel="noopener noreferrer" className="block relative aspect-video bg-black rounded-lg overflow-hidden border border-white/20 hover:border-primary transition-colors hover:scale-105 transform duration-200">
                                                    {/* Using regular img tag to avoid next/image issues with external/uploaded urls sometimes */}
                                                    <img src={img.src} alt={img.label} className="w-full h-full object-cover" />
                                                </a>
                                            ) : (
                                                <div className="h-28 bg-white/5 rounded-lg flex items-center justify-center text-slate-600 text-xs">Sin foto</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Acciones */}
                            <div className="flex gap-4 border-t border-white/5 pt-4">
                                <form action={`/api/admin/verification/${user.id}/action`} method="post" className="flex-1">
                                    <button name="action" value="REJECT" className="btn btn-error btn-outline w-full gap-2">
                                        ❌ Rechazar
                                    </button>
                                </form>
                                <form action={`/api/admin/verification/${user.id}/action`} method="post" className="flex-1">
                                    <button name="action" value="APPROVE" className="btn btn-success w-full gap-2 text-white">
                                        ✅ Aprobar Verificación
                                    </button>
                                </form>
                            </div>
                        </article>
                    ))}
                </section>
            )}
        </main>
    );
}

