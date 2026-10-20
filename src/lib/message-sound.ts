/**
 * Petit son des nouveaux messages, le même que sur clovergames.fr : une bulle qui monte puis un
 * tintement de clochette, joués par l'API Web Audio (aucun fichier à charger). Le navigateur ne
 * laisse sonner la fenêtre qu'après une première interaction ; avant, le son est simplement sauté.
 */

let context: AudioContext | null = null;

type Tone = { type: OscillatorType; from: number; to?: number; at: number; peak: number; length: number };

/** Une note : attaque brève, glissé de `from` vers `to` s'il est donné, extinction en `length` secondes. */
function play(audio: AudioContext, { type, from, to, at, peak, length }: Tone) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(to, at + 0.06);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.05);
}

export function playMessageSound() {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime + 0.01;
    // La bulle : un « bloop » qui monte.
    play(context, { type: "sine", from: 480, to: 900, at: start, peak: 0.14, length: 0.12 });
    // La clochette : Mi6 et un partiel inharmonique plus discret, qui font sonner le métal.
    play(context, { type: "sine", from: 1318.5, at: start + 0.08, peak: 0.1, length: 0.55 });
    play(context, { type: "sine", from: 1318.5 * 2.76, at: start + 0.08, peak: 0.025, length: 0.3 });
  } catch {
    // Pas d'audio (sortie refusée) : l'alerte reste visuelle.
  }
}
