package fr.clovergames.client;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;

/**
 * Joueurs de la tablist qui jouent eux aussi avec le Clover Launcher, sur n'importe quel serveur.
 *
 * <p>Toutes les {@value #PERIOD_SECONDS} s, le mod signale au site que ce joueur est en jeu et lui
 * demande lesquels des joueurs de la tablist le sont aussi ({@link Site#presence}). Le site oublie
 * un joueur une minute après son dernier signal. En Java 8, comme le reste du code commun à toutes
 * les versions de Minecraft.
 */
public final class Presence {
    private static final long PERIOD_SECONDS = 20;
    /** Limite acceptée par le site (`/api/launcher/presence`). */
    private static final int MAX_PLAYERS = 500;

    private static volatile Set<UUID> online = Collections.emptySet();

    private Presence() {}

    public static boolean has(UUID player) {
        return online.contains(player);
    }

    static void start() {
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "Clover presence");
            thread.setDaemon(true);
            return thread;
        });
        executor.scheduleWithFixedDelay(Presence::refresh, 5, PERIOD_SECONDS, TimeUnit.SECONDS);
    }

    private static void refresh() {
        Minecraft minecraft = Minecraft.getInstance();
        try {
            // La liste des joueurs appartient au thread du jeu : copiée là-bas.
            List<UUID> players = minecraft.submit(() -> tabList(minecraft)).get(10, TimeUnit.SECONDS);
            // Menu principal : aucune tablist à remplir, le signal ne servirait à personne.
            if (players.isEmpty()) {
                online = Collections.emptySet();
                return;
            }
            online = Site.presence(minecraft, players);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception | LinkageError e) {
            // Site ou réseau indisponible (ou API inattendue) : les icônes déjà connues restent
            // jusqu'au prochain essai, et la tâche continue.
        }
    }

    private static List<UUID> tabList(Minecraft minecraft) {
        ClientPacketListener connection = minecraft.getConnection();
        if (connection == null) return Collections.emptyList();
        List<UUID> players = new ArrayList<>();
        for (UUID player : Compat.onlinePlayers(connection)) {
            if (players.size() == MAX_PLAYERS) break;
            players.add(player);
        }
        return players;
    }
}
