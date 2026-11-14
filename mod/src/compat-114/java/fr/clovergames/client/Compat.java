package fr.clovergames.client;

import com.mojang.authlib.GameProfile;
import com.mojang.authlib.exceptions.AuthenticationException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.TextComponent;

/**
 * Minecraft 1.14 et 1.15 : pas de police par texte avant la 1.16, le trèfle est le caractère ☘
 * (dessiné par la police Unicode du jeu), en vert.
 */
public final class Compat {
    private Compat() {}

    public static Component withBadge(Component name) {
        return new TextComponent("\u2618 ").withStyle(ChatFormatting.DARK_GREEN).append(name);
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
        List<UUID> players = new ArrayList<>();
        for (PlayerInfo info : connection.getOnlinePlayers()) players.add(info.getProfile().getId());
        return players;
    }
}
