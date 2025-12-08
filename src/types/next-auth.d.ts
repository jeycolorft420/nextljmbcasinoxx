
import NextAuth, { DefaultSession } from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
    interface User {
        username?: string | null
        role?: string
        balanceCents?: number
        verificationStatus?: string
        rouletteSkins?: any[]
        selectedRouletteSkin?: string | null
    }

    interface Session {
        user: {
            id: string
            username?: string | null
            role?: string
            balanceCents?: number
            verificationStatus?: string
            rouletteSkins?: any[]
            selectedRouletteSkin?: string | null
        } & DefaultSession["user"]
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        username?: string | null
        role?: string
        balanceCents?: number
        verificationStatus?: string
        rouletteSkins?: any[]
        selectedRouletteSkin?: string | null
    }
}
