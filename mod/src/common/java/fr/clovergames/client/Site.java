package fr.clovergames.client;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.authlib.exceptions.AuthenticationException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.minecraft.client.Minecraft;

/**
 * Échanges avec clovergames.fr, depuis le thread de la présence uniquement.
 *
 * <p>Le mod prouve le compte du joueur comme un serveur Minecraft le ferait, par la même route que
 * le launcher (`/api/launcher/session`) : il appelle `join` chez Mojang avec un `serverId` donné
 * par le site, qui vérifie par `hasJoined`. Le jeton Minecraft ne part que chez Mojang ; le jeton
 * court rendu par le site reste en mémoire le temps de la partie. `HttpURLConnection` plutôt que
 * `java.net.http` : les plus anciennes versions de Minecraft tournent en Java 8.
 */
final class Site {
    /** Adresse du site, ou celle donnée au launcher en développement (`CLOVER_SITE_URL`). */
    private static final String SITE_URL = siteUrl();
    /** Attente après une connexion refusée (compte hors ligne, Mojang indisponible), en ms. */
    private static final long AUTH_RETRY_MS = 10 * 60 * 1000;
    private static final int TIMEOUT_MS = 10_000;
    private static final Gson GSON = new Gson();

    private static String token;
    private static UUID tokenOwner;
    private static long nextAuth;

    private Site() {}

    /** Signale ce joueur en jeu ; rend ceux de `players` qui jouent aussi avec le launcher. */
    static Set<UUID> presence(Minecraft minecraft, List<UUID> players) throws IOException {
        String bearer = token(minecraft);
        if (bearer == null) return Collections.emptySet();

        JsonArray uuids = new JsonArray();
        for (UUID player : players) uuids.add(undashed(player));
        JsonObject body = new JsonObject();
        body.add("uuids", uuids);
        Response response = send("/api/launcher/presence", body, bearer);
        if (response.status == 401) {
            token = null;
            return Collections.emptySet();
        }
        if (response.status != 200) throw new IOException("presence : HTTP " + response.status);

        Set<UUID> online = new HashSet<>();
        for (JsonElement id : GSON.fromJson(response.body, JsonObject.class).getAsJsonArray("online")) {
            UUID player = dashed(id.getAsString());
            if (player != null) online.add(player);
        }
        return Collections.unmodifiableSet(online);
    }

    private static String token(Minecraft minecraft) throws IOException {
        UUID owner = Compat.userId(minecraft);
        if (token != null && owner.equals(tokenOwner)) return token;
        if (System.currentTimeMillis() < nextAuth) return null;
        nextAuth = System.currentTimeMillis() + AUTH_RETRY_MS;

        String uuid = undashed(owner);
        Response challenge = send("/api/launcher/session?uuid=" + uuid, null, null);
        if (challenge.status != 200) return null;
        String serverId = GSON.fromJson(challenge.body, JsonObject.class).get("serverId").getAsString();
        try {
            Compat.joinServer(minecraft, serverId);
        } catch (AuthenticationException e) {
            return null;
        }

        JsonObject body = new JsonObject();
        body.addProperty("uuid", uuid);
        body.addProperty("name", minecraft.getUser().getName());
        Response session = send("/api/launcher/session", body, null);
        if (session.status != 200) return null;
        token = GSON.fromJson(session.body, JsonObject.class).get("token").getAsString();
        tokenOwner = owner;
        return token;
    }

    /** GET sans corps, POST JSON avec. */
    private static Response send(String path, JsonObject body, String bearer) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) URI.create(SITE_URL + path).toURL().openConnection();
        try {
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty("User-Agent", "CloverClient");
            if (bearer != null) connection.setRequestProperty("Authorization", "Bearer " + bearer);
            if (body != null) {
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(GSON.toJson(body).getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            return new Response(status, stream == null ? "" : read(stream));
        } finally {
            connection.disconnect();
        }
    }

    private static String read(InputStream stream) throws IOException {
        try (InputStream in = stream) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for (int count; (count = in.read(buffer)) != -1; ) out.write(buffer, 0, count);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static String undashed(UUID uuid) {
        return uuid.toString().replace("-", "");
    }

    /** UUID du site, sans tirets ; `null` s'il est illisible. */
    private static UUID dashed(String plain) {
        if (plain.length() != 32) return null;
        try {
            return UUID.fromString(plain.replaceFirst("(.{8})(.{4})(.{4})(.{4})(.{12})", "$1-$2-$3-$4-$5"));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String siteUrl() {
        String override = System.getenv("CLOVER_SITE_URL");
        return override == null || override.trim().isEmpty() ? "https://clovergames.fr" : override.replaceAll("/+$", "");
    }

    private static final class Response {
        final int status;
        final String body;

        Response(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }
}
