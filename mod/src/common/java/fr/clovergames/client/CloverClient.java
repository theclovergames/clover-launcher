package fr.clovergames.client;

import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.Minecraft;

/** Mod caché du Clover Launcher : la présence démarre avec le jeu, les mixins ajoutent l'icône. */
public final class CloverClient implements ClientModInitializer {
    public static final String MOD_ID = "cloverclient";

    @Override
    public void onInitializeClient() {
        Presence.start();
        if (Boolean.getBoolean("cloverclient.selftest")) selfTest();
    }

    /** Développement (`gradlew :<version>:runClient`) : l'API de cette version répond-elle ? */
    private static void selfTest() {
        try {
            Class.forName("fr.clovergames.client.Compat");
            System.out.println("[cloverclient] selftest ok, joueur " + Compat.userId(Minecraft.getInstance()));
        } catch (Throwable e) {
            System.out.println("[cloverclient] selftest en échec : " + e);
        }
    }
}
