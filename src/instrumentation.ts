export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { verifyLicense } = await import('./lib/license-check');
        console.log("🔒 [LICENSE] Checking license on startup...");
        verifyLicense(); // No usamos await para no bloquear el arranque
    }
}
