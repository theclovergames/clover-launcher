package fr.clovergames.client;

import com.mojang.authlib.GameProfile;
import java.util.UUID;
import net.minecraft.network.chat.Component;

/** Trèfle placé devant le nom d'un joueur du launcher ; son rendu dépend de la version (`Compat`). */
public final class Badge {
    /** Désactivé pour la partie si l'API de cette version ne répond pas comme prévu. */
    private static volatile boolean broken;

    private Badge() {}

    /** Nom de la tablist : le joueur est connu par son profil. */
    public static Component decorate(GameProfile profile, Component name) {
        if (broken) return name;
        try {
            return decorate(Compat.profileId(profile), name);
        } catch (LinkageError e) {
            broken = true;
            return name;
        }
    }

    public static Component decorate(UUID player, Component name) {
        if (broken || name == null || !Presence.has(player)) return name;
        try {
            return Compat.withBadge(name);
        } catch (LinkageError e) {
            // Correctif de Minecraft que ce JAR ne connaît pas : le nom reste tel quel, le jeu tourne.
            broken = true;
            return name;
        }
    }
}
