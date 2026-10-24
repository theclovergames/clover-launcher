package fr.clovergames.client.mixin;

import fr.clovergames.client.Badge;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/** Nametag au-dessus de la tête, de la 1.15 à la 1.21.1 : `render` lit le nom par `getDisplayName`. */
@Mixin(EntityRenderer.class)
abstract class NameTagMixin {
    @Redirect(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/Entity;getDisplayName()Lnet/minecraft/network/chat/Component;"), require = 0)
    private Component cloverclient$badge(Entity entity) {
        Component name = entity.getDisplayName();
        return entity instanceof Player ? Badge.decorate(entity.getUUID(), name) : name;
    }
}
