import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Dernier filet : une exception de rendu ne laisse plus une fenêtre blanche. Le rapport part vers
 * Sentry par `onCaughtError` (voir `main.tsx`), qui respecte le consentement du joueur.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 bg-background px-10 text-center">
        <h1 className="font-display text-[26px] leading-none">Une erreur est survenue</h1>
        <p className="max-w-[520px] text-sm text-muted-foreground">{this.state.error.message}</p>
        <button type="button" onClick={() => window.location.reload()} className="mc-frame bg-card px-4 py-2 text-sm font-semibold">
          Recharger
        </button>
      </div>
    );
  }
}
