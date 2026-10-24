package fr.clovergames.client;

import com.mojang.authlib.GameProfile;
import com.mojang.authlib.exceptions.AuthenticationException;
import java.util.Collection;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;

/** Minecraft 1.21.11 et 26.x : `Identifier`, polices par `FontDescription`, services de Mojang par `services()`. */
public final class Compat {
    /** `\uE000` : le trèfle ; `\uE001` : l'espace de 2 px qui le sépare du nom (police `cloverclient:badge`). */
    private static final Component ICON = Component.literal("\uE000\uE001").withStyle(Style.EMPTY.withFont(new FontDescription.Resource(Identifier.fromNamespaceAndPath(CloverClient.MOD_ID, "badge"))).withColor(ChatFormatting.WHITE));

    private Compat() {}

    public static Component withBadge(Component name) {
        return Component.empty().append(ICON).append(name);
    }

    public static UUID profileId(GameProfile profile) {
        return profile.id();
    }

    static UUID userId(Minecraft minecraft) {
        return minecraft.getUser().getProfileId();
    }

    static void joinServer(Minecraft minecraft, String serverId) throws AuthenticationException {
        minecraft.services().sessionService().joinServer(minecraft.getUser().getProfileId(), minecraft.getUser().getAccessToken(), serverId);
    }

    static Collection<UUID> onlinePlayers(ClientPacketListener connection) {
        return connection.getOnlinePlayerIds();
    }
}
