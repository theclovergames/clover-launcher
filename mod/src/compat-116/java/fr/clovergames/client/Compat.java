package fr.clovergames.client;

import com.mojang.authlib.GameProfile;
import com.mojang.authlib.exceptions.AuthenticationException;
import java.util.Collection;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.network.chat.TextComponent;
import net.minecraft.resources.ResourceLocation;

/** Minecraft 1.16 à 1.18 : `TextComponent`, police par `ResourceLocation`, `joinServer` par profil. */
public final class Compat {
    /** `\uE000` : le trèfle ; `\uE001` : l'espace de 2 px qui le sépare du nom (police `cloverclient:badge`). */
    private static final Component ICON = new TextComponent("\uE000\uE001")
            .withStyle(Style.EMPTY.withFont(ResourceLocation.tryParse(CloverClient.MOD_ID + ":badge")).withColor(ChatFormatting.WHITE));

    private Compat() {}

    public static Component withBadge(Component name) {
        return new TextComponent("").append(ICON).append(name);
    }

    public static UUID profileId(GameProfile profile) {
        return profile.getId();
    }

    static UUID userId(Minecraft minecraft) {
        return minecraft.getUser().getGameProfile().getId();
    }

    static void joinServer(Minecraft minecraft, String serverId) throws AuthenticationException {
        minecraft.getMinecraftSessionService().joinServer(minecraft.getUser().getGameProfile(), minecraft.getUser().getAccessToken(), serverId);
    }

    static Collection<UUID> onlinePlayers(ClientPacketListener connection) {
        return connection.getOnlinePlayerIds();
    }
}
