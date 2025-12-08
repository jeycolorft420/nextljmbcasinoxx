"use client";

import AdminRoomList from "@/modules/admin/components/admin/AdminRoomList";
import DiceSettingsForm from "@/modules/admin/components/admin/DiceSettingsForm";

export default function AdminDiceRoomsPage() {
    return (
        <div>
            <DiceSettingsForm />
            <AdminRoomList gameType="DICE_DUEL" />
        </div>
    );
}

