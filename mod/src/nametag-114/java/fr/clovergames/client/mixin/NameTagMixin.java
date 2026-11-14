package fr.clovergames.client.mixin;

import fr.clovergames.client.Badge;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/** Nametag au-dessus de la tête en 1.14 : `LivingEntityRenderer.renderName` lit le nom par `getDisplayName`. */
@Mixin(LivingEntityRenderer.class)
abstract class NameTagMixin {
    @Redirect(method = "renderName", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;getDisplayName()Lnet/minecraft/network/chat/Component;"), require = 0)
    private Component cloverclient$badge(LivingEntity entity) {
        Component name = entity.getDisplayName();
        return entity instanceof Player ? Badge.decorate(entity.getUUID(), name) : name;
    }
}
