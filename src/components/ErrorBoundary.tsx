import { Component, type ReactNode } from "react";

// Minimal error boundary. If a child throws during render — e.g. the lazy 3D
// hero's GLB fetch rejects (CDN blip, corrupt deploy) — React would otherwise
// unmount the entire tree to a blank page. Here we render an optional fallback
// (default: nothing) so a decorative failure never takes down sign-in or the
// landing page.
export default class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    // decorative subtree — log, don't rethrow
    console.warn("ErrorBoundary caught:", err);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
