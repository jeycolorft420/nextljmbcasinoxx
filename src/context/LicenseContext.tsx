"use client";

import { createContext, useContext, useEffect, useState } from "react";

type LicenseState = {
    features: string[];
    loading: boolean;
    isValid: boolean;
};

const LicenseContext = createContext<LicenseState>({
    features: [],
    loading: true,
    isValid: false,
});

export function LicenseProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<LicenseState>({
        features: [],
        loading: true,
        isValid: false,
    });

    useEffect(() => {
        const checkLicense = () => {
            fetch("/api/license/status")
                .then((res) => res.json())
                .then((data) => {
                    setState({
                        features: data.features || [],
                        isValid: data.valid,
                        loading: false,
                    });
                })
                .catch(() => {
                    console.error("License check failed");
                });
        };

        checkLicense();
        const interval = setInterval(checkLicense, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

    return (
        <LicenseContext.Provider value={state}>
            {children}
        </LicenseContext.Provider>
    );
}

export const useLicense = () => useContext(LicenseContext);

