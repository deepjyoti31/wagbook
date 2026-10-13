/**
 * Warning tags offered when adding a pet. Staff see these in red wherever the
 * pet appears. The database stores them as free text (pets.flags), so adding
 * a tag here needs no migration.
 */
export const PET_FLAGS = ["escape_risk", "bite_history", "dog_reactive", "anxious", "on_medication", "senior"] as const;
